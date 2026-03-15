import { useEffect, useState } from "react";
import { LessonDetail, LessonMeta, Noun, Verb } from "../types";
import { API_BASE_URL, getApiHeaders } from "../utils/api";

interface LessonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const LESSONS_API = `${API_BASE_URL}/lessons`;

const lessonDetailCache = new Map<string, LessonDetail>();
const lessonIndexCache = new Map<string, LessonMeta[]>();
const lessonSummaryCache = new Map<string, string>();
const nounsCache = new Map<string, Noun[]>();
const verbsCache = new Map<string, Verb[]>();

const ALL_LEVELS = ["a1", "a2", "b1", "b2"];
const allNounsCache = new Map<"all", Noun[]>();
const allVerbsCache = new Map<"all", Verb[]>();

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
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/${lessonId}`;

    fetch(url, { headers: getApiHeaders() })
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
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}`;

    fetch(url, { headers: getApiHeaders() })
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
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/nouns`;

    fetch(url, { headers: getApiHeaders() })
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
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/verbs`;

    fetch(url, { headers: getApiHeaders() })
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
        error: "VITE_API_BASE_URL is not configured.",
      });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const url = `${LESSONS_API}/${level}/${lessonId}/summary`;

    fetch(url, { headers: getApiHeaders() })
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

export function useAllNounsAllLevels(): LessonState<Noun[]> {
  const [state, setState] = useState<LessonState<Noun[]>>({
    data: allNounsCache.get("all") ?? null,
    loading: !allNounsCache.has("all"),
    error: null,
  });

  useEffect(() => {
    if (allNounsCache.has("all")) {
      setState({ data: allNounsCache.get("all")!, loading: false, error: null });
      return;
    }
    if (!LESSONS_API) {
      setState({ data: null, loading: false, error: "VITE_API_BASE_URL is not configured." });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    Promise.all(
      ALL_LEVELS.map((l) =>
        fetch(`${LESSONS_API}/${l}/nouns`, { headers: getApiHeaders() })
          .then((res) => (res.ok ? (res.json() as Promise<Noun[]>) : []))
          .catch(() => [] as Noun[]),
      ),
    ).then((results) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const combined: Noun[] = [];
      for (const nouns of results) {
        for (const noun of nouns) {
          if (!seen.has(noun.word)) {
            seen.add(noun.word);
            combined.push(noun);
          }
        }
      }
      allNounsCache.set("all", combined);
      setState({ data: combined, loading: false, error: null });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function useAllVerbsAllLevels(): LessonState<Verb[]> {
  const [state, setState] = useState<LessonState<Verb[]>>({
    data: allVerbsCache.get("all") ?? null,
    loading: !allVerbsCache.has("all"),
    error: null,
  });

  useEffect(() => {
    if (allVerbsCache.has("all")) {
      setState({ data: allVerbsCache.get("all")!, loading: false, error: null });
      return;
    }
    if (!LESSONS_API) {
      setState({ data: null, loading: false, error: "VITE_API_BASE_URL is not configured." });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    Promise.all(
      ALL_LEVELS.map((l) =>
        fetch(`${LESSONS_API}/${l}/verbs`, { headers: getApiHeaders() })
          .then((res) => (res.ok ? (res.json() as Promise<Verb[]>) : []))
          .catch(() => [] as Verb[]),
      ),
    ).then((results) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const combined: Verb[] = [];
      for (const verbs of results) {
        for (const verb of verbs) {
          if (!seen.has(verb.infinitive)) {
            seen.add(verb.infinitive);
            combined.push(verb);
          }
        }
      }
      allVerbsCache.set("all", combined);
      setState({ data: combined, loading: false, error: null });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}
