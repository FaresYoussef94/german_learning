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
| `ExerciseGenFunction` | Python 3.12 | 5 min | 512 MB | Step Functions (Step 2) |
| `LessonApiFunction` | Python 3.12 | 30s | 256 MB | API Gateway |
| `ExerciseApiFunction` | Python 3.12 | 30s | 256 MB | API Gateway |

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

### API Gateway

| Resource | Type | Routes |
|---|---|---|
| `ExercisesApi` | REST API | `/exercises/{level}`, `/lessons/{level}`, `/lessons/{level}/nouns`, `/lessons/{level}/verbs`, `/lessons/{level}/{lessonId}`, `/lessons/{level}/{lessonId}/summary` |

CORS: Allow all origins, GET + OPTIONS methods

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
- `dynamodb:PutItem` on ExercisesTable
- `bedrock:InvokeModel`

**LessonApiFunction:**
- `dynamodb:Query` on ExercisesTable
- `s3:GetObject` on ProcessedBucket (for summary proxy)

**ExerciseApiFunction:**
- `dynamodb:Query` on ExercisesTable

## Entry point

`bin/infrastructure.ts` instantiates `GermanLearningStack` using `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` from the environment.

## Lambda source

Lambda code is bundled from:
- `../../ingestion/lambda_workflow_trigger`
- `../../ingestion/lambda_ocr_markdown`
- `../../ingestion/lambda_exercise_gen`
- `../../ingestion/lambda_lesson_api`
- `../../ingestion/lambda_exercise_api`

via `lambda.Code.fromAsset(...)`

## Outputs after deploy

| Output | Use |
|---|---|
| `RawBucketName` | Target for PDF uploads: `aws s3 cp data/a1/lesson_XX.pdf s3://<name>/a1/` |
| `ProcessedBucketName` | Where markdown files are stored (read-only for users) |
| `ExercisesTableName` | Informational |
| `ExercisesApiUrl` | Set as `VITE_EXERCISES_API_URL` in Amplify Console |
| `LessonsApiUrl` | Set as `VITE_LESSONS_API_URL` in Amplify Console |
