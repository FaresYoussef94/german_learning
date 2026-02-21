"""OCR and Markdown Generation Lambda — Step 1 of ingestion workflow.

Receives S3 bucket and key from Step Functions, performs OCR with Textract,
generates 3 markdown files (summary, nouns, verbs) via Bedrock, and saves to ProcessedBucket.
"""

import json
import logging
import os
import re
import time

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
textract = boto3.client("textract")
bedrock = boto3.client(
    "bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1")
)

RAW_BUCKET = os.environ["RAW_BUCKET"]
PROCESSED_BUCKET = os.environ["PROCESSED_BUCKET"]
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")


def extract_lesson_number(s3_key: str) -> int:
    """Extract lesson number from S3 key (e.g., 'a1/lektion5' -> 5, 'a1/4.pdf' -> 4)."""
    filename = s3_key.split("/")[-1]  # Get filename only, ignore prefix
    match = re.search(r"(\d+)", filename)
    if match:
        return int(match.group(1))
    raise ValueError(f"Could not extract lesson number from key: {s3_key}")


def start_textract_job(bucket: str, key: str) -> str:
    """Start async Textract job and return job ID."""
    response = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    return response["JobId"]


def wait_for_textract(
    job_id: str, timeout_seconds: int = 600, poll_interval: int = 5
) -> dict:
    """Poll Textract job until complete, with timeout. Fixed: check JobStatus not Pages[0].Status."""
    start_time = time.time()
    while True:
        response = textract.get_document_text_detection(JobId=job_id)
        # FIX: Check JobStatus directly, not Pages[0].Status
        status = response.get("JobStatus", "IN_PROGRESS")

        if status in ("SUCCEEDED", "PARTIAL_SUCCESS"):
            return response
        elif status == "FAILED":
            raise RuntimeError(f"Textract job {job_id} failed")

        if time.time() - start_time > timeout_seconds:
            raise TimeoutError(
                f"Textract job {job_id} timeout after {timeout_seconds}s"
            )

        logger.info(
            f"Textract job {job_id} in progress (status={status}), waiting {poll_interval}s..."
        )
        time.sleep(poll_interval)


def extract_text_from_textract(response: dict) -> str:
    """Concatenate all text blocks from Textract response."""
    blocks = response.get("Blocks", [])
    lines = []
    for block in blocks:
        if block["BlockType"] == "LINE":
            lines.append(block.get("Text", ""))
    return "\n".join(lines)


def call_bedrock_for_summary(extracted_text: str, lesson_id: int) -> tuple[str, str]:
    """Generate lesson summary and title via Bedrock."""
    system_prompt = """You are a German A1 lesson processor.
### Structure
- **Heading:** `## Lesson [X]: [Lesson Title]`
- **Subsections:** Multiple ### headings for different topics
- **Content:** Prose paragraphs, example sentences, explanation, and organized tables
- **Format:** Mix of narrative text and structured tables/lists

### Extraction and Creation Rules

#### Lesson Title
- Extract from PDF cover/title page
- Format: `## Lesson [Number]: [Title in German]`
- Example: `## Lesson 5: Was ist das?`

#### Vocabulary Lists with Descriptions
**Create organized lists grouped by category:**

```markdown
### Objects (Gegenstände)
Common objects you can identify and describe:
- **Brille** (die) — glasses
- **Buch** (das) — book
```

- Extract category headings from PDF section titles
- List items use: `- **German (article)** — English`
- Add brief context about the vocabulary group

#### Grammar Explanations

**Rule 1: Extract explicit grammar rules from PDF**
- Look for grammar boxes, tables, or labeled explanations
- Reproduce exactly but organize clearly
- Add context if needed

**Rule 2: Create comprehensive tables for complex grammar**
- Article changes (nominative, accusative, dative, genitive)
- Verb conjugation tables
- Comparison tables (like ein vs. kein)

Example from PDF: If showing article changes in accusative case, create:
```markdown
### Article Changes in Accusative Case

| Case | Masculine | Feminine | Neuter | Plural |
|---|---|---|---|---|
| Nominative | der | die | das | die |
| Accusative | den | die | das | die |
```

**Rule 3: Explain sentence structure patterns**
- Use clear labels: "Nominative (subject)", "Accusative (object)"
- Provide example sentences with translations
- Show position numbers for word order: (position 1, 2, end, etc.)

#### Sample Dialogues
- Extract realistic dialogues from PDF
- Format with speaker labels and translations if helpful
- Use these to show grammar in context

#### Example Sentences
- Extract from PDF lessons
- Organize by topic
- Provide German + English translations
- Use to illustrate grammar rules

#### Key Phrases & Expressions
- Extract common expressions from lesson
- Group by function (greetings, questions, responses)
- Include both formal and informal variants if present

### Content Organization Order (Standard Sequence)
1. **Vocabulary section** (nouns by category)
2. **Key concepts/themes** (what the lesson is about)
3. **Main grammar point(s)** (detailed explanation)
4. **Conjugation/reference tables** (if applicable)
5. **Sentence patterns/structure** (word order rules)
6. **Sample dialogues** (real-world usage)
7. **Useful phrases/expressions** (practical language)
8. **Important notes/exceptions** (special cases)

### Quality Standards

**Prose Quality:**
- ✓ Natural English explanation
- ✓ Clear, educational tone
- ✓ Short paragraphs (3-5 sentences max)
- ✓ Technical terms explained

**Example Sentences:**
- ✓ Include German and English translation
- ✓ Highlight the relevant grammar point in bold
- ✓ Use realistic, practical examples
- ✓ Show variations (positive/negative, formal/informal)

**Table Quality:**
- ✓ Clear headers
- ✓ Consistent formatting
- ✓ Aligned columns
- ✓ Color coding if needed (using markdown emphasis)
- ✓ No empty cells (use — if N/A)

**Completeness:**
- ✓ Covers all major grammar points from lesson
- ✓ Includes all vocabulary categories from PDF
- ✓ Provides context for "why" this matters
- ✓ Links concepts to previous lessons where relevant
    """

    user_prompt = f"""Generate a summary for Lesson {lesson_id} from this OCR text:

{extracted_text}

Return markdown starting with the lesson title."""

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

    summary_md = content[0]["text"]
    # Extract title from markdown (first line should be "# Lesson N: ...")
    lines = summary_md.split("\n")
    title = f"Lesson {lesson_id}"
    for line in lines:
        if line.startswith("#"):
            # Remove all leading "#" symbols and whitespace
            title = re.sub(r"^#+\s*", "", line).strip()
            break

    return title, summary_md


