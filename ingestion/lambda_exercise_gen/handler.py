"""Exercise Generation Lambda — Step 2 of ingestion workflow.

Receives markdown files from Step 1, parses them, generates exercises via Bedrock,
and writes the full lesson item to DynamoDB.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
bedrock = boto3.client(
    "bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1")
)
dynamodb = boto3.resource("dynamodb")

PROCESSED_BUCKET = os.environ["PROCESSED_BUCKET"]
TABLE_NAME = os.environ["TABLE_NAME"]
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")


def read_s3_text(bucket: str, key: str) -> str:
    """Read text file from S3."""
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return resp["Body"].read().decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to read {key} from {bucket}: {e}")
        raise


def normalize_field_name(name: str) -> str:
    """Normalize markdown header names to camelCase frontend field names."""
    name_lower = name.lower()

    # Noun field mappings
    if name_lower == "german":
        return "word"
    elif name_lower == "article":
        return "article"
    elif name_lower == "plural":
        return "plural"
    elif name_lower == "english":
        return "english"
    # Verb field mappings
    elif name_lower == "infinitive":
        return "infinitive"
    elif name_lower == "present perfect":
        return "perfectForm"
    elif name_lower == "case":
        return "case"

    # Default: lowercase the name
    return name_lower


def parse_markdown_table(markdown_text: str) -> list:
    """Parse markdown table into list of dicts. Assumes | separator. Deduplicates by first column."""
    lines = markdown_text.strip().split("\n")
    if len(lines) < 3:
        return []

    # Extract header
    header_line = lines[0]
    headers = [
        h.strip() for h in header_line.split("|")[1:-1]
    ]  # skip first and last empty

    # Normalize header names to match frontend expectations
    normalized_headers = [normalize_field_name(h) for h in headers]

    # Extract rows (skip separator line at index 1), deduplicating by first column value
    rows = []
    seen = set()
    for line in lines[2:]:
        if line.strip() and "|" in line:
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) == len(normalized_headers):
                row = dict(zip(normalized_headers, cells))
                # Deduplicate by first column (German word/infinitive)
                first_col_value = cells[0] if cells else None
                if first_col_value and first_col_value not in seen:
                    rows.append(row)
                    seen.add(first_col_value)
                elif first_col_value:
                    logger.warning(f"Skipping duplicate entry: {first_col_value}")

    return rows


def call_bedrock_for_exercises(nouns_md: str, verbs_md: str, summary_md: str) -> dict:
    """Call Bedrock to generate exercises from markdown content."""
    system_prompt = """You are a German A1 exercise generator.
Given vocabulary tables (nouns and verbs) from a lesson, generate practical exercises.

Return ONLY valid JSON (no code fences):
{
  "nouns": [
    {"type": "multiple_choice", "topic": "article", "question": "...", "options": ["...", "...", "...", "..."], "answer": "..."},
    {"type": "fill_blank", "topic": "plural", "question": "...", "answer": "..."},
    {"type": "translation", "topic": "vocabulary", "question": "...", "answer": "..."}
  ],
  "verbs": [
    {"type": "multiple_choice", "topic": "infinitive", "question": "...", "options": ["...", "...", "...", "..."], "answer": "..."},
    {"type": "fill_blank", "topic": "perfect_form", "question": "...", "answer": "..."},
    {"type": "translation", "topic": "vocabulary", "question": "...", "answer": "..."}
  ]
}

NOUN QUESTION TOPICS:
- "article": Questions testing der/die/das article recognition
- "plural": Questions testing plural forms of nouns
- "vocabulary": Translation questions testing noun meaning

VERB QUESTION TOPICS:
- "infinitive": Questions testing infinitive forms or their meanings
- "conjugation": Questions testing verb conjugations in different tenses/persons
- "perfect_form": Questions testing present perfect (Perfekt) forms
- "vocabulary": Translation questions testing verb meaning

Guidelines:
- Noun exercises: Create 5 multiple_choice (article), 5 fill_blank (plural), 5 translation (vocabulary)
- Verb exercises: Create 5 multiple_choice (infinitive), 5 fill_blank (perfect_form), 5 translation (vocabulary)
- Make questions practical and contextual
- Ensure answers are concise and unambiguous
- Use realistic German phrases and sentences
- IMPORTANT: Each question MUST have a "topic" field set appropriately"""

    # Truncate summary for context

    user_prompt = f"""Generate exercises from these lesson materials:

## Nouns Table
{nouns_md}

## Verbs Table
{verbs_md}

## Lesson Context
{summary_md}

Generate 15 noun exercises and 15 verb exercises with the specified topic fields.
Return only the JSON object with all questions including their topic fields."""

    resp = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        system=[{"text": system_prompt}],
    )

    message = resp["output"]["message"]
    if not message:
        raise ValueError("No message in response")
    content = message["content"]
    if not content or "text" not in content[0]:
        raise ValueError("No text content in response")

    text = content[0]["text"].strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```[^\n]*\n", "", text)
        text = re.sub(r"\n```$", "", text)

    return json.loads(text)


def main(event, context):
    logger.info("Exercise generation triggered: %s", json.dumps(event))

    # Input from Step 1
    level = event["level"]
    lesson_id = event["lessonId"]
    title = event["title"]
    summary_key = event["summaryKey"]
    nouns_key = event["nounsKey"]
    verbs_key = event["verbsKey"]

    logger.info(f"Processing lesson {lesson_id} ({title})")

    try:
        # Read markdown files from ProcessedBucket
        logger.info("Reading markdown files from ProcessedBucket...")
        summary_md = read_s3_text(PROCESSED_BUCKET, summary_key)
        nouns_md = read_s3_text(PROCESSED_BUCKET, nouns_key)
        verbs_md = read_s3_text(PROCESSED_BUCKET, verbs_key)

        logger.info("Parsing markdown tables...")
        nouns_list = parse_markdown_table(nouns_md)
        verbs_list = parse_markdown_table(verbs_md)

        logger.info(f"Parsed {len(nouns_list)} nouns, {len(verbs_list)} verbs")

        # Call Bedrock to generate exercises
        logger.info("Calling Bedrock to generate exercises...")
        exercises_data = call_bedrock_for_exercises(nouns_md, verbs_md, summary_md)

        logger.info("Generated exercises")

        # Write to DynamoDB
        table = dynamodb.Table(TABLE_NAME)
        item = {
            "level": level,
            "typeLesson": f"lesson#{lesson_id:02d}",
            "title": title,
            "summaryKey": summary_key,
            "nouns": nouns_list,
            "verbs": verbs_list,
            "exercises": {
                "nouns": exercises_data.get("nouns", []),
                "verbs": exercises_data.get("verbs", []),
            },
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"Writing lesson {lesson_id} to DynamoDB...")
        table.put_item(Item=item)

        logger.info(f"Ingestion complete for lesson {lesson_id}")
        return {
            "statusCode": 200,
            "lesson": lesson_id,
            "status": "success",
        }

    except Exception as e:
        logger.error(f"Exercise generation failed: {e}", exc_info=True)
        raise
