# lambda_ingestion

S3-triggered Lambda. Entry point: `handler.main`.

## What it does

1. Downloads all 3 source files from S3 (`a1/German_Lesson_Summary.md`, `German_Nouns.md`, `German_Verbs.md`)
2. Splits each file into per-lesson sections on `## Lesson N` headings
3. For each lesson (1–14) × type (`nouns`, `verbs`, `lesson`):
   - Builds a Bedrock prompt from the relevant content
   - Calls `bedrock:InvokeModel` with Claude Haiku
   - Parses the JSON response
   - Writes to DynamoDB: PK=`"a1"`, SK=`"<type>#<NN>"`

## Environment variables

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB table (set by CDK) |
| `RAW_BUCKET` | S3 bucket name (set by CDK) |
| `MODEL_ID` | Bedrock model ID (default: `us.anthropic.claude-haiku-4-5`) |

## DynamoDB item written

```json
{
  "level": "a1",
  "typeLesson": "nouns#03",
  "questions": [...],
  "generatedAt": "2026-02-16T10:00:00Z"
}
```

## Bedrock response format

The model is instructed to return only a JSON object `{ "questions": [...] }`. The handler strips markdown code fences if present before parsing.

## Error handling

Per-lesson Bedrock failures are caught, logged as warnings, and skipped. A failure to fetch the source files from S3 raises and fails the Lambda.
