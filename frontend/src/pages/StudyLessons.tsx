import { useParams } from "react-router-dom";
import { useLesson, useLessonSummary } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { StudyQuestionCard } from "../components/StudyQuestionCard";

export function StudyLessons() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const id = lessonId ?? "1";
  const { data: lesson, loading: lessonLoading, error: lessonError } = useLesson(
    "a1",
    id
  );
  const { data: summary, loading: summaryLoading, error: summaryError } =
    useLessonSummary("a1", id);

  const loading = lessonLoading || summaryLoading;
  const error = lessonError || summaryError;

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return (
      <div className="p-6 text-red-500">Error loading lesson: {error}</div>
    );
  if (!summary)
    return <div className="p-6 text-slate-400">No content available.</div>;

  const nounExercises = lesson?.exercises?.nouns ?? [];
  const verbExercises = lesson?.exercises?.verbs ?? [];

  return (
    <div className="overflow-y-auto flex-1">
      {/* Lesson Summary */}
      <div className="p-6 border-b border-slate-200">
        <MarkdownViewer content={summary} />
      </div>

      {/* Exercises Section */}
      {(nounExercises.length > 0 || verbExercises.length > 0) && (
        <div className="p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            Practice Questions
          </h2>

          {/* Noun Exercises */}
          {nounExercises.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-700 mb-4 flex items-center gap-2">
                <span className="text-blue-600">📚</span> Noun Exercises (
                {nounExercises.length})
              </h3>
              <div className="space-y-3">
                {nounExercises.map((q, idx) => (
                  <StudyQuestionCard
                    key={idx}
                    question={q}
                    questionNumber={idx + 1}
                    totalQuestions={nounExercises.length}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Verb Exercises */}
          {verbExercises.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-slate-700 mb-4 flex items-center gap-2">
                <span className="text-green-600">🔄</span> Verb Exercises (
                {verbExercises.length})
              </h3>
              <div className="space-y-3">
                {verbExercises.map((q, idx) => (
                  <StudyQuestionCard
                    key={idx}
                    question={q}
                    questionNumber={idx + 1}
                    totalQuestions={verbExercises.length}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
