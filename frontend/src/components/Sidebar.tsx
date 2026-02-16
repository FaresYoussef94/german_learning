import { NavLink } from 'react-router-dom'
import type { LessonMeta } from '../types'

interface Props {
  lessons: LessonMeta[];
}

export function Sidebar({ lessons }: Props) {
  return (
    <aside className="w-56 shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto">
      <ul className="py-2">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <NavLink
              to={`/study/lessons/${lesson.id}`}
              className={({ isActive }) =>
                `flex items-start gap-2 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                    : 'text-slate-700 hover:bg-slate-100'
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
    </aside>
  )
}
