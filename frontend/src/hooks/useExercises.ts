import { useEffect, useState } from 'react'

export interface Question {
  type: 'multiple_choice' | 'fill_blank' | 'translation' | 'article';
  question: string;
  options?: string[];
  answer: string;
  lessonId?: number;
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

const API_URL = import.meta.env.VITE_EXERCISES_API_URL ?? ''

const cache = new Map<string, ExerciseSet>()

export function useExercises(level: string, type: string): ExerciseState {
  const key = `${level}:${type}`
  const [state, setState] = useState<ExerciseState>({
    data: cache.get(key) ?? null,
    loading: !cache.has(key),
    error: null,
  })

  useEffect(() => {
    if (cache.has(key)) {
      setState({ data: cache.get(key)!, loading: false, error: null })
      return
    }

    if (!API_URL) {
      setState({ data: null, loading: false, error: 'VITE_EXERCISES_API_URL is not configured.' })
      return
    }

    let cancelled = false
    setState({ data: null, loading: true, error: null })

    const url = type === 'all'
      ? `${API_URL}/${level}`
      : `${API_URL}/${level}?type=${type}`

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error('not_generated')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ExerciseSet>
      })
      .then((data) => {
        if (!cancelled) {
          cache.set(key, data)
          setState({ data, loading: false, error: null })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err.message })
        }
      })

    return () => { cancelled = true }
  }, [key])

  return state
}
