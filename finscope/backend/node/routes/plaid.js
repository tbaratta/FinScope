import { Router } from 'express'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import axios from 'axios'

const router = Router()

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID
const PLAID_SECRET = process.env.PLAID_SECRET
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox').toLowerCase()
const PY_URL = process.env.PYTHON_SERVICE_URL || 'http://py-api:8000'

const basePath = PLAID_ENV === 'production' ? PlaidEnvironments.production
  : PLAID_ENV === 'development' ? PlaidEnvironments.development
  : PlaidEnvironments.sandbox

let plaid
if (PLAID_CLIENT_ID && PLAID_SECRET) {
  const config = new Configuration({
    basePath,
    baseOptions: { headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET } },
  })
  plaid = new PlaidApi(config)
}

function ensurePlaid(res) {
  if (!plaid) {
    res.status(400).json({ error: 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.' })
    return false
  }
  return true
}

router.post('/create_link_token', async (req, res) => {
  try {
    if (!ensurePlaid(res)) return
    const userId = String(req.body?.user_id || 'demo-user')
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'FinScope',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      webhook: undefined,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    })
    res.json(resp.data)
  } catch (err) {
    res.status(500).json({ error: 'create_link_token failed', detail: err?.response?.data || err?.message })
  }
})

router.post('/exchange_public_token', async (req, res) => {
  try {
    if (!ensurePlaid(res)) return
    const public_token = req.body?.public_token
    if (!public_token) return res.status(400).json({ error: 'public_token required' })
    const resp = await plaid.itemPublicTokenExchange({ public_token })
    // return access_token to client only if you intend to store client-side (not recommended). Normally store server-side.
    res.json({ access_token: resp.data.access_token, item_id: resp.data.item_id })
  } catch (err) {
    res.status(500).json({ error: 'exchange_public_token failed', detail: err?.response?.data || err?.message })
  }
})

router.get('/transactions', async (req, res) => {
  try {
    if (!ensurePlaid(res)) return
    const access_token = req.headers['x-plaid-access-token'] || req.query.access_token
    if (!access_token) return res.status(400).json({ error: 'access_token required (send in X-Plaid-Access-Token header for demo)' })
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 30)
    const fmt = (d) => d.toISOString().slice(0, 10)
    const resp = await plaid.transactionsGet({ access_token, start_date: fmt(start), end_date: fmt(end) })
    res.json(resp.data)
  } catch (err) {
    res.status(500).json({ error: 'transactions failed', detail: err?.response?.data || err?.message })
  }
})

router.post('/transactions/store', async (req, res) => {
  try {
    // store transactions in Python SQLite for simplicity
    const txns = req.body?.transactions
    if (!Array.isArray(txns)) return res.status(400).json({ error: 'transactions must be array' })
    const resp = await axios.post(`${PY_URL}/bank/transactions`, { transactions: txns }, { timeout: 15000 })
    res.json(resp.data)
  } catch (err) {
    res.status(500).json({ error: 'store transactions failed', detail: err?.message })
  }
})

export default router
