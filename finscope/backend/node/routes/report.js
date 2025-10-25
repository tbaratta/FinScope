import { Router } from 'express'
import PDFDocument from 'pdfkit'
import axios from 'axios'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const title = req.body?.title || 'FinScope Daily Report'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="finscope-report.pdf"')

    // Run agent pipeline (Node route) to gather data
    const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : []
    let agentResponse
    try {
      const { data } = await axios.post('http://localhost:4000/api/agents/report', symbols.length ? { symbols } : {})
      agentResponse = data
    } catch (e) {
      agentResponse = { error: 'Agent pipeline failed', detail: e?.message }
    }
    const agentReport = agentResponse?.report || null

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    doc.pipe(res)

    // Title and timestamp
    doc.fontSize(20).text(title, { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).fillColor('#555').text(`Generated: ${new Date().toLocaleString()}`)

    // Summary / Explanation
    if (agentReport?.explanation) {
      doc.moveDown()
      doc.fillColor('#000').fontSize(14).text('Summary')
      doc.fontSize(12).fillColor('#333').text(agentReport.explanation, { align: 'left' })
    }

    // Key indicators
    const macro = agentReport?.macro || {}
    const overview = agentReport?.asset_overview || {}
    const rows = []
    if (macro.ten_year_yield_pct != null) rows.push(['10Y Yield', `${Number(macro.ten_year_yield_pct).toFixed(2)}%`])
    if (macro.cpi_yoy_pct != null) rows.push(['CPI YoY', `${Number(macro.cpi_yoy_pct).toFixed(2)}%`])
    if (macro.unemployment_rate_pct != null) rows.push(['Unemployment', `${Number(macro.unemployment_rate_pct).toFixed(2)}%`])
    for (const sym of Object.keys(overview)) {
      const o = overview[sym]
      if (o?.last != null && o?.changePct != null) rows.push([`${sym} (last)`, `${o.last.toFixed(2)} (${o.changePct.toFixed(2)}%)`])
    }
    if (rows.length) {
      doc.moveDown()
      doc.fillColor('#000').fontSize(14).text('Key Indicators')
      doc.moveDown(0.5)
      doc.fontSize(12).fillColor('#222')
      rows.forEach(([k, v]) => doc.text(`${k}: ${v}`))
    }

    // Headlines
    const headlines = Array.isArray(agentReport?.headlines) ? agentReport.headlines.slice(0, 8) : []
    if (headlines.length) {
      doc.moveDown()
      doc.fillColor('#000').fontSize(14).text('Top Headlines')
      doc.fontSize(12).fillColor('#333')
      headlines.forEach(h => {
        const line = `• ${h.title}${h.source ? ` — ${h.source}` : ''}`
        doc.text(line)
      })
    }

    doc.end()
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report', detail: err.message })
  }
})

export default router
