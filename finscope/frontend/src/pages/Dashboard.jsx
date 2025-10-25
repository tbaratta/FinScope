import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'
import DataCards from '../components/DataCards'
import ReportView from '../components/ReportView'
import { useSettings } from '../hooks/useSettings.jsx'

export default function Dashboard() {
  const { settings } = useSettings()
  const [cards, setCards] = useState([])
  const [agentReport, setAgentReport] = useState(null)
  const [symbolsText, setSymbolsText] = useState(settings.defaultSymbols || 'SPY, QQQ, DIA')
  const [agentLoading, setAgentLoading] = useState(false)
  const [error, setError] = useState('')

  const computeChart = useCallback(async () => {
    try {
      const res = await api.get('/api/data/summary')
      const summary = res.data || {}
      setCards(summary.cards || [])
    } catch (_) {}
  }, [])

  useEffect(() => { computeChart() }, [computeChart])
  useEffect(() => { setSymbolsText(settings.defaultSymbols || 'SPY, QQQ, DIA') }, [settings.defaultSymbols])

  const generateReport = async () => {
    const symbols = symbolsText
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 10)
    setError('')
    setAgentLoading(true)
    try {
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
      const { data } = await api.post('/api/agents/report', payload)
      setAgentReport(data || null)
    } catch (err) {
      setError(err?.message || 'Failed to generate report')
    } finally {
      setAgentLoading(false)
    }
  }

  const runAgents = async () => {
    try {
      setAgentLoading(true)
      const symbols = symbolsText
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 10) // keep it reasonable
      const payload = symbols.length ? { symbols } : { symbols: ['SPY'] }
      const { data } = await api.post('/api/agents/report', payload)
      setAgentReport(data || null)
    } catch (err) {
      setAgentReport({ error: 'Agent run failed', detail: err?.message })
    }
    finally {
      setAgentLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-3">
        <DataCards cards={cards} />
      </div>
  <div className="lg:col-span-3 space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-300">Symbols</label>
            <input
              value={symbolsText}
              onChange={(e) => setSymbolsText(e.target.value)}
              placeholder="e.g., SPY, QQQ, DIA"
              className="min-w-[260px] flex-1 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={generateReport} className="px-3 py-2 rounded bg-primary disabled:opacity-50" disabled={agentLoading}>{agentLoading ? 'Generating…' : 'Generate Report'}</button>
          </div>
          {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
        </div>
        {agentReport && <ReportView report={agentReport} />}
      </div>
    </div>
  )
}
