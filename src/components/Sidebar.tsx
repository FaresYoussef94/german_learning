import { NavLink, useMatch } from 'react-router-dom'
import type { LessonMeta } from '../types'

interface Props {
  lessons: LessonMeta[];
}

type Section = 'lessons' | 'nouns' | 'verbs'

function useCurrentSection(): Section {
  const isNouns = useMatch('/study/nouns/:lessonId')
  const isVerbs = useMatch('/study/verbs/:lessonId')
  if (isNouns) return 'nouns'
  if (isVerbs) return 'verbs'
  return 'lessons'
}

export function Sidebar({ lessons }: Props) {
  const section = useCurrentSection()

  return (
    <aside className="w-56 shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto">
      <ul className="py-2">
        {lessons.map((lesson) => {
          const isDisabled =
            (section === 'nouns' && !lesson.hasNouns) ||
            (section === 'verbs' && !lesson.hasVerbs)

          if (isDisabled) {
            return (
              <li key={lesson.id}>
                <span className="flex items-start gap-2 px-4 py-2 text-sm text-slate-300 cursor-default">
                  <span className="shrink-0 text-xs font-mono text-slate-300 mt-0.5 w-5 text-right">
                    {lesson.id}
                  </span>
                  <span className="leading-tight">{lesson.title}</span>
                </span>
              </li>
            )
          }

          return (
            <li key={lesson.id}>
              <NavLink
                to={`/study/${section}/${lesson.id}`}
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
          )
        })}
      </ul>
    </aside>
  )
}
