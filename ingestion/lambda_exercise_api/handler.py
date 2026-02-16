"""Exercise API Lambda — serves pre-generated exercises from DynamoDB.

GET /exercises/{level}?type=nouns|verbs|lesson   — filtered by type
GET /exercises/{level}                            — all questions for the level
"""

import json
import logging
import os

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ['TABLE_NAME']

VALID_TYPES = {'nouns', 'verbs', 'lesson'}

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json',
}


def respond(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, ensure_ascii=False),
    }


def main(event, context):
    logger.info("Event: %s", json.dumps(event))

    path_params = event.get('pathParameters') or {}
    query_params = event.get('queryStringParameters') or {}

    level = path_params.get('level', 'a1').lower()
    exercise_type = query_params.get('type', '').lower()  # empty string = all types

    if exercise_type and exercise_type not in VALID_TYPES:
        return respond(400, {
            'error': f'type must be one of: {", ".join(sorted(VALID_TYPES))}, or omitted for all'
        })

    table = dynamodb.Table(TABLE_NAME)

    if exercise_type:
        # Filter to a specific type: SK begins_with "{type}#"
        result = table.query(
            KeyConditionExpression=(
                Key('level').eq(level) &
                Key('typeLesson').begins_with(f'{exercise_type}#')
            )
        )
    else:
        # All questions for the level
        result = table.query(
            KeyConditionExpression=Key('level').eq(level)
        )

    items = result.get('Items', [])

    if not items:
        return respond(404, {
            'error': 'not_generated',
            'message': (
                f'No exercises found for level "{level}"'
                + (f' / type "{exercise_type}"' if exercise_type else '')
                + '. Upload the source files to S3 to trigger generation.'
            ),
        })

    # Flatten all questions, embedding lessonId (parsed from SK "type#NN") on each
    all_questions = []
    for item in sorted(items, key=lambda x: x['typeLesson']):
        _, lesson_str = item['typeLesson'].split('#', 1)
        lesson_id = int(lesson_str)
        for q in item['questions']:
            all_questions.append({**q, 'lessonId': lesson_id})

    return respond(200, {
        'level': level,
        'type': exercise_type or 'all',
        'questions': all_questions,
        'total': len(all_questions),
    })
