# lambda_lesson_api

API Gateway Lambda. Serves lesson content from DynamoDB and summaries from S3.

**Entry point:** `handler.main`

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/lessons/{level}` | `[{id, title}, ...]` — lesson index |
| `GET` | `/lessons/{level}/nouns` | `[{word, article, plural, english}, ...]` — all nouns |
| `GET` | `/lessons/{level}/verbs` | `[{infinitive, perfectForm, case, english}, ...]` — all verbs |
| `GET` | `/lessons/{level}/{lessonId}` | `{id, title, nouns[], verbs[], exercises}` — single lesson (no summary) |
| `GET` | `/lessons/{level}/{lessonId}/summary` | `markdown text` — lesson summary from S3 |

All endpoints return `404 { "error": "not_found" }` or `404 { "error": "not_generated" }` if data doesn't exist.

## Environment variables

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB exercises table (set by CDK) |
| `PROCESSED_BUCKET` | S3 bucket where markdown summaries are stored (set by CDK) |

## DynamoDB access pattern

Uses `Key()` builder (modern boto3):
- **Index:** Query `PK=level AND SK begins_with "lesson#"`
- **Detail:** GetItem with `PK=level, SK=lesson#{id:02d}`

## Summary fetching

The `/lessons/{level}/{lessonId}/summary` endpoint:
1. Queries DynamoDB for the lesson item (to get `summaryKey`)
2. Proxies the S3 object: `s3.get_object(Bucket=PROCESSED_BUCKET, Key=summaryKey)`
3. Returns markdown text with `Content-Type: text/markdown`

This allows summaries to stay in S3 (don't count against DynamoDB 400KB item limit) while still being accessible via the API.

## Response shape

**Lesson index:** `[{id: 1, title: "Lesson 1: ..."}, ...]`

**Single lesson:**
```json
{
  "id": 3,
  "title": "Lesson 3: ...",
  "nouns": [{word, article, plural, english}, ...],
  "verbs": [{infinitive, perfectForm, case, english}, ...],
  "exercises": {
    "nouns": [{type, question, [options], answer}, ...],
    "verbs": [{type, question, [options], answer}, ...]
  }
}
```

**All nouns (deduplicated):**
```json
[
  {word: "Stuhl", article: "der", plural: "Stühle", english: "chair"},
  {word: "Tisch", article: "der", plural: "Tische", english: "table"}
]
```

**Summary:** Plain text markdown

## Deduplication

**Cross-lesson deduplication:** When returning all nouns/verbs, uses a `seen` set to skip duplicate words/infinitives across lessons.

Example: If Lesson 1 has "der Stuhl" and Lesson 3 also has "der Stuhl", only the first is included in `/lessons/a1/nouns`.

## Changes from original

- **Added** `import re` (was missing, caused NameError)
- **Fixed** DynamoDB query to use `Key()` builder instead of raw string expressions
- **Added** `lesson_summary()` function for new `/summary` endpoint
- **Removed** `summary` field from `single_lesson()` response (now fetched separately)
- **Updated** routing logic to handle `/summary` path
- **Added** `PROCESSED_BUCKET` environment variable and S3 client

## CORS

All responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Content-Type: application/json (or text/markdown for summary)
```

## IAM Permissions

Lambda role requires:
- `dynamodb:Query` on ExercisesTable (PK=level, begins_with)
- `dynamodb:GetItem` on ExercisesTable (for summary lookup)
- `s3:GetObject` on ProcessedBucket (for summary proxy)
