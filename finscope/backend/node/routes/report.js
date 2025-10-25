import { Router } from 'express'
import PDFDocument from 'pdfkit'
import axios from 'axios'

const router = Router()
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'

router.post('/', async (req, res) => {
  try {
    const title = req.body?.title || 'FinScope Daily Report'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="finscope-report.pdf"')

    // Get agent report with news analysis
    const agentReport = await axios.post(`${PY_URL}/agents/report`, {
      symbols: req.body?.symbols || ['SPY'],
      includeNews: true
    }).then(r => r.data?.report || {})
    .catch(err => ({ error: 'Agent analysis failed', detail: err.message }))

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    doc.pipe(res)

    // Title and timestamp
    doc.fontSize(20).text(title, { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).fillColor('#555').text(`Generated: ${new Date().toLocaleString()}`)

    doc.moveDown()
    doc.fillColor('#000').fontSize(14).text('Market Summary:')
    
    if (agentReport.error) {
      doc.fontSize(12).fillColor('#FF0000').text(agentReport.error)
      if (agentReport.detail) doc.text(agentReport.detail)
    } else {
      // Market Data Section
      doc.fontSize(12).fillColor('#333')
      if (agentReport.market_data_keys?.length) {
        doc.text(`Analyzed symbols: ${agentReport.market_data_keys.join(', ')}`)
      }

      // News Analysis Section
      doc.moveDown()
      doc.fillColor('#000').fontSize(14).text('Latest News & Analysis:')
      doc.fontSize(12).fillColor('#333')
      
      if (agentReport.news_analysis) {
        const { summary, sentiment, key_points } = agentReport.news_analysis
        if (summary) {
          doc.text('Summary:', { underline: true })
          doc.text(summary)
          doc.moveDown(0.5)
        }
        if (key_points?.length) {
          doc.text('Key Points:', { underline: true })
          key_points.forEach(point => doc.text(`• ${point}`))
          doc.moveDown(0.5)
        }
        if (sentiment) {
          doc.text('Market Sentiment:', { underline: true })
          doc.text(sentiment)
        }
      } else {
        doc.text('No news analysis available for the specified symbols.')
      }
    }

    doc.end()
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report', detail: err.message })
  }
})

export default router
