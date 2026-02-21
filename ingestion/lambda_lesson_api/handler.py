"""Lesson API Lambda — serves lesson content from DynamoDB.

Handles routes:
  GET /lessons/{level}                       → lesson index [{id, title}]
  GET /lessons/{level}/nouns                 → all nouns flattened
  GET /lessons/{level}/verbs                 → all verbs flattened
  GET /lessons/{level}/{lessonId}            → single lesson full data
  GET /lessons/{level}/{lessonId}/summary    → lesson summary (markdown from S3)
"""

import json
import logging
import os
import re

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

TABLE_NAME = os.environ['TABLE_NAME']
PROCESSED_BUCKET = os.environ['PROCESSED_BUCKET']

LEVEL = 'a1'


def get_headers():
    """Return CORS headers for API responses."""
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    }


def query_lessons(level: str) -> list:
    """Query all lessons for a level, returning items with typeLesson=lesson#*."""
    table = dynamodb.Table(TABLE_NAME)
    try:
        response = table.query(
            KeyConditionExpression=Key('level').eq(level) & Key('typeLesson').begins_with('lesson#')
        )
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Query failed for level {level}: {e}")
        raise


def lesson_index(level: str) -> dict:
    """GET /lessons/{level} — return list of {id, title}."""
    items = query_lessons(level)
    if not items:
        return {
            'statusCode': 404,
            'headers': get_headers(),
            'body': json.dumps({'error': 'not_generated'}),
        }

    index = []
    for item in items:
        # Extract lesson ID from typeLesson (e.g., "lesson#03" -> 3)
        match = re.search(r'lesson#(\d+)', item['typeLesson'])
        if match:
            lesson_id = int(match.group(1))
            index.append({
                'id': lesson_id,
                'title': item.get('title', f'Lesson {lesson_id}'),
            })

    # Sort by lesson ID
    index.sort(key=lambda x: x['id'])

    return {
        'statusCode': 200,
        'headers': get_headers(),
        'body': json.dumps(index),
    }


def all_nouns(level: str) -> dict:
    """GET /lessons/{level}/nouns — read pre-computed aggregate (fast)."""
    table = dynamodb.Table(TABLE_NAME)
    try:
        response = table.get_item(
            Key={'level': level, 'typeLesson': 'nouns'}
        )
        item = response.get('Item')
        if not item:
            return {
                'statusCode': 404,
                'headers': get_headers(),
                'body': json.dumps({'error': 'not_generated'}),
            }

        all_nouns_list = item.get('nouns', [])
        return {
            'statusCode': 200,
            'headers': get_headers(),
            'body': json.dumps(all_nouns_list),
        }
    except Exception as e:
        logger.error(f"Failed to fetch nouns aggregate: {e}")
        return {
            'statusCode': 500,
            'headers': get_headers(),
            'body': json.dumps({'error': 'internal_error'}),
        }


def all_verbs(level: str) -> dict:
    """GET /lessons/{level}/verbs — read pre-computed aggregate (fast)."""
    table = dynamodb.Table(TABLE_NAME)
    try:
        response = table.get_item(
            Key={'level': level, 'typeLesson': 'verbs'}
        )
        item = response.get('Item')
        if not item:
            return {
                'statusCode': 404,
                'headers': get_headers(),
                'body': json.dumps({'error': 'not_generated'}),
            }

        all_verbs_list = item.get('verbs', [])
        return {
            'statusCode': 200,
            'headers': get_headers(),
            'body': json.dumps(all_verbs_list),
        }
    except Exception as e:
        logger.error(f"Failed to fetch verbs aggregate: {e}")
        return {
            'statusCode': 500,
            'headers': get_headers(),
            'body': json.dumps({'error': 'internal_error'}),
        }


def single_lesson(level: str, lesson_id: str) -> dict:
    """GET /lessons/{level}/{lessonId} — return full lesson data (without summary)."""
    table = dynamodb.Table(TABLE_NAME)
    lesson_id_int = int(lesson_id)
    sk = f'lesson#{lesson_id_int:02d}'

    try:
        response = table.get_item(Key={'level': level, 'typeLesson': sk})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 404,
                'headers': get_headers(),
                'body': json.dumps({'error': 'not_found'}),
            }

        # Build response with extracted lesson ID (summary NOT included, fetched separately)
        data = {
            'id': lesson_id_int,
            'title': item.get('title', f'Lesson {lesson_id_int}'),
            'nouns': item.get('nouns', []),
            'verbs': item.get('verbs', []),
            'exercises': item.get('exercises', {'nouns': [], 'verbs': []}),
        }

        return {
            'statusCode': 200,
            'headers': get_headers(),
            'body': json.dumps(data),
        }

    except Exception as e:
        logger.error(f"Get item failed for {sk}: {e}")
        return {
            'statusCode': 500,
            'headers': get_headers(),
            'body': json.dumps({'error': 'internal_error'}),
        }


def lesson_summary(level: str, lesson_id: str) -> dict:
    """GET /lessons/{level}/{lessonId}/summary — return markdown summary from S3."""
    lesson_id_int = int(lesson_id)
    sk = f'lesson#{lesson_id_int:02d}'

    try:
        table = dynamodb.Table(TABLE_NAME)
        response = table.get_item(Key={'level': level, 'typeLesson': sk})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 404,
                'headers': get_headers(),
                'body': json.dumps({'error': 'not_found'}),
            }

        summary_key = item.get('summaryKey')
        if not summary_key:
            return {
                'statusCode': 404,
                'headers': get_headers(),
                'body': json.dumps({'error': 'summary_not_found'}),
            }

        # Read summary markdown from S3
        s3_response = s3.get_object(Bucket=PROCESSED_BUCKET, Key=summary_key)
        summary_content = s3_response['Body'].read().decode('utf-8')

        # Return as plain text (markdown)
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': 'text/markdown',
            },
            'body': summary_content,
        }

    except Exception as e:
        logger.error(f"Summary fetch failed for {sk}: {e}")
        return {
            'statusCode': 500,
            'headers': get_headers(),
            'body': json.dumps({'error': 'internal_error'}),
        }


def main(event, context):
    """Lambda handler for API Gateway."""
    logger.info(f"Event: {json.dumps(event)}")

    # Extract path and method
    path = event.get('path', '')
    method = event.get('httpMethod', '')
    resource = event.get('resource', '')
    path_params = event.get('pathParameters') or {}

    # Handle OPTIONS
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': get_headers(),
        }

    # Route based on resource template
    # /lessons/{level}/nouns
    # /lessons/{level}/verbs
    # /lessons/{level}/{lessonId}/summary
    # /lessons/{level}/{lessonId}
    # /lessons/{level}

    level = path_params.get('level', '').lower()

    if not level:
        return {
            'statusCode': 400,
            'headers': get_headers(),
            'body': json.dumps({'error': 'missing_level'}),
        }

    # Check which resource was matched by examining the path
    # (API Gateway resource field might not include literal segments)
    if '/summary' in path:
        lesson_id = path_params.get('lessonId', '')
        return lesson_summary(level, lesson_id)
    elif '/nouns' in path:
        return all_nouns(level)
    elif '/verbs' in path:
        return all_verbs(level)
    elif 'lessonId' in path_params:
        lesson_id = path_params.get('lessonId', '')
        return single_lesson(level, lesson_id)
    else:
        # Default to lesson index
        return lesson_index(level)
