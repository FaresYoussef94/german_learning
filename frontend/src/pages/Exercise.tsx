import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useExercises, type Question } from '../hooks/useExercises'

type FilterType = 'all' | 'nouns' | 'verbs' | 'lesson'
const FILTER_LABELS: Record<FilterType, string> = {
  all: 'All',
  nouns: 'Nouns',
  verbs: 'Verbs',
  lesson: 'Lesson',
}

function QuestionCard({
  question,
  index,
  total,
  onAnswer,
}: {
  question: Question
  index: number
  total: number
  onAnswer: (correct: boolean) => void
}) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)

  const isMultipleChoice = question.type === 'multiple_choice'
  const correct = submitted
    ? (isMultipleChoice ? (selectedOption ?? '') : input.trim()).toLowerCase() ===
      question.answer.toLowerCase()
    : false

  function handleCheck() {
    if (submitted) return
    setSubmitted(true)
    const answer = isMultipleChoice ? selectedOption ?? '' : input.trim()
    onAnswer(answer.toLowerCase() === question.answer.toLowerCase())
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
        Question {index + 1} / {total}
      </p>

      <p className="text-lg font-medium text-slate-800">{question.question}</p>

      {isMultipleChoice && question.options ? (
        <div className="grid grid-cols-2 gap-2">
          {question.options.map((opt) => {
            let cls = 'px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left '
            if (!submitted) {
              cls += selectedOption === opt
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 hover:border-slate-400 text-slate-700'
            } else if (opt.toLowerCase() === question.answer.toLowerCase()) {
              cls += 'border-green-500 bg-green-50 text-green-700'
            } else if (opt === selectedOption) {
              cls += 'border-red-400 bg-red-50 text-red-700'
            } else {
              cls += 'border-slate-200 text-slate-400'
            }
            return (
              <button key={opt} className={cls} onClick={() => !submitted && setSelectedOption(opt)}>
                {opt}
              </button>
            )
          })}
        </div>
      ) : (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          disabled={submitted}
          placeholder="Your answer…"
          className={`px-4 py-2 border rounded-lg text-sm outline-none transition-colors ${
            submitted
              ? correct
                ? 'border-green-400 bg-green-50'
                : 'border-red-400 bg-red-50'
              : 'border-slate-300 focus:border-blue-400'
          }`}
        />
      )}

      {submitted ? (
        <p className={`text-sm font-medium ${correct ? 'text-green-600' : 'text-red-500'}`}>
          {correct ? '✓ Correct!' : `✗ The answer is: ${question.answer}`}
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
  )
}

export function Exercise() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterType = (searchParams.get('type') ?? 'all') as FilterType

  const [questionIndex, setQuestionIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [finished, setFinished] = useState(false)

  const { data, loading, error } = useExercises('a1', filterType)

  function handleFilterChange(type: FilterType) {
    setSearchParams({ type })
    setQuestionIndex(0)
    setScore(0)
    setAnswered(false)
    setFinished(false)
  }

  function handleAnswer(correct: boolean) {
    if (correct) setScore((s) => s + 1)
    setAnswered(true)
  }

  function handleNext() {
    const total = data?.questions.length ?? 0
    if (questionIndex + 1 >= total) {
      setFinished(true)
    } else {
      setQuestionIndex((i) => i + 1)
      setAnswered(false)
    }
  }

  function handleRetry() {
    setQuestionIndex(0)
    setScore(0)
    setAnswered(false)
    setFinished(false)
  }

  const questions = data?.questions ?? []
  const total = questions.length

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-2">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((t) => (
          <button
            key={t}
            onClick={() => handleFilterChange(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
              filterType === t
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {FILTER_LABELS[t]}
          </button>
        ))}
        {total > 0 && !finished && (
          <span className="ml-auto text-sm text-slate-500">
            Score: {score} / {questionIndex}
          </span>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-white flex items-start justify-center p-8">
        <div className="w-full max-w-xl">
          {loading && <p className="text-slate-400">Loading exercises…</p>}

          {error === 'not_generated' && (
            <div className="text-center text-slate-400">
              <p className="text-lg font-medium mb-2">Not ready yet</p>
              <p className="text-sm">
                Exercises haven't been generated yet. Upload the source files to S3 to
                trigger generation.
              </p>
            </div>
          )}

          {error && error !== 'not_generated' && (
            <p className="text-red-500 text-sm">Error: {error}</p>
          )}

          {!loading && !error && finished && (
            <div className="text-center">
              <p className="text-2xl font-semibold text-slate-800 mb-2">
                {score} / {total}
              </p>
              <p className="text-slate-500 mb-6">
                {score === total
                  ? 'Perfect score!'
                  : score >= total * 0.7
                  ? 'Well done!'
                  : 'Keep practising!'}
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
              />
              {answered && (
                <button
                  onClick={handleNext}
                  className="self-end px-5 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  {questionIndex + 1 < total ? 'Next →' : 'Finish'}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
