import { useAllNouns } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { useLevel } from "../context/LevelContext";

export function StudyNouns() {
  const { level } = useLevel();
  const { data: nouns, loading, error } = useAllNouns(level);

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return <div className="p-6 text-red-500">Error loading nouns: {error}</div>;
  if (!nouns || nouns.length === 0)
    return (
      <div className="p-6 text-slate-400 italic">No noun data available.</div>
    );

  const content = `# All German Nouns (${level.toUpperCase()})

| German | Article | Plural | English |
|--------|---------|--------|---------|
${nouns.map((n) => `| ${n.word} | ${n.article} | ${n.plural} | ${n.english} |`).join("\n")}
`;

  return (
    <div className="p-6">
      <MarkdownViewer content={content} />
    </div>
  );
}
