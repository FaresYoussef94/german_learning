"""Aggregate Rebuild Lambda — rebuilds vocabulary and exercise aggregates hourly.

Reads all lesson items from DynamoDB, flattens and deduplicates,
and writes clean aggregate items. Handles concurrent lesson ingestion safely.

Triggered: EventBridge rule (every hour)
"""

import json
import logging
import os

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["TABLE_NAME"]


def rebuild_aggregates(level: str) -> dict:
    """Rebuild all aggregates from lesson items."""
    table = dynamodb.Table(TABLE_NAME)

    logger.info(f"Rebuilding aggregates for level: {level}")

    # Query all lesson items
    try:
        response = table.query(
            KeyConditionExpression=(
                Key("level").eq(level) & Key("typeLesson").begins_with("lesson#")
            )
        )
        items = response.get("Items", [])
    except Exception as e:
        logger.error(f"Failed to query lessons: {e}")
        raise

    if not items:
        logger.info(f"No lessons found for level {level}")
        return {"lesson_count": 0}

    logger.info(f"Found {len(items)} lessons to process")

    # Flatten and deduplicate nouns
    nouns_dict = {}  # Use dict to deduplicate by word
    for item in items:
        for noun in item.get("nouns", []):
            word = noun.get("word")
            if word and word not in nouns_dict:
                nouns_dict[word] = noun

    nouns_list = list(nouns_dict.values())
    logger.info(f"Flattened nouns: {len(nouns_list)} unique")

    # Flatten and deduplicate verbs
    verbs_dict = {}  # Use dict to deduplicate by infinitive
    for item in items:
        for verb in item.get("verbs", []):
            infinitive = verb.get("infinitive")
            if infinitive and infinitive not in verbs_dict:
                verbs_dict[infinitive] = verb

    verbs_list = list(verbs_dict.values())
    logger.info(f"Flattened verbs: {len(verbs_list)} unique")

    # Flatten and deduplicate noun exercises
    noun_exercises_dict = {}  # Use dict to deduplicate by question
    for item in items:
        for exercise in item.get("exercises", {}).get("nouns", []):
            question = exercise.get("question")
            if question and question not in noun_exercises_dict:
                noun_exercises_dict[question] = exercise

    noun_exercises_list = list(noun_exercises_dict.values())
    logger.info(f"Flattened noun exercises: {len(noun_exercises_list)} unique")

    # Flatten and deduplicate verb exercises
    verb_exercises_dict = {}  # Use dict to deduplicate by question
    for item in items:
        for exercise in item.get("exercises", {}).get("verbs", []):
            question = exercise.get("question")
            if question and question not in verb_exercises_dict:
                verb_exercises_dict[question] = exercise

    verb_exercises_list = list(verb_exercises_dict.values())
    logger.info(f"Flattened verb exercises: {len(verb_exercises_list)} unique")

    # Write aggregates
    try:
        table.put_item(
            Item={"level": level, "typeLesson": "nouns", "nouns": nouns_list}
        )
        logger.info("Updated nouns aggregate")

        table.put_item(
            Item={"level": level, "typeLesson": "verbs", "verbs": verbs_list}
        )
        logger.info("Updated verbs aggregate")

        table.put_item(
            Item={
                "level": level,
                "typeLesson": "exercises#nouns",
                "exercises": noun_exercises_list,
            }
        )
        logger.info("Updated exercises#nouns aggregate")

        table.put_item(
            Item={
                "level": level,
                "typeLesson": "exercises#verbs",
                "exercises": verb_exercises_list,
            }
        )
        logger.info("Updated exercises#verbs aggregate")
    except Exception as e:
        logger.error(f"Failed to write aggregates: {e}")
        raise

    return {
        "lesson_count": len(items),
        "nouns": len(nouns_list),
        "verbs": len(verbs_list),
        "noun_exercises": len(noun_exercises_list),
        "verb_exercises": len(verb_exercises_list),
    }


def main(event, context):
    """Lambda handler — triggered by EventBridge every hour."""
    logger.info("Aggregate rebuild triggered")
    logger.info("Event: %s", json.dumps(event))

    level = "a1"  # Currently only A1 level

    try:
        result = rebuild_aggregates(level)
        logger.info(f"Rebuild complete: {result}")
        return {
            "statusCode": 200,
            "body": json.dumps(result),
        }
    except Exception as e:
        logger.error(f"Aggregate rebuild failed: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
