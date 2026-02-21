import { NavLink } from "react-router-dom";
import type { LessonMeta } from "../types";

interface Props {
  lessons: LessonMeta[];
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ lessons, collapsed, onToggle }: Props) {
  return (
    <div className="flex">
      <aside
        className={`shrink-0 bg-slate-50 border-r border-slate-200 overflow-hidden transition-all ${
          collapsed ? "w-0" : "w-56"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500">
              Lessons
            </span>
            <button
              onClick={onToggle}
              className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-600"
              title="Collapse sidebar"
            >
              ←
            </button>
          </div>
          <ul className="py-2 overflow-y-auto flex-1">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <NavLink
                  to={`/study/lessons/${lesson.id}`}
                  className={({ isActive }) =>
                    `flex items-start gap-2 px-4 py-2 text-sm transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600"
                        : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  <span className="shrink-0 text-xs font-mono text-slate-400 mt-0.5 w-5 text-right">
                    {lesson.id}
                  </span>
                  <span className="leading-tight">{lesson.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      {collapsed && (
        <button
          onClick={onToggle}
          className="w-10 shrink-0 flex items-start justify-center pt-2 bg-slate-50 border-r border-slate-200 hover:bg-slate-100 transition-colors text-slate-600"
          title="Expand sidebar"
        >
          →
        </button>
      )}
    </div>
  );
}
