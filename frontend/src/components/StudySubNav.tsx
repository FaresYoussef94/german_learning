import { NavLink, useParams } from 'react-router-dom'

export function StudySubNav() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const id = lessonId ?? '1'

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-2 flex gap-1">
      <NavLink
        to={`/study/lessons/${id}`}
        className={({ isActive }) =>
          `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        Lessons
      </NavLink>
      <NavLink
        to="/study/nouns"
        className={({ isActive }) =>
          `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        Nouns
      </NavLink>
      <NavLink
        to="/study/verbs"
        className={({ isActive }) =>
          `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        Verbs
      </NavLink>
    </div>
  )
}
