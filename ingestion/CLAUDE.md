# ingestion

Python data pipeline. Two local scripts for build-time processing and two Lambda handlers for AWS exercise generation and serving.

## Structure

```
split_lessons.py          Splits German_Lesson_Summary.md into per-lesson files
merge_tables.py           Merges noun/verb tables into deduplicated all.md files
lambda_ingestion/         S3-triggered Lambda: parse sources → Bedrock → DynamoDB
lambda_exercise_api/      API Gateway Lambda: query DynamoDB, return exercises JSON
```

## Local scripts (run from repo root)

```bash
python3 ingestion/split_lessons.py
# Writes: frontend/public/data/a1/lessons/lesson_01.md … lesson_14.md
#         frontend/public/data/a1/index.json

python3 ingestion/merge_tables.py
# Writes: frontend/public/data/a1/nouns/all.md  (deduplicated)
#         frontend/public/data/a1/verbs/all.md   (deduplicated)
```

Both scripts use `Path(__file__).parent.parent` to resolve the repo root — must be run from the repo root.

## Lambda: ingestion (`lambda_ingestion/handler.py`)

Trigger: S3 `ObjectCreated` on any `.md` in the raw bucket.

Generates 42 DynamoDB items: 14 lessons × 3 types (`nouns`, `verbs`, `lesson`). Each item has 15 questions. Failures per lesson are logged as warnings and skipped — they don't abort the whole run.

Environment variables required: `TABLE_NAME`, `RAW_BUCKET`, `MODEL_ID`.

## Lambda: exercise API (`lambda_exercise_api/handler.py`)

Serves `GET /exercises/{level}?type=nouns|verbs|lesson`.

Returns flattened questions array with `lessonId` embedded from the DynamoDB SK. Returns `404 not_generated` if no items exist for the requested level/type.

Environment variable required: `TABLE_NAME`.

## Dependencies

Both Lambdas depend only on `boto3` (provided by the Lambda runtime). `requirements.txt` files are present but empty for future additions.
