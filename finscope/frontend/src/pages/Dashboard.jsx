import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'
import DataCards from '../components/DataCards'
import AgentChat from '../components/AgentChat'

export default function Dashboard() {
  const [cards, setCards] = useState([])
  const [agentReport, setAgentReport] = useState(null)
  const [symbolsText, setSymbolsText] = useState('SPY, QQQ, DIA')
  const [agentLoading, setAgentLoading] = useState(false)

  const computeChart = useCallback(async () => {
    try {
      const res = await api.get('/api/data/summary')
      const summary = res.data || {}
      setCards(summary.cards || [])
    } catch (_) {}
  }, [])

  useEffect(() => { computeChart() }, [computeChart])

  const generateReport = async () => {
    const symbols = symbolsText
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 10)
    const res = await api.post('/api/report', { title: 'Daily Summary', symbols }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'finscope-report.pdf'
    a.click()
    URL.revokeObjectURL(url)
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
      <div className="lg:col-span-2 space-y-4">
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
            <button onClick={generateReport} className="px-3 py-2 rounded bg-primary">Generate Daily Report (PDF)</button>
            <button onClick={runAgents} disabled={agentLoading} className={`px-3 py-2 rounded ${agentLoading ? 'bg-slate-700 cursor-not-allowed' : 'bg-accent'}`}>
              {agentLoading ? 'Running…' : 'Run Mission Control (Agents)'}
            </button>
          </div>
        </div>
        {agentReport && (
          <div className="rounded border border-slate-800 bg-slate-900 p-4">
            <div className="font-semibold mb-2">Agent Report</div>
            {agentReport.error ? (
              <div className="text-red-400">{agentReport.error}: {agentReport.detail}</div>
            ) : (
              (() => {
                const rep = agentReport.report || agentReport
                const steps = agentReport.steps || []
                const dataStep = steps.find(s => s.type === 'data')
                const partialFails = Array.isArray(dataStep?.failures) && dataStep.failures.length
                return (
                  <div className="text-sm text-slate-300 space-y-3">
                    <div className="space-y-1">
                      <div><span className="text-slate-400">Run ID:</span> {rep.run_id}</div>
                      <div><span className="text-slate-400">Generated:</span> {rep.generated_at}</div>
                      <div><span className="text-slate-400">Symbols:</span> {(rep.input_symbols || []).join(', ')}</div>
                      <div><span className="text-slate-400">Samples:</span> {(rep.market_data_keys || []).join(', ')}</div>
                      {partialFails ? (
                        <div className="text-amber-400">Skipped symbols: {dataStep.failures.map(f => f.symbol).join(', ')}</div>
                      ) : null}
                    </div>
                    {rep.analysis && (
                      <div>
                        <div className="font-semibold mb-1">Analysis</div>
                        <div className="space-y-1">
                          {Number.isFinite(rep.analysis.z_score_last) && (
                            <div><span className="text-slate-400">Z-score (last):</span> {Number(rep.analysis.z_score_last).toFixed(3)}</div>
                          )}
                          {Array.isArray(rep.analysis.insights) && rep.analysis.insights.length > 0 && (
                            <ul className="list-disc list-inside text-slate-200">
                              {rep.analysis.insights.map((it, idx) => (<li key={idx}>{it}</li>))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                    {rep.explanation && (
                      <div>
                        <div className="font-semibold mb-1">LLM Explanation</div>
                        <div className="whitespace-pre-wrap text-slate-200">{rep.explanation}</div>
                      </div>
                    )}
                  </div>
                )
              })()
            )}
          </div>
        )}
      </div>
      <div className="lg:col-span-1 space-y-4">
        <AgentChat />
      </div>
    </div>
  )
}
