import { useState } from "react";
import { NavLink, useParams, useMatch, useNavigate } from "react-router-dom";
import { useLevel } from "../context/LevelContext";
import { getDueCount } from "../hooks/useSpacedRepetition";

const LEVELS = ["a1", "a2", "b1", "b2"];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded font-medium text-sm whitespace-nowrap transition-colors ${
    isActive ? "bg-white text-blue-700" : "text-blue-100 hover:bg-blue-600"
  }`;

export function TopNav() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const id = lessonId ?? "1";

  const isLessons = useMatch("/study/lessons/*");
  const { level, setLevel } = useLevel();
  const navigate = useNavigate();

  const [dueCount] = useState(() => getDueCount());

  function handleLevelChange(newLevel: string) {
    setLevel(newLevel);
    navigate("/study/lessons/1");
  }

  return (
    <header className="bg-blue-700 text-white shadow-md">
      {/* Row 1: brand + level selector */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="font-bold text-lg tracking-tight">German</span>
        {isLessons && (
          <div className="flex gap-1">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => handleLevelChange(l)}
                className={`px-2.5 py-1 rounded text-xs font-semibold uppercase transition-colors ${
                  level === l
                    ? "bg-white text-blue-700"
                    : "text-blue-100 border border-blue-500 hover:bg-blue-600"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 2: nav links, scrollable on small screens */}
      <div className="overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 px-4 pb-2 min-w-max">
          <NavLink
            to={`/study/lessons/${id}`}
            className={() => navLinkClass({ isActive: !!isLessons })}
          >
            Lessons
          </NavLink>
          <NavLink to="/study/nouns" className={navLinkClass}>
            Nouns
          </NavLink>
          <NavLink to="/study/verbs" className={navLinkClass}>
            Verbs
          </NavLink>
          <NavLink to="/exercise" className={navLinkClass}>
            Exercise
          </NavLink>
          <NavLink
            to="/review"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded font-medium text-sm whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive ? "bg-white text-blue-700" : "text-blue-100 hover:bg-blue-600"
              }`
            }
          >
            Review
            {dueCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.1rem] h-[1.1rem] flex items-center justify-center px-1 leading-none">
                {dueCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/upload" className={navLinkClass}>
            Upload
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
