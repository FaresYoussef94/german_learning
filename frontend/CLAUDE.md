# frontend

React 18 + Vite + TypeScript web app. Run all commands from this directory.

## Stack

- React 18, React Router v6
- Tailwind CSS v3 + `@tailwindcss/typography`
- `react-markdown` + `remark-gfm`
- Vite 5

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + bundle → dist/
```

## Structure

```
src/
├── App.tsx                      # Root component and routing
├── types.ts                     # Shared TypeScript types
├── components/                  # TopNav, StudySubNav, Sidebar, MarkdownViewer
├── hooks/                       # useLesson.ts (lesson data + summary fetching)
└── pages/                       # StudyLessons, StudyNouns, StudyVerbs, Exercise
public/
└── _redirects                   # SPA routing config for Amplify
```

## Routes

| Path | Component | Data Source |
|---|---|---|
| `/` | Redirect → `/study/lessons/1` | — |
| `/study/lessons/:lessonId` | `StudyLessons` | `useLessonSummary()` → `/lessons/{level}/{lessonId}/summary` |
| `/study/nouns` | `StudyNouns` | `useAllNouns()` → `/lessons/{level}/nouns` |
| `/study/verbs` | `StudyVerbs` | `useAllVerbs()` → `/lessons/{level}/verbs` |
| `/exercise` | `Exercise` | `useExercises()` → `/exercises/{level}?type=nouns\|verbs` |
| `/upload` | `UploadLesson` | `getPresignedUrl()` → `POST /lesson-upload-url` |

## Hooks

### useLesson.ts

#### useLessonIndex(level: string)
Fetches lesson index: `GET /lessons/{level}` → `{id, title}[]`

### useLessonSummary(level: string, lessonId: string)
Fetches lesson summary markdown: `GET /lessons/{level}/{lessonId}/summary` → `string`
(Note: summary is fetched separately from S3, not from DynamoDB lesson item)

### useAllNouns(level: string)
Fetches all nouns across lessons: `GET /lessons/{level}/nouns` → `Noun[]`
(Deduplicated by API endpoint)

### useAllVerbs(level: string)
Fetches all verbs across lessons: `GET /lessons/{level}/verbs` → `Verb[]`
(Deduplicated by API endpoint)

### useExercises(level: string, type?: 'nouns' | 'verbs' | 'all')
Fetches exercises: `GET /exercises/{level}?type=nouns|verbs` → `{questions: Question[]}`

### useLessonUpload.ts

#### getPresignedUrl(lessonId: string, level?: string)
Generates a presigned S3 upload URL: `POST /lesson-upload-url` → `{uploadUrl, key, expiresIn}`

**Usage:**
```typescript
const { uploadUrl, expiresIn } = await getPresignedUrl("3", "a1");
// Returns URL valid for 1 hour, ready for direct S3 PUT from browser
```

**Throws:** Error if API not configured or request fails

## Types (types.ts)

### LessonMeta
```typescript
{ id: number; title: string }
```

### LessonDetail
```typescript
{
  id: number;
  title: string;
  nouns: Noun[];
  verbs: Verb[];
  exercises: {
    nouns: Question[];
    verbs: Question[];
  };
}
```
(Note: summary NOT included; fetched separately via useLessonSummary)

### Noun
```typescript
{ word: string; article: string; plural: string; english: string }
```

### Verb
```typescript
{ infinitive: string; perfectForm: string; case: string; english: string }
```

### Question
```typescript
{
  type: "multiple_choice" | "fill_blank" | "translation" | "article";
  topic: string;         // e.g., "article", "plural", "vocabulary", "infinitive", "conjugation", "perfect_form"
  question: string;
  options?: string[];    // present for multiple_choice
  answer: string;
}
```

## Environment variables

- `VITE_API_BASE_URL` — API Gateway base URL. Set in Amplify Console for production.

All endpoints are constructed from this base:
- `/lessons` — lesson API
- `/exercises` — exercise API
- `/feedback` — feedback API
- `/lesson-upload-url` — presigned URL API

For local testing create `frontend/.env.local`:
```
VITE_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod
```

## Key Changes from Previous Version

- **Summary fetching**: Changed from `useLesson()` (returns full lesson with summary) to `useLessonSummary()` (fetches summary separately from S3)
- **Exercise types**: Removed "lesson" type (now only nouns + verbs)
- **LessonDetail interface**: Removed `summary` field (fetched separately)
- **Module-level caches**: useLesson.ts maintains separate caches for lessons, summaries, nouns, and verbs
- **Deduplication**: API endpoints handle cross-lesson deduplication (reflected automatically in hooks)

## Notes

- All lesson content and exercises are fetched from the API at runtime (no static files).
- `tsconfig.json` includes `"types": ["vite/client"]` for `import.meta.env` support.
- `public/_redirects` handles SPA routing on Amplify (`/* /index.html 200`).
