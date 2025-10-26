import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Line } from 'react-chartjs-2'
import {
     Chart as ChartJS,
     CategoryScale,
     LinearScale,
     PointElement,
     LineElement,
     Tooltip,
     Legend,
} from 'chart.js'
import { useSettings } from '../hooks/useSettings.jsx'
import { formatCurrency, formatPercent, formatDateTime } from '../utils/format.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

function Card({ title, value, badge }) {
     return (
          <div className="rounded border border-slate-800 bg-slate-900 p-3">
               <div className="text-slate-400 text-xs">{title}</div>
               <div className="text-lg font-semibold">{value}</div>
               {badge && <div className="text-xs text-slate-500">{badge}</div>}
          </div>
     )
}

export default function ReportView({ report }) {
     const rep = report?.report || report
     if (!rep) return null

     const symbols = rep.input_symbols || []
     const series = rep.series || {}
     const macro = rep.macro || {}
     const pf = rep.personal_finance || null
     const analysis = rep.analysis || null
     const invest = rep.invest || null

     const { settings } = useSettings()

     const mainSym = symbols[0]
     const chartData = useMemo(() => {
          if (!mainSym || !series[mainSym]) return null
          const s = series[mainSym]
          const windowDays = Number(settings?.chartDays || 7)
          const L = Math.max(0, (s.labels?.length || 0) - windowDays)
          const labels = Array.isArray(s.labels) ? s.labels.slice(L) : []
          const values = Array.isArray(s.values) ? s.values.slice(L) : []
          return {
               labels,
               datasets: [
                    { label: mainSym, data: values, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.25)', pointRadius: 0, tension: 0.25 }
               ]
          }
     }, [mainSym, series, settings?.chartDays])

     // Build a chart config for each symbol
     const charts = useMemo(() => {
          if (!Array.isArray(symbols) || !symbols.length) return []
          const windowDays = Number(settings?.chartDays || 7)
          return symbols.map(sym => {
               const s = series?.[sym]
               if (!s || !Array.isArray(s.values) || !Array.isArray(s.labels)) return null
               const L = Math.max(0, s.labels.length - windowDays)
               return {
                    sym,
                    data: {
                         labels: s.labels.slice(L),
                         datasets: [
                              { label: sym, data: s.values.slice(L), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.12)', pointRadius: 0, tension: 0.25 }
                         ]
                    }
               }
          }).filter(Boolean)
     }, [symbols, series, settings?.chartDays])

     return (
          <div className="space-y-6">
               <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xl font-semibold">Today's FinScope Report</div>
                    <div className="text-slate-400 text-sm">{formatDateTime(rep.generated_at, settings?.timezone)}</div>
                    {symbols.map(s => (
                         <span key={s} className="px-2 py-1 rounded bg-primary/20 border border-primary/30 text-primary text-xs">{s}</span>
                    ))}
               </div>

               {Array.isArray(symbols) && symbols.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-1">
                         {symbols.map(sym => {
                              const o = rep.asset_overview?.[sym] || {}
                              const trend = rep.technicals?.[sym]?.sma_trend
                              const last = Number(o.last)
                              const chg = Number(o.changePct)
                              const up = Number.isFinite(chg) && chg >= 0
                              return (
                                   <div key={sym} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900 px-3 py-2">
                                        <div className="font-semibold">{sym}</div>
                                        <div className="text-slate-200">{Number.isFinite(last) ? formatCurrency(last, settings?.currency) : '—'}</div>
                                        {Number.isFinite(chg) && (
                                             <div className={`flex items-center gap-1 text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                  <span>{up ? '▲' : '▼'}</span>
                                                  <span>{`${Math.abs(chg).toFixed(2)}%`}</span>
                                             </div>
                                        )}
                                        {trend && (
                                             <span className={`text-xs px-1.5 py-0.5 rounded border ${trend==='bullish' ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : trend==='bearish' ? 'border-rose-500/30 text-rose-300 bg-rose-500/10' : 'border-slate-700 text-slate-300 bg-slate-800'}`}>{trend}</span>
                                        )}
                                   </div>
                              )
                         })}
                    </div>
               )}

               <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Number.isFinite(Number(macro.ten_year_yield_pct)) && <Card title="10Y Yield" value={`${Number(macro.ten_year_yield_pct).toFixed(2)}%`} />}
                    {Number.isFinite(Number(macro.cpi_yoy_pct)) && <Card title="CPI YoY" value={`${Number(macro.cpi_yoy_pct).toFixed(2)}%`} />}
                    {Number.isFinite(Number(macro.unemployment_rate_pct)) && <Card title="Unemployment" value={`${Number(macro.unemployment_rate_pct).toFixed(2)}%`} />}
               </div>

               {charts && charts.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto">
                         {charts.map(c => (
                              <div key={c.sym} className="rounded border border-slate-800 bg-slate-900 p-3 min-w-[240px] w-64">
                                   <div className="font-semibold mb-2">{c.sym} — last {settings?.chartDays || 7} days</div>
                                   <div style={{ height: 140 }}>
                                                  <Line data={c.data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { ticks: { callback: v => formatCurrency(v, settings?.currency) } } } }} />
                                   </div>
                              </div>
                         ))}

                    </div>
               )}

               {rep.explanation && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                                                            <div className="font-semibold mb-3">Summary & Recommendations</div>
                                                            {settings?.beginnerMode && (
                                                                 <div className="text-sm text-slate-200 bg-slate-800/60 rounded p-3 mb-3">
                                                                      In simple words: this is the story of the market today and what it might mean for you. We highlight what went up or down, and any simple actions to consider.
                                                                 </div>
                                                            )}
                         <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                   h1: ({ children }) => <h3 className="text-lg font-semibold text-slate-100 mb-2">{children}</h3>,
                                   h2: ({ children }) => <h4 className="text-base font-semibold text-slate-100 mb-2">{children}</h4>,
                                   h3: ({ children }) => <h5 className="text-sm font-semibold text-slate-200 mb-2">{children}</h5>,
                                   p: ({ children }) => <p className="text-slate-200 text-sm leading-6 mb-2">{children}</p>,
                                   ul: ({ children }) => <ul className="list-disc list-inside text-slate-200 text-sm space-y-1 mb-2">{children}</ul>,
                                   ol: ({ children }) => <ol className="list-decimal list-inside text-slate-200 text-sm space-y-1 mb-2">{children}</ol>,
                                   li: ({ children }) => <li className="marker:text-slate-400">{children}</li>,
                                   strong: ({ children }) => <strong className="text-slate-100 font-semibold">{children}</strong>,
                                   em: ({ children }) => <em className="text-slate-300">{children}</em>,
                                   a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{children}</a>,
                                   hr: () => <hr className="border-slate-800 my-3" />,
                                   code: ({ children }) => <code className="bg-slate-800/80 text-slate-100 px-1 py-0.5 rounded">{children}</code>,
                              }}
                         >
                              {rep.explanation}
                         </ReactMarkdown>
                    </div>
               )}

               {analysis && !analysis.error && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">Analysis</div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {Number.isFinite(Number(analysis.z_score_last)) && <Card title="Z-Score (last)" value={Number(analysis.z_score_last).toFixed(2)} />}
                              {Array.isArray(analysis.anomaly_flags) && <Card title="Recent Anomalies (last 5)" value={analysis.anomaly_flags.slice(-5).filter(Boolean).length} />}
                         </div>
                         {settings?.beginnerMode && (
                           <div className="mt-3 text-sm text-slate-200 bg-slate-800/60 rounded p-3">
                             <div className="font-semibold mb-1">What this means</div>
                             Z-score tells us if today’s price looks unusual compared to recent history. A bigger number means more unusual. An "anomaly" is just a day that looks very different.
                           </div>
                         )}
                         {Array.isArray(analysis.insights) && analysis.insights.length > 0 && (
                              <ul className="list-disc list-inside text-slate-200 text-sm mt-2">
                                   {analysis.insights.map((it, idx) => <li key={idx}>{it}</li>)}
                              </ul>
                         )}
                    </div>
               )}

               {rep.technicals && Object.keys(rep.technicals).length > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">Technicals Snapshot (6m)</div>
                                                             {settings?.beginnerMode && (
                                                                  <div className="text-sm text-slate-200 bg-slate-800/60 rounded p-3 mb-3">
                                                                       These are simple yardsticks traders use to judge trend and bounciness. Green is up, red is down. You don’t need to memorize them—just glance for big changes.
                                                                  </div>
                                                             )}
                         <div className="overflow-auto">
                              <table className="w-full text-left text-sm">
                                   <thead>
                                        <tr className="text-slate-400">
                                             <th className="py-1 pr-3">Symbol</th>
                                             <th className="py-1 pr-3">{settings?.beginnerMode ? 'Price' : 'Last'}</th>
                                             <th className="py-1 pr-3">{settings?.beginnerMode ? 'Change today' : 'Change %'}</th>
                                             <th className="py-1 pr-3">{settings?.beginnerMode ? 'Bounciness (20d)' : 'Vol20 %'}</th>
                                             <th className="py-1 pr-3">Trend</th>
                                             <th className="py-1 pr-3">{settings?.beginnerMode ? 'From 6‑mo high | low' : '6m Dist (↓High | ↑Low)'}</th>
                                        </tr>
                                   </thead>
                                   <tbody>
                                        {Object.keys(rep.technicals).map(sym => {
                                             const t = rep.technicals[sym]
                                             const o = rep.asset_overview?.[sym] || {}
                                             return (
                                                  <tr key={sym} className="border-t border-slate-800">
                                                       <td className="py-1 pr-3">{sym}</td>
                                                       <td className="py-1 pr-3">{o.last != null ? Number(o.last).toFixed(2) : '—'}</td>
                                                       <td className={`py-1 pr-3 ${Number(o.changePct) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number.isFinite(Number(o.changePct)) ? `${Number(o.changePct) >= 0 ? '▲' : '▼'} ${Math.abs(Number(o.changePct)).toFixed(2)}%` : '—'}</td>
                                                       <td className="py-1 pr-3">{Number.isFinite(Number(t.vol20_pct)) ? `${Number(t.vol20_pct).toFixed(2)}%` : '—'}</td>
                                                       <td className={`py-1 pr-3 ${t.sma_trend === 'bullish' ? 'text-emerald-400' : t.sma_trend === 'bearish' ? 'text-rose-400' : ''}`}>{t.sma_trend || '—'}</td>
                                                       <td className="py-1 pr-3">{Number.isFinite(Number(t.dist_to_6m_high_pct)) && Number.isFinite(Number(t.dist_to_6m_low_pct)) ? `${Number(t.dist_to_6m_high_pct).toFixed(2)}% | ${Number(t.dist_to_6m_low_pct).toFixed(2)}%` : '—'}</td>
                                                  </tr>
                                             )
                                        })}
                                   </tbody>
                              </table>
                         </div>
                    </div>
               )}

               {rep.forecast && Object.keys(rep.forecast).length > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">{settings?.beginnerMode ? 'Simple forecast (next ~2 weeks)' : 'Forecast (next 14 days)'}</div>
                                                             {settings?.beginnerMode && (
                                                                  <div className="text-sm text-slate-200 bg-slate-800/60 rounded p-3 mb-2">
                                                                       This is a simple guess about where prices might go next based on recent patterns. It’s not a promise—just a hint.
                                                                  </div>
                                                             )}
                         <ul className="list-disc list-inside text-slate-200 text-sm">
                              {Object.keys(rep.forecast).map(sym => {
                                   const f = rep.forecast[sym]
                                   const path = Array.isArray(f?.forecast) ? f.forecast.map(Number).filter(v => Number.isFinite(v)) : []
                                   const last = Number(rep.asset_overview?.[sym]?.last)
                                   if (!(path.length && Number.isFinite(last) && last > 0)) return null
                                   const end = path[path.length - 1]
                                   const chg = ((end - last) / last) * 100
                                   if (settings?.beginnerMode) {
                                     const word = chg >= 0 ? 'might go up' : 'might go down'
                                     return <li key={sym}>{sym}: looks like it {word} about {Math.abs(chg).toFixed(1)}% if recent patterns continue.</li>
                                   }
                                   const s = `${sym}: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs last (linear trend)`
                                   return <li key={sym}>{s}</li>
                              })}
                         </ul>
                    </div>
               )}

               {invest && !invest.error && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">Portfolio Signal</div>
                         <div className="text-sm text-slate-200"><span className="text-slate-400">Signal:</span> {invest.signal}</div>
                         <div className="text-sm text-slate-200"><span className="text-slate-400">Confidence:</span> {Number(invest.confidence).toFixed(2)}</div>
                         <div className="text-sm text-slate-200"><span className="text-slate-400">Rationale:</span> {invest.rationale}</div>
                                                             {settings?.beginnerMode && (
                                                                  <div className="mt-3 text-sm text-slate-200 bg-slate-800/60 rounded p-3">
                                                                       Think of this as a simple “traffic light.” Green means more positive, red means more negative. Confidence is how sure we are.
                                                                  </div>
                                                             )}
                    </div>
               )}

               {pf && !pf.error && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">Personal Finance Snapshot (last {pf.window_days}d)</div>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                             {Number.isFinite(Number(pf.total_spend)) && <Card title="Total Spend (window)" value={formatCurrency(pf.total_spend, settings?.currency)} />}
                             {Number.isFinite(Number(pf.total_income)) && <Card title="Total Income (window)" value={formatCurrency(pf.total_income, settings?.currency)} />}
                             {Number.isFinite(Number(pf.net_savings)) && <Card title="Net Savings (window)" value={formatCurrency(pf.net_savings, settings?.currency)} />}
                             {Number.isFinite(Number(pf.savings_rate_pct)) && <Card title="Savings Rate (window)" value={formatPercent(pf.savings_rate_pct, 1)} />}
                         </div>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                             {Number.isFinite(Number(pf.mtd_spend)) && <Card title="Month-to-date Spend" value={formatCurrency(pf.mtd_spend, settings?.currency)} />}
                             {Number.isFinite(Number(pf.mtd_income)) && <Card title="Month-to-date Income" value={formatCurrency(pf.mtd_income, settings?.currency)} />}
                             {Number.isFinite(Number(pf.mtd_net_savings)) && <Card title="MTD Net Savings" value={formatCurrency(pf.mtd_net_savings, settings?.currency)} />}
                             {Number.isFinite(Number(pf.mtd_savings_rate_pct)) && <Card title="MTD Savings Rate" value={formatPercent(pf.mtd_savings_rate_pct, 1)} />}
                         </div>
                         {(Number.isFinite(Number(pf.monthly_budget)) || Number.isFinite(Number(pf.budget_remaining))) && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                                   {Number.isFinite(Number(pf.monthly_budget)) && <Card title="Monthly Budget" value={formatCurrency(pf.monthly_budget, settings?.currency)} />}
                                   {Number.isFinite(Number(pf.budget_remaining)) && <Card title="Budget Remaining" value={formatCurrency(pf.budget_remaining, settings?.currency)} />}
                                   {Number.isFinite(Number(pf.budget_utilization_pct)) && <Card title="Budget Utilization" value={formatPercent(pf.budget_utilization_pct, 1)} />}
                              </div>
                         )}
                         {Array.isArray(pf.top_categories) && pf.top_categories.length > 0 && (
                              <div className="mb-3">
                                   <div className="text-slate-300 font-semibold mb-1">Top Categories</div>
                                   <ul className="text-sm text-slate-200 list-disc list-inside">
                                        {pf.top_categories.map((c, i) => <li key={i}>{c.category}: {formatCurrency(Number(c.total), settings?.currency)} ({c.count})</li>)}
                                   </ul>
                              </div>
                         )}
                         {Array.isArray(pf.top_merchants) && pf.top_merchants.length > 0 && (
                              <div>
                                   <div className="text-slate-300 font-semibold mb-1">Top Merchants</div>
                                   <ul className="text-sm text-slate-200 list-disc list-inside">
                                        {pf.top_merchants.map((m, i) => <li key={i}>{m.merchant}: {formatCurrency(Number(m.total), settings?.currency)} ({m.count})</li>)}
                                   </ul>
                              </div>
                         )}
                         {settings?.beginnerMode && (
                           <div className="mt-3 text-sm text-slate-200 bg-slate-800/60 rounded p-3">
                             This shows what you earned and spent. Net savings is income minus spending. A positive number means you kept money; negative means you used savings or credit.
                           </div>
                         )}
                    </div>
               )}

               {Array.isArray(rep.headlines) && rep.headlines.length > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900 p-4">
                         <div className="font-semibold mb-2">Top Headlines</div>
                                                             {settings?.beginnerMode && (
                                                                  <div className="text-sm text-slate-200 bg-slate-800/60 rounded p-3 mb-2">
                                                                       These are big stories that can move markets. Click a headline to read the article.
                                                                  </div>
                                                             )}
                         <ul className="list-disc list-inside text-slate-200 text-sm">
                             {rep.headlines.slice(0, 8).map((h, idx) => (
                                  <li key={idx}>
                                       {h.url ? (
                                            <a href={h.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{h.title}</a>
                                       ) : (
                                            <span>{h.title}</span>
                                       )}
                                       {h.source ? <span className="text-slate-500"> — {h.source}</span> : null}
                                  </li>
                             ))}
                         </ul>
                    </div>
               )}
          </div>
     )
}