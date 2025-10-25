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
  const res = await api.post('/api/report', { title: 'Daily Summary' }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'finscope-report.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-3">
        <DataCards cards={cards} />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <ChartPanel title="Portfolio vs Index" labels={chart.labels} datasets={chart.datasets} />
        <button onClick={generateReport} className="px-3 py-2 rounded bg-primary">Generate Daily Report (PDF)</button>
      </div>
      <div className="lg:col-span-1 space-y-4">
        <PortfolioEditor onSaved={() => { setLoadingChart(true); computeChart() }} />
        <AgentChat />
      </div>
    </div>
  )
}
