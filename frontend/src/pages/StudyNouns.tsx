import { useAllNouns } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";

export function StudyNouns() {
  const { data: nouns, loading, error } = useAllNouns("a1");

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return <div className="p-6 text-red-500">Error loading nouns: {error}</div>;
  if (!nouns || nouns.length === 0)
    return (
      <div className="p-6 text-slate-400 italic">No noun data available.</div>
    );

  // Format nouns as markdown table
  const content = `# All German Nouns (A1)

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
