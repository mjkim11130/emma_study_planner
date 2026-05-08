import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { useAuth } from './auth/AuthContext'

const CalendarView = lazy(() => import('./routes/CalendarView').then((module) => ({ default: module.CalendarView })))
const DayDetailView = lazy(() => import('./routes/DayDetailView').then((module) => ({ default: module.DayDetailView })))
const SubjectDashboardView = lazy(() => import('./routes/SubjectDashboardView').then((module) => ({ default: module.SubjectDashboardView })))
const SubjectManagerView = lazy(() => import('./routes/SubjectManagerView').then((module) => ({ default: module.SubjectManagerView })))
const TaskDialogRedirectView = lazy(() => import('./routes/TaskDialogRedirectView').then((module) => ({ default: module.TaskDialogRedirectView })))
const SettingsView = lazy(() => import('./routes/SettingsView').then((module) => ({ default: module.SettingsView })))
const ExamDetailView = lazy(() => import('./routes/ExamDetailView').then((module) => ({ default: module.ExamDetailView })))
const LoginView = lazy(() => import('./routes/LoginView').then((module) => ({ default: module.LoginView })))
const WeekView = lazy(() => import('./routes/WeekView').then((module) => ({ default: module.WeekView })))

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm">
        불러오는 중…
      </div>
    </div>
  )
}

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginView />} />

        {user ? (
          <Route element={<AppLayout />}>
            <Route path="/" element={<CalendarView />} />
            <Route path="/calendar" element={<Navigate to="/" replace />} />
            <Route path="/week" element={<WeekView />} />
            <Route path="/day" element={<Navigate to="/" replace />} />
            <Route path="/day/:date" element={<DayDetailView />} />
            <Route path="/task/:taskId" element={<TaskDialogRedirectView />} />
            <Route path="/subjects" element={<SubjectManagerView />} />
            <Route path="/dashboard" element={<SubjectDashboardView />} />
            <Route path="/dashboard/:subjectId" element={<SubjectDashboardView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/exams/:examId" element={<ExamDetailView />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </Suspense>
  )
}

export default App
