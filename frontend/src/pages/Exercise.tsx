import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useExercises, type Question } from "../hooks/useExercises";
import {
  deleteQuestion,
  regenerateQuestion,
  replaceQuestion,
} from "../hooks/useFeedback";

type FilterType = "all" | "nouns" | "verbs";
const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  nouns: "Nouns",
  verbs: "Verbs",
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function QuestionCard({
  question,
  index,
  total,
  onAnswer,
  onDelete,
  onImprove,
}: {
  question: Question;
  index: number;
  total: number;
  onAnswer: (correct: boolean) => void;
  onDelete: () => void;
  onImprove: () => void;
}) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const isMultipleChoice = question.type === "multiple_choice";
  const correct = submitted
    ? (isMultipleChoice
        ? (selectedOption ?? "")
        : input.trim()
      ).toLowerCase() === question.answer.toLowerCase()
    : false;

  function handleCheck() {
    if (submitted) return;
    setSubmitted(true);
    const answer = isMultipleChoice ? (selectedOption ?? "") : input.trim();
    onAnswer(answer.toLowerCase() === question.answer.toLowerCase());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
          Question {index + 1} / {total}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
            {question.topic}
          </span>
          <button
            onClick={onImprove}
            className="text-sm text-slate-600 hover:text-blue-600 transition-colors"
            title="Improve this question"
          >
            ✏
          </button>
          <button
            onClick={onDelete}
            className="text-sm text-slate-600 hover:text-red-600 transition-colors"
            title="Delete this question"
          >
            🗑
          </button>
        </div>
      </div>

      <p className="text-lg font-medium text-slate-800">{question.question}</p>

      {isMultipleChoice && question.options ? (
        <div className="grid grid-cols-2 gap-2">
          {question.options.map((opt) => {
            let cls =
              "px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ";
            if (!submitted) {
              cls +=
                selectedOption === opt
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 hover:border-slate-400 text-slate-700";
            } else if (opt.toLowerCase() === question.answer.toLowerCase()) {
              cls += "border-green-500 bg-green-50 text-green-700";
            } else if (opt === selectedOption) {
              cls += "border-red-400 bg-red-50 text-red-700";
            } else {
              cls += "border-slate-200 text-slate-400";
            }
            return (
              <button
                key={opt}
                className={cls}
                onClick={() => !submitted && setSelectedOption(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          disabled={submitted}
          placeholder="Your answer…"
          className={`px-4 py-2 border rounded-lg text-sm outline-none transition-colors ${
            submitted
              ? correct
                ? "border-green-400 bg-green-50"
                : "border-red-400 bg-red-50"
              : "border-slate-300 focus:border-blue-400"
          }`}
        />
      )}

      {submitted ? (
        <p
          className={`text-sm font-medium ${correct ? "text-green-600" : "text-red-500"}`}
        >
          {correct ? "✓ Correct!" : `✗ The answer is: ${question.answer}`}
        </p>
      ) : (
        <button
          onClick={handleCheck}
          disabled={isMultipleChoice ? !selectedOption : !input.trim()}
          className="self-start px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
            hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Check
        </button>
      )}
    </div>
  );
}

type ImproveModeState =
  | { phase: "idle" }
  | { phase: "input" }
  | { phase: "loading" }
  | { phase: "preview"; previewQuestion: Question; iterationBase: Question };

export function Exercise() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterType = (searchParams.get("type") ?? "all") as FilterType;
  const filterTopic = searchParams.get("topic") ?? "all";

  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);

  const [improveMode, setImproveMode] = useState<ImproveModeState>({
    phase: "idle",
  });
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const { data, loading, error } = useExercises("a1", filterType);

  // Get available topics from current questions
  const availableTopics = data?.questions
    ? Array.from(new Set(data.questions.map((q) => q.topic)))
    : [];

  function resetExercise(newQuestions?: Question[]) {
    setQuestionIndex(0);
    setScore(0);
    setAnswered(false);
    setFinished(false);
    if (newQuestions) {
      setShuffledQuestions(newQuestions);
    } else {
      setShuffledQuestions([]);
    }
  }

  function handleFilterChange(type: FilterType) {
    setSearchParams({ type, topic: "all" });
    resetExercise();
  }

  function handleTopicChange(topic: string) {
    setSearchParams({ type: filterType, topic });
    resetExercise();
  }

  function handleShuffle() {
    const questions = data?.questions ?? [];
    if (questions.length > 0) {
      const newShuffled = shuffleArray(questions);
      resetExercise(newShuffled);
    }
  }

  function handleAnswer(correct: boolean) {
    if (correct) setScore((s) => s + 1);
    setAnswered(true);
  }

  function handleNext() {
    const total = data?.questions.length ?? 0;
    if (questionIndex + 1 >= total) {
      setFinished(true);
    } else {
      setQuestionIndex((i) => i + 1);
      setAnswered(false);
    }
  }

  function handleRetry() {
    const questions = data?.questions ?? [];
    const newShuffled = shuffleArray(questions);
    resetExercise(newShuffled);
  }

  async function handleDelete() {
    const question = questions[questionIndex];
    if (!question) return;

    if (
      !confirm(
        `Delete this ${question.exerciseType} question?\n\n"${question.question}"`
      )
    ) {
      return;
    }

    try {
      await deleteQuestion(
        "a1",
        question.lessonId || 1,
        question.exerciseType || "nouns",
        question.question
      );

      // Remove from local state
      const newShuffled = shuffledQuestions.filter(
        (q) => q.question !== question.question
      );
      setShuffledQuestions(newShuffled);
      setAnswered(false);

      // Move to next question or finish
      const newTotal = newShuffled.length;
      if (questionIndex >= newTotal) {
        if (newTotal === 0) {
          setFinished(true);
        } else {
          setQuestionIndex(Math.max(0, newTotal - 1));
        }
      }
    } catch (err) {
      alert(`Failed to delete question: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleImproveOpen() {
    setImproveMode({ phase: "input" });
    setFeedbackText("");
    setFeedbackError(null);
  }

  async function handleRegenerateSubmit() {
    const question = questions[questionIndex];
    if (!question || !feedbackText.trim()) return;

    setImproveMode({ phase: "loading" });
    setFeedbackError(null);

    try {
      const newQuestion = await regenerateQuestion(
        "a1",
        question.lessonId || 1,
        question.exerciseType || "nouns",
        question.question,
        feedbackText
      );

      setImproveMode({
        phase: "preview",
        previewQuestion: newQuestion,
        iterationBase: newQuestion,
      });
    } catch (err) {
      setFeedbackError(
        err instanceof Error ? err.message : "Failed to regenerate question"
      );
      setImproveMode({ phase: "input" });
    }
  }

  async function handleAccept() {
    const question = questions[questionIndex];
    const improveState = improveMode;

    if (
      improveState.phase !== "preview" ||
      !question ||
      !improveState.previewQuestion
    ) {
      return;
    }

    try {
      await replaceQuestion(
        "a1",
        question.lessonId || 1,
        question.exerciseType || "nouns",
        question.question,
        improveState.previewQuestion
      );

      // Update local state
      const newShuffled = shuffledQuestions.map((q) =>
        q.question === question.question ? improveState.previewQuestion : q
      );
      setShuffledQuestions(newShuffled);
      setImproveMode({ phase: "idle" });
      setFeedbackText("");
      setAnswered(false);
    } catch (err) {
      setFeedbackError(
        err instanceof Error ? err.message : "Failed to accept replacement"
      );
    }
  }

  function handleTryAgain() {
    const improveState = improveMode;
    if (improveState.phase !== "preview") return;

    setImproveMode({ phase: "loading" });
    setFeedbackError(null);

    regenerateQuestion(
      "a1",
      questions[questionIndex]?.lessonId || 1,
      questions[questionIndex]?.exerciseType || "nouns",
      questions[questionIndex]?.question || "",
      feedbackText
    )
      .then((newQuestion) => {
        setImproveMode({
          phase: "preview",
          previewQuestion: newQuestion,
          iterationBase: newQuestion,
        });
      })
      .catch((err) => {
        setFeedbackError(
          err instanceof Error ? err.message : "Failed to regenerate question"
        );
        setImproveMode({ phase: "input" });
      });
  }

  function handleDiscardImprove() {
    setImproveMode({ phase: "idle" });
    setFeedbackText("");
    setFeedbackError(null);
  }

  // Filter questions by topic if selected
  const allQuestions = data?.questions ?? [];
  const topicFilteredQuestions =
    filterTopic === "all"
      ? allQuestions
      : allQuestions.filter((q) => q.topic === filterTopic);

  // Initialize shuffled questions on first load
  const questions =
    shuffledQuestions.length > 0 ? shuffledQuestions : topicFilteredQuestions;
  const total = questions.length;

  // Auto-shuffle when data loads and we haven't shuffled yet
  if (!shuffledQuestions.length && topicFilteredQuestions.length > 0) {
    const newShuffled = shuffleArray(topicFilteredQuestions);
    setShuffledQuestions(newShuffled);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col gap-3">
        {/* Type filters */}
        <div className="flex items-center gap-2">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((t) => (
            <button
              key={t}
              onClick={() => handleFilterChange(t)}
              className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                filterType === t
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {FILTER_LABELS[t]}
            </button>
          ))}
          {total > 0 && !finished && (
            <>
              <button
                onClick={handleShuffle}
                className="ml-2 px-3 py-1.5 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                title="Shuffle questions"
              >
                🔀 Shuffle
              </button>
              <span className="ml-auto text-sm text-slate-500">
                Score: {score} / {questionIndex}
              </span>
            </>
          )}
        </div>

        {/* Topic filters */}
        {availableTopics.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Topic:</span>
            <button
              onClick={() => handleTopicChange("all")}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filterTopic === "all"
                  ? "bg-slate-200 text-slate-800"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              All
            </button>
            {availableTopics.map((topic) => (
              <button
                key={topic}
                onClick={() => handleTopicChange(topic)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  filterTopic === topic
                    ? "bg-slate-200 text-slate-800"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-white flex items-start justify-center p-8">
        <div className="w-full max-w-xl">
          {loading && <p className="text-slate-400">Loading exercises…</p>}

          {error === "not_generated" && (
            <div className="text-center text-slate-400">
              <p className="text-lg font-medium mb-2">Not ready yet</p>
              <p className="text-sm">
                Exercises haven't been generated yet. Upload the source files to
                S3 to trigger generation.
              </p>
            </div>
          )}

          {error && error !== "not_generated" && (
            <p className="text-red-500 text-sm">Error: {error}</p>
          )}

          {!loading && !error && finished && (
            <div className="text-center">
              <p className="text-2xl font-semibold text-slate-800 mb-2">
                {score} / {total}
              </p>
              <p className="text-slate-500 mb-6">
                {score === total
                  ? "Perfect score!"
                  : score >= total * 0.7
                    ? "Well done!"
                    : "Keep practising!"}
              </p>
              <button
                onClick={handleRetry}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && !finished && questions.length > 0 && (
            <div className="flex flex-col gap-6">
              <QuestionCard
                key={`${filterType}-${questionIndex}`}
                question={questions[questionIndex]}
                index={questionIndex}
                total={total}
                onAnswer={handleAnswer}
                onDelete={handleDelete}
                onImprove={handleImproveOpen}
              />

              {/* Improve mode UI */}
              {improveMode.phase === "input" && (
                <div className="flex flex-col gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="text-sm font-semibold text-slate-700">
                    How should this question be improved?
                  </label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="e.g., Make it harder, Use a different topic, Change the question format..."
                    className="p-3 border border-slate-300 rounded text-sm outline-none focus:border-blue-400"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRegenerateSubmit}
                      disabled={!feedbackText.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Generate
                    </button>
                    <button
                      onClick={handleDiscardImprove}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {improveMode.phase === "loading" && (
                <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-sm text-slate-600">Generating…</span>
                </div>
              )}

              {improveMode.phase === "preview" && (
                <div className="flex flex-col gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                    Preview
                  </p>
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-slate-800">
                      {improveMode.previewQuestion.question}
                    </p>

                    {improveMode.previewQuestion.type === "multiple_choice" &&
                      improveMode.previewQuestion.options && (
                        <div className="grid grid-cols-2 gap-2">
                          {improveMode.previewQuestion.options.map((opt) => (
                            <div
                              key={opt}
                              className="px-3 py-2 rounded border border-slate-200 text-sm text-slate-700 bg-white"
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}

                    <p className="text-xs text-slate-600">
                      <strong>Answer:</strong> {improveMode.previewQuestion.answer}
                    </p>
                  </div>

                  {feedbackError && (
                    <p className="text-sm text-red-600">{feedbackError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleAccept}
                      className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={handleTryAgain}
                      className="px-4 py-2 bg-slate-600 text-white rounded text-sm font-medium hover:bg-slate-700 transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={handleDiscardImprove}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded text-sm font-medium transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {answered && improveMode.phase === "idle" && (
                <button
                  onClick={handleNext}
                  className="self-end px-5 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  {questionIndex + 1 < total ? "Next →" : "Finish"}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
