import { useAllVerbs } from "../hooks/useLesson";
import { MarkdownViewer } from "../components/MarkdownViewer";

export function StudyVerbs() {
  const { data: verbs, loading, error } = useAllVerbs("a1");

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error)
    return <div className="p-6 text-red-500">Error loading verbs: {error}</div>;
  if (!verbs || verbs.length === 0)
    return (
      <div className="p-6 text-slate-400 italic">No verb data available.</div>
    );

  // Format verbs as markdown table
  const content = `# All German Verbs (A1)

| Infinitive | Present Perfect | Case | English |
|-----------|-----------------|------|---------|
${verbs.map((v) => `| ${v.infinitive} | ${v.perfectForm} | ${v.case} | ${v.english} |`).join("\n")}
`;

  return (
    <div className="p-6">
      <MarkdownViewer content={content} />
    </div>
  );
}
