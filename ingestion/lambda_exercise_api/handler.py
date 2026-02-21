"""Exercise API Lambda — serves pre-generated exercises from DynamoDB aggregates.

GET /exercises/{level}?type=nouns|verbs   — filtered by type (fast GetItem from aggregate)
GET /exercises/{level}                     — all questions for the level
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["TABLE_NAME"]

VALID_TYPES = {"nouns", "verbs"}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}


def respond(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, ensure_ascii=False),
    }


def main(event, context):
    logger.info("Event: %s", json.dumps(event))

    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    level = path_params.get("level", "a1").lower()
    exercise_type = query_params.get("type", "").lower()  # empty string = all types

    if exercise_type and exercise_type not in VALID_TYPES:
        return respond(
            400,
            {
                "error": f'type must be one of: {", ".join(sorted(VALID_TYPES))}, or omitted for all'
            },
        )

    table = dynamodb.Table(TABLE_NAME)
    all_questions = []

    # Read from exercise aggregates (fast GetItem instead of Query)
    types_to_fetch = [exercise_type] if exercise_type else ["nouns", "verbs"]

    try:
        for qtype in types_to_fetch:
            response = table.get_item(
                Key={"level": level, "typeLesson": f"exercises#{qtype}"}
            )
            item = response.get("Item")
            if item:
                exercises = item.get("exercises", [])
                for q in exercises:
                    all_questions.append(
                        {**q, "exerciseType": qtype}
                    )
    except Exception as e:
        logger.error(f"Failed to fetch exercises aggregate: {e}")
        return respond(500, {"error": "database_error"})

    if not all_questions:
        return respond(
            404,
            {
                "error": "not_generated",
                "message": (
                    f'No exercises found for level "{level}"'
                    + (f' / type "{exercise_type}"' if exercise_type else "")
                    + ". Upload PDF files to S3 to trigger generation."
                ),
            },
        )

    return respond(
        200,
        {
            "level": level,
            "type": exercise_type or "all",
            "questions": all_questions,
            "total": len(all_questions),
        },
    )
