import { NavLink, useParams, useMatch } from 'react-router-dom'

export function TopNav() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const id = lessonId ?? '1'

  const isExercise = useMatch('/exercise/*')

  return (
    <header className="bg-blue-700 text-white px-6 py-3 flex items-center gap-6 shadow-md">
      <span className="font-bold text-xl tracking-tight mr-4">German A1</span>
      <nav className="flex gap-2">
        <NavLink
          to={`/study/lessons/${id}`}
          className={({ isActive }) =>
            `px-4 py-1.5 rounded font-medium transition-colors ${
              !isExercise && isActive
                ? 'bg-white text-blue-700'
                : 'text-blue-100 hover:bg-blue-600'
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
                ? 'bg-white text-blue-700'
                : 'text-blue-100 hover:bg-blue-600'
            }`
          }
        >
          Exercise
        </NavLink>
      </nav>
    </header>
  )
}
