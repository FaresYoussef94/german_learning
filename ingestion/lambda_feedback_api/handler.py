"""Feedback API Lambda — handles question deletion and AI-powered regeneration.

DELETE  /feedback/{level}/{lessonId}/{type}            — delete a question
POST    /feedback/{level}/{lessonId}/{type}/regenerate — regenerate a question with feedback
POST    /feedback/{level}/{lessonId}/{type}/replace    — replace a question with a new one
"""

import json
import logging
import os

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
bedrock = boto3.client("bedrock-runtime")

TABLE_NAME = os.environ["TABLE_NAME"]
MODEL_ID = os.environ["MODEL_ID"]

VALID_TYPES = {"nouns", "verbs"}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


def respond(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, ensure_ascii=False),
    }


def handle_delete(level: str, lesson_id: str, exercise_type: str, body: dict) -> dict:
    """Delete a question by its text from DynamoDB."""
    question_text = body.get("question", "").strip()
    if not question_text:
        logger.warning("Delete request missing question field")
        return respond(400, {"error": "question field is required"})

    logger.info(
        f"DELETE: lesson#{int(lesson_id):02d} ({exercise_type}): {question_text[:50]}..."
    )

    table = dynamodb.Table(TABLE_NAME)
    key = {"level": level, "typeLesson": f"lesson#{int(lesson_id):02d}"}

    # Get current item
    try:
        response = table.get_item(Key=key)
        logger.debug(f"Retrieved lesson item: {len(response.get('Item', {}))} bytes")
    except Exception as e:
        logger.error(f"DynamoDB GetItem failed: {e}")
        return respond(500, {"error": "database_error"})

    item = response.get("Item")
    if not item:
        return respond(404, {"error": "lesson_not_found"})

    exercises = item.get("exercises", {})
    questions = exercises.get(exercise_type, [])

    # Filter out matching question
    filtered = [q for q in questions if q.get("question", "").strip() != question_text]

    if len(filtered) == len(questions):
        logger.warning(f"Question not found in lesson#{int(lesson_id):02d} ({exercise_type})")
        return respond(404, {"error": "question_not_found"})

    logger.info(f"Found and filtering question ({len(questions)} → {len(filtered)} remaining)")

    # Update lesson item
    try:
        table.update_item(
            Key=key,
            UpdateExpression="SET exercises.#t = :list",
            ExpressionAttributeNames={"#t": exercise_type},
            ExpressionAttributeValues={":list": filtered},
        )
        logger.info(f"Updated lesson item: {len(questions)} → {len(filtered)} exercises")
    except Exception as e:
        logger.error(f"DynamoDB UpdateItem failed: {e}")
        return respond(500, {"error": "database_error"})

    # Update exercise aggregate
    agg_key = {"level": level, "typeLesson": f"exercises#{exercise_type}"}
    try:
        agg_response = table.get_item(Key=agg_key)
        agg_exercises = agg_response.get("Item", {}).get("exercises", [])
        logger.debug(f"Retrieved exercises#{exercise_type} aggregate: {len(agg_exercises)} items")

        # Filter out the deleted question from aggregate
        agg_filtered = [
            q for q in agg_exercises if q.get("question", "").strip() != question_text
        ]

        if len(agg_filtered) < len(agg_exercises):
            table.put_item(
                Item={
                    "level": level,
                    "typeLesson": f"exercises#{exercise_type}",
                    "exercises": agg_filtered,
                }
            )
            logger.info(f"Updated exercises#{exercise_type}: {len(agg_exercises)} → {len(agg_filtered)}")
        else:
            logger.debug("Question not in aggregate (may have already been deleted)")
    except Exception as e:
        logger.warning(f"Failed to update exercise aggregate (non-fatal): {e}")

    logger.info("DELETE operation completed successfully")
    return respond(200, {"deleted": True})


def handle_regenerate(
    level: str, lesson_id: str, exercise_type: str, body: dict
) -> dict:
    """Regenerate a question using Bedrock with user feedback."""
    question_text = body.get("question", "").strip()
    feedback_text = body.get("feedback", "").strip()

    if not question_text or not feedback_text:
        logger.warning("Regenerate request missing question or feedback field")
        return respond(400, {"error": "question and feedback fields are required"})

    logger.info(f"REGENERATE: lesson#{int(lesson_id):02d} ({exercise_type}), feedback: {feedback_text[:50]}...")

    table = dynamodb.Table(TABLE_NAME)
    key = {"level": level, "typeLesson": f"lesson#{int(lesson_id):02d}"}

    # Get the original question object
    try:
        response = table.get_item(Key=key)
    except Exception as e:
        logger.error(f"DynamoDB GetItem failed: {e}")
        return respond(500, {"error": "database_error"})

    item = response.get("Item")
    if not item:
        return respond(404, {"error": "lesson_not_found"})

    exercises = item.get("exercises", {})
    questions = exercises.get(exercise_type, [])

    original_question = None
    for q in questions:
        if q.get("question", "").strip() == question_text:
            original_question = q
            break

    if not original_question:
        logger.warning(f"Question not found in lesson#{int(lesson_id):02d} ({exercise_type})")
        return respond(404, {"error": "question_not_found"})

    logger.debug(f"Found original question, calling Bedrock...")

    # Call Bedrock to regenerate
    system_prompt = f"""You are a German A1 learning exercise generator. The user wants to improve a {exercise_type[:-1]} (noun/verb) exercise.

You MUST return ONLY valid JSON with the following structure:
{{"type": "...", "topic": "...", "question": "...", "options": ["..."], "answer": "..."}}

Rules:
- type: one of "multiple_choice", "fill_blank", "translation", "article"
- topic: depends on exercise_type (e.g., "article", "plural" for nouns; "infinitive", "perfect_form", "conjugation" for verbs)
- question: the German learning question
- options: list of choices (only for multiple_choice type)
- answer: the correct answer

Original exercise:
{json.dumps(original_question, ensure_ascii=False)}

User feedback:
{feedback_text}

Regenerate the exercise based on the feedback. Maintain the same structure but improve it."""

    try:
        logger.debug("Calling Bedrock converse API...")
        response = bedrock.converse(
            modelId=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"text": "Regenerate this exercise with the feedback provided."}
                    ],
                }
            ],
            system=[{"text": system_prompt}],
        )

        logger.debug("Bedrock response received, parsing...")
        message = response["output"]["message"]
        if not message:
            raise ValueError("No message in response")
        content = message["content"]
        if not content or "text" not in content[0]:
            raise ValueError("No text content in response")
        new_question = json.loads(content[0]["text"])
        logger.info(f"Successfully generated new {exercise_type[:-1]} exercise")

    except json.JSONDecodeError as e:
        logger.error(f"Bedrock response was not valid JSON: {e}")
        return respond(500, {"error": "bedrock_invalid_response"})
    except Exception as e:
        logger.error(f"Bedrock converse failed: {e}")
        return respond(500, {"error": "bedrock_error"})

    logger.info("REGENERATE operation completed successfully")
    return respond(200, {"question": new_question})


