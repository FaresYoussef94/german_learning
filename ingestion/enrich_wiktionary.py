"""Backfill script: enrich all existing DynamoDB lessons with Wiktionary data.

Fetches every lesson item (SK begins_with "lesson#"), enriches verbs with
present-tense conjugations and nouns with verified article/plural, writes the
updated items back to DynamoDB, then rebuilds the nouns and verbs aggregates.

Usage:
    python enrich_wiktionary.py --table <TABLE_NAME> --level a1

Environment variables (alternative to CLI flags):
    TABLE_NAME   DynamoDB table name
    LEVEL        Course level (default: a1)
"""

import argparse
import logging
import os
import re
import sys
import time

import boto3
import requests
from boto3.dynamodb.conditions import Key

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

WIKTIONARY_API = "https://de.wiktionary.org/w/api.php"
WIKTIONARY_HEADERS = {
    "User-Agent": "GermanLearningApp/1.0 (https://github.com/faresjoe/german_learning; educational)"
}

# Polite delay between Wiktionary requests (seconds)
REQUEST_DELAY = 0.5
# Timeout and retry settings
REQUEST_TIMEOUT = 20
MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# Wiktionary helpers (identical to lambda_exercise_gen/handler.py)
# ---------------------------------------------------------------------------

def fetch_wiktionary_wikitext(word: str) -> str:
    """Fetch raw wikitext for a German word from German Wiktionary.

    Retries up to MAX_RETRIES times with exponential backoff on timeouts.
    Raises on persistent failure. Returns '' if word not found.
    """
    params = {
        "action": "query",
        "titles": word,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            time.sleep(REQUEST_DELAY)
            resp = requests.get(WIKTIONARY_API, params=params, headers=WIKTIONARY_HEADERS, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            break
        except requests.exceptions.Timeout:
            if attempt == MAX_RETRIES:
                logger.error(f"  Wiktionary timed out for '{word}' after {MAX_RETRIES} attempts")
                raise
            wait = 2 ** attempt
            logger.warning(f"  Timeout for '{word}' (attempt {attempt}/{MAX_RETRIES}), retrying in {wait}s...")
            time.sleep(wait)
    data = resp.json()
    pages = data["query"]["pages"]
    page_id = list(pages.keys())[0]
    if page_id == "-1":
        logger.warning(f"  '{word}' not found on German Wiktionary — skipping")
        return ""
    rev = pages[page_id]["revisions"][0]
    if "slots" in rev:
        return rev["slots"]["main"]["*"]
    return rev.get("*", "")


def clean_wikitext_value(text: str) -> str:
    """Strip common wikitext markup from a template field value."""
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = re.sub(r"'+", "", text)
    return text.strip()


def enrich_verb_with_wiktionary(verb: dict) -> dict:
    """Add present-tense conjugations to a verb dict using German Wiktionary."""
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
        logger.info(f"  Enriched verb '{infinitive}': {found}")
    else:
        logger.warning(f"  No conjugations found for '{infinitive}'")

    return enriched


def enrich_noun_with_wiktionary(noun: dict) -> dict:
    """Verify/correct noun article and plural using German Wiktionary."""
    word = noun.get("word", "")
    if not word:
        return noun

    wikitext = fetch_wiktionary_wikitext(word)
    if not wikitext:
        return noun

    enriched = dict(noun)

    genus_match = re.search(r"\|Genus\s*=\s*([mfn])\b", wikitext)
    if genus_match:
        genus_map = {"m": "der", "f": "die", "n": "das"}
        article = genus_map.get(genus_match.group(1))
        if article:
            if enriched.get("article") != article:
                logger.info(f"  Corrected article for '{word}': {enriched.get('article')} → {article}")
            enriched["article"] = article

    plural_match = re.search(
        r"\|Nominativ Plural(?:\s*\d+)?\s*=\s*([^\n|{}]+)", wikitext
    )
    if plural_match:
        plural = clean_wikitext_value(plural_match.group(1))
        if plural and plural not in ("-", "—", "kein Plural", ""):
            if enriched.get("plural") != plural:
                logger.info(f"  Corrected plural for '{word}': {enriched.get('plural')} → {plural}")
            enriched["plural"] = plural

    return enriched


# ---------------------------------------------------------------------------
# DynamoDB helpers
# ---------------------------------------------------------------------------

def get_all_lessons(table, level: str) -> list:
    """Query all lesson items (SK begins_with 'lesson#') for a given level."""
    items = []
    kwargs = {
        "KeyConditionExpression": (
            Key("level").eq(level) & Key("typeLesson").begins_with("lesson#")
        )
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def update_lesson_item(table, level: str, type_lesson: str, nouns: list, verbs: list) -> None:
    """Write enriched nouns and verbs back to a lesson item."""
    table.update_item(
        Key={"level": level, "typeLesson": type_lesson},
        UpdateExpression="SET nouns = :n, verbs = :v",
        ExpressionAttributeValues={":n": nouns, ":v": verbs},
    )


def rebuild_aggregates(table, level: str, all_nouns: list, all_verbs: list) -> None:
    """Rebuild the nouns and verbs aggregate items from all enriched lesson data."""
    # Deduplicate nouns by word
    seen: set = set()
    unique_nouns = []
    for noun in all_nouns:
        word = noun.get("word")
        if word and word not in seen:
            unique_nouns.append(noun)
            seen.add(word)

    # Deduplicate verbs by infinitive
    seen = set()
    unique_verbs = []
    for verb in all_verbs:
        infinitive = verb.get("infinitive")
        if infinitive and infinitive not in seen:
            unique_verbs.append(verb)
            seen.add(infinitive)

    logger.info(f"Rebuilding nouns aggregate: {len(unique_nouns)} unique nouns")
    table.put_item(Item={"level": level, "typeLesson": "nouns", "nouns": unique_nouns})

    logger.info(f"Rebuilding verbs aggregate: {len(unique_verbs)} unique verbs")
    table.put_item(Item={"level": level, "typeLesson": "verbs", "verbs": unique_verbs})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Enrich DynamoDB lessons with Wiktionary data")
    parser.add_argument("--table", default=os.environ.get("TABLE_NAME"), help="DynamoDB table name")
    parser.add_argument("--level", default=os.environ.get("LEVEL", "a1"), help="Course level (default: a1)")
    parser.add_argument("--region", default=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"), help="AWS region")
    args = parser.parse_args()

    if not args.table:
        print("Error: --table or TABLE_NAME env var required", file=sys.stderr)
        sys.exit(1)

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)

    logger.info(f"Fetching all lessons for level '{args.level}' from table '{args.table}'...")
    lessons = get_all_lessons(table, args.level)
    logger.info(f"Found {len(lessons)} lesson(s)")

    if not lessons:
        logger.warning("No lessons found. Make sure the table name and level are correct.")
        sys.exit(0)

    all_nouns: list = []
    all_verbs: list = []

    for lesson in lessons:
        type_lesson = lesson["typeLesson"]
        logger.info(f"\nProcessing {type_lesson} ({lesson.get('title', 'untitled')})")

        raw_verbs = lesson.get("verbs", [])
        raw_nouns = lesson.get("nouns", [])

        logger.info(f"  Enriching {len(raw_verbs)} verb(s)...")
        enriched_verbs = [enrich_verb_with_wiktionary(v) for v in raw_verbs]

        logger.info(f"  Enriching {len(raw_nouns)} noun(s)...")
        enriched_nouns = [enrich_noun_with_wiktionary(n) for n in raw_nouns]

        logger.info(f"  Writing enriched data back to DynamoDB...")
        update_lesson_item(table, args.level, type_lesson, enriched_nouns, enriched_verbs)

        all_nouns.extend(enriched_nouns)
        all_verbs.extend(enriched_verbs)

    logger.info("\nRebuilding aggregates...")
    rebuild_aggregates(table, args.level, all_nouns, all_verbs)

    logger.info("\nDone! All lessons enriched and aggregates rebuilt.")


if __name__ == "__main__":
    main()
