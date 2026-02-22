import { useState } from "react";
import type { Question } from "../hooks/useExercises";

export function StudyQuestionCard({
  question,
  questionNumber,
  totalQuestions,
}: {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const isMultipleChoice = question.type === "multiple_choice";

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
          Question {questionNumber} / {totalQuestions}
        </p>
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
          {question.topic}
        </span>
      </div>

      <p className="text-sm font-medium text-slate-800 mb-3">{question.question}</p>

      {isMultipleChoice && question.options ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {question.options.map((opt) => {
            let cls = "px-3 py-2 rounded border text-xs font-medium transition-colors text-left cursor-pointer ";

            if (!revealed) {
              cls +=
                selectedOption === opt
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 hover:border-slate-400 text-slate-700 hover:bg-slate-50";
            } else if (opt.toLowerCase() === question.answer.toLowerCase()) {
              cls += "border-green-500 bg-green-50 text-green-700";
            } else if (opt === selectedOption && opt !== question.answer) {
              cls += "border-red-400 bg-red-50 text-red-700";
            } else {
              cls += "border-slate-200 text-slate-400";
            }

            return (
              <button
                key={opt}
                className={cls}
                onClick={() => {
                  if (!revealed) {
                    setSelectedOption(opt);
                    setRevealed(true);
                  }
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-3">
          <button
            className="w-full px-3 py-2 border border-slate-200 rounded text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? "Hide answer" : "Show answer"}
          </button>
        </div>
      )}

      {revealed && (
        <div className="bg-green-50 border border-green-200 rounded p-3">
          <p className="text-xs font-semibold text-green-700 mb-1">Answer</p>
          <p className="text-sm text-green-900">{question.answer}</p>
        </div>
      )}
    </div>
  );
}
