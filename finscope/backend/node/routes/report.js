import { Router } from 'express'
import PDFDocument from 'pdfkit'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const title = req.body?.title || 'FinScope Daily Report'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="finscope-report.pdf"')

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    doc.pipe(res)

    doc.fontSize(20).text(title, { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).fillColor('#555').text(`Generated: ${new Date().toLocaleString()}`)

    doc.moveDown()
    doc.fillColor('#000').fontSize(14).text('Summary:')
    doc.fontSize(12).fillColor('#333').text('- Markets mixed; CPI cooling slightly.\n- Portfolio moderately weighted to Tech; consider Energy tilt.\n- Forecast suggests mild upward drift next 2 weeks.')

    doc.end()
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report', detail: err.message })
  }
})

export default router
