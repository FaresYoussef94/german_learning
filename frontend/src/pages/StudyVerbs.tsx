import { useAllVerbs } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { useLevel } from "../context/LevelContext";
import type { Verb } from "../types";

const PRONOUNS: Array<{ key: keyof Verb; label: string }> = [
  { key: "ich",     label: "ich" },
  { key: "du",      label: "du" },
  { key: "erSieEs", label: "er/sie/es" },
  { key: "wir",     label: "wir" },
  { key: "ihr",     label: "ihr" },
  { key: "sieSie",  label: "sie/Sie" },
];

export function StudyVerbs() {
  const { level } = useLevel();
  const { data: verbs, loading, error } = useAllVerbs(level);

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return <div className="p-6 text-red-500">Error loading verbs: {error}</div>;
  if (!verbs || verbs.length === 0)
    return (
      <div className="p-6 text-slate-400 italic">No verb data available.</div>
    );

  const hasConjugations = verbs.some((v) => v.ich);

  const header = hasConjugations
    ? `| Infinitive | English | Perfect | Case | ich | du | er/sie/es | wir | ihr | sie/Sie |
|-----------|---------|---------|------|-----|----|-----------|-----|-----|---------|`
    : `| Infinitive | English | Perfect | Case |
|-----------|---------|---------|------|`;

  const rows = verbs
    .map((v) => {
      const base = `| ${v.infinitive} | ${v.english} | ${v.perfectForm ?? "—"} | ${v.case ?? "—"} |`;
      if (!hasConjugations) return base;
      return (
        base +
        PRONOUNS.map(({ key }) => ` ${(v[key] as string) ?? "—"} |`).join("")
      );
    })
    .join("\n");

  const content = `# All German Verbs (${level.toUpperCase()})\n\n${header}\n${rows}\n`;

  return (
    <div className="p-6">
      <MarkdownViewer content={content} />
    </div>
  );
}
