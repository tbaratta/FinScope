import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function ChartPanel({ title, labels = [], series = [], color = '#22c55e' }) {
  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: series,
        borderColor: color,
        backgroundColor: color + '33',
        fill: true,
        pointRadius: 0,
        tension: 0.25,
      }
    ]
  }
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { color: '#1f2937' } }, y: { grid: { color: '#1f2937' } } }
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="font-semibold mb-2">{title}</div>
      <Line data={data} options={options} height={80} />
    </div>
  )
}
