# data/a1 — Source Markdown Files

These three files are the single source of truth for all content. Edit them to add or update content.

## Files

| File | Purpose |
|---|---|
| `German_Lesson_Summary.md` | 14 lesson summaries, split on `## Lesson N` headings |
| `German_Nouns.md` | All nouns organised by lesson, with article, plural, English |
| `German_Verbs.md` | All verbs organised by lesson, with present perfect, case, English |
| `LLM_INSTRUCTION_SET.md` | Authoring notes — excluded from S3 sync |

## After editing

Run from the repo root to regenerate static frontend assets:
```bash
python3 ingestion/split_lessons.py
python3 ingestion/merge_tables.py
```

Then upload to S3 to regenerate exercises:
```bash
aws s3 sync data/a1/ s3://<RawBucketName>/a1/ --exclude "LLM_INSTRUCTION_SET.md"
```

## Heading convention

`German_Lesson_Summary.md` and the per-lesson sections in `German_Nouns.md` / `German_Verbs.md` must use `## Lesson N` (exact format) — the ingestion scripts and Lambda both rely on this regex: `^## Lesson (\d+)`.
