"""Exercise Generation Lambda — Step 2 of ingestion workflow.

Receives markdown files from Step 1, parses them, generates exercises via Bedrock,
and writes the full lesson item to DynamoDB.
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

import boto3
import requests

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

WIKTIONARY_API = "https://de.wiktionary.org/w/api.php"
WIKTIONARY_HEADERS = {
    "User-Agent": "GermanLearningApp/1.0 (https://github.com/faresjoe/german_learning; educational)"
}
WIKTIONARY_TIMEOUT = 20
WIKTIONARY_MAX_RETRIES = 3


def fetch_wiktionary_wikitext(word: str) -> str:
    """Fetch raw wikitext for a German word from German Wiktionary.

    Retries up to WIKTIONARY_MAX_RETRIES times on timeout.
    Raises on persistent HTTP/network errors. Returns '' if word not found.
    """
    params = {
        "action": "query",
        "titles": word,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
    }
    for attempt in range(1, WIKTIONARY_MAX_RETRIES + 1):
        try:
            resp = requests.get(WIKTIONARY_API, params=params, headers=WIKTIONARY_HEADERS, timeout=WIKTIONARY_TIMEOUT)
            resp.raise_for_status()  # raises on 4xx/5xx — fails the Lambda
            break
        except requests.exceptions.Timeout:
            if attempt == WIKTIONARY_MAX_RETRIES:
                logger.error(f"Wiktionary timed out for '{word}' after {WIKTIONARY_MAX_RETRIES} attempts")
                raise
            wait = 2 ** attempt
            logger.warning(f"Timeout for '{word}' (attempt {attempt}/{WIKTIONARY_MAX_RETRIES}), retrying in {wait}s...")
            time.sleep(wait)
    data = resp.json()
    pages = data["query"]["pages"]
    page_id = list(pages.keys())[0]
    if page_id == "-1":
        logger.warning(f"'{word}' not found on German Wiktionary — skipping enrichment")
        return ""
    rev = pages[page_id]["revisions"][0]
    # Handle both old (*) and new (slots) API response formats
    if "slots" in rev:
        return rev["slots"]["main"]["*"]
    return rev.get("*", "")


def clean_wikitext_value(text: str) -> str:
    """Strip common wikitext markup from a template field value."""
    # [[link|display]] → display, [[link]] → link
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", text)
    # Remove {{templates}}
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    # Remove '' / ''' bold/italic markers
    text = re.sub(r"'+", "", text)
    return text.strip()


def enrich_verb_with_wiktionary(verb: dict) -> dict:
    """Add present-tense conjugations to a verb dict using German Wiktionary.

    German Wiktionary uses the {{Deutsch Verb Übersicht}} template with
    explicit Präsens_* fields, making regex extraction straightforward.
    Falls back to the original verb dict on any failure.
    """
    infinitive = verb.get("infinitive", "")
    if not infinitive:
        return verb

    wikitext = fetch_wiktionary_wikitext(infinitive)
    if not wikitext:
        return verb

    field_patterns = {
        "ich":     r"\|Präsens_ich\s*=\s*([^\n|{}]+)",
        "du":      r"\|Präsens_du\s*=\s*([^\n|{}]+)",
        "erSieEs": r"\|Präsens_er,\s*sie,\s*es\s*=\s*([^\n|{}]+)",
        "wir":     r"\|Präsens_wir\s*=\s*([^\n|{}]+)",
        "ihr":     r"\|Präsens_ihr\s*=\s*([^\n|{}]+)",
        "sieSie":  r"\|Präsens_sie\s*=\s*([^\n|{}]+)",
    }

    enriched = dict(verb)
    found = []
    for key, pattern in field_patterns.items():
        match = re.search(pattern, wikitext)
        if match:
            val = clean_wikitext_value(match.group(1))
            if val:
                enriched[key] = val
                found.append(key)

    # Only use what Wiktionary explicitly provides — no derivations.
    # Derivation rules (wir=infinitive, ihr=erSieEs, etc.) break for irregular
    # verbs (e.g. sein: wir sind, ihr seid — not "sein"/"ist").

    if found:
        logger.info(f"Enriched verb '{infinitive}' with conjugations: {found}")
    else:
        logger.warning(f"No Wiktionary conjugations found for '{infinitive}'")

    return enriched


def enrich_noun_with_wiktionary(noun: dict) -> dict:
    """Verify/correct noun article and plural using German Wiktionary.

    German Wiktionary uses {{Deutsch Substantiv Übersicht}} with explicit
    Genus and Nominativ Plural fields.  Bedrock's values are kept as fallback
    when Wiktionary has no entry for the word.
    """
    word = noun.get("word", "")
    if not word:
        return noun

    wikitext = fetch_wiktionary_wikitext(word)
    if not wikitext:
        return noun

    enriched = dict(noun)

    # Genus: m → der, f → die, n → das
    genus_match = re.search(r"\|Genus\s*=\s*([mfn])\b", wikitext)
    if genus_match:
        genus_map = {"m": "der", "f": "die", "n": "das"}
        article = genus_map.get(genus_match.group(1))
        if article:
            enriched["article"] = article
            logger.info(f"Verified article for '{word}': {article}")

    # Nominativ Plural (handles "Nominativ Plural 1", "Nominativ Plural 2", etc.)
    plural_match = re.search(
        r"\|Nominativ Plural(?:\s*\d+)?\s*=\s*([^\n|{}]+)", wikitext
    )
    if plural_match:
        plural = clean_wikitext_value(plural_match.group(1))
        if plural and plural not in ("-", "—", "kein Plural", ""):
            enriched["plural"] = plural
            logger.info(f"Verified plural for '{word}': {plural}")

    return enriched


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


def update_aggregates(
    level: str,
    nouns_list: list,
    verbs_list: list,
    exercises_data: dict,
) -> None:
    """Merge new nouns/verbs/exercises into aggregate items, deduplicating."""
    table = dynamodb.Table(TABLE_NAME)

    # Update nouns aggregate
    logger.info("Updating nouns aggregate...")
    try:
        response = table.get_item(Key={"level": level, "typeLesson": "nouns"})
        existing_nouns = response.get("Item", {}).get("nouns", [])

        # Merge and deduplicate by word
        seen = {n.get("word") for n in existing_nouns}
        merged_nouns = list(existing_nouns)
        for noun in nouns_list:
            word = noun.get("word")
            if word and word not in seen:
                merged_nouns.append(noun)
                seen.add(word)

        table.put_item(
            Item={"level": level, "typeLesson": "nouns", "nouns": merged_nouns}
        )
        logger.info(f"Updated nouns aggregate: {len(merged_nouns)} total nouns")
    except Exception as e:
        logger.error(f"Failed to update nouns aggregate: {e}")
        raise

    # Update verbs aggregate
    logger.info("Updating verbs aggregate...")
    try:
        response = table.get_item(Key={"level": level, "typeLesson": "verbs"})
        existing_verbs = response.get("Item", {}).get("verbs", [])

        # Merge and deduplicate by infinitive
        seen = {v.get("infinitive") for v in existing_verbs}
        merged_verbs = list(existing_verbs)
        for verb in verbs_list:
            infinitive = verb.get("infinitive")
            if infinitive and infinitive not in seen:
                merged_verbs.append(verb)
                seen.add(infinitive)

        table.put_item(
            Item={"level": level, "typeLesson": "verbs", "verbs": merged_verbs}
        )
        logger.info(f"Updated verbs aggregate: {len(merged_verbs)} total verbs")
    except Exception as e:
        logger.error(f"Failed to update verbs aggregate: {e}")
        raise

    # Update exercises#nouns aggregate
    logger.info("Updating exercises#nouns aggregate...")
    try:
        response = table.get_item(
            Key={"level": level, "typeLesson": "exercises#nouns"}
        )
        existing_exercises = response.get("Item", {}).get("exercises", [])

        # Merge exercises (deduplicate by question text)
        seen_questions = {ex.get("question") for ex in existing_exercises}
        merged_exercises = list(existing_exercises)
        for exercise in exercises_data.get("nouns", []):
            question = exercise.get("question")
            if question and question not in seen_questions:
                merged_exercises.append(exercise)
                seen_questions.add(question)

        table.put_item(
            Item={
                "level": level,
                "typeLesson": "exercises#nouns",
                "exercises": merged_exercises,
            }
        )
        logger.info(
            f"Updated exercises#nouns aggregate: {len(merged_exercises)} total exercises"
        )
    except Exception as e:
        logger.error(f"Failed to update exercises#nouns aggregate: {e}")
        raise

    # Update exercises#verbs aggregate
    logger.info("Updating exercises#verbs aggregate...")
    try:
        response = table.get_item(
            Key={"level": level, "typeLesson": "exercises#verbs"}
        )
        existing_exercises = response.get("Item", {}).get("exercises", [])

        # Merge exercises (deduplicate by question text)
        seen_questions = {ex.get("question") for ex in existing_exercises}
        merged_exercises = list(existing_exercises)
        for exercise in exercises_data.get("verbs", []):
            question = exercise.get("question")
            if question and question not in seen_questions:
                merged_exercises.append(exercise)
                seen_questions.add(question)

        table.put_item(
            Item={
                "level": level,
                "typeLesson": "exercises#verbs",
                "exercises": merged_exercises,
            }
        )
        logger.info(
            f"Updated exercises#verbs aggregate: {len(merged_exercises)} total exercises"
        )
    except Exception as e:
        logger.error(f"Failed to update exercises#verbs aggregate: {e}")
        raise


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

        # Enrich verbs with present-tense conjugations from Wiktionary
        logger.info("Enriching verbs with Wiktionary conjugations...")
        verbs_list = [enrich_verb_with_wiktionary(v) for v in verbs_list]

        # Enrich nouns with verified article/plural from Wiktionary
        logger.info("Enriching nouns with Wiktionary article/plural...")
        nouns_list = [enrich_noun_with_wiktionary(n) for n in nouns_list]

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

        # Update aggregates for fast cross-lesson queries
        logger.info("Updating aggregates for fast queries...")
        update_aggregates(level, nouns_list, verbs_list, exercises_data)

        logger.info(f"Ingestion complete for lesson {lesson_id}")
        return {
            "statusCode": 200,
            "lesson": lesson_id,
            "status": "success",
        }

    except Exception as e:
        logger.error(f"Exercise generation failed: {e}", exc_info=True)
        raise
