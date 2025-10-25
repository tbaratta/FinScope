import { Router } from 'express'
import axios from 'axios'

const router = Router()
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

router.post('/', async (req, res) => {
  try {
    const r = await axios.post(`${PY_URL}/analyze`, req.body, { timeout: 15_000 })
    res.json(r.data)
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', detail: err.message })
  }
})

router.post('/chat', async (req, res) => {
  // Placeholder: would send to ADK Mission Control agent
  const last = (req.body?.messages || []).slice(-1)[0]?.content || ''
  return res.json({ reply: `FinScope (stub): I received your message: "${last}". Analytics agent integration is wired but stubbed.` })
})

export default router