def call_bedrock_for_nouns(extracted_text: str, lesson_id: int) -> str:
    """Generate nouns markdown table via Bedrock."""
    system_prompt = """You are a German A1 lesson processor.
From the OCR text, extract all German nouns and create a markdown table.
Return ONLY a markdown table (no other text, no code fences).
Table format:
| German | Article | Plural | English |
|---|---|---|---|
| Stuhl | der | Stühle | chair |
...
Include all nouns found in the lesson."""

    user_prompt = f"""Extract all nouns from Lesson {lesson_id} OCR text and create a markdown table:

{extracted_text}

Return only the markdown table."""

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

    return content[0]["text"]


def call_bedrock_for_verbs(extracted_text: str, lesson_id: int) -> str:
    """Generate verbs markdown table via Bedrock."""
    system_prompt = """You are a German A1 lesson processor.
From the OCR text, extract all German verbs and create a markdown table.
Return ONLY a markdown table (no other text, no code fences).
Table format:
| Infinitive | Present Perfect | Case | English |
|---|---|---|---|
| gehen | ist gegangen | — | to go |
...

CRITICAL RULES FOR INFINITIVE COLUMN:
- ALWAYS use the base infinitive form (ends with -en, -ern, -eln)
- Examples: gehen (not geht), sehen (not sieht), nehmen (not nimmt), sprechen (not spricht)
- If you find a conjugated form in text, convert it to infinitive
- Do NOT include any conjugation markers
- Do NOT include separable prefixes as separate parts (use only the full infinitive: aufstehen, not auf stehen)

Include all verbs found in the lesson.
Case field: "Acc" for accusative, "Dat" for dative, "—" for no object."""

    user_prompt = f"""Extract all verbs from Lesson {lesson_id} OCR text and create a markdown table:

{extracted_text}

Return only the markdown table."""

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

    return content[0]["text"]


def main(event, context):
    logger.info("OCR and Markdown generation triggered: %s", json.dumps(event))

    # Input from Step Functions
    bucket = event["bucket"]
    key = event["key"]

    logger.info(f"Processing {key} from bucket {bucket}")

    try:
        # Extract lesson number from key
        lesson_id = extract_lesson_number(key)
        level = "a1"  # hardcoded for now
        logger.info(f"Extracted lesson number: {lesson_id}")

        # Start Textract async job
        logger.info("Starting Textract OCR job...")
        textract_job_id = start_textract_job(bucket, key)

        # Wait for completion
        logger.info(f"Waiting for Textract job {textract_job_id}...")
        textract_response = wait_for_textract(textract_job_id)

        # Extract text
        extracted_text = extract_text_from_textract(textract_response)
        logger.info(f"Extracted {len(extracted_text)} characters from PDF")

        # Call Bedrock for summary (also extracts title)
        logger.info("Calling Bedrock for summary generation...")
        title, summary_md = call_bedrock_for_summary(extracted_text, lesson_id)
        logger.info(f"Generated summary for: {title}")

        # Call Bedrock for nouns
        logger.info("Calling Bedrock for nouns extraction...")
        nouns_md = call_bedrock_for_nouns(extracted_text, lesson_id)
        logger.info("Generated nouns table")

        # Call Bedrock for verbs
        logger.info("Calling Bedrock for verbs extraction...")
        verbs_md = call_bedrock_for_verbs(extracted_text, lesson_id)
        logger.info("Generated verbs table")

        # Save to ProcessedBucket
        summary_key = f"{level}/{lesson_id:02d}/summary.md"
        nouns_key = f"{level}/{lesson_id:02d}/nouns.md"
        verbs_key = f"{level}/{lesson_id:02d}/verbs.md"

        logger.info(
            f"Saving to ProcessedBucket: {summary_key}, {nouns_key}, {verbs_key}"
        )

        s3.put_object(Bucket=PROCESSED_BUCKET, Key=summary_key, Body=summary_md)
        s3.put_object(Bucket=PROCESSED_BUCKET, Key=nouns_key, Body=nouns_md)
        s3.put_object(Bucket=PROCESSED_BUCKET, Key=verbs_key, Body=verbs_md)

        logger.info("Saved all markdown files")

        # Return output for next step
        output = {
            "level": level,
            "lessonId": lesson_id,
            "title": title,
            "summaryKey": summary_key,
            "nounsKey": nouns_key,
            "verbsKey": verbs_key,
        }

        logger.info(f"Step 1 complete: {json.dumps(output)}")
        return output

    except Exception as e:
        logger.error(f"OCR and Markdown generation failed: {e}", exc_info=True)
        raise
