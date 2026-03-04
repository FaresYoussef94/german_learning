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
3. **Wiktionary enrichment** (German Wiktionary API: `de.wiktionary.org`):
   - Each verb: fetch `{{Deutsch Verb Übersicht}}` wikitext → extract `Präsens_*` fields → add `ich/du/erSieEs/wir/ihr/sieSie` conjugations
   - Each noun: fetch `{{Deutsch Substantiv Übersicht}}` wikitext → extract `Genus` + `Nominativ Plural` → verify/correct `article` and `plural`
   - HTTP errors (4xx/5xx) → raise exception → fail the Lambda
   - Word not found (page_id == "-1") → log warning → skip enrichment for that word
4. Call Bedrock to generate exercises (single call, returns JSON)
5. Write full lesson item to DynamoDB: `PK=level, SK=lesson#{id:02d}`
6. Return success response

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

## Wiktionary enrichment

**API:** `https://de.wiktionary.org/w/api.php` with `action=query&prop=revisions&rvprop=content`

**User-Agent required:** Wikimedia blocks requests without a descriptive User-Agent header (403 Forbidden). The Lambda sends: `GermanLearningApp/1.0 (https://github.com/faresjoe/german_learning; educational)`

**Three helper functions:**

- `fetch_wiktionary_wikitext(word)` — fetches raw wikitext for a word; raises on HTTP errors; returns `""` if page not found
- `clean_wikitext_value(text)` — strips `[[links]]`, `{{templates}}`, and `''markup''` from field values
- `enrich_verb_with_wiktionary(verb)` — extracts `Präsens_ich/du/er,sie,es/wir/ihr/sie` from `{{Deutsch Verb Übersicht}}`
- `enrich_noun_with_wiktionary(noun)` — extracts `Genus` (→ der/die/das) and `Nominativ Plural` from `{{Deutsch Substantiv Übersicht}}`

**Error policy:**
- HTTP 4xx/5xx → `raise_for_status()` propagates → Lambda fails (Step Functions workflow pauses)
- Word not in Wiktionary (page_id `-1`) → log warning → return original word unchanged

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
- Each exercise: `{type, topic, question, [options], answer}`
- **Topics:** "article", "plural", "vocabulary" for nouns; "infinitive", "conjugation", "perfect_form", "vocabulary" for verbs

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
    {"infinitive": "gehen", "perfectForm": "ist gegangen", "case": "—", "english": "to go",
     "ich": "gehe", "du": "gehst", "erSieEs": "geht", "wir": "gehen", "ihr": "geht", "sieSie": "gehen"}
  ],
  "exercises": {
    "nouns": [
      {"type": "multiple_choice", "topic": "article", "question": "What is the article for Stuhl?", "options": ["der", "die", "das", "den"], "answer": "der"}
    ],
    "verbs": [
      {"type": "fill_blank", "topic": "perfect_form", "question": "gehen (perfect form): ___", "answer": "ist gegangen"}
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

## Dependencies

| Package | Purpose |
|---|---|
| `boto3` | AWS SDK (S3, DynamoDB, Bedrock) |
| `requests` | HTTP client for Wiktionary API calls |

## Error handling

Failures in S3 reads, Wiktionary API (HTTP errors), Bedrock, or DynamoDB writes propagate and fail the Lambda (pauses the Step Functions workflow).
