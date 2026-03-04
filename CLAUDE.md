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

# Upload PDF to trigger content generation (CLI method)
aws s3 cp data/a1/lesson_03.pdf s3://<RawBucketName>/a1/

# Generate presigned URL for mobile upload
curl -X POST https://<API_ENDPOINT>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3"}'
```

## Data flow

All content (lessons, nouns, verbs, exercises) is API-driven:

1. **PDF Upload** (two methods):
   - CLI: `aws s3 cp lesson_XX.pdf s3://<RawBucket>/a1/`
   - Mobile: `POST /lesson-upload-url` → presigned URL → browser upload
2. **S3 Trigger**: ObjectCreated event → `WorkflowTriggerFunction` Lambda
3. **Step Functions Workflow** (sequential):
   - **Step 1 (OcrAndMarkdownsFunction)**:
     - Amazon Textract: async OCR (poll JobStatus, 10-min timeout)
     - Bedrock: generate 3 markdown files (summary, nouns, verbs) via 3 separate calls
     - Save to ProcessedBucket: `a1/{id:02d}/{summary,nouns,verbs}.md`
   - **Step 2 (ExerciseGenFunction)**:
     - Read markdown files from ProcessedBucket
     - Parse markdown tables → structured noun/verb lists
     - Wiktionary API: enrich verbs with present-tense conjugations (ich/du/erSieEs/wir/ihr/sieSie); verify/correct noun articles and plurals
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
- **Three-tier DynamoDB structure** (lessons + top-level aggregates + hourly rebuild)
  - Lesson items: `PK=level, SK=lesson#{id}` (complete lesson data)
  - Aggregates: `PK=level, SK=nouns|verbs|exercises#{type}` (deduplicated cross-lesson data)
  - Hourly rebuild: EventBridge triggers aggregate rebuild every hour (handles concurrent uploads safely)
- **Deduplication**: within-lesson (parse_markdown_table) + across-lesson (aggregate rebuild)
- **Exercise types simplified**: nouns + verbs only (removed "lesson grammar" type)
- **PDFs are scanned images** → Amazon Textract required for OCR
- **Async Textract polling** with 10-min timeout (fixed: checks JobStatus not Pages[0].Status)
- **Wiktionary enrichment**: German Wiktionary API used in Step 2 to add verb conjugations and verify noun articles/plurals; HTTP errors fail the Lambda hard; word-not-found is skipped gracefully
- **All frontend pages fetch from API endpoints** (no static files)
- **Performance optimization**: Cross-lesson queries use aggregates (10-50x faster than querying all lessons)
- **User feedback curation**: Delete/improve exercises with AI regeneration via Bedrock
- **Mobile PDF uploads**: Presigned URL endpoint allows browser-based uploads from phone without CLI/S3 app
- **Two-tier authentication**:
  - Tier 1: API Key on all endpoints (read + write) — sent via `x-api-key` header
  - Tier 2: Password on uploads only — sent in request body
  - This allows you to control who accesses the app while keeping uploads extra secure

## Authentication

### Tier 1: API Key (All endpoints)

All endpoints require API Key authentication sent via `x-api-key` HTTP header:

```bash
curl -H "x-api-key: <API_KEY>" https://api.example.com/lessons/a1
```

- Required for: `/lessons`, `/exercises`, `/feedback`, `/lesson-upload-url`
- Sent in HTTP header: `x-api-key: <your-api-key>`
- Returns 401 Unauthorized if missing or invalid
- Controls who can access the app at all

### Tier 2: Password (Upload only)

Upload page asks users for a password before requesting presigned URL:

```
Upload form:
├── Lesson ID
├── Course Level
└── Upload Password (user enters at upload time)
```

- Required for: `POST /lesson-upload-url`
- User enters password in the upload form
- Sent in JSON body: `{"password": "<password>"}`
- Returns 401 Unauthorized if incorrect
- Extra protection: only users who know the password can upload lessons
- Everyone else can only read/solve exercises

### Deployment Setup

**Before deploying, set these environment variables:**

```bash
export API_KEY="<API_KEY>"
export UPLOAD_PASSWORD="<UPLOAD_PASSWORD>"  # Backend password validation

# Then deploy:
cd infrastructure
npx cdk deploy
```

**Frontend configuration (.env.local):**

```
VITE_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod
VITE_API_KEY=<API_KEY>
# Note: VITE_UPLOAD_PASSWORD is NOT needed - users enter it in the upload form
```

**Amplify Console setup:**

- Go to App Settings → Environment variables
- Add: `VITE_API_KEY`, `VITE_API_BASE_URL`
- Users will be prompted for password in the upload form
