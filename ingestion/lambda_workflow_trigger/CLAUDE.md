# lambda_workflow_trigger

S3-triggered Lambda. Starts the Step Functions ingestion workflow.

**Entry point:** `handler.main`

## What it does

**Trigger:** S3 `ObjectCreated` event on `.pdf` files in raw bucket (e.g., `a1/lesson_03.pdf`)

**Flow:**
1. Extract bucket and key from S3 event
2. Call Step Functions `start_execution()` with state machine ARN
3. Pass input: `{bucket, key}` as JSON string
4. Return execution ARN to caller

**Return value:**
```json
{
  "statusCode": 200,
  "body": "{\"executionArn\": \"arn:aws:states:...\"}"
}
```

## Environment variables

| Variable | Description |
|---|---|
| `STATE_MACHINE_ARN` | Step Functions state machine ARN (set by CDK) |

## Input to Step Functions

```json
{
  "bucket": "raw-bucket-name",
  "key": "a1/lesson_03.pdf"
}
```

This input is passed to Step 1 (OcrAndMarkdownsFunction) which extracts the lesson number from the key.

## IAM Permissions

Lambda role requires:
- `sfn:StartExecution` on IngestionStateMachine

## Error handling

Failures in parsing the S3 event or calling Step Functions are caught, logged, and re-raised (fails the Lambda).

The Step Functions execution itself runs asynchronously — workflow errors don't immediately fail this function.

## Why separate trigger Lambda?

Rather than directly invoking Step Functions from S3 (not natively supported), we use this lightweight Lambda as a bridge. This allows:
- Flexibility to add pre-processing (e.g., file validation, logging)
- Clear audit trail of workflow executions
- Simple error handling at the trigger point
