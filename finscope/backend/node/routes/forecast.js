import { Router } from 'express'
import axios from 'axios'

const router = Router()
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

router.get('/', async (req, res) => {
  try {
    const r = await axios.get(`${PY_URL}/forecast`, { params: req.query, timeout: 15_000 })
    res.json(r.data)
  } catch (err) {
    res.status(500).json({ error: 'Forecast failed', detail: err.message })
  }
})

export default router
