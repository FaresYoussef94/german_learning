# lambda_exercise_api

API Gateway Lambda. Serves pre-generated exercises from DynamoDB.

**Entry point:** `handler.main`

## Endpoint

```
GET /exercises/{level}               all questions for the level
GET /exercises/{level}?type=nouns    noun questions only
GET /exercises/{level}?type=verbs    verb questions only
```

## Environment variables

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB exercises table (set by CDK) |

## DynamoDB access pattern

- **All types:** Query `PK=level AND SK begins_with "lesson#"`
- **Filtered:** Extract from `exercises.{type}` field in returned items

Items are sorted by `typeLesson` before flattening. Each question gets a `lessonId` field parsed from the SK.

## Response shape

```json
{
  "level": "a1",
  "type": "nouns",
  "questions": [
    {
      "lessonId": 3,
      "type": "multiple_choice",
      "question": "What is the article for Stuhl?",
      "options": ["der", "die", "das"],
      "answer": "der"
    }
  ],
  "total": 15
}
```

Returns `404 { "error": "not_generated" }` if no DynamoDB items exist for the requested level/type.

CORS headers (`Access-Control-Allow-Origin: *`) are included on all responses.

## Valid types

- `nouns` — noun exercises only
- `verbs` — verb exercises only
- (omitted) — all exercises (combines nouns + verbs)

**Removed:** "lesson" type (simplified to just nouns + verbs)

## Changes from original

- **Removed** `'lesson'` from VALID_TYPES (now only `{'nouns', 'verbs'}`)
- **Updated** question flattening logic to only include nouns + verbs
- **Updated** error message to reflect simplified type options

## IAM Permissions

Lambda role requires:
- `dynamodb:Query` on ExercisesTable (implicit from grantReadData)
