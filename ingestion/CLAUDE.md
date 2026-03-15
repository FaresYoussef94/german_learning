# ingestion

Python AWS Lambda pipeline. Handles PDF ingestion via Step Functions workflow, API serving, and hourly aggregate rebuilding.

## Structure

```
lambda_workflow_trigger/       S3-triggered Lambda: starts Step Functions execution
lambda_ocr_markdown/           Step 1: PDF → OCR → 3 markdown files (summary, nouns, verbs)
lambda_exercise_gen/           Step 2: markdown files → parse → generate exercises → DynamoDB + aggregates
lambda_lesson_api/             API Gateway Lambda: serve lessons from aggregates (fast)
lambda_exercise_api/           API Gateway Lambda: serve exercises from aggregates (fast)
lambda_feedback_api/           API Gateway Lambda: delete/improve exercises, update aggregates
lambda_presigned_url/          API Gateway Lambda: generate presigned S3 upload URLs (mobile uploads)
lambda_aggregate_rebuild/      EventBridge-triggered: rebuild aggregates hourly (safe for concurrent uploads)
utils.py                       (in lambda_ocr_markdown/) Comprehensive LLM instruction set
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
3. Wiktionary API enrichment (requires `beautifulsoup4` for HTML parsing):
   - Verbs: fetch `Flexion:{verb}` HTML page → parse Präsens table (all 6 forms: ich/du/erSieEs/wir/ihr/sieSie) + parse Perfekt table → extract `perfectForm` (3rd person singular, e.g. `"ist gegangen"`)
   - Nouns: fetch raw wikitext → extract Genus (→ der/die/das) and Nominativ Plural → verify/correct article and plural
   - HTTP errors → fail the Lambda; word not found → skip gracefully
4. Bedrock call: Generate exercises (single call, returns JSON)
5. Write full lesson item to DynamoDB

**Environment variables:** `PROCESSED_BUCKET`, `TABLE_NAME`, `MODEL_ID`

**DynamoDB item schema:**

```json
{
  "level": "a1",
  "typeLesson": "lesson#03",
  "title": "Lesson 3: ...",
  "summaryKey": "a1/03/summary.md",
  "nouns": [{"word": "Stuhl", "article": "der", "plural": "Stühle", "english": "chair"}],
  "verbs": [{"infinitive": "gehen", "perfectForm": "ist gegangen", "case": "—", "english": "to go", "ich": "gehe", "du": "gehst", "erSieEs": "geht", "wir": "gehen", "ihr": "geht", "sieSie": "gehen"}],
  // Note: perfectForm and conjugations (ich/du/erSieEs/wir/ihr/sieSie) are sourced from Wiktionary (not Bedrock)
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

All Lambdas include `boto3` in `requirements.txt`. `lambda_exercise_gen` also requires `requests` (for Wiktionary API calls) and `beautifulsoup4` (for HTML parsing of Wiktionary Flexion pages).

### Lambda: feedback API (`lambda_feedback_api/handler.py`)

**Endpoints:**

- `DELETE /feedback/{level}/{lessonId}/{type}` — delete a question
- `POST /feedback/{level}/{lessonId}/{type}/regenerate` — AI-regenerate with feedback
- `POST /feedback/{level}/{lessonId}/{type}/replace` — accept regenerated question

**Flow:**

- Delete: Remove from lesson item + exercise aggregate
- Regenerate: Call Bedrock with user feedback → return new question (no DB write)
- Replace: Swap old for new in lesson item + exercise aggregate

**Environment variables:** `TABLE_NAME`, `MODEL_ID`

**Question identity:** Question text is the natural key (unique within lesson)

### Lambda: presigned URL API (`lambda_presigned_url/handler.py`)

**Endpoint:**

- `POST /lesson-upload-url` — generate presigned S3 upload URL

**Authentication:** Two-tier

1. API Key (header): `x-api-key: <key>` (validates against `API_KEY` env var)
2. Password (body): `{"password": "..."}` (validates against `UPLOAD_PASSWORD` env var)

**Request headers:**

```
x-api-key: <API_KEY>
Content-Type: application/json
```

**Request body:**

```json
{
  "lessonId": "3",
  "level": "a1", // optional, defaults to "a1"
  "password": "your-password" // entered by user in the upload form
}
```

**Frontend flow:**

1. User visits `/upload` page
2. Enters: Lesson ID, Course Level, and Upload Password
3. Clicks "Get Upload Link"
4. Frontend sends POST request with password
5. Lambda validates: API Key (header) + Password (body)
6. If valid: returns presigned S3 URL (10-minute expiry)
7. User selects PDF files and uploads directly to S3

**Response (200 OK):**

```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/a1/lesson_03.pdf?AWSAccessKeyId=...",
  "key": "a1/lesson_03.pdf",
  "expiresIn": 600
}
```

**Error (401 Unauthorized):**

```json
{
  "error": "Invalid password"
}
```

**Flow:**

1. Validate password (if `UPLOAD_PASSWORD` env var is set)
2. Validate lesson ID (must be numeric)
3. Format lesson ID as 2-digit number (3 → 03)
4. Generate presigned PUT URL (10-minute expiry)
5. Return URL to client

**Use case:** Mobile uploads via browser — user receives presigned URL, opens it on phone, selects PDF from Downloads, uploads directly without CLI/S3 app

**Environment variables:** `RAW_BUCKET`, `UPLOAD_PASSWORD` (set in CDK)

**Notes:**

- Presigned URLs are time-limited (10 minutes)
- Supports any lesson level (a1, a2, b1, etc.)
- S3 upload automatically triggers workflow (same as CLI uploads)
- Password authentication protects against unauthorized uploads
- Set `UPLOAD_PASSWORD` as environment variable during CDK deployment

## Aggregate Structure (DynamoDB)

**Three-tier architecture for performance:**

```
Tier 1: Aggregates (cross-lesson views, updated hourly)
  PK: level    SK: nouns              → {nouns: [all unique nouns]}
  PK: level    SK: verbs              → {verbs: [all unique verbs]}
  PK: level    SK: exercises#nouns    → {exercises: [all noun exercises]}
  PK: level    SK: exercises#verbs    → {exercises: [all verb exercises]}

Tier 2: Lesson items (complete lesson data)
  PK: level    SK: lesson#03          → {title, summaryKey, generatedAt, nouns, verbs, exercises}

Tier 3: S3 (large text data)
  summaries:   a1/03/summary.md
  nouns:       a1/03/nouns.md
  verbs:       a1/03/verbs.md
```

**Why three tiers?**

- Aggregates enable fast cross-lesson queries (1 GetItem vs Query + iterate)
- Lesson items keep complete data for single-lesson views
- S3 keeps large summaries separate (under 400KB DynamoDB limit)

### Lambda: aggregate rebuild (`lambda_aggregate_rebuild/handler.py`)

**Trigger:** EventBridge rule (every 1 hour)

**Flow:**

**Multi-level**: scans DynamoDB to discover all levels with lesson items (not hardcoded to a1)

1. Query all lesson items (PK=level, SK begins_with "lesson#")
2. Flatten nouns → deduplicate by word
3. Flatten verbs → deduplicate by infinitive
4. Flatten noun exercises → deduplicate by question text
5. Flatten verb exercises → deduplicate by question text
6. Write 4 clean aggregate items

**Environment variables:** `TABLE_NAME`

**Why hourly rebuild?**

- Handles concurrent PDF uploads safely (no race conditions)
- Fixes any lost updates from simultaneous ingestion
- Removes duplicates automatically
- Non-blocking (runs independently)

**Performance:** 5-minute timeout, handles 24 lessons easily

## APIs Performance

| Endpoint                            | Before            | After                   | Speed         |
| ----------------------------------- | ----------------- | ----------------------- | ------------- |
| `GET /lessons/{level}/nouns`        | Query all lessons | 1 GetItem (aggregate)   | **10-50x** ⚡ |
| `GET /lessons/{level}/verbs`        | Query all lessons | 1 GetItem (aggregate)   | **10-50x** ⚡ |
| `GET /exercises/{level}?type=nouns` | Query all lessons | 1 GetItem (aggregate)   | **10-50x** ⚡ |
| `GET /exercises/{level}`            | Query all lessons | 2 GetItems (aggregates) | **5-25x** ⚡  |

## Bedrock Models

- **Model ID (ingestion)**: `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Sonnet for quality)
- **Model ID (feedback)**: `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Sonnet for accuracy)
- **API**: Modern `converse()` (replaces deprecated `invoke_model()`)
- **Token limits**:
  - Summary: 2000 tokens
  - Nouns: 4000 tokens
  - Verbs: 4000 tokens
  - Exercises: 6000 tokens
  - Feedback regeneration: 500 tokens
