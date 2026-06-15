import { MarkdownViewer } from "../components/MarkdownViewer";
import { API_BASE_URL, getApiHeaders } from "../utils/api";
import { useEffect, useState } from "react";

const cache = new Map<string, string>();

export function Summary() {
  const [content, setContent] = useState<string | null>(cache.get("summary") ?? null);
  const [loading, setLoading] = useState(!cache.has("summary"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has("summary")) return;

    let cancelled = false;
    const url = `${API_BASE_URL}/summary`;

    fetch(url, { headers: getApiHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          cache.set("summary", text);
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Laden...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Fehler: {error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <MarkdownViewer content={content ?? ""} />
    </div>
  );
}
