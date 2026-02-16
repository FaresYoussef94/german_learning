# lambda_exercise_api

API Gateway Lambda. Entry point: `handler.main`.

## Endpoint

```
GET /exercises/{level}               all questions for the level
GET /exercises/{level}?type=nouns    noun questions only
GET /exercises/{level}?type=verbs    verb questions only
GET /exercises/{level}?type=lesson   lesson grammar questions only
```

## Environment variables

| Variable | Description |
|---|---|
| `TABLE_NAME` | DynamoDB table (set by CDK) |

## DynamoDB access pattern

- Filtered: `Query PK=level AND SK begins_with "{type}#"`
- All types: `Query PK=level`

Items are sorted by `typeLesson` before flattening. Each question gets a `lessonId` field parsed from the SK (`"nouns#03"` → `3`).

## Response shape

```json
{
  "level": "a1",
  "type": "nouns",
  "questions": [{ "lessonId": 3, "type": "multiple_choice", ... }],
  "total": 210
}
```

Returns `404 { "error": "not_generated" }` if no DynamoDB items exist for the requested level/type. CORS headers (`Access-Control-Allow-Origin: *`) are included on all responses.
