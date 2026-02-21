import { useEffect, useState } from "react";

interface MarkdownState {
  content: string | null;
  loading: boolean;
  error: string | null;
}

const cache = new Map<string, string>();

export function useMarkdown(url: string): MarkdownState {
  const [state, setState] = useState<MarkdownState>({
    content: cache.get(url) ?? null,
    loading: !cache.has(url),
    error: null,
  });

  useEffect(() => {
    if (cache.has(url)) {
      setState({ content: cache.get(url)!, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ content: null, loading: true, error: null });

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          cache.set(url, text);
          setState({ content: text, loading: false, error: null });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({ content: null, loading: false, error: err.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
