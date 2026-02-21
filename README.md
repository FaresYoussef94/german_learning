# German Learning App

A full-stack app for studying and practising German A1 vocabulary and grammar. The frontend is a React web app that fetches all content via API. The backend uses AWS Step Functions to orchestrate PDF ingestion (OCR + AI content generation) and serves lessons, vocabularyary, and exercises via API Gateway.

## Repo structure

```
german_learning/
├── data/a1/                    # Source PDF files (upload to S3 to trigger generation)
│   └── lesson_*.pdf
├── frontend/                   # React + Vite + TypeScript web app (API-driven)
├── ingestion/                  # Python pipeline: 5 AWS Lambda handlers
│   ├── lambda_workflow_trigger/   (S3 event → Step Functions)
│   ├── lambda_ocr_markdown/       (Step 1: PDF → markdown)
│   ├── lambda_exercise_gen/       (Step 2: markdown → exercises)
│   ├── lambda_lesson_api/         (API: lessons + summaries)
│   └── lambda_exercise_api/       (API: exercises)
├── infrastructure/             # AWS CDK stack (TypeScript)
└── amplify.yml                # AWS Amplify build config
```

## How it works

### Architecture

```
User uploads PDF to S3
       ↓
S3 ObjectCreated event
       ↓
WorkflowTriggerFunction
       ↓
Step Functions State Machine (20-min timeout)
       ├─ Step 1: OcrAndMarkdownsFunction (10 min)
       │  • Textract async OCR
       │  • 3 separate Bedrock calls → 3 markdown files
       │  • Save to ProcessedBucket
       │
       └─ Step 2: ExerciseGenFunction (5 min)
          • Parse markdown tables
          • Bedrock → generate exercises
          • Write to DynamoDB

       ↓
DynamoDB (structured data: nouns, verbs, exercises)
ProcessedBucket (summaries in markdown)
       ↓
API Gateway
       ↓
Frontend fetches via /lessons and /exercises endpoints
```

### Content Flow

1. **PDF Upload**: `aws s3 cp data/a1/lesson_03.pdf s3://<RawBucket>/a1/`
2. **Step 1 (OcrAndMarkdownsFunction)**:
   - Amazon Textract: async OCR with polling
   - Bedrock Claude (3 calls):
     - Summary: lesson overview + title
     - Nouns: German-English noun table with articles/plurals
     - Verbs: German-English verb table with perfect forms
   - Output: 3 markdown files to ProcessedBucket
3. **Step 2 (ExerciseGenFunction)**:
   - Parse markdown tables from ProcessedBucket
   - Bedrock Claude: generate 15 noun + 15 verb exercises
   - Write to DynamoDB: `{level, typeLesson, title, nouns[], verbs[], exercises, summaryKey}`
4. **Serving**:
   - `GET /lessons/{level}` → list of lessons
   - `GET /lessons/{level}/{id}/summary` → markdown from S3
   - `GET /lessons/{level}/nouns` → all nouns (deduplicated)
   - `GET /exercises/{level}?type=nouns|verbs` → exercises

### Frontend

All content is API-driven (no static files). The React app fetches:
- Lessons list and summaries via LessonApiFunction
- Exercises via ExerciseApiFunction
- Uses module-level caches to avoid duplicate requests

## Key features

- **Step Functions workflow** for reliable, sequential PDF processing
- **Async Textract polling** with timeout and error handling
- **Three separate Bedrock calls** for focused, reliable content generation
- **Markdown-based intermediates** (cleaner than single JSON response)
- **S3 storage for summaries** (DynamoDB 400KB item limit)
- **Deduplication** at two levels: within-lesson parsing + cross-lesson API queries
- **Exercise types simplified**: nouns + verbs only (no "lesson grammar" type)
- **Modern Bedrock API** (converse, not deprecated invoke_model)

## Prerequisites

- Node.js 20+
- Python 3.12+
- AWS CLI configured (`aws configure`)
- AWS CDK bootstrapped (`cdk bootstrap`)

