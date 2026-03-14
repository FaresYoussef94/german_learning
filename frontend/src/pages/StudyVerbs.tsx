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

  // Vocabulary table (always shown)
  const vocabTable = `# All German Verbs (${level.toUpperCase()})

| Infinitive | Present Perfect | Case | English |
|-----------|-----------------|------|---------|
${verbs.map((v) => `| ${v.infinitive} | ${v.perfectForm} | ${v.case} | ${v.english} |`).join("\n")}
`;

  // Conjugation table (shown only when Wiktionary data is available)
  const conjugationTable = hasConjugations
    ? `## Present Tense Conjugations

| Infinitive | ich | du | er/sie/es | wir | ihr | sie/Sie |
|-----------|-----|----|-----------|-----|-----|---------|
${verbs
  .filter((v) => v.ich)
  .map(
    (v) =>
      `| ${v.infinitive} | ${v.ich} | ${v.du} | ${v.erSieEs} | ${v.wir} | ${v.ihr} | ${v.sieSie} |`
  )
  .join("\n")}
`
    : "";

  return (
    <div className="p-6">
      <MarkdownViewer content={vocabTable + conjugationTable} />
    </div>
  );
}
