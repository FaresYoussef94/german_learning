# frontend

React + Vite + TypeScript web app for the German Learning study and exercise experience.

## Stack

- React 18, React Router v6
- Tailwind CSS v3 + `@tailwindcss/typography`
- `react-markdown` + `remark-gfm` (table rendering)
- Vite 5

## Structure

```
src/
├── App.tsx                  # Root component, routing
├── types.ts                 # Shared TypeScript types
├── components/
│   ├── TopNav.tsx           # Study / Exercise top navigation
│   ├── StudySubNav.tsx      # Lessons / Nouns / Verbs sub-tabs
│   ├── Sidebar.tsx          # Lesson list (study mode only)
│   └── MarkdownViewer.tsx   # react-markdown renderer with prose styles
├── hooks/
│   ├── useMarkdown.ts       # Fetch + cache markdown files
│   └── useExercises.ts      # Fetch exercises from API Gateway
└── pages/
    ├── StudyLessons.tsx     # Per-lesson markdown viewer
    ├── StudyNouns.tsx       # Full nouns table (all lessons)
    ├── StudyVerbs.tsx       # Full verbs table (all lessons)
    └── Exercise.tsx         # Exercise UI with filter tabs and score tracking
```

## Routes

| Path | Description |
|---|---|
| `/` | Redirects to `/study/lessons/1` |
| `/study/lessons/:lessonId` | Lesson summary with sidebar navigation |
| `/study/nouns` | All nouns in one scrollable table |
| `/study/verbs` | All verbs in one scrollable table |
| `/exercise` | Exercise mode (All / Nouns / Verbs / Lesson filters) |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + bundle → dist/
```

Static data files (`public/data/a1/`) must be generated first:

```bash
# from repo root
python3 ingestion/split_lessons.py
python3 ingestion/merge_tables.py
```

## Environment variables

| Variable | Description |
|---|---|
| `VITE_EXERCISES_API_URL` | API Gateway base URL, e.g. `https://<id>.execute-api.<region>.amazonaws.com/prod/exercises` |

Set this in the **Amplify Console** environment variables for production. For local exercise testing, create `frontend/.env.local`:

```
VITE_EXERCISES_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod/exercises
```

## Deployment

Hosted on **AWS Amplify**. The `amplify.yml` at the repo root handles the full build:

1. Runs `ingestion/split_lessons.py` and `ingestion/merge_tables.py` to generate static data
2. Runs `npm run build` inside this directory
3. Serves `frontend/dist/` as the static site

SPA routing is handled by `public/_redirects` (`/* /index.html 200`).
