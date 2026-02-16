import { useParams } from 'react-router-dom'
import { useMarkdown } from '../hooks/useMarkdown'
import { MarkdownViewer } from '../components/MarkdownViewer'

export function StudyNouns() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const id = parseInt(lessonId ?? '1', 10)
  const padded = String(id).padStart(2, '0')
  const { content, loading, error } = useMarkdown(`/data/a1/nouns/lesson_${padded}.md`)

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>
  if (error) return <div className="p-6 text-red-500">Error loading nouns: {error}</div>
  if (!content || content.trim() === '')
    return <div className="p-6 text-slate-400 italic">No noun data for this lesson.</div>

  return (
    <div className="p-6 overflow-y-auto">
      <MarkdownViewer content={content} />
    </div>
  )
}
