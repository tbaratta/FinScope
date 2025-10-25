import { useEffect, useState } from 'react'
import axios from 'axios'
import DataCards from '../components/DataCards'
import ChartPanel from '../components/ChartPanel'
import AgentChat from '../components/AgentChat'

export default function Dashboard() {
  const [cards, setCards] = useState([])
  const [chart, setChart] = useState({ labels: [], series: [] })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/data/summary`)
        setCards(res.data.cards || [])
        setChart(res.data.chart || { labels: [], series: [] })
      } catch (_) {}
    }
    load()
  }, [])

  const generateReport = async () => {
    const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/report`, { title: 'Daily Summary' }, { responseType: 'blob' })
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
        <ChartPanel title="Portfolio vs Index" labels={chart.labels} series={chart.series} />
        <button onClick={generateReport} className="px-3 py-2 rounded bg-primary">Generate Daily Report (PDF)</button>
      </div>
      <div className="lg:col-span-1">
        <AgentChat />
      </div>
    </div>
  )
}
