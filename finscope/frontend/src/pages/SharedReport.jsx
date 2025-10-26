import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import ReportView from '../components/ReportView'

export default function SharedReport() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const path = window.location.pathname || ''
    const token = path.split('/share/')[1] || ''
    if (!token) { setError('Missing share token'); setLoading(false); return }
    ;(async () => {
      try {
        const { data } = await api.get(`/api/share/${encodeURIComponent(token)}`)
        setReport(data?.report || null)
      } catch (e) {
        setError('This shared report was not found or has expired.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div className="text-slate-300">Loading report…</div>
  if (error) return <div className="rounded border border-red-700 bg-red-900/30 text-red-200 p-4">{error}</div>
  if (!report) return null
  return (
    <div>
      <div className="text-sm text-slate-400 mb-3">Shared view — read only (no sign-in required)</div>
      <ReportView report={report} />
    </div>
  )
}
