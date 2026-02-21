import { useParams } from "react-router-dom";
import { useLessonSummary } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";

export function StudyLessons() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const id = lessonId ?? "1";
  const { data: summary, loading, error } = useLessonSummary("a1", id);

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return (
      <div className="p-6 text-red-500">Error loading lesson: {error}</div>
    );
  if (!summary)
    return <div className="p-6 text-slate-400">No content available.</div>;

  return (
    <div className="p-6 overflow-y-auto">
      <MarkdownViewer content={summary} />
    </div>
  );
}
