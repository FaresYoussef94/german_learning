# German Learning App

Full-stack German A1 study and exercise app. Monorepo with four areas:

## Repo layout

```
data/a1/           PDFs and LLM instruction set (source for content generation)
frontend/          React + Vite + TypeScript web app (API-driven)
ingestion/         Python Lambda pipeline: Step Functions workflow for PDF processing
infrastructure/    AWS CDK stack (TypeScript)
amplify.yml        Amplify build config
```

## Common commands

```bash
# Local dev
cd frontend && npm run dev

# Deploy AWS infrastructure
cd infrastructure && npx cdk deploy

# Upload PDF to trigger content generation
aws s3 cp data/a1/lesson_03.pdf s3://<RawBucketName>/a1/
```

## Data flow

All content (lessons, nouns, verbs, exercises) is API-driven:

1. **PDF Upload**: `aws s3 cp lesson_XX.pdf s3://<RawBucket>/a1/`
2. **S3 Trigger**: ObjectCreated event → `WorkflowTriggerFunction` Lambda
3. **Step Functions Workflow** (sequential):
   - **Step 1 (OcrAndMarkdownsFunction)**:
     - Amazon Textract: async OCR (poll JobStatus, 10-min timeout)
     - Bedrock: generate 3 markdown files (summary, nouns, verbs) via 3 separate calls
     - Save to ProcessedBucket: `a1/{id:02d}/{summary,nouns,verbs}.md`
   - **Step 2 (ExerciseGenFunction)**:
     - Read markdown files from ProcessedBucket
     - Parse markdown tables → structured noun/verb lists
     - Bedrock: generate exercises (nouns + verbs types only)
     - Write to DynamoDB with summaryKey pointer
4. **Storage**: DynamoDB (single item per lesson) + ProcessedBucket (lesson summaries)
5. **Serving**: API Gateway → `LessonApiFunction` (with S3 proxy for summaries) and `ExerciseApiFunction`
6. **Frontend**: React fetches from `/lessons` and `/exercises` endpoints

## Key decisions

- **Step Functions workflow** replaces single-Lambda ingestion (better separation of concerns, resilience)
- **Three markdown files** instead of single JSON (cleaner generation, smaller payloads)
- **Lesson summaries in S3** (too large for DynamoDB 400KB item limit)
- **Structured data in DynamoDB** (nouns, verbs, exercises) for efficient queries
- **Three separate Bedrock calls** (one for summary, one for nouns, one for verbs) for reliable generation
- **Bedrock converse() API** (modern, better response handling than invoke_model)
- **Deduplication**: within-lesson (parse_markdown_table) + across-lesson (lesson_api query)
- **Exercise types simplified**: nouns + verbs only (removed "lesson grammar" type)
- **PDFs are scanned images** → Amazon Textract required for OCR
- **Async Textract polling** with 10-min timeout (fixed: checks JobStatus not Pages[0].Status)
- **DynamoDB schema**: PK=`level` (`"a1"`), SK=`typeLesson` (`"lesson#03"`)
- **All frontend pages fetch from API endpoints** (no static files)
