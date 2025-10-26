import { Router } from 'express'
import PDFDocument from 'pdfkit'
import axios from 'axios'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const title = req.body?.title || 'FinScope Daily Report'

    // Run agent pipeline (Node route) to gather data
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : []
    let agentResponse
    try {
      // Hardcode to public API base to avoid localhost in production
      const { data } = await axios.post('https://app.finscope.us/api/agents/report', symbols.length ? { symbols } : {})
      agentResponse = data
    } catch (e) {
      agentResponse = { error: 'Agent pipeline failed', detail: e?.message }
    }
    const agentReport = agentResponse?.report || null

    const buildPDFBufferFancy = () => new Promise((resolve, reject) => {
      const THEME = {
        brand: '#0ea5e9',
        accent: '#10b981',
        danger: '#ef4444',
        warn: '#f59e0b',
        text: '#111827',
        muted: '#6b7280',
        subtle: '#374151',
        border: '#e5e7eb',
        surface: '#f9fafb',
        zebra: '#f3f4f6'
      }
      const hexToRgb = (hex) => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
        if (!m) return [0, 0, 0]
        return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
      }
      const toRGB = (c) => Array.isArray(c) ? c : hexToRgb(String(c || '#000000'))
      const COL = {
        brand: toRGB(THEME.brand),
        accent: toRGB(THEME.accent),
        danger: toRGB(THEME.danger),
        warn: toRGB(THEME.warn),
        text: toRGB(THEME.text),
        muted: toRGB(THEME.muted),
        subtle: toRGB(THEME.subtle),
        border: toRGB(THEME.border),
        surface: toRGB(THEME.surface),
        zebra: toRGB(THEME.zebra),
        white: [1, 1, 1]
      }
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('error', (err) => reject(err))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      try {
        // Prime first page
        doc.font('Helvetica').fontSize(1).text(' ', 0, 0)
        // helpers
        const drawHeader = () => {
          const w = doc.page.width - doc.page.margins.left - doc.page.margins.right
          doc.save()
          doc.fillColor(COL.brand).rect(doc.page.margins.left, 30, w, 24).fill()
          doc.fillColor(COL.white).font('Helvetica-Bold').fontSize(14).text('FinScope', doc.page.margins.left + 10, 35)
          doc.restore()
        }
        const drawFooter = () => {
          const bottom = doc.page.height - doc.page.margins.bottom + 10
          doc.strokeColor(COL.border).moveTo(doc.page.margins.left, bottom - 18).lineTo(doc.page.width - doc.page.margins.right, bottom - 18).stroke()
          doc.fillColor(COL.muted).fontSize(9)
          doc.text(`Generated ${new Date().toLocaleString()}`, doc.page.margins.left, bottom - 14, { width: 300, align: 'left' })
          doc.text(`Page ${doc.page.number}`, doc.page.margins.left, bottom - 14, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right' })
        }
        const sectionTitle = (t) => {
          doc.moveDown(1)
          const startX = doc.page.margins.left
          doc.save()
          // small accent bar
          doc.fillColor(COL.brand).rect(startX, doc.y + 2, 4, 16).fill()
          doc.restore()
          doc.fillColor(COL.text).font('Helvetica-Bold').fontSize(14).text(t, startX + 10)
          doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).strokeColor(COL.border).stroke()
          doc.moveDown(0.5).font('Helvetica').fillColor(COL.text)
        }
        const drawChip = (text, color, opt = {}) => {
          const padX = 8, padY = 4
          const y0 = doc.y
          const w = doc.widthOfString(text) + padX * 2
          const h = doc.currentLineHeight() + padY
          const x = opt.x ?? doc.x
          const y = opt.y ?? y0
          doc.save()
          doc.fillColor(toRGB(color))
          doc.rect(x, y, w, h).fill()
          doc.fillColor(COL.white).font('Helvetica-Bold').text(text, x + padX, y + padY / 2)
          doc.restore()
          return { w, h }
        }
        // utilities for richer layout/content
        const safeNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : null
        const bulletList = (items, opts = {}) => {
          const dot = opts.dot || '•'
          const col = opts.color || COL.text
          doc.fillColor(col).font('Helvetica').fontSize(opts.fontSize || 12)
          items.forEach(line => {
            doc.text(`${dot} ${String(line)}`)
          })
        }
        const extractSection = (txt, header) => {
          if (typeof txt !== 'string') return null
          const re = new RegExp(`\\n?\\s*${header}\\s*:?[\\r\\n]+([\\s\\S]*?)(\\n\\s*\\n|$)`, 'i')
          const m = re.exec(txt)
          return m ? m[1].trim() : null
        }
        const toKeyTakeaways = (txt) => {
          if (!txt || typeof txt !== 'string') return []
          const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
          const bullets = lines.filter(l => /^[\-\*•\d]+[\).\-\s]/.test(l)).map(l => l.replace(/^([\-\*•\d]+[\).\-\s]+)/, ''))
          if (bullets.length) return bullets.slice(0, 5)
          const sentences = txt.split(/(?<=[\.!?])\s+/).slice(0, 3)
          return sentences
        }
        const riskFromVix = (vix) => {
          const v = safeNumber(vix)
          if (v == null) return { label: 'Unknown', color: COL.muted }
          if (v < 15) return { label: 'Calm', color: COL.accent }
          if (v < 20) return { label: 'Normal', color: COL.text }
          if (v < 30) return { label: 'Cautious', color: COL.warn }
          return { label: 'Volatile', color: COL.danger }
        }
        const twoColList = (lines, options = {}) => {
          if (!Array.isArray(lines) || !lines.length) return
          const gutter = options.gutter || 20
          const colW = Math.floor((doc.page.width - doc.page.margins.left - doc.page.margins.right - gutter) / 2)
          const startY = doc.y
          const left = lines.slice(0, Math.ceil(lines.length / 2))
          const right = lines.slice(Math.ceil(lines.length / 2))
          doc.save(); doc.fillColor(COL.text).font('Helvetica').fontSize(12)
          let x = doc.page.margins.left
          left.forEach(t => { doc.text(`• ${t}`, x, doc.y, { width: colW }) })
          const leftBottom = doc.y
          doc.y = startY
          x = doc.page.margins.left + colW + gutter
          right.forEach(t => { doc.text(`• ${t}`, x, doc.y, { width: colW }) })
          const rightBottom = doc.y
          doc.restore()
          doc.y = Math.max(leftBottom, rightBottom)
        }
        const metricCard = (x, y, w, h, label, value, accentColor) => {
          doc.save()
          // background
          doc.lineWidth(0.6).strokeColor(COL.border).fillColor(COL.white)
          doc.rect(x, y, w, h).fillAndStroke()
          // left accent
          doc.fillColor(toRGB(accentColor || COL.brand)).rect(x, y, 4, h).fill()
          // text
          doc.fillColor(COL.muted).font('Helvetica').fontSize(9).text(label, x + 12, y + 8, { width: w - 20 })
          doc.fillColor(toRGB(accentColor || COL.text)).font('Helvetica-Bold').fontSize(16).text(value, x + 12, y + 22, { width: w - 24 })
          doc.restore()
        }
        const kvTable = (rows) => {
          doc.font('Helvetica').fontSize(11).fillColor(COL.text)
          const startX = doc.page.margins.left
          const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
          const col1 = Math.floor(tableWidth * 0.45)
          const col2 = tableWidth - col1
          rows.forEach(([k, v], idx) => {
            const y0 = doc.y
            if (idx % 2 === 0) { doc.save().fillColor(COL.zebra).rect(startX - 4, y0 - 2, tableWidth + 8, 16).fill().restore() }
            doc.fillColor(COL.subtle).text(String(k), startX, y0, { width: col1 })
            doc.fillColor(COL.text).text(String(v), startX + col1 + 8, y0, { width: col2 })
            doc.moveDown(0.3)
          })
        }
        const assetTable = (header, rows) => {
          doc.font('Helvetica-Bold').fontSize(11).fillColor(COL.text).text(header)
          doc.moveDown(0.4)
          const cols = [60, 90, 80, 120, 120, 170]
          const labels = ['Symbol', 'Last', 'Change %', 'Vol20 %', 'Trend', '6m Dist (↓High | ↑Low)']
          let x = doc.page.margins.left
          labels.forEach((l, i) => { doc.fillColor(COL.subtle).text(l, x, doc.y, { width: cols[i] }); x += cols[i] + 8 })
          doc.moveDown(0.2)
          doc.strokeColor(COL.border).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
          doc.moveDown(0.2)
          rows.forEach((r, idx) => {
            let x2 = doc.page.margins.left
            const rowY = doc.y
            if (idx % 2 === 0) { doc.save().fillColor(COL.zebra).rect(x2 - 4, rowY - 2, cols.reduce((a, b) => a + b, 0) + 8 + (8 * (cols.length - 1)), 16).fill().restore() }
            const values = [
              r.sym,
              r.last != null && Number.isFinite(Number(r.last)) ? Number(r.last).toFixed(2) : '—',
              r.chgPct != null && Number.isFinite(Number(r.chgPct)) ? `${Number(r.chgPct).toFixed(2)}%` : '—',
              r.vol20 != null && Number.isFinite(Number(r.vol20)) ? `${Number(r.vol20).toFixed(2)}%` : '—',
              r.trend || '—',
              (r.hiDist != null && r.loDist != null && Number.isFinite(Number(r.hiDist)) && Number.isFinite(Number(r.loDist))) ? `${Number(r.hiDist).toFixed(2)}% | ${Number(r.loDist).toFixed(2)}%` : '—',
            ]
            values.forEach((v, i) => {
              if (i === 2 && typeof v === 'string' && v.endsWith('%')) {
                const n = parseFloat(v)
                const col = isFinite(n) ? (n >= 0 ? COL.accent : COL.danger) : COL.text
                doc.fillColor(col)
              } else if (i === 4 && typeof v === 'string') {
                const low = v.toLowerCase()
                const col = low === 'bullish' ? COL.accent : (low === 'bearish' ? COL.danger : COL.text)
                doc.fillColor(col)
              } else {
                doc.fillColor(COL.text)
              }
              doc.font('Helvetica').text(String(v), x2, doc.y, { width: cols[i] })
              x2 += cols[i] + 8
            })
            doc.moveDown(0.2)
          })
        }

        // draw page chrome
        drawHeader(); drawFooter();
        doc.on('pageAdded', () => { drawHeader(); drawFooter() })

        // content
        doc.moveDown(2)
  doc.fillColor(COL.text).font('Helvetica-Bold').fontSize(22).text(title)
        doc.moveDown(0.1)
  doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(new Date().toLocaleString())
        // brand underline
  doc.moveTo(doc.page.margins.left, doc.y + 6).lineTo(doc.page.width - doc.page.margins.right, doc.y + 6).strokeColor(COL.brand).lineWidth(2).stroke()
        doc.lineWidth(1)
        if (Array.isArray(agentReport?.input_symbols) && agentReport.input_symbols.length) {
          doc.moveDown(0.4)
          doc.font('Helvetica').fontSize(11)
          const maxChips = Math.min(8, agentReport.input_symbols.length)
          let cx = doc.page.margins.left
          const topY = doc.y
          for (let i = 0; i < maxChips; i++) {
            const sym = String(agentReport.input_symbols[i])
            const chip = drawChip(sym, THEME.brand, { x: cx, y: topY })
            cx += chip.w + 6
          }
          doc.moveDown(2)
        }
  if (agentReport?.explanation) {
    sectionTitle('Summary')
    const takeaways = toKeyTakeaways(agentReport.explanation)
    if (takeaways.length) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COL.text).text('Key Takeaways')
      doc.moveDown(0.2)
      bulletList(takeaways)
    }
    const recs = extractSection(agentReport.explanation, 'Educational Recommendations')
    if (recs) {
      doc.moveDown(0.6)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COL.text).text('Recommendations')
      doc.moveDown(0.2)
      bulletList(recs.split(/\r?\n/).filter(Boolean))
    }
  }
        // Analysis section (from Python /analyze)
        const analysis = agentReport?.analysis || null
        if (analysis && !analysis.error) {
          sectionTitle('Analysis')
          const rows = []
          if (Number.isFinite(Number(analysis.z_score_last))) {
            rows.push(['Z-Score (last)', Number(analysis.z_score_last).toFixed(2)])
          }
          if (Array.isArray(analysis.anomaly_flags)) {
            const last5 = analysis.anomaly_flags.slice(-5)
            const cnt = last5.reduce((a, b) => a + (b ? 1 : 0), 0)
            rows.push(['Recent Anomalies (last 5)', `${cnt} flagged`])
          }
          if (rows.length) { kvTable(rows) }
          if (Array.isArray(analysis.insights) && analysis.insights.length) {
            doc.moveDown(0.3)
            doc.font('Helvetica-Bold').fontSize(12).fillColor(COL.text).text('Insights')
            doc.moveDown(0.2)
            bulletList(analysis.insights)
          }
        }
        const macro = agentReport?.macro || {}
        const overview = agentReport?.asset_overview || {}
        const technicals = agentReport?.technicals || {}
        // Metric cards first
        const cards = []
        if (Number.isFinite(Number(macro.ten_year_yield_pct))) cards.push(['10Y Yield', `${Number(macro.ten_year_yield_pct).toFixed(2)}%`, THEME.text])
        if (Number.isFinite(Number(macro.cpi_yoy_pct))) cards.push(['CPI YoY', `${Number(macro.cpi_yoy_pct).toFixed(2)}%`, THEME.warn])
        if (Number.isFinite(Number(macro.unemployment_rate_pct))) cards.push(['Unemployment', `${Number(macro.unemployment_rate_pct).toFixed(2)}%`, THEME.text])
        if (Number.isFinite(Number(macro.vix_last))) cards.push(['VIX', `${Number(macro.vix_last).toFixed(2)}`, THEME.warn])
        if (cards.length) {
          sectionTitle('Key Indicators')
          const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 10) / 2
          const cardH = 48
          let x = doc.page.margins.left
          let y = doc.y
          cards.forEach((c, idx) => {
            metricCard(x, y, colW, cardH, c[0], c[1], c[2])
            if ((idx % 2) === 0) {
              x += colW + 10
            } else {
              x = doc.page.margins.left
              y += cardH + 10
            }
          })
          // risk gauge (full-width) based on VIX
          const risk = riskFromVix(macro.vix_last)
          y += 6
          metricCard(doc.page.margins.left, y, (doc.page.width - doc.page.margins.left - doc.page.margins.right), 42, 'Market Regime', risk.label, risk.color)
          y += 42 + 6
          // move cursor below last row
          doc.y = y
        }
        // Then a quick glance list of asset last values
        const rows = []
        for (const sym of Object.keys(overview)) {
          const o = overview[sym] || {}
          if (o.last != null) rows.push([`${sym} (last)`, `${Number(o.last).toFixed(2)}${Number.isFinite(Number(o.changePct)) ? ` (${Number(o.changePct).toFixed(2)}%)` : ''}`])
        }
        if (rows.length) { doc.moveDown(0.5); kvTable(rows) }
        const techKeys = Object.keys(technicals)
        if (techKeys.length) {
          const tableRows = techKeys.map(sym => {
            const t = technicals[sym] || {}
            return { sym, last: overview?.[sym]?.last ?? null, chgPct: overview?.[sym]?.changePct ?? null, vol20: Number.isFinite(t.vol20_pct) ? t.vol20_pct : null, trend: t.sma_trend || (Number.isFinite(t.sma5) && Number.isFinite(t.sma20) ? (t.sma5 > t.sma20 ? 'bullish' : 'bearish') : null), hiDist: Number.isFinite(t.dist_to_6m_high_pct) ? t.dist_to_6m_high_pct : null, loDist: Number.isFinite(t.dist_to_6m_low_pct) ? t.dist_to_6m_low_pct : null }
          })
          sectionTitle('Technicals Snapshot (6m)'); assetTable('Assets', tableRows)
        }
  // InvestAgent signal
  const invest = agentReport?.invest
  if (invest && !invest.error) {
    sectionTitle('Portfolio Signal')
    const rows = []
    if (invest.signal) rows.push(['Signal', invest.signal])
    if (invest.confidence != null) rows.push(['Confidence', Number(invest.confidence).toFixed(2)])
    if (invest.rationale) rows.push(['Rationale', invest.rationale])
    if (Array.isArray(invest.portfolio)) rows.push(['Positions', invest.portfolio.map(p => `${p.ticker}:${(p.weight*100).toFixed(1)}%`).join(', ')])
    if (rows.length) kvTable(rows)
  }
  // Forecast section
  const forecast = agentReport?.forecast || {}
  const fSymbols = Object.keys(forecast)
  if (fSymbols.length) {
    sectionTitle('Forecast (next 14 days)')
    const lines = []
    for (const sym of fSymbols) {
      const f = forecast[sym]
      const path = Array.isArray(f?.forecast) ? f.forecast.map(Number).filter(v => Number.isFinite(v)) : []
      const last = Number(overview?.[sym]?.last)
      if (path.length && Number.isFinite(last) && last > 0) {
        const end = path[path.length - 1]
        const chg = ((end - last) / last) * 100
        const dir = chg >= 0 ? '+' : ''
        lines.push(`${sym}: ${dir}${chg.toFixed(2)}% vs last (linear trend)`) 
      }
    }
    if (lines.length) bulletList(lines)
  }
  // Personal finance snapshot
  const pf = agentReport?.personal_finance
  if (pf && !pf.error) {
    sectionTitle(`Personal Finance Snapshot (last ${pf.window_days}d)`) 
    const rows = []
    if (Number.isFinite(Number(pf.total_spend))) rows.push(['Total Spend', `$${Number(pf.total_spend).toFixed(2)}`])
    if (rows.length) kvTable(rows)
    const catLines = Array.isArray(pf.top_categories) ? pf.top_categories.map(c => `${c.category}: $${Number(c.total).toFixed(2)} (${c.count})`) : []
    if (catLines.length) {
      doc.moveDown(0.2)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COL.text).text('Top Categories')
      doc.moveDown(0.2)
      twoColList(catLines)
    }
    const merchLines = Array.isArray(pf.top_merchants) ? pf.top_merchants.map(m => `${m.merchant}: $${Number(m.total).toFixed(2)} (${m.count})`) : []
    if (merchLines.length) {
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COL.text).text('Top Merchants')
      doc.moveDown(0.2)
      twoColList(merchLines)
    }
  }
  const headlines = Array.isArray(agentReport?.headlines) ? agentReport.headlines.slice(0, 10) : []
  if (headlines.length) {
    sectionTitle('Top Headlines')
    const lines = headlines.map(h => `${h.title}${h.source ? ` — ${h.source}` : ''}`)
    twoColList(lines)
  }
  doc.moveDown(0.8)
  sectionTitle('Methodology & Sources')
  doc.font('Helvetica').fontSize(10).fillColor(COL.muted).text('Prices and technicals from market data APIs; macro: 10Y Yield (DGS10), CPI (CPIAUCSL), Unemployment (UNRATE); VIX; news headlines from public sources. LLM synthesis for plain-language explanation and educational tips.')
  doc.moveDown(1.2); doc.strokeColor(COL.border).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke(); doc.moveDown(0.4); doc.font('Helvetica').fontSize(9).fillColor(COL.muted).text('Educational use only. This report does not constitute investment advice. Markets involve risk; past performance is not indicative of future results.')
        doc.end()
      } catch (e) { reject(e) }
    })

    const buildPDFBufferSimple = () => new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('error', (err) => reject(err))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      try {
        doc.fontSize(18).text(title)
        doc.moveDown()
        if (agentReport?.explanation) doc.fontSize(12).text(agentReport.explanation)
        const macro = agentReport?.macro || {}
        const overview = agentReport?.asset_overview || {}
        doc.moveDown()
        doc.fontSize(14).text('Key Indicators')
        Object.entries(macro).forEach(([k, v]) => { if (v != null) doc.fontSize(11).text(`${k}: ${v}`) })
        Object.entries(overview).forEach(([sym, o]) => { if (o?.last != null) doc.fontSize(11).text(`${sym}: ${o.last}${o.changePct != null ? ` (${o.changePct}%)` : ''}`) })
        const headlines = Array.isArray(agentReport?.headlines) ? agentReport.headlines.slice(0, 8) : []
        if (headlines.length) { doc.moveDown(); doc.fontSize(14).text('Top Headlines'); headlines.forEach(h => doc.fontSize(11).text(`• ${h.title}${h.source ? ` — ${h.source}` : ''}`)) }
        doc.end()
      } catch (e) { reject(e) }
    })

    let buffer
    try {
      buffer = await buildPDFBufferFancy()
    } catch (e) {
      console.error('Fancy PDF generation failed; falling back. Reason:', e?.stack || e)
      buffer = await buildPDFBufferSimple()
    }

    // Send response with headers after buffer is ready
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="finscope-report.pdf"')
  res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  } catch (err) {
    console.error('PDF report generation failed:', err?.stack || err)
    res.status(500).json({ error: 'Failed to generate report', detail: err.message })
  }
})

export default router
