import { useMarkdown } from '../hooks/useMarkdown'
import { MarkdownViewer } from '../components/MarkdownViewer'

export function StudyNouns() {
  const { content, loading, error } = useMarkdown('/data/a1/nouns/all.md')

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>
  if (error) return <div className="p-6 text-red-500">Error loading nouns: {error}</div>
  if (!content) return <div className="p-6 text-slate-400 italic">No noun data available.</div>

  return (
    <div className="p-6">
      <MarkdownViewer content={content} />
    </div>
  )
}
