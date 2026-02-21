import { useEffect, useState } from "react";
import { LessonDetail, LessonMeta, Noun, Verb } from "../types";

interface LessonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const LESSONS_API = import.meta.env.VITE_LESSONS_API_URL ?? "";

const lessonDetailCache = new Map<string, LessonDetail>();
const lessonIndexCache = new Map<string, LessonMeta[]>();
const lessonSummaryCache = new Map<string, string>();
const nounsCache = new Map<string, Noun[]>();
const verbsCache = new Map<string, Verb[]>();

export function useLesson(
  level: string,
  lessonId: string,
): LessonState<LessonDetail> {
  const key = `${level}:${lessonId}`;
  const [state, setState] = useState<LessonState<LessonDetail>>({
    data: lessonDetailCache.get(key) ?? null,
    loading: !lessonDetailCache.has(key),
    error: null,
  });

  useEffect(() => {
    if (lessonDetailCache.has(key)) {
      setState({
        data: lessonDetailCache.get(key)!,
        loading: false,
        error: null,
      });
      return;
    }

    if (!LESSONS_API) {
      setState({
        data: null,
        loading: false,
        error: "VITE_LESSONS_API_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/${lessonId}`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error("not_found");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LessonDetail>;
      })
      .then((data) => {
        if (!cancelled) {
          lessonDetailCache.set(key, data);
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

export function useLessonIndex(level: string): LessonState<LessonMeta[]> {
  const [state, setState] = useState<LessonState<LessonMeta[]>>({
    data: lessonIndexCache.get(level) ?? null,
    loading: !lessonIndexCache.has(level),
    error: null,
  });

  useEffect(() => {
    if (lessonIndexCache.has(level)) {
      setState({
        data: lessonIndexCache.get(level)!,
        loading: false,
        error: null,
      });
      return;
    }

    if (!LESSONS_API) {
      setState({
        data: null,
        loading: false,
        error: "VITE_LESSONS_API_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error("not_generated");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LessonMeta[]>;
      })
      .then((data) => {
        if (!cancelled) {
          lessonIndexCache.set(level, data);
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
  }, [level]);

  return state;
}

export function useAllNouns(level: string): LessonState<Noun[]> {
  const [state, setState] = useState<LessonState<Noun[]>>({
    data: nounsCache.get(level) ?? null,
    loading: !nounsCache.has(level),
    error: null,
  });

  useEffect(() => {
    if (nounsCache.has(level)) {
      setState({ data: nounsCache.get(level)!, loading: false, error: null });
      return;
    }

    if (!LESSONS_API) {
      setState({
        data: null,
        loading: false,
        error: "VITE_LESSONS_API_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/nouns`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error("not_generated");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Noun[]>;
      })
      .then((data) => {
        if (!cancelled) {
          nounsCache.set(level, data);
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
  }, [level]);

  return state;
}

export function useAllVerbs(level: string): LessonState<Verb[]> {
  const [state, setState] = useState<LessonState<Verb[]>>({
    data: verbsCache.get(level) ?? null,
    loading: !verbsCache.has(level),
    error: null,
  });

  useEffect(() => {
    if (verbsCache.has(level)) {
      setState({ data: verbsCache.get(level)!, loading: false, error: null });
      return;
    }

    if (!LESSONS_API) {
      setState({
        data: null,
        loading: false,
        error: "VITE_LESSONS_API_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/verbs`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error("not_generated");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Verb[]>;
      })
      .then((data) => {
        if (!cancelled) {
          verbsCache.set(level, data);
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
  }, [level]);

  return state;
}

export function useLessonSummary(
  level: string,
  lessonId: string,
): LessonState<string> {
  const key = `${level}:${lessonId}`;
  const [state, setState] = useState<LessonState<string>>({
    data: lessonSummaryCache.get(key) ?? null,
    loading: !lessonSummaryCache.has(key),
    error: null,
  });

  useEffect(() => {
    if (lessonSummaryCache.has(key)) {
      setState({
        data: lessonSummaryCache.get(key)!,
        loading: false,
        error: null,
      });
      return;
    }

    if (!LESSONS_API) {
      setState({
        data: null,
        loading: false,
        error: "VITE_LESSONS_API_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/${lessonId}/summary`;

    fetch(url)
      .then((res) => {
        if (res.status === 404) throw new Error("not_found");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text() as Promise<string>;
      })
      .then((data) => {
        if (!cancelled) {
          lessonSummaryCache.set(key, data);
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
