import { useState, useEffect, useCallback } from "react";
import { useAllNounsAllLevels, useAllVerbsAllLevels } from "./useLesson";
import type { Noun, Verb } from "../types";

export interface ReviewCard {
  id: string;
  type: "noun" | "verb";
  data: Noun | Verb;
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReview: string; // YYYY-MM-DD
  lastReview?: string;
}

export type Rating = "again" | "hard" | "good" | "easy";

const RATING_QUALITY: Record<Rating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

const STORAGE_KEY = "sr_cards";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function sm2Update(card: ReviewCard, rating: Rating): ReviewCard {
  const q = RATING_QUALITY[rating];
  let { interval, repetitions, easeFactor } = card;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);

    easeFactor = Math.max(
      1.3,
      easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02),
    );
    repetitions += 1;
  }

  return {
    ...card,
    interval,
    repetitions,
    easeFactor,
    lastReview: todayStr(),
    nextReview: addDays(todayStr(), interval),
  };
}

function loadCards(): Record<string, ReviewCard> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCards(cards: Record<string, ReviewCard>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function getDueCount(): number {
  try {
    const cards = loadCards();
    const today = todayStr();
    return Object.values(cards).filter((c) => c.nextReview <= today).length;
  } catch {
    return 0;
  }
}

export function useSpacedRepetition() {
  const { data: nouns, loading: nounsLoading } = useAllNounsAllLevels();
  const { data: verbs, loading: verbsLoading } = useAllVerbsAllLevels();
  const [cards, setCards] = useState<Record<string, ReviewCard>>(loadCards);
  // synced becomes true after the API-driven setCards resolves (always false on mount,
  // so the queue always waits for the full card set including verbs)
  const [synced, setSynced] = useState(false);

  // Sync new vocabulary items into card deck once API loads
  useEffect(() => {
    if (nounsLoading || verbsLoading) return;
    if (!nouns && !verbs) return;

    setCards((prev) => {
      const updated = { ...prev };
      let changed = false;

      (nouns ?? []).forEach((noun) => {
        const id = `noun:${noun.word}`;
        if (!updated[id]) {
          updated[id] = {
            id,
            type: "noun",
            data: noun,
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5,
            nextReview: todayStr(),
          };
          changed = true;
        }
      });

      (verbs ?? []).forEach((verb) => {
        const id = `verb:${verb.infinitive}`;
        if (!updated[id]) {
          updated[id] = {
            id,
            type: "verb",
            data: verb,
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5,
            nextReview: todayStr(),
          };
          changed = true;
        }
      });

      if (changed) saveCards(updated);
      return changed ? updated : prev;
    });
    setSynced(true);
  }, [nouns, verbs, nounsLoading, verbsLoading]);

  const rateCard = useCallback((card: ReviewCard, rating: Rating) => {
    setCards((prev) => {
      const updated = { ...prev, [card.id]: sm2Update(card, rating) };
      saveCards(updated);
      return updated;
    });
  }, []);

  const today = todayStr();
  const allCards = Object.values(cards);
  const dueCards = allCards.filter((c) => c.nextReview <= today);

  return {
    dueCards,
    totalCards: allCards.length,
    learnedCount: allCards.filter((c) => c.repetitions > 0).length,
    rateCard,
    loading: nounsLoading || verbsLoading,
    synced,
  };
}
