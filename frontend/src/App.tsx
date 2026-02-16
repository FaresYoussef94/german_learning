import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useMatch } from 'react-router-dom'
import type { LessonMeta, LessonIndex } from './types'
import { TopNav } from './components/TopNav'
import { StudySubNav } from './components/StudySubNav'
import { Sidebar } from './components/Sidebar'
import { StudyLessons } from './pages/StudyLessons'
import { StudyNouns } from './pages/StudyNouns'
import { StudyVerbs } from './pages/StudyVerbs'
import { Exercise } from './pages/Exercise'

function StudyLayout({ lessons }: { lessons: LessonMeta[] }) {
  const onLessons = useMatch('/study/lessons/:lessonId')

  return (
    <div className="flex flex-1 min-h-0">
      {onLessons && <Sidebar lessons={lessons} />}
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
  )
}

function AppShell({ lessons }: { lessons: LessonMeta[] }) {
  return (
    <div className="flex flex-col h-screen bg-white">
      <TopNav />
      <Routes>
        <Route path="/" element={<Navigate to="/study/lessons/1" replace />} />
        <Route path="/study/*" element={<StudyLayout lessons={lessons} />} />
        <Route path="/exercise" element={<Exercise />} />
        <Route path="*" element={<Navigate to="/study/lessons/1" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  const [lessons, setLessons] = useState<LessonMeta[]>([])

  useEffect(() => {
    fetch('/data/a1/index.json')
      .then((res) => res.json())
      .then((data: LessonIndex) => setLessons(data.lessons))
      .catch(console.error)
  }, [])

  return (
    <BrowserRouter>
      <AppShell lessons={lessons} />
    </BrowserRouter>
  )
}