def handle_replace(level: str, lesson_id: str, exercise_type: str, body: dict) -> dict:
    """Replace an old question with a new one in DynamoDB."""
    old_question_text = body.get("oldQuestion", "").strip()
    new_question = body.get("newQuestion")

    if not old_question_text or not new_question:
        logger.warning("Replace request missing oldQuestion or newQuestion field")
        return respond(
            400, {"error": "oldQuestion and newQuestion fields are required"}
        )

    logger.info(f"REPLACE: lesson#{int(lesson_id):02d} ({exercise_type}): {old_question_text[:50]}...")

    table = dynamodb.Table(TABLE_NAME)
    key = {"level": level, "typeLesson": f"lesson#{int(lesson_id):02d}"}

    # Get current item
    try:
        response = table.get_item(Key=key)
    except Exception as e:
        logger.error(f"DynamoDB GetItem failed: {e}")
        return respond(500, {"error": "database_error"})

    item = response.get("Item")
    if not item:
        return respond(404, {"error": "lesson_not_found"})

    exercises = item.get("exercises", {})
    questions = exercises.get(exercise_type, [])

    # Find and replace
    found = False
    updated_questions = []
    for q in questions:
        if q.get("question", "").strip() == old_question_text:
            updated_questions.append(new_question)
            found = True
        else:
            updated_questions.append(q)

    if not found:
        return respond(404, {"error": "question_not_found"})

    # Update lesson item
    try:
        table.update_item(
            Key=key,
            UpdateExpression="SET exercises.#t = :list",
            ExpressionAttributeNames={"#t": exercise_type},
            ExpressionAttributeValues={":list": updated_questions},
        )
    except Exception as e:
        logger.error(f"DynamoDB UpdateItem failed: {e}")
        return respond(500, {"error": "database_error"})

    # Update exercise aggregate
    agg_key = {"level": level, "typeLesson": f"exercises#{exercise_type}"}
    try:
        agg_response = table.get_item(Key=agg_key)
        agg_exercises = agg_response.get("Item", {}).get("exercises", [])

        # Find and replace in aggregate
        agg_updated = []
        found_in_agg = False
        for q in agg_exercises:
            if q.get("question", "").strip() == old_question_text:
                agg_updated.append(new_question)
                found_in_agg = True
            else:
                agg_updated.append(q)

        if found_in_agg:
            table.put_item(
                Item={
                    "level": level,
                    "typeLesson": f"exercises#{exercise_type}",
                    "exercises": agg_updated,
                }
            )
            logger.info(f"Updated exercises#{exercise_type} aggregate with new question")
        else:
            logger.debug("Question not found in aggregate (may have already been updated)")
    except Exception as e:
        logger.warning(f"Failed to update exercise aggregate (non-fatal): {e}")

    logger.info("REPLACE operation completed successfully")
    return respond(200, {"replaced": True})


def main(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("httpMethod", "").upper()
    path = event.get("path", "").strip("/")
    path_params = event.get("pathParameters") or {}

    # Parse path: /feedback/{level}/{lessonId}/{type}/[regenerate|replace]
    parts = path.split("/")
    if len(parts) < 4 or parts[0] != "feedback":
        return respond(400, {"error": "invalid_path"})

    level = parts[1].lower()
    lesson_id = parts[2]
    exercise_type = parts[3].lower()

    if exercise_type not in VALID_TYPES:
        return respond(
            400, {"error": f'type must be one of: {", ".join(sorted(VALID_TYPES))}'}
        )

    # Get request body
    try:
        body = json.loads(event.get("body", "{}")) if event.get("body") else {}
    except json.JSONDecodeError:
        return respond(400, {"error": "invalid_json"})

    # Route by method and path
    if http_method == "DELETE":
        return handle_delete(level, lesson_id, exercise_type, body)
    elif http_method == "POST":
        if len(parts) >= 5:
            action = parts[4].lower()
            if action == "regenerate":
                return handle_regenerate(level, lesson_id, exercise_type, body)
            elif action == "replace":
                return handle_replace(level, lesson_id, exercise_type, body)
        return respond(400, {"error": "invalid_action"})
    elif http_method == "OPTIONS":
        return respond(200, {})
    else:
        return respond(405, {"error": "method_not_allowed"})
