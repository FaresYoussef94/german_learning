# ingestion

Python data pipeline: local scripts for processing source files, and AWS Lambda handlers for exercise generation and serving.

## Structure

```
ingestion/
├── split_lessons.py             # Splits German_Lesson_Summary.md into per-lesson files
├── merge_tables.py              # Merges all noun/verb tables into deduplicated all.md files
├── lambda_ingestion/
│   ├── handler.py               # S3-triggered Lambda: parse source files → Bedrock → DynamoDB
│   └── requirements.txt
└── lambda_exercise_api/
    ├── handler.py               # API Gateway Lambda: query DynamoDB, return exercises JSON
    └── requirements.txt
```

## Local scripts

These run during the Amplify build (`preBuild`) and can also be run locally for development.

### `split_lessons.py`

Reads `data/a1/German_Lesson_Summary.md`, splits on `## Lesson N` headings, and writes:
- `frontend/public/data/a1/lessons/lesson_01.md` … `lesson_14.md`
- `frontend/public/data/a1/index.json` (lesson titles)

```bash
python3 ingestion/split_lessons.py
```

### `merge_tables.py`

Reads `data/a1/German_Nouns.md` and `data/a1/German_Verbs.md`, deduplicates rows across lessons, and writes:
- `frontend/public/data/a1/nouns/all.md` (292 unique nouns)
- `frontend/public/data/a1/verbs/all.md` (72 unique verbs)

```bash
python3 ingestion/merge_tables.py
```

Both scripts must be run from the **repo root**.

## Lambda: ingestion (`lambda_ingestion/handler.py`)

**Trigger:** S3 `ObjectCreated` on any `.md` file in the raw source bucket.

**What it does:**
1. Downloads all 3 source files from S3 (`a1/German_Lesson_Summary.md`, `German_Nouns.md`, `German_Verbs.md`)
2. Parses per-lesson content for all 14 lessons
3. For each lesson × type combination (14 × 3 = 42 calls):
   - Builds a prompt from the lesson content
   - Calls **Amazon Bedrock** (`us.anthropic.claude-haiku-4-5`)
   - Parses the JSON response into question objects
   - Writes to DynamoDB

**DynamoDB schema:**

| Attribute | Type | Example | Notes |
|---|---|---|---|
| `level` | String (PK) | `"a1"` | Partition key |
| `typeLesson` | String (SK) | `"nouns#03"` | Sort key: enables `begins_with` filtering |
| `questions` | List | `[{type, question, answer, ...}]` | Generated questions |
| `generatedAt` | String | `"2026-02-16T10:00:00Z"` | ISO timestamp |

**Question types generated:**
- `multiple_choice` — 4 options, one correct
- `fill_blank` — type the answer (e.g. present perfect form)
- `translation` — translate word/phrase
- `article` — type `der`, `die`, or `das`

**Environment variables:**

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB table name (set by CDK) |
| `RAW_BUCKET` | S3 bucket name (set by CDK) |
| `MODEL_ID` | Bedrock model ID (default: `us.anthropic.claude-haiku-4-5`) |

## Lambda: exercise API (`lambda_exercise_api/handler.py`)

**Endpoint:** `GET /exercises/{level}?type=nouns|verbs|lesson`

**Behaviour:**
- `?type` omitted → returns all questions for the level (~630 questions)
- `?type=nouns` → noun questions only, using DynamoDB `begins_with("nouns#")` filter
- Returns `404 { "error": "not_generated" }` if no exercises exist yet

**Response shape:**
```json
{
  "level": "a1",
  "type": "nouns",
  "total": 210,
  "questions": [
    {
      "lessonId": 3,
      "type": "multiple_choice",
      "question": "What article does 'Mutter' take?",
      "options": ["der", "die", "das", "—"],
      "answer": "die"
    }
  ]
}
```

**Environment variables:**

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB table name (set by CDK) |
