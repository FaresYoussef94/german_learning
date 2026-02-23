# Presigned URL Upload Guide

## How Presigned URLs Work

A presigned URL is a time-limited URL that grants direct access to S3 without AWS credentials. Perfect for letting users upload files securely.

### Request Flow

```
1. Client requests presigned URL
   POST /lesson-upload-url → {uploadUrl, expiresIn}

2. Client uses presigned URL to upload file
   PUT <presigned-url> + file → S3

3. S3 trigger fires (ObjectCreated)
   → WorkflowTriggerFunction
   → Step Functions Workflow starts
```

## Upload Methods

### Method 1: Browser File Input (Recommended - Already Implemented)

Used in the frontend `/upload` page. Users select a file and upload directly.

```typescript
// Handler
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];

  const xhr = new XMLHttpRequest();
  xhr.upload.addEventListener("progress", (event) => {
    const percent = (event.loaded / event.total) * 100;
    setUploadProgress(percent);
  });

  xhr.open("PUT", presignedUrl);
  xhr.setRequestHeader("Content-Type", file.type);
  xhr.send(file);
};
```

**Advantages:**
- ✅ Native browser file picker
- ✅ Progress tracking
- ✅ User-friendly UI
- ✅ Works on mobile browsers

### Method 2: Direct cURL (CLI)

```bash
# 1. Get presigned URL
RESPONSE=$(curl -s -X POST https://<api-domain>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3"}')

UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')

# 2. Upload file
curl -X PUT --data-binary @lesson_03.pdf \
  "$UPLOAD_URL"
```

### Method 3: JavaScript Fetch

```typescript
async function uploadFile(presignedUrl: string, file: File) {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/pdf",
    },
    body: file,
  });

  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
}
```

### Method 4: Python

```python
import requests

# Get presigned URL
response = requests.post(
    "https://<api-domain>/prod/lesson-upload-url",
    json={"lessonId": "3"}
)
presigned_url = response.json()["uploadUrl"]

# Upload file
with open("lesson_03.pdf", "rb") as f:
    requests.put(presigned_url, data=f, headers={"Content-Type": "application/pdf"})
```

## Frontend Implementation

The UploadLesson page now supports:

### 1. **Direct File Upload** (Primary)
```
1. Enter lesson ID
2. Click "Get Upload Link"
3. Select PDF file
4. Progress bar shows upload status
5. Success message when done
```

### 2. **Manual URL Copy** (Fallback)
- Collapsed by default
- Copy URL for manual upload with cURL/Postman
- Useful for testing or scripting

## UploadLesson Component Features

### New State Variables
```typescript
const [uploading, setUploading] = useState(false);
const [uploadProgress, setUploadProgress] = useState(0);
const [uploadSuccess, setUploadSuccess] = useState(false);
```

### File Input Handler
- Accepts `.pdf` files only
- Tracks upload progress with XMLHttpRequest
- Shows real-time percentage
- Visual progress bar
- Error handling for failed uploads

### Success Flow
```
Upload completes
  ↓
S3 fires ObjectCreated event
  ↓
WorkflowTriggerFunction invokes Step Functions
  ↓
OCR + Exercise generation starts
  ↓
Results available in API
```

## Upload URL Structure

Example presigned URL:
```
https://germanlearningstack-rawsourcebucket09c8e404-u2fknazvmh7z.s3.amazonaws.com/a1/lesson_18.pdf?
  AWSAccessKeyId=ASIATEZZ2YMXOQILVMBW&
  Signature=h72BY2e18tmmpX1RMcRY%2FAlUSww%3D&
  x-amz-security-token=IQoJb3JpZ2luX2VjEAEaCXVzLWVhc3QtMSJIMEYC...&
  Expires=1771782067
```

**Components:**
- **Bucket:** `germanlearningstack-rawsourcebucket...`
- **Key:** `a1/lesson_18.pdf`
- **Access Key ID:** AWS temporary credentials
- **Signature:** HMAC signature (proves validity)
- **Token:** Session token
- **Expires:** Unix timestamp (1 hour from generation)

## Security

✅ **Time-limited** — URLs expire in 1 hour
✅ **Signature-verified** — S3 validates signature
✅ **Limited scope** — Only allows PUT to specific key
✅ **Temporary credentials** — STS tokens, not permanent AWS keys
✅ **No storage** — URLs aren't stored, generated on-demand

## Troubleshooting

### "Upload failed: 403 Forbidden"
- URL has expired (regenerate)
- Signature is invalid (URL was modified)
- Session token revoked

### "Upload failed: 400 Bad Request"
- Missing `Content-Type` header
- File size too large (S3 has limits)
- Malformed URL

### "Network error"
- CORS issue (S3 bucket CORS policy)
- Network connectivity
- Large file timeout

## Testing

### cURL
```bash
# Get URL
curl -X POST https://<domain>/prod/lesson-upload-url \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "3"}'

# Upload
curl -X PUT -d @lesson_03.pdf \
  "https://bucket.s3.amazonaws.com/..."
```

### Browser DevTools Console
```javascript
// Get URL
const res = await fetch(
  'https://<domain>/prod/lesson-upload-url',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: '3' })
  }
);
const { uploadUrl } = await res.json();

// Upload file
const file = /* select from input */;
const uploadRes = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/pdf' },
  body: file
});
```

## Performance

- **Generation:** <100ms (minimal API call)
- **Upload:** Depends on file size and network
  - 1MB PDF: ~1-2 seconds on 4G
  - 5MB PDF: ~5-10 seconds on 4G
- **Processing:** Starts immediately after S3 receives file

## Next Steps

After upload completes:
1. S3 fires ObjectCreated event
2. WorkflowTriggerFunction processes the file
3. Step Functions runs OCR + Exercise Generation
4. DynamoDB and S3 are updated with new content
5. Frontend APIs serve the new lesson
