import { NavLink, useParams, useMatch, useNavigate } from "react-router-dom";
import { useLevel } from "../context/LevelContext";

const LEVELS = ["a1", "a2", "b1", "b2"];

export function TopNav() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const id = lessonId ?? "1";

  const isStudy = useMatch("/study/*");
  const { level, setLevel } = useLevel();
  const navigate = useNavigate();

  function handleLevelChange(newLevel: string) {
    setLevel(newLevel);
    navigate("/study/lessons/1");
  }

  return (
    <header className="bg-blue-700 text-white px-6 py-3 flex items-center gap-6 shadow-md">
      <span className="font-bold text-xl tracking-tight mr-4">German</span>
      <nav className="flex gap-2">
        <NavLink
          to={`/study/lessons/${id}`}
          className={() =>
            `px-4 py-1.5 rounded font-medium transition-colors ${
              isStudy
                ? "bg-white text-blue-700"
                : "text-blue-100 hover:bg-blue-600"
            }`
          }
        >
          Study
        </NavLink>
        <NavLink
          to="/exercise"
          className={({ isActive }) =>
            `px-4 py-1.5 rounded font-medium transition-colors ${
              isActive
                ? "bg-white text-blue-700"
                : "text-blue-100 hover:bg-blue-600"
            }`
          }
        >
          Exercise
        </NavLink>
        <NavLink
          to="/upload"
          className={({ isActive }) =>
            `px-4 py-1.5 rounded font-medium transition-colors ${
              isActive
                ? "bg-white text-blue-700"
                : "text-blue-100 hover:bg-blue-600"
            }`
          }
        >
          Upload
        </NavLink>
      </nav>
      <div className="ml-auto flex gap-1">
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => handleLevelChange(l)}
            className={`px-3 py-1 rounded text-sm font-semibold uppercase transition-colors ${
              level === l
                ? "bg-white text-blue-700"
                : "text-blue-100 border border-blue-500 hover:bg-blue-600"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
