import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string;
}

export function MarkdownViewer({ content }: Props) {
  return (
    <div className="prose prose-slate max-w-none
      prose-headings:font-semibold
      prose-h2:text-2xl prose-h2:mt-0 prose-h2:mb-4
      prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
      prose-table:w-full prose-table:border-collapse
      prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-slate-300
      prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-300
      prose-tr:even:bg-slate-50
      prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded
      prose-strong:text-slate-900">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
