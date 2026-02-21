# ingestion

Python AWS Lambda pipeline. Handles PDF ingestion via Step Functions workflow and API serving.

## Structure

```
lambda_workflow_trigger/    S3-triggered Lambda: starts Step Functions execution
lambda_ocr_markdown/        Step 1: PDF → OCR → 3 markdown files (summary, nouns, verbs)
lambda_exercise_gen/        Step 2: markdown files → parse → generate exercises → DynamoDB
lambda_lesson_api/          API Gateway Lambda: serve lesson content + summary from S3
lambda_exercise_api/        API Gateway Lambda: serve exercises
utils.py                    (in lambda_ocr_markdown/) Comprehensive LLM instruction set
```

## Ingestion Workflow (Step Functions)

**Trigger:** S3 `ObjectCreated` on `.pdf` in raw bucket → `WorkflowTriggerFunction` → Step Functions

### Step 1: OcrAndMarkdownsFunction

**Input:** `{bucket, key}` from Step Functions

**Flow:**
1. Extract lesson number from S3 key (e.g., `lesson_03` → `3`)
2. Start async Textract job
3. Poll every 5s until complete (timeout: 10 min)
4. Extract text from Textract response
5. **Three separate Bedrock calls:**
   - Call 1 (summary): Generate lesson summary markdown + extract title
   - Call 2 (nouns): Generate nouns markdown table
   - Call 3 (verbs): Generate verbs markdown table
6. Save 3 files to ProcessedBucket:
   - `a1/03/summary.md`
   - `a1/03/nouns.md`
   - `a1/03/verbs.md`
7. Return metadata for Step 2

**Environment variables:** `RAW_BUCKET`, `PROCESSED_BUCKET`, `MODEL_ID`

**Bedrock API:** Uses modern `converse()` API with structured system prompts

**Bugs Fixed:**
- Textract polling: checks `response['JobStatus']` directly (was checking `Pages[0].Status` which always returned `IN_PROGRESS`)

### Step 2: ExerciseGenFunction

**Input:** Step 1 output `{level, lessonId, title, summaryKey, nounsKey, verbsKey}`

**Flow:**
1. Read 3 markdown files from ProcessedBucket
2. Parse markdown tables using regex → structured lists:
   - Extract nouns: `{word, article, plural, english}`
   - Extract verbs: `{infinitive, perfectForm, case, english}`
   - **Deduplication:** Skip duplicate entries by first column (German word/infinitive)
3. Bedrock call: Generate exercises (single call, returns JSON)
4. Write full lesson item to DynamoDB

**Environment variables:** `PROCESSED_BUCKET`, `TABLE_NAME`, `MODEL_ID`

**DynamoDB item schema:**
```json
{
  "level": "a1",
  "typeLesson": "lesson#03",
  "title": "Lesson 3: ...",
  "summaryKey": "a1/03/summary.md",
  "nouns": [{"word": "Stuhl", "article": "der", "plural": "Stühle", "english": "chair"}],
  "verbs": [{"infinitive": "gehen", "perfectForm": "ist gegangen", "case": "—", "english": "to go"}],
  "exercises": {
    "nouns": [{"type": "multiple_choice", "topic": "article", "question": "...", "options": [...], "answer": "..."}],
    "verbs": [{"type": "fill_blank", "topic": "perfect_form", "question": "...", "answer": "..."}]
  },
  "generatedAt": "2026-02-21T10:00:00Z"
}
```

## APIs

### Lambda: lesson API (`lambda_lesson_api/handler.py`)

**Endpoints:**
- `GET /lessons/{level}` — return lesson index `[{id, title}]`
- `GET /lessons/{level}/nouns` — return all nouns flattened (deduplicated by word)
- `GET /lessons/{level}/verbs` — return all verbs flattened (deduplicated by infinitive)
- `GET /lessons/{level}/{lessonId}` — return full lesson data (nouns, verbs, exercises; summary excluded)
- `GET /lessons/{level}/{lessonId}/summary` — return lesson summary markdown from S3

**Environment variables:** `TABLE_NAME`, `PROCESSED_BUCKET`

**Deduplication:** Across-lesson deduplication happens at query time (uses `seen` set)

**Bugs Fixed:**
- Added missing `import re`
- Fixed DynamoDB query to use `Key()` builder (not raw string expressions)

### Lambda: exercise API (`lambda_exercise_api/handler.py`)

**Endpoints:**
- `GET /exercises/{level}?type=nouns|verbs` — return exercises by type
- `GET /exercises/{level}` — return all exercises (nouns + verbs)

**Notes:** "lesson" exercise type removed (now only nouns + verbs)

**Environment variable:** `TABLE_NAME`

## Dependencies

All Lambdas depend on `boto3>=1.47.0` (for modern Bedrock converse API). `requirements.txt` files specify this version.

## Bedrock Models

- **Model ID**: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (Haiku for cost efficiency)
- **API**: Modern `converse()` (replaces deprecated `invoke_model()`)
- **Token limits**:
  - Summary: 2000 tokens
  - Nouns: 4000 tokens
  - Verbs: 4000 tokens
  - Exercises: 6000 tokens
