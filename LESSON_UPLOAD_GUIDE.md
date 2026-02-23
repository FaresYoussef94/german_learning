# Lesson PDF Upload Guide

Upload lesson PDFs to S3 via presigned URLs without downloading or using AWS CLI.

## Endpoint

**POST** `/lesson-upload-url`

## Request

Send a JSON POST request with the lesson ID:

```bash
curl -X POST https://<API_ENDPOINT>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3"}'
```

Or with optional level parameter (defaults to "a1"):

```bash
curl -X POST https://<API_ENDPOINT>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3", "level": "a1"}'
```

## Response

Returns a presigned URL valid for 1 hour:

```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/a1/lesson_03.pdf?...",
  "key": "a1/lesson_03.pdf",
  "expiresIn": 3600
}
```

## Usage on Mobile

### Option 1: Browser Upload (Recommended)

1. Open the API response link in your mobile browser
2. Browser's file picker opens
3. Select the PDF from WhatsApp downloads
4. Upload completes automatically ✅

### Option 2: cURL on Mobile (Termux)

If you have Termux or similar terminal:

```bash
LESSON_ID="3"
API="https://<API_ENDPOINT>/prod/lesson-upload-url"

# Get presigned URL
RESPONSE=$(curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"lessonId\": \"$LESSON_ID\"}")

UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')

# Upload the PDF
curl -X PUT -F "file=@/path/to/lesson_${LESSON_ID}.pdf" "$UPLOAD_URL"
```

## Workflow

### Via Phone Browser

1. Receive PDF via WhatsApp
2. Call API to get presigned URL:
   ```
   https://<API_ENDPOINT>/prod/lesson-upload-url
   Body: {"lessonId": "3"}
   ```
3. Click the returned `uploadUrl`
4. Browser file picker opens
5. Select PDF from Downloads
6. Upload completes
7. S3 trigger → Step Functions workflow starts automatically ✅

### Via Desktop/CLI

```bash
# 1. Get presigned URL
curl -X POST https://<API_ENDPOINT>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3"}' | jq .uploadUrl

# 2. Upload using the presigned URL
curl -X PUT --data-binary @lesson_03.pdf \
  'https://bucket.s3.amazonaws.com/a1/lesson_03.pdf?...'
```

## Notes

- Lesson ID is formatted as 2-digit number: `3` → `lesson_03.pdf`
- Presigned URLs are valid for 1 hour
- Upload automatically triggers the ingestion pipeline
- File must be a PDF
- Replaces any existing file with the same lesson ID

## Getting the API Endpoint

After deploying the infrastructure:

```bash
cd infrastructure
npx cdk deploy

# Look for output: "LessonUploadUrlEndpoint"
# Copy the full URL
```

Or retrieve it later:

```bash
aws cloudformation describe-stacks \
  --stack-name GermanLearningStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LessonUploadUrlEndpoint`].OutputValue' \
  --output text
```
