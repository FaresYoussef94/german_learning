# infrastructure

AWS CDK stack (TypeScript). Provisions all backend resources for the German Learning app.

## Commands (run from this directory)

```bash
npm install
npx cdk synth    # synthesise CloudFormation template — no AWS calls
npx cdk diff     # compare deployed stack with local changes
npx cdk deploy   # deploy to AWS
npx cdk destroy  # tear down (S3 + DynamoDB are RETAIN — delete manually)
```

## Stack: `GermanLearningStack` (`lib/german-learning-stack.ts`)

### Buckets

| Resource | Type | Config |
|---|---|---|
| `RawSourceBucket` | S3 | Versioned, private, RETAIN; triggers `WorkflowTriggerFunction` on `.pdf` upload |
| `ProcessedBucket` | S3 | Versioned, private, RETAIN; stores markdown files (summaries, nouns, verbs) |

### Database

| Resource | Type | Config |
|---|---|---|
| `ExercisesTable` | DynamoDB | PK=`level` (S), SK=`typeLesson` (S); PAY_PER_REQUEST, RETAIN |

### Lambdas

| Resource | Type | Timeout | Memory | Trigger |
|---|---|---|---|---|
| `WorkflowTriggerFunction` | Python 3.12 | 30s | 256 MB | S3 ObjectCreated (.pdf) |
| `OcrAndMarkdownsFunction` | Python 3.12 | 10 min | 512 MB | Step Functions (Step 1) |
| `ExerciseGenFunction` | Python 3.12 | 5 min | 512 MB | Step Functions (Step 2) + updates aggregates |
| `LessonApiFunction` | Python 3.12 | 30s | 256 MB | API Gateway (reads aggregates) |
| `ExerciseApiFunction` | Python 3.12 | 30s | 256 MB | API Gateway (reads aggregates) |
| `FeedbackApiFunction` | Python 3.12 | 30s | 256 MB | API Gateway (delete/improve exercises) |
| `AggregateRebuildFunction` | Python 3.12 | 5 min | 256 MB | EventBridge (hourly) |

### Step Functions

| Resource | Type | Steps | Timeout |
|---|---|---|---|
| `IngestionStateMachine` | State Machine | 2 sequential Lambda invokes | 20 min |

Flow:
```
OcrAndMarkdownsFunction (Step 1)
        ↓
ExerciseGenFunction (Step 2)
```

### EventBridge

| Resource | Type | Schedule | Target |
|---|---|---|---|
| `HourlyAggregateRebuild` | Rule | Every 1 hour | `AggregateRebuildFunction` |

**Purpose:** Safely handles concurrent PDF uploads by rebuilding clean aggregates hourly

### API Gateway

| Resource | Type | Routes | Methods |
|---|---|---|---|
| `ExercisesApi` | REST API | `/exercises/{level}` | GET |
| | | `/lessons/{level}` | GET |
| | | `/lessons/{level}/nouns` | GET |
| | | `/lessons/{level}/verbs` | GET |
| | | `/lessons/{level}/{lessonId}` | GET |
| | | `/lessons/{level}/{lessonId}/summary` | GET |
| | | `/feedback/{level}/{lessonId}/{type}` | DELETE |
| | | `/feedback/{level}/{lessonId}/{type}/regenerate` | POST |
| | | `/feedback/{level}/{lessonId}/{type}/replace` | POST |

CORS: Allow all origins, GET + POST + DELETE + OPTIONS methods

### Permissions

**WorkflowTriggerFunction:**
- `sfn:StartExecution` on IngestionStateMachine

**OcrAndMarkdownsFunction:**
- `s3:GetObject` on RawSourceBucket
- `s3:PutObject` on ProcessedBucket
- `textract:StartDocumentTextDetection`, `textract:GetDocumentTextDetection`
- `bedrock:InvokeModel`

**ExerciseGenFunction:**
- `s3:GetObject` on ProcessedBucket
- `dynamodb:PutItem`, `dynamodb:GetItem` on ExercisesTable (for aggregate updates)
- `bedrock:InvokeModel`

**LessonApiFunction:**
- `dynamodb:GetItem` on ExercisesTable (reads aggregates)
- `s3:GetObject` on ProcessedBucket (for summary proxy)

**ExerciseApiFunction:**
- `dynamodb:GetItem` on ExercisesTable (reads aggregates)

**FeedbackApiFunction:**
- `dynamodb:GetItem`, `dynamodb:UpdateItem`, `dynamodb:PutItem` on ExercisesTable
- `bedrock:InvokeModel` (for regeneration)

**AggregateRebuildFunction:**
- `dynamodb:Query`, `dynamodb:GetItem`, `dynamodb:PutItem` on ExercisesTable

## Entry point

`bin/infrastructure.ts` instantiates `GermanLearningStack` using `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` from the environment.

## Lambda source

Lambda code is bundled from:
- `../../ingestion/lambda_workflow_trigger`
- `../../ingestion/lambda_ocr_markdown`
- `../../ingestion/lambda_exercise_gen`
- `../../ingestion/lambda_lesson_api`
- `../../ingestion/lambda_exercise_api`
- `../../ingestion/lambda_feedback_api`
- `../../ingestion/lambda_aggregate_rebuild`

via `lambda.Code.fromAsset(...)`

## Outputs after deploy

| Output | Use |
|---|---|
| `RawBucketName` | Target for PDF uploads: `aws s3 cp data/a1/lesson_XX.pdf s3://<name>/a1/` |
| `ProcessedBucketName` | Where markdown files are stored (read-only for users) |
| `ExercisesTableName` | Informational |
| `ExercisesApiUrl` | Set as `VITE_EXERCISES_API_URL` in Amplify Console |
| `LessonsApiUrl` | Set as `VITE_LESSONS_API_URL` in Amplify Console |
| `FeedbackApiUrl` | Set as `VITE_FEEDBACK_API_URL` in Amplify Console |

## Architecture Overview

```
S3 Upload (lesson.pdf)
    ↓
Step Functions Workflow
├─ Step 1: OCR + Generate markdown (Textract + Bedrock)
└─ Step 2: Parse + Generate exercises (Bedrock) + Update aggregates
    ↓
DynamoDB (Lesson items + Aggregates)
├─ Lesson items: lesson#01, lesson#02, ... (complete data)
└─ Aggregates: nouns, verbs, exercises#nouns, exercises#verbs (fast reads)
    ↓
EventBridge (Every 1 hour)
└─ Rebuild aggregates from scratch (safe for concurrent uploads)
    ↓
API Gateway
├─ /lessons/{level}/nouns → reads aggregates (10-50x faster)
├─ /lessons/{level}/verbs → reads aggregates (10-50x faster)
├─ /exercises/{level} → reads aggregates (5-25x faster)
└─ /feedback/* → delete/improve exercises (updates lesson + aggregate)
    ↓
Frontend
└─ React app fetches from APIs (all data-driven)
