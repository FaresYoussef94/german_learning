import { useMarkdown } from '../hooks/useMarkdown'
import { MarkdownViewer } from '../components/MarkdownViewer'

export function StudyVerbs() {
  const { content, loading, error } = useMarkdown('/data/a1/verbs/all.md')

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>
  if (error) return <div className="p-6 text-red-500">Error loading verbs: {error}</div>
  if (!content) return <div className="p-6 text-slate-400 italic">No verb data available.</div>

  return (
    <div className="p-6">
      <MarkdownViewer content={content} />
    </div>
  )
}
