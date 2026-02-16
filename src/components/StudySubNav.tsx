import { NavLink, useParams } from 'react-router-dom'
import type { LessonMeta } from '../types'

interface Props {
  lesson: LessonMeta | undefined;
}

export function StudySubNav({ lesson }: Props) {
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
        to={`/study/nouns/${id}`}
        className={({ isActive }) =>
          `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : lesson && !lesson.hasNouns
              ? 'text-slate-300 cursor-default pointer-events-none'
              : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        Nouns
      </NavLink>
      <NavLink
        to={`/study/verbs/${id}`}
        className={({ isActive }) =>
          `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : lesson && !lesson.hasVerbs
              ? 'text-slate-300 cursor-default pointer-events-none'
              : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        Verbs
      </NavLink>
    </div>
  )
}
