# lambda_exercise_gen

Step 2 of the ingestion workflow. Parses markdown and generates exercises.

**Entry point:** `handler.main`

## What it does

**Trigger:** Step Functions state machine (Step 2)

**Input:** Step 1 output `{level, lessonId, title, summaryKey, nounsKey, verbsKey}`

**Flow:**
1. Read 3 markdown files from ProcessedBucket
2. Parse markdown tables using regex → structured lists:
   - Nouns: `{word, article, plural, english}`
   - Verbs: `{infinitive, perfectForm, case, english}`
   - **Deduplication:** Skip duplicate entries by first column (German word/infinitive)
3. Call Bedrock to generate exercises (single call, returns JSON)
4. Write full lesson item to DynamoDB: `PK=level, SK=lesson#{id:02d}`
5. Return success response

**Return value:**
```json
{
  "statusCode": 200,
  "lesson": 3,
  "status": "success"
}
```

## Environment variables

| Variable | Description |
|---|---|
| `PROCESSED_BUCKET` | S3 bucket where markdown files are stored (set by CDK) |
| `TABLE_NAME` | DynamoDB exercises table (set by CDK) |
| `MODEL_ID` | Bedrock model ID (default: `us.anthropic.claude-haiku-4-5-20251001-v1:0`) |

## Markdown table parsing

Parses markdown tables with `|` separators:
```markdown
| German | Article | Plural | English |
|--------|---------|--------|---------|
| Stuhl  | der     | Stühle | chair   |
| Tisch  | der     | Tische | table   |
```

**Output:** `[{German: "Stuhl", Article: "der", Plural: "Stühle", English: "chair"}, ...]`

**Deduplication:** Skips duplicate entries (same word) within a lesson

## Bedrock API

**Model:** Claude Haiku

**API:** Modern `converse()` with `inferenceConfig={maxTokens: 6000}`

**Single call:** Generates both noun and verb exercises in one JSON response

**System prompt:** Instructs Claude to generate:
- 15 noun exercises: 5 multiple_choice (articles), 5 fill_blank (plurals), 5 translation
- 15 verb exercises: 5 multiple_choice (infinitives), 5 fill_blank (perfect forms), 5 translation
- Each exercise: `{type, question, [options], answer}`

## DynamoDB item written

```json
{
  "level": "a1",
  "typeLesson": "lesson#03",
  "title": "Lesson 3: Wie geht's?",
  "summaryKey": "a1/03/summary.md",
  "nouns": [
    {"word": "Stuhl", "article": "der", "plural": "Stühle", "english": "chair"}
  ],
  "verbs": [
    {"infinitive": "gehen", "perfectForm": "ist gegangen", "case": "—", "english": "to go"}
  ],
  "exercises": {
    "nouns": [
      {"type": "multiple_choice", "question": "What is the article for Stuhl?", "options": ["der", "die", "das", "den"], "answer": "der"}
    ],
    "verbs": [
      {"type": "fill_blank", "question": "gehen (perfect form): ___", "answer": "ist gegangen"}
    ]
  },
  "generatedAt": "2026-02-21T10:00:00Z"
}
```

## IAM Permissions

Lambda role requires:
- `s3:GetObject` on ProcessedBucket
- `dynamodb:PutItem` on ExercisesTable
- `bedrock:InvokeModel`

## Error handling

Failures in S3 reads, Bedrock, or DynamoDB writes are caught, logged, and re-raised (fails the Lambda and pauses the workflow).
