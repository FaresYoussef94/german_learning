# German Learning App

Full-stack German A1 study and exercise app. Monorepo with four areas:

## Repo layout

```
data/a1/           Source markdown files (lessons, nouns, verbs)
frontend/          React + Vite + TypeScript web app
ingestion/         Python pipeline: local scripts + Lambda handlers
infrastructure/    AWS CDK stack (TypeScript)
amplify.yml        Amplify build config (preBuild runs ingestion scripts)
```

## Common commands

```bash
# Generate static data files (run from repo root)
python3 ingestion/split_lessons.py
python3 ingestion/merge_tables.py

# Local dev
cd frontend && npm run dev

# Deploy AWS infrastructure
cd infrastructure && npx cdk deploy

# Upload source files to trigger exercise generation
aws s3 sync data/a1/ s3://<RawBucketName>/a1/ --exclude "LLM_INSTRUCTION_SET.md"
```

## Data flow

- **Study mode**: Amplify `preBuild` runs the Python scripts to split/merge markdown into static files served by the frontend.
- **Exercise mode**: `aws s3 sync` → S3 event → `IngestionFunction` Lambda → Bedrock (Claude Haiku) → DynamoDB → API Gateway → frontend `/exercise`.

## Key decisions

- All AWS infrastructure is defined in `infrastructure/` via CDK.
- No GitHub Actions / CI credentials. S3 uploads are done manually with `aws s3 sync`.
- Exercises are pre-generated and cached in DynamoDB (not generated on demand).
- DynamoDB key design: PK=`level` (`"a1"`), SK=`typeLesson` (`"nouns#03"`) — enables `begins_with` filtering without a GSI.
