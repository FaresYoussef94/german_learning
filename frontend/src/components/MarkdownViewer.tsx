import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export function MarkdownViewer({ content }: Props) {
  return (
    <div className="bg-white rounded-lg p-6">
      <div
        className="prose max-w-none
        prose-headings:font-semibold prose-headings:text-slate-900
        prose-h2:text-2xl prose-h2:mt-0 prose-h2:mb-4
        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
        prose-p:text-slate-800
        prose-li:text-slate-800
        prose-strong:text-slate-900 prose-strong:font-bold
        prose-table:w-full prose-table:border-collapse
        prose-th:bg-slate-200 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-slate-300 prose-th:text-slate-900 prose-th:font-semibold
        prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-300 prose-td:text-slate-800
        prose-tr:even:bg-slate-100
        prose-pre:bg-slate-100 prose-pre:border prose-pre:border-slate-300 prose-pre:text-slate-900
        prose-code:text-slate-900 prose-code:bg-transparent prose-code:p-0 prose-code:border-0
        prose-blockquote:text-slate-700 prose-blockquote:border-slate-300 prose-blockquote:italic
        prose-a:text-blue-600 prose-a:underline prose-a:hover:text-blue-700"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
