# infrastructure

AWS CDK stack (TypeScript) that provisions all backend resources for the German Learning app.

## Stack: `GermanLearningStack`

| Resource | Type | Purpose |
|---|---|---|
| `RawSourceBucket` | S3 | Stores the 3 source `.md` files uploaded from CI; triggers ingestion on upload |
| `ExercisesTable` | DynamoDB | Caches pre-generated exercises; PK=`level`, SK=`typeLesson` |
| `IngestionFunction` | Lambda (Python 3.12) | Reads S3 → calls Bedrock → writes DynamoDB; 10 min timeout, 512 MB |
| `ExerciseApiFunction` | Lambda (Python 3.12) | Reads DynamoDB, serves exercises JSON; 30s timeout |
| `ExercisesApi` | API Gateway (REST) | `GET /exercises/{level}?type=nouns\|verbs\|lesson` |

## Prerequisites

- AWS CLI configured (`aws configure`)
- CDK bootstrapped in your target account/region:
  ```bash
  npx cdk bootstrap aws://<account-id>/<region>
  ```

## Commands

```bash
npm install          # install CDK dependencies
npx cdk synth        # synthesise CloudFormation template (no AWS calls)
npx cdk diff         # compare deployed stack with local changes
npx cdk deploy       # deploy to AWS
npx cdk destroy      # tear down (S3 bucket and DynamoDB table are RETAIN — delete manually)
```

## Outputs after deploy

| Output | Description |
|---|---|
| `RawBucketName` | Set as `RAW_BUCKET_NAME` in GitHub repo secrets |
| `ExercisesTableName` | DynamoDB table (informational) |
| `ExercisesApiUrl` | Set as `VITE_EXERCISES_API_URL` in Amplify Console |

## DynamoDB key design

```
PK: level       (e.g. "a1")
SK: typeLesson  (e.g. "nouns#03")
```

This lets the API Lambda use a single `Query` call for all questions (`PK = "a1"`) or filter by type with `begins_with("nouns#")` — no secondary indexes needed.

## IAM permissions

- `IngestionFunction`: `s3:GetObject` on raw bucket, `dynamodb:PutItem` on table, `bedrock:InvokeModel`
- `ExerciseApiFunction`: `dynamodb:GetItem` + `dynamodb:Query` on table

## Lambda code

Lambda source is referenced from `../../ingestion/lambda_ingestion` and `../../ingestion/lambda_exercise_api` using `lambda.Code.fromAsset(...)`. CDK bundles the directory as a zip on `cdk deploy`.
