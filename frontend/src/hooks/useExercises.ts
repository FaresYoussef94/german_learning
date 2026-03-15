import { useEffect, useState } from "react";
import { API_BASE_URL, getApiHeaders } from "../utils/api";

export interface Question {
  type: "multiple_choice" | "fill_blank" | "translation" | "article";
  question: string;
  options?: string[];
  answer: string;
  topic: string;
  lessonId?: number;
  exerciseType?: "nouns" | "verbs";
  level?: string;
}

export interface ExerciseSet {
  level: string;
  type: string;
  questions: Question[];
  total: number;
}

interface ExerciseState {
  data: ExerciseSet | null;
  loading: boolean;
  error: string | null;
}

const API_URL = `${API_BASE_URL}/exercises`;

const cache = new Map<string, ExerciseSet>();

export function useExercises(level: string, type: string): ExerciseState {
  const key = `${level}:${type}`;
  const [state, setState] = useState<ExerciseState>({
    data: cache.get(key) ?? null,
    loading: !cache.has(key),
    error: null,
  });

  useEffect(() => {
    if (cache.has(key)) {
      setState({ data: cache.get(key)!, loading: false, error: null });
      return;
    }

    if (!API_BASE_URL) {
      setState({
        data: null,
        loading: false,
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url =
      type === "all"
        ? `${API_URL}/${level}`
        : `${API_URL}/${level}?type=${type}`;

    fetch(url, { headers: getApiHeaders() })
      .then((res) => {
        if (res.status === 404) throw new Error("not_generated");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ExerciseSet>;
      })
      .then((data) => {
        if (!cancelled) {
          cache.set(key, data);
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

const ALL_LEVELS = ["a1", "a2", "b1", "b2"];
const allExercisesCache = new Map<string, ExerciseSet>();

export function useExercisesAllLevels(type: string): ExerciseState {
  const key = `all:${type}`;
  const [state, setState] = useState<ExerciseState>({
    data: allExercisesCache.get(key) ?? null,
    loading: !allExercisesCache.has(key),
    error: null,
  });

  useEffect(() => {
    if (allExercisesCache.has(key)) {
      setState({ data: allExercisesCache.get(key)!, loading: false, error: null });
      return;
    }
    if (!API_BASE_URL) {
      setState({ data: null, loading: false, error: "VITE_API_BASE_URL is not configured." });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    Promise.all(
      ALL_LEVELS.map((l) => {
        const url = type === "all" ? `${API_URL}/${l}` : `${API_URL}/${l}?type=${type}`;
        return fetch(url, { headers: getApiHeaders() })
          .then((res) => (res.ok ? (res.json() as Promise<ExerciseSet>) : { questions: [], level: l, type, total: 0 }))
          .then((data) => ({ level: l, questions: data.questions ?? [] }))
          .catch(() => ({ level: l, questions: [] as Question[] }));
      }),
    ).then((results) => {
      if (cancelled) return;
      const combined: Question[] = [];
      for (const { level, questions } of results) {
        for (const q of questions) {
          combined.push({ ...q, level });
        }
      }
      const result: ExerciseSet = { level: "all", type, questions: combined, total: combined.length };
      allExercisesCache.set(key, result);
      setState({ data: result, loading: false, error: null });
    });

    return () => { cancelled = true; };
  }, [key]);

  return state;
}
