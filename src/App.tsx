import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CalendarView } from './routes/CalendarView'
import { DayDetailView } from './routes/DayDetailView'
import { SubjectDashboardView } from './routes/SubjectDashboardView'
import { SubjectManagerView } from './routes/SubjectManagerView'
import { TaskDetailView } from './routes/TaskDetailView'
import { SettingsView } from './routes/SettingsView'
import { ExamDetailView } from './routes/ExamDetailView'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="calendar" replace />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/day/:date" element={<DayDetailView />} />
        <Route path="/task/:taskId" element={<TaskDetailView />} />
        <Route path="/subjects" element={<SubjectManagerView />} />
        <Route path="/dashboard" element={<SubjectDashboardView />} />
        <Route path="/dashboard/:subjectId" element={<SubjectDashboardView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="/exams/:examId" element={<ExamDetailView />} />
      </Route>
    </Routes>
  )
}

export default App
