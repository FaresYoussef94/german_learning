import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useMatch,
  useLocation,
} from "react-router-dom";
import type { LessonMeta } from "./types";
import { TopNav } from "./components/TopNav";
import { Sidebar } from "./components/Sidebar";
import { StudyLessons } from "./pages/StudyLessons";
import { StudyNouns } from "./pages/StudyNouns";
import { StudyVerbs } from "./pages/StudyVerbs";
import { Exercise } from "./pages/Exercise";
import { UploadLesson } from "./pages/UploadLesson";
import { Review } from "./pages/Review";
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
  const location = useLocation();

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        height: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <TopNav />
      <div key={location.pathname} className="flex flex-col flex-1 min-h-0 page-enter">
        <Routes>
          <Route path="/" element={<Navigate to="/study/lessons/1" replace />} />
          <Route path="/study/*" element={<StudyLayout lessons={lessons} />} />
          <Route path="/exercise" element={<Exercise />} />
          <Route path="/review" element={<Review />} />
          <Route path="/upload" element={<UploadLesson />} />
          <Route path="*" element={<Navigate to="/study/lessons/1" replace />} />
        </Routes>
      </div>
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
