import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CalendarView } from './routes/CalendarView'
import { DayDetailView } from './routes/DayDetailView'
import { SubjectDashboardView } from './routes/SubjectDashboardView'
import { SubjectManagerView } from './routes/SubjectManagerView'
import { TaskDialogRedirectView } from './routes/TaskDialogRedirectView'
import { SettingsView } from './routes/SettingsView'
import { ExamDetailView } from './routes/ExamDetailView'
import { LoginView } from './routes/LoginView'
import { useAuth } from './auth/AuthContext'

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null

  return (
    <Routes>
      <Route path="/login" element={<LoginView />} />

      {user ? (
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="calendar" replace />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/day" element={<Navigate to="/calendar" replace />} />
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
  )
}

export default App
