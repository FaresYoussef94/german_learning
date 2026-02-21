# lambda_ocr_markdown

Step 1 of the ingestion workflow. Performs OCR and generates markdown files.

**Entry point:** `handler.main`

## What it does

**Trigger:** Step Functions state machine (Step 1)

**Input:** `{bucket, key}` from WorkflowTriggerFunction

**Flow:**
1. Extract lesson number from S3 key (e.g., `lesson_03.pdf` → `3`)
2. Start async Textract job on raw PDF
3. Poll every 5s until complete (timeout: 10 min)
   - **Bug fix:** Checks `response['JobStatus']` directly (not `Pages[0].Status`)
4. Extract text from Textract blocks
5. **Three separate Bedrock calls** (each optimized for its task):
   - Call 1: Generate summary markdown + extract lesson title
   - Call 2: Generate nouns markdown table
   - Call 3: Generate verbs markdown table
6. Save 3 files to ProcessedBucket:
   - `a1/{id:02d}/summary.md`
   - `a1/{id:02d}/nouns.md`
   - `a1/{id:02d}/verbs.md`
7. Return metadata for Step 2

**Return value:**
```json
{
  "level": "a1",
  "lessonId": 3,
  "title": "Lesson 3: Wie geht's?",
  "summaryKey": "a1/03/summary.md",
  "nounsKey": "a1/03/nouns.md",
  "verbsKey": "a1/03/verbs.md"
}
```

## Environment variables

| Variable | Description |
|---|---|
| `RAW_BUCKET` | S3 bucket containing source PDFs (set by CDK) |
| `PROCESSED_BUCKET` | S3 bucket for storing markdown output (set by CDK) |
| `MODEL_ID` | Bedrock model ID (default: `us.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| `AWS_REGION` | AWS region (set by Lambda runtime, default: `us-east-1`) |

## Textract async flow

1. `start_document_text_detection()` — start async job
2. Poll `get_document_text_detection()` every 5s
3. Check `response['JobStatus']`:
   - `SUCCEEDED` / `PARTIAL_SUCCESS` → extract text
   - `FAILED` → raise error
   - `IN_PROGRESS` → wait and retry
4. Timeout: 10 minutes (waits ~120 poll attempts)

**Bug fixed:** Previous code checked `response['DocumentMetadata']['Pages'][0].get('Status')` which always returned `IN_PROGRESS`. Now correctly checks `response['JobStatus']`.

## Bedrock calls

All three calls use modern `converse()` API with custom system prompts.

### Call 1: Summary + Title

**System prompt:** Instructs Claude to extract lesson content from OCR text
- Generate lesson summary in markdown (2-3 paragraphs with grammar points)
- Extract lesson title as markdown heading (`# Lesson N: ...`)

**Max tokens:** 2000

**Output:** Markdown text (title parsed from first `#` heading)

### Call 2: Nouns Table

**System prompt:** Instructs Claude to extract nouns and create markdown table
- Format: `| German | Article | Plural | English |`
- Rules for articles (use PDF context or noun endings)
- Rules for plurals (use PDF or apply German plural rules)

**Max tokens:** 4000

**Output:** Markdown table

### Call 3: Verbs Table

**System prompt:** Instructs Claude to extract verbs and create markdown table
- Format: `| Infinitive | Present Perfect | Case | English |`
- Perfect form construction rules (regular/irregular/separable)
- Case requirements from context (Acc/Dat/—)

**Max tokens:** 4000

**Output:** Markdown table

## Files in this directory

- `handler.py` — Main Lambda code
- `utils.py` — Comprehensive LLM instruction set (included in system prompts)
- `requirements.txt` — Dependencies (`boto3>=1.47.0`)

## IAM Permissions

Lambda role requires:
- `s3:GetObject` on RawSourceBucket
- `s3:PutObject` on ProcessedBucket
- `textract:StartDocumentTextDetection`
- `textract:GetDocumentTextDetection`
- `bedrock:InvokeModel`

## Error handling

Failures in Textract, Bedrock, or S3 writes are caught, logged, and re-raised. This pauses the Step Functions workflow (Step 2 is not executed).

## Why three Bedrock calls?

Rather than generating one large JSON response (which required `outputConfig` not widely supported yet), we make three focused calls:
- Simpler prompts → more reliable output
- Each optimized for its specific task
- Better token utilization
- No JSON parsing complexity
