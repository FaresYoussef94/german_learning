import { useState, useEffect, useRef } from "react";
import {
  useSpacedRepetition,
  type ReviewCard,
  type Rating,
} from "../hooks/useSpacedRepetition";
import type { Noun, Verb } from "../types";

const PRONOUNS: { key: keyof Verb; label: string }[] = [
  { key: "ich", label: "ich" },
  { key: "du", label: "du" },
  { key: "erSieEs", label: "er/sie/es" },
  { key: "wir", label: "wir" },
  { key: "ihr", label: "ihr" },
  { key: "sieSie", label: "sie/Sie" },
];

const RATING_BUTTONS: {
  rating: Rating;
  label: string;
  sub: string;
  color: string;
}[] = [
  {
    rating: "again",
    label: "Again",
    sub: "<1m",
    color:
      "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
  },
  {
    rating: "hard",
    label: "Hard",
    sub: "~1d",
    color:
      "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200",
  },
  {
    rating: "good",
    label: "Good",
    sub: "~3d",
    color:
      "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200",
  },
  {
    rating: "easy",
    label: "Easy",
    sub: "~7d",
    color:
      "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200",
  },
];

function NounFront({ noun }: { noun: Noun }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
        article &amp; plural?
      </div>
      <div className="text-5xl font-bold text-slate-800 mb-3">{noun.word}</div>
      <div className="text-lg text-slate-400 italic">{noun.english}</div>
    </div>
  );
}

function NounBack({ noun }: { noun: Noun }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-slate-800 mb-2">
        <span className="text-blue-600">{noun.article}</span> {noun.word}
      </div>
      <div className="text-xl text-slate-500 mb-1">Plural: {noun.plural}</div>
      <div className="text-slate-400 italic">{noun.english}</div>
    </div>
  );
}

function VerbFront({ verb }: { verb: Verb }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
        infinitive?
      </div>
      <div className="text-5xl font-bold text-slate-800 mb-3">
        {verb.english}
      </div>
    </div>
  );
}

function VerbBack({ verb }: { verb: Verb }) {
  const hasConjugations = !!verb.ich;
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-slate-800 mb-1">
        {verb.infinitive}
      </div>
      <div className="text-slate-400 italic mb-2">{verb.english}</div>
      {verb.perfectForm && (
        <div className="text-blue-600 font-medium mb-3">
          Perfekt: {verb.perfectForm}
        </div>
      )}
      {hasConjugations && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm max-w-xs mx-auto text-left mt-2">
          {PRONOUNS.map(({ key, label }) => (
            <div key={key} className="flex gap-1.5">
              <span className="text-slate-400 w-14 shrink-0">{label}</span>
              <span className="font-medium text-slate-700">
                {(verb[key] as string | undefined) ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Review() {
  const { dueCards, totalCards, learnedCount, rateCard, loading, synced } = useSpacedRepetition();

  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [sessionDone, setSessionDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const initialized = useRef(false);

  // Always wait for API sync before initializing, so both nouns and verbs
  // are included even when noun cards already exist in localStorage
  useEffect(() => {
    if (!synced || initialized.current) return;
    const shuffled = [...dueCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled);
    initialized.current = true;
  }, [synced, dueCards]);

  function handleRate(rating: Rating) {
    if (!queue?.[0]) return;
    rateCard(queue[0], rating);
    setQueue((q) => (q ? q.slice(1) : []));
    setSessionDone((n) => n + 1);
    setRevealed(false);
  }

  // Loading state
  if (loading || queue === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-slate-400 text-lg">Loading vocabulary...</div>
      </div>
    );
  }

  const current = queue[0];

  // Session complete
  if (!current) {
    const nothingDue = sessionDone === 0;
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <div className="text-5xl">{nothingDue ? "✓" : "🎉"}</div>
        <div className="text-2xl font-bold text-slate-800">
          {nothingDue ? "Nothing due!" : "Session complete!"}
        </div>
        {sessionDone > 0 && (
          <div className="text-slate-500">
            Reviewed {sessionDone} card{sessionDone !== 1 ? "s" : ""}
          </div>
        )}
        {nothingDue && (
          <div className="text-slate-400 text-sm">
            All caught up. Check back tomorrow.
          </div>
        )}
        <div className="grid grid-cols-2 gap-6 mt-4 text-center">
          <div>
            <div className="text-3xl font-bold text-slate-700">{totalCards}</div>
            <div className="text-sm text-slate-400">total cards</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-green-600">
              {learnedCount}
            </div>
            <div className="text-sm text-slate-400">learned</div>
          </div>
        </div>
      </div>
    );
  }

  const isNoun = current.type === "noun";
  const total = sessionDone + queue.length;
  const progress = total > 0 ? sessionDone / total : 0;

  return (
    <div className="flex flex-col h-full p-6 max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{sessionDone} done</span>
          <span>{queue.length} remaining</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 min-h-56 flex flex-col items-center justify-center">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-widest mb-6">
            {isNoun ? "Noun" : "Verb"}
          </div>
          {!revealed ? (
            isNoun ? (
              <NounFront noun={current.data as Noun} />
            ) : (
              <VerbFront verb={current.data as Verb} />
            )
          ) : isNoun ? (
            <NounBack noun={current.data as Noun} />
          ) : (
            <VerbBack verb={current.data as Verb} />
          )}
        </div>

        {current.repetitions > 0 && (
          <div className="text-xs text-slate-300">
            interval {current.interval}d · ease {current.easeFactor.toFixed(1)}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-6">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors"
          >
            Show Answer
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATING_BUTTONS.map(({ rating, label, sub, color }) => (
              <button
                key={rating}
                onClick={() => handleRate(rating)}
                className={`py-3 rounded-xl font-semibold text-sm transition-colors flex flex-col items-center gap-0.5 ${color}`}
              >
                <span>{label}</span>
                <span className="text-xs font-normal opacity-60">{sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
