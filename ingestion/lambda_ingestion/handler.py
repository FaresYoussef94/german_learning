"""Ingestion Lambda — triggered by S3 PutObject on raw source bucket.

Downloads the 3 source markdown files, parses per-lesson content, calls
Amazon Bedrock (Claude Haiku) to generate exercises for each lesson × type
combination, and writes the results to DynamoDB.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

TABLE_NAME = os.environ['TABLE_NAME']
RAW_BUCKET = os.environ['RAW_BUCKET']
MODEL_ID = os.environ.get('MODEL_ID', 'anthropic.claude-haiku-4-5')

LESSON_HEADING = re.compile(r'^## Lesson (\d+)', re.MULTILINE)
TABLE_ROW = re.compile(r'^\|(.+)\|$')
SEPARATOR_ROW = re.compile(r'^\|[\s\-|:]+\|$')

SOURCE_KEYS = {
    'lessons': 'a1/German_Lesson_Summary.md',
    'nouns': 'a1/German_Nouns.md',
    'verbs': 'a1/German_Verbs.md',
}

QUESTION_SCHEMA = json.dumps({
    "questions": [
        {
            "type": "<multiple_choice|fill_blank|translation|article>",
            "question": "<question text>",
            "options": ["<opt1>", "<opt2>", "<opt3>", "<opt4>"],
            "answer": "<correct answer>"
        }
    ]
}, indent=2)

SYSTEM_PROMPT = (
    "You are a German A1 exercise generator. "
    "Given lesson content, generate exactly the requested number of questions of each type. "
    f"Respond ONLY with valid JSON matching this schema:\n{QUESTION_SCHEMA}\n"
    "For fill_blank, translation, and article questions, omit the 'options' field. "
    "For article questions, the answer must be one of: der, die, das. "
    "Do not add any explanation or markdown — only the JSON object."
)


def fetch_source(key: str) -> str:
    resp = s3.get_object(Bucket=RAW_BUCKET, Key=key)
    return resp['Body'].read().decode('utf-8')


def split_by_lesson(content: str) -> dict[int, str]:
    sections: dict[int, str] = {}
    matches = list(LESSON_HEADING.finditer(content))
    for i, match in enumerate(matches):
        num = int(match.group(1))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        sections[num] = content[start:end].strip()
    return sections


def extract_table_rows(content: str) -> list[list[str]]:
    rows = []
    for line in content.splitlines():
        line = line.strip()
        if not TABLE_ROW.match(line) or SEPARATOR_ROW.match(line):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if cells[0].lower() in ('german', 'infinitive', 'noun', 'lesson'):
            continue
        rows.append(cells)
    return rows


def build_nouns_prompt(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    table = "\n".join(
        f"| {r[0]} | {r[1] if len(r) > 1 else ''} | {r[2] if len(r) > 2 else ''} | {r[3] if len(r) > 3 else ''} |"
        for r in rows
    )
    return (
        f"German nouns for this lesson (German | Article | Plural | English):\n{table}\n\n"
        "Generate 5 multiple_choice questions, 5 article questions, and 5 translation questions "
        "based on these nouns. Use the actual words from the table above."
    )


def build_verbs_prompt(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    table = "\n".join(
        f"| {r[0]} | {r[1] if len(r) > 1 else ''} | {r[2] if len(r) > 2 else ''} | {r[3] if len(r) > 3 else ''} |"
        for r in rows
    )
    return (
        f"German verbs for this lesson (Infinitive | Present Perfect | Case | English):\n{table}\n\n"
        "Generate 5 fill_blank questions (asking for the present perfect form), "
        "5 translation questions (German verb → English), "
        "and 5 multiple_choice questions about verb meaning or case usage. "
        "Use the actual verbs from the table above."
    )


def build_lesson_prompt(summary: str) -> str:
    # Truncate to ~3000 chars to stay within token limits for Haiku
    truncated = summary[:3000] if len(summary) > 3000 else summary
    return (
        f"German A1 lesson summary:\n{truncated}\n\n"
        "Generate 5 fill_blank questions, 5 multiple_choice questions, and 5 translation questions "
        "based on the grammar and vocabulary in this lesson summary."
    )


def call_bedrock(user_prompt: str) -> list[dict]:
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_prompt}],
    })
    resp = bedrock.invoke_model(modelId=MODEL_ID, body=body)
    raw = json.loads(resp['body'].read())
    text = raw['content'][0]['text'].strip()
    # Strip markdown code fences if model wraps output
    if text.startswith('```'):
        text = re.sub(r'^```[^\n]*\n', '', text)
        text = re.sub(r'\n```$', '', text)
    return json.loads(text)['questions']


LEVEL = 'a1'


def write_to_dynamodb(lesson_id: int, exercise_type: str, questions: list[dict]) -> None:
    table = dynamodb.Table(TABLE_NAME)
    table.put_item(Item={
        'level': LEVEL,
        'typeLesson': f'{exercise_type}#{lesson_id:02d}',
        'questions': questions,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
    })


def main(event, context):
    logger.info("Ingestion triggered: %s", json.dumps(event))

    # Fetch all 3 source files
    try:
        lessons_md = fetch_source(SOURCE_KEYS['lessons'])
        nouns_md = fetch_source(SOURCE_KEYS['nouns'])
        verbs_md = fetch_source(SOURCE_KEYS['verbs'])
    except Exception as e:
        logger.error("Failed to fetch source files: %s", e)
        raise

    lesson_sections = split_by_lesson(lessons_md)
    noun_sections = split_by_lesson(nouns_md)
    verb_sections = split_by_lesson(verbs_md)

    for lesson_id in range(1, 15):
        for exercise_type, content_fn in [
            ('nouns', lambda: build_nouns_prompt(extract_table_rows(noun_sections.get(lesson_id, '')))),
            ('verbs', lambda: build_verbs_prompt(extract_table_rows(verb_sections.get(lesson_id, '')))),
            ('lesson', lambda: build_lesson_prompt(lesson_sections.get(lesson_id, ''))),
        ]:
            prompt = content_fn()
            if not prompt:
                logger.info("Skipping lesson %d / %s — no content", lesson_id, exercise_type)
                continue
            try:
                questions = call_bedrock(prompt)
                write_to_dynamodb(lesson_id, exercise_type, questions)
                logger.info("Wrote %d questions for lesson %d / %s", len(questions), lesson_id, exercise_type)
            except Exception as e:
                logger.warning("Failed lesson %d / %s: %s", lesson_id, exercise_type, e)

    logger.info("Ingestion complete")
    return {'statusCode': 200, 'body': 'done'}
