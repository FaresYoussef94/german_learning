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
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
import requests
from bs4 import BeautifulSoup
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


PERSON_TO_KEY = {
    "1. Person Singular": "ich",
    "2. Person Singular": "du",
    "3. Person Singular": "erSieEs",
    "1. Person Plural":   "wir",
    "2. Person Plural":   "ihr",
    "3. Person Plural":   "sieSie",
}


def fetch_conjugations_from_flexion(infinitive: str) -> dict:
    """Fetch all 6 Präsens Indikativ forms from the Flexion:{infinitive} page."""
    params = {
        "action": "parse",
        "page": f"Flexion:{infinitive}",
        "prop": "text",
        "format": "json",
        "disablelimitreport": "1",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            time.sleep(REQUEST_DELAY)
            resp = requests.get(WIKTIONARY_API, params=params, headers=WIKTIONARY_HEADERS, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            break
        except requests.exceptions.Timeout:
            if attempt == MAX_RETRIES:
                logger.error(f"  Wiktionary timed out for 'Flexion:{infinitive}' after {MAX_RETRIES} attempts")
                raise
            wait = 2 ** attempt
            logger.warning(f"  Timeout for 'Flexion:{infinitive}' (attempt {attempt}/{MAX_RETRIES}), retrying in {wait}s...")
            time.sleep(wait)

    data = resp.json()
    if "error" in data:
        logger.warning(f"  'Flexion:{infinitive}' not found — skipping conjugation enrichment")
        return {}

    html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(html, "html.parser")

    def is_ccccff(tag) -> bool:
        """Match both old (bgcolor attr) and new (inline style) Wiktionary table formats."""
        return (
            tag.get("bgcolor", "").upper() == "#CCCCFF"
            or "background:#ccccff" in tag.get("style", "").lower()
        )

    def extract_section(target_section: str) -> dict:
        """Extract person→form mapping from a named section, searching all tables."""
        for table in soup.find_all("table"):
            forms = {}
            in_section = False
            section_found = False
            for row in table.find_all("tr"):
                all_cells = row.find_all(["td", "th"])
                if not all_cells:
                    continue
                # Section header: exactly one ccccff cell
                if len(all_cells) == 1 and is_ccccff(all_cells[0]):
                    header_text = all_cells[0].get_text(strip=True)
                    if header_text == target_section:
                        in_section = True
                        section_found = True
                    elif in_section:
                        break  # Next section — stop
                    continue
                if not in_section:
                    continue
                # Person data rows use <td>; sub-header rows use <th> — skip them
                td_cells = row.find_all("td")
                if len(td_cells) < 2:
                    continue
                small = td_cells[0].find("small")
                if not small:
                    continue
                person_label = small.get_text(strip=True)
                key = PERSON_TO_KEY.get(person_label)
                if not key:
                    continue
                # Second td: Indikativ Aktiv — contains "pronoun form", strip pronoun prefix.
                # Some cells append archaic variants after "veraltet:" — strip those.
                cell_text = td_cells[1].get_text(separator=" ", strip=True)
                veraltet_idx = cell_text.lower().find("veraltet")
                if veraltet_idx > 0:
                    cell_text = cell_text[:veraltet_idx].strip()
                parts = cell_text.split(" ", 1)
                if len(parts) == 2 and parts[1].strip() not in ("—", ""):
                    forms[key] = parts[1].strip().rstrip(",")
            if section_found:
                return forms
        return {}

    result = extract_section("Präsens")
    if not result:
        logger.warning(f"  No Präsens table found for 'Flexion:{infinitive}'")
        return {}

    perfekt = extract_section("Perfekt")
    # Use 3rd person singular as canonical perfectForm: "er/sie/es ist gegangen" → "ist gegangen"
    if "erSieEs" in perfekt:
        result["perfectForm"] = perfekt["erSieEs"]

    return result


def enrich_verb_with_wiktionary(verb: dict) -> dict:
    """Add present-tense conjugations to a verb dict using the Wiktionary Flexion page."""
    infinitive = verb.get("infinitive", "")
    if not infinitive:
        return verb

    conjugations = fetch_conjugations_from_flexion(infinitive)
    if not conjugations:
        return verb

    enriched = {**verb, **conjugations}
    logger.info(f"  Enriched verb '{infinitive}': {list(conjugations.keys())}")
    return enriched


def fetch_noun_corrections(word: str) -> dict:
    """Fetch article and plural corrections for a noun from German Wiktionary.

    Returns a (possibly empty) dict with 'article' and/or 'plural' keys.
    Returns {} if the word is not found or no corrections are available.
    """
    wikitext = fetch_wiktionary_wikitext(word)
    if not wikitext:
        return {}

    corrections = {}

    genus_match = re.search(r"\|Genus\s*=\s*([mfn])\b", wikitext)
    if genus_match:
        genus_map = {"m": "der", "f": "die", "n": "das"}
        article = genus_map.get(genus_match.group(1))
        if article:
            corrections["article"] = article

    plural_match = re.search(
        r"\|Nominativ Plural(?:\s*\d+)?\s*=\s*([^\n|{}]+)", wikitext
    )
    if plural_match:
        plural = clean_wikitext_value(plural_match.group(1))
        if plural and plural not in ("-", "—", "kein Plural", ""):
            corrections["plural"] = plural

    return corrections


def enrich_noun_with_wiktionary(noun: dict) -> dict:
    """Verify/correct noun article and plural using German Wiktionary."""
    word = noun.get("word", "")
    if not word:
        return noun
    corrections = fetch_noun_corrections(word)
    if not corrections:
        return noun
    enriched = {**noun, **corrections}
    if corrections.get("article") and corrections["article"] != noun.get("article"):
        logger.info(f"  Corrected article for '{word}': {noun.get('article')} → {corrections['article']}")
    if corrections.get("plural") and corrections["plural"] != noun.get("plural"):
        logger.info(f"  Corrected plural for '{word}': {noun.get('plural')} → {corrections['plural']}")
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

def debug_word(word: str) -> None:
    """Print the raw Wiktionary wikitext for a word to inspect field names."""
    print(f"\n=== Raw Wiktionary wikitext for '{word}' ===\n")
    wikitext = fetch_wiktionary_wikitext(word)
    if not wikitext:
        print("(not found)")
        return
    # Print only lines containing Präsens to keep output short
    for line in wikitext.splitlines():
        if "Präsens" in line or "Deutsch Verb" in line:
            print(line)
    print("\n=== End ===\n")


def debug_html(word: str) -> None:
    """Fetch the rendered HTML for a word and print conjugation-related tables."""
    params = {
        "action": "parse",
        "page": word,
        "prop": "text",
        "format": "json",
        "disablelimitreport": "1",
    }
    time.sleep(REQUEST_DELAY)
    resp = requests.get(WIKTIONARY_API, params=params, headers=WIKTIONARY_HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        print(f"Page '{word}' not found")
        return

    html = data["parse"]["text"]["*"]

    # Print all table HTML that contains "Präsens"
    import re as _re
    tables = _re.findall(r"<table[^>]*>.*?</table>", html, _re.DOTALL)
    found = 0
    for table in tables:
        if "Präsens" in table:
            print(f"\n=== Table {found + 1} containing 'Präsens' ===\n")
            # Strip tags to show readable content
            readable = _re.sub(r"<[^>]+>", " ", table)
            readable = _re.sub(r"\s{2,}", " ", readable)
            print(readable[:3000])
            print("\n--- Raw HTML (first 2000 chars) ---\n")
            print(table[:2000])
            found += 1
    if not found:
        print(f"No tables containing 'Präsens' found for '{word}'")


def main():
    parser = argparse.ArgumentParser(description="Enrich DynamoDB lessons with Wiktionary data")
    parser.add_argument("--table", default=os.environ.get("TABLE_NAME"), help="DynamoDB table name")
    parser.add_argument("--level", default=os.environ.get("LEVEL", "a1"), help="Course level (default: a1)")
    parser.add_argument("--region", default=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"), help="AWS region")
    parser.add_argument("--workers", type=int, default=8, help="Parallel Wiktionary fetch workers (default: 8)")
    parser.add_argument("--debug-word", metavar="WORD", help="Print raw Wiktionary wikitext for a word and exit")
    parser.add_argument("--debug-html", metavar="WORD", help="Print rendered HTML conjugation tables for a word and exit")
    args = parser.parse_args()

    if args.debug_word:
        debug_word(args.debug_word)
        sys.exit(0)

    if args.debug_html:
        debug_html(args.debug_html)
        sys.exit(0)

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

    # --- Collect unique words across all lessons (deduplicated) ---
    unique_infinitives = {
        v["infinitive"]
        for lesson in lessons
        for v in lesson.get("verbs", [])
        if v.get("infinitive")
    }
    unique_noun_words = {
        n["word"]
        for lesson in lessons
        for n in lesson.get("nouns", [])
        if n.get("word")
    }
    logger.info(
        f"\nFetching {len(unique_infinitives)} unique verb(s) and "
        f"{len(unique_noun_words)} unique noun(s) in parallel ({args.workers} workers)..."
    )

    # --- Parallel fetch ---
    verb_cache: dict = {}
    noun_cache: dict = {}

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        verb_futures = {executor.submit(fetch_conjugations_from_flexion, inf): inf for inf in unique_infinitives}
        noun_futures = {executor.submit(fetch_noun_corrections, word): word for word in unique_noun_words}

        for future in as_completed(verb_futures):
            inf = verb_futures[future]
            try:
                result = future.result()
                verb_cache[inf] = result
                if result:
                    logger.info(f"  Verb '{inf}': fetched {list(result.keys())}")
            except Exception as e:
                logger.error(f"  Error fetching verb '{inf}': {e}")
                verb_cache[inf] = {}

        for future in as_completed(noun_futures):
            word = noun_futures[future]
            try:
                result = future.result()
                noun_cache[word] = result
                if result:
                    logger.info(f"  Noun '{word}': fetched {result}")
            except Exception as e:
                logger.error(f"  Error fetching noun '{word}': {e}")
                noun_cache[word] = {}

    # --- Apply cache and write back per lesson ---
    all_nouns: list = []
    all_verbs: list = []

    for lesson in lessons:
        type_lesson = lesson["typeLesson"]
        logger.info(f"\nApplying enrichment to {type_lesson} ({lesson.get('title', 'untitled')})")

        enriched_verbs = []
        for verb in lesson.get("verbs", []):
            inf = verb.get("infinitive", "")
            corrections = verb_cache.get(inf, {})
            enriched_verbs.append({**verb, **corrections} if corrections else verb)

        enriched_nouns = []
        for noun in lesson.get("nouns", []):
            word = noun.get("word", "")
            corrections = noun_cache.get(word, {})
            if corrections:
                if corrections.get("article") and corrections["article"] != noun.get("article"):
                    logger.info(f"  Corrected article for '{word}': {noun.get('article')} → {corrections['article']}")
                if corrections.get("plural") and corrections["plural"] != noun.get("plural"):
                    logger.info(f"  Corrected plural for '{word}': {noun.get('plural')} → {corrections['plural']}")
            enriched_nouns.append({**noun, **corrections} if corrections else noun)

        logger.info(f"  Writing enriched data back to DynamoDB...")
        update_lesson_item(table, args.level, type_lesson, enriched_nouns, enriched_verbs)

        all_nouns.extend(enriched_nouns)
        all_verbs.extend(enriched_verbs)

    logger.info("\nRebuilding aggregates...")
    rebuild_aggregates(table, args.level, all_nouns, all_verbs)

    logger.info("\nDone! All lessons enriched and aggregates rebuilt.")


if __name__ == "__main__":
    main()
