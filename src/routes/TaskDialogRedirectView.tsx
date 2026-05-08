import { Navigate, useParams } from 'react-router-dom'

export function TaskDialogRedirectView() {
  const { taskId } = useParams()
  if (!taskId) return <Navigate to="/" replace />
  return <Navigate to={`/calendar?previewTaskId=${encodeURIComponent(taskId)}`} replace />
}