## Quickstart (local dev)

```bash
# 1. Run the frontend locally (no backend required for UI preview)
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
# Study section works, exercise section shows "not generated" message
```

## Deploying to AWS

```bash
# 1. Deploy the CDK stack (creates all AWS resources)
cd infrastructure
npm install
npx cdk deploy

# Note the outputs:
#   RawBucketName        → where to upload PDFs
#   ProcessedBucketName  → where markdown files are stored
#   LessonsApiUrl        → set as VITE_LESSONS_API_URL in Amplify
#   ExercisesApiUrl      → set as VITE_EXERCISES_API_URL in Amplify

# 2. Upload a PDF to trigger the workflow
aws s3 cp data/a1/lesson_01.pdf s3://<RawBucketName>/a1/
# Workflow runs automatically (2-3 min depending on PDF size)

# 3. Monitor progress
# AWS Console → Step Functions → IngestionStateMachine
# Check CloudWatch logs for each Lambda

# 4. Test the API
curl https://<api-id>.execute-api.<region>.amazonaws.com/prod/lessons/a1
# Returns lesson index: [{id: 1, title: "..."}]

# 5. Deploy frontend to Amplify
# Connect this repo to AWS Amplify Console
# Set environment variables:
#   VITE_LESSONS_API_URL = <LessonsApiUrl from CDK output>
#   VITE_EXERCISES_API_URL = <ExercisesApiUrl from CDK output>
# Push to main → Amplify builds and deploys automatically
```

## Adding new lessons

1. Create PDF file: `data/a1/lesson_XX.pdf`
2. Upload to S3: `aws s3 cp data/a1/lesson_XX.pdf s3://<RawBucketName>/a1/`
3. Step Functions workflow runs automatically (~2-3 min)
4. Check CloudWatch if any step fails
5. API returns new lesson in `/lessons/a1` once Step 2 completes

## Architecture decisions

- **Step Functions** instead of single Lambda: cleaner separation, better error handling, long timeouts
- **Three Bedrock calls** instead of one: simpler prompts, more reliable output, easier to debug
- **Markdown files** as intermediate format: cleaner generation, smaller payloads, can be debugged separately
- **ProcessedBucket** for summaries: avoids DynamoDB 400KB item size limit
- **Async Textract polling**: handles large PDFs that take 30+ seconds to process
- **boto3 >= 1.47.0**: required for modern Bedrock converse API
- **Haiku model**: cost-efficient for A1-level content generation

## Troubleshooting

### Workflow fails at Step 1 (OCR)

**Check CloudWatch logs** for `lambda_ocr_markdown`:
- `Textract job failed` → PDF may be corrupted or unscannable
- `timeout` → PDF is very large or Textract is slow

**Check Textract** in AWS Console for detailed job status

### Workflow fails at Step 2 (Exercise Generation)

**Check CloudWatch logs** for `lambda_exercise_gen`:
- `Failed to read from S3` → ProcessedBucket permissions issue
- `json.JSONDecodeError` → Bedrock response was not valid JSON

**Check that markdown files were saved**: `aws s3 ls s3://<ProcessedBucket>/a1/01/`

### API returns 404

- Lesson not in DynamoDB yet → wait for Step 2 to complete
- `GET /lessons/a1` shows nothing → no lessons generated yet (upload a PDF)
- `GET /lessons/a1/1/summary` returns 404 → summaryKey not set (Step 1 failed)

### Frontend shows "not_generated"

- `VITE_LESSONS_API_URL` or `VITE_EXERCISES_API_URL` not set in Amplify Console
- API endpoints not deployed or not accessible

## Documentation

See CLAUDE.md files for detailed architecture and implementation notes:
- `CLAUDE.md` — High-level overview
- `ingestion/CLAUDE.md` — Ingestion pipeline details
- `ingestion/lambda_*/CLAUDE.md` — Individual Lambda documentation
- `frontend/CLAUDE.md` — React app structure
- `infrastructure/CLAUDE.md` — CDK stack configuration
