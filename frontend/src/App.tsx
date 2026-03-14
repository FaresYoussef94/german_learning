import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useMatch,
} from "react-router-dom";
import type { LessonMeta } from "./types";
import { TopNav } from "./components/TopNav";
import { StudySubNav } from "./components/StudySubNav";
import { Sidebar } from "./components/Sidebar";
import { StudyLessons } from "./pages/StudyLessons";
import { StudyNouns } from "./pages/StudyNouns";
import { StudyVerbs } from "./pages/StudyVerbs";
import { Exercise } from "./pages/Exercise";
import { UploadLesson } from "./pages/UploadLesson";
import { useLessonIndex } from "./hooks/useLesson";
import { LevelContext, useLevel } from "./context/LevelContext";

function StudyLayout({ lessons }: { lessons: LessonMeta[] }) {
  const onLessons = useMatch("/study/lessons/:lessonId");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-1 min-h-0">
      {onLessons && (
        <Sidebar
          lessons={lessons}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <StudySubNav />
        <main className="flex-1 overflow-y-auto bg-white">
          <Routes>
            <Route path="lessons/:lessonId" element={<StudyLessons />} />
            <Route path="nouns" element={<StudyNouns />} />
            <Route path="verbs" element={<StudyVerbs />} />
            <Route path="*" element={<Navigate to="lessons/1" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppShell() {
  const { level } = useLevel();
  const { data } = useLessonIndex(level);
  const lessons = data ?? [];

  return (
    <div className="flex flex-col h-screen bg-white">
      <TopNav />
      <Routes>
        <Route path="/" element={<Navigate to="/study/lessons/1" replace />} />
        <Route path="/study/*" element={<StudyLayout lessons={lessons} />} />
        <Route path="/exercise" element={<Exercise />} />
        <Route path="/upload" element={<UploadLesson />} />
        <Route path="*" element={<Navigate to="/study/lessons/1" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const [level, setLevel] = useState("a1");

  return (
    <BrowserRouter>
      <LevelContext.Provider value={{ level, setLevel }}>
        <AppShell />
      </LevelContext.Provider>
    </BrowserRouter>
  );
}
