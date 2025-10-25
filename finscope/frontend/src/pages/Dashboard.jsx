import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'
import { pyApi } from '../utils/pyApi'
import DataCards from '../components/DataCards'
import ChartPanel from '../components/ChartPanel'
import AgentChat from '../components/AgentChat'
import PortfolioEditor from '../components/PortfolioEditor'

export default function Dashboard() {
  const [cards, setCards] = useState([])
  const [chart, setChart] = useState({ labels: [], datasets: [] })
  const [positions, setPositions] = useState([])
  const [loadingChart, setLoadingChart] = useState(true)
  const [agentReport, setAgentReport] = useState(null)

  const computeChart = useCallback(async () => {
    try {
      const res = await api.get('/api/data/summary')
      const summary = res.data || {}
      setCards(summary.cards || [])
      const labels = summary.chart?.labels || []
      const spySeries = summary.chart?.series || []

      // Load saved positions (if any)
      let positionsRes
      try { positionsRes = await api.get('/api/data/portfolio') } catch (_) { positionsRes = null }
      const pos = Array.isArray(positionsRes?.data?.positions) ? positionsRes.data.positions : []
      setPositions(pos)

      // If no positions, only show SPY
      if (!pos.length) {
        setChart({ labels, datasets: [{ label: 'SPY (Index)', data: spySeries, borderColor: '#22c55e', backgroundColor: '#22c55e33', fill: true, pointRadius: 0, tension: 0.25 }] })
        return
      }

      // Fetch each symbol series from Python API (yfinance)
      const mapDateToVal = async (symbol) => {
        const { data } = await pyApi.get('/market', { params: { symbol, period: '1mo', interval: '1d' } })
        const dmap = {}
        if (Array.isArray(data?.labels) && Array.isArray(data?.values)) {
          for (let i = 0; i < data.labels.length; i++) dmap[data.labels[i]] = Number(data.values[i])
        }
        return dmap
      }
      const seriesMaps = await Promise.all(pos.map(p => mapDateToVal(p.symbol)))

      // Build normalized weighted portfolio series aligned to labels
      const portfolioSeries = labels.map(d => {
        let sum = 0
        let any = false
        for (let i = 0; i < pos.length; i++) {
          const weight = Number(pos[i].weight) || 0
          const v = seriesMaps[i][d]
          if (isFinite(v)) { sum += weight * v; any = true }
        }
        return any ? sum : null
      })
      // Normalize both to start at 100 for visual comparability
      const norm = (arr) => {
        const first = arr.find(v => v != null)
        if (!isFinite(first)) return arr
        return arr.map(v => (v == null ? null : (v / first) * 100))
      }
      const spyNorm = norm(spySeries)
      const portNorm = norm(portfolioSeries)
      setChart({
        labels,
        datasets: [
          { label: 'SPY (Index)', data: spyNorm, borderColor: '#22c55e', backgroundColor: '#22c55e33', fill: true, pointRadius: 0, tension: 0.25 },
          { label: 'Portfolio', data: portNorm, borderColor: '#3b82f6', backgroundColor: '#3b82f633', fill: false, pointRadius: 0, tension: 0.2 },
        ]
      })
    } catch (_) {}
    finally { setLoadingChart(false) }
  }, [])

  useEffect(() => { computeChart() }, [computeChart])

  const generateReport = async () => {
    // Use portfolio symbols if available, otherwise default to SPY
    const symbols = positions?.length ? positions.map(p => p.symbol) : ['SPY']
    const res = await api.post('/api/report', { 
      title: 'Daily Summary',
      symbols 
    }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'finscope-report.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const runAgents = async () => {
    try {
      // Prefer symbols from saved positions; fallback to SPY
      const symbols = positions?.length ? positions.map(p => p.symbol) : ['SPY']
      const { data } = await api.post('/api/agents/report', { symbols })
      setAgentReport(data || null)
    } catch (err) {
      setAgentReport({ error: 'Agent run failed', detail: err?.message })
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-3">
        <DataCards cards={cards} />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <ChartPanel title="Portfolio vs Index" labels={chart.labels} datasets={chart.datasets} />
        <div className="flex gap-2">
          <button onClick={generateReport} className="px-3 py-2 rounded bg-primary">Generate Daily Report (PDF)</button>
          <button onClick={runAgents} className="px-3 py-2 rounded bg-accent">Run Mission Control (Agents)</button>
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
        <PortfolioEditor onSaved={() => { setLoadingChart(true); computeChart() }} />
        <AgentChat />
      </div>
    </div>
  )
}
