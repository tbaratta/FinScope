import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../utils/api'

export default function PlaidConnect() {
  const [linkToken, setLinkToken] = useState(null)
  const [userId, setUserId] = useState('demo-user')
  const [txns, setTxns] = useState([])
  const [error, setError] = useState('')

  const createLinkToken = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.post('/api/plaid/create_link_token', { user_id: userId })
      if (data?.user_id) setUserId(data.user_id)
      setLinkToken(data?.link_token)
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to create link token')
    }
  }, [])

  useEffect(() => { createLinkToken() }, [createLinkToken])

  const onSuccess = useCallback(async (public_token, metadata) => {
    try {
      await api.post('/api/plaid/exchange_public_token', { public_token, user_id: userId })
    } catch (e) {
      setError('Token exchange failed')
    }
  }, [userId])

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess })

  const fetchTxns = async () => {
    setError('')
    try {
      const { data } = await api.get('/api/plaid/transactions', { headers: { 'X-User-Id': userId } })
      const items = data?.transactions || []
      setTxns(items)
      // Auto-store fetched transactions to backend so reports reflect latest spend
      try {
        await api.post('/api/plaid/transactions/store', { transactions: items }, { headers: { 'X-User-Id': userId } })
      } catch (_) {}
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to fetch transactions')
    }
  }

  const storeTxns = async () => {
    try {
      await api.post('/api/plaid/transactions/store', { transactions: txns })
    } catch (_) {}
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="font-semibold mb-2">Bank (Plaid Sandbox)</div>
      {error && <div className="text-red-400 text-sm mb-2">{String(error)}</div>}
      <div className="flex gap-2 mb-2">
  <button onClick={() => open()} disabled={!ready} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50">Connect Bank</button>
  <button onClick={fetchTxns} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50">Fetch Transactions</button>
  <button onClick={storeTxns} disabled={!txns.length} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50">Store</button>
      </div>
      {txns.length > 0 && (
        <div className="max-h-64 overflow-auto text-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.slice(0, 50).map((t) => (
                <tr key={t.transaction_id} className="border-t border-slate-800">
                  <td className="py-1 pr-2">{t.date}</td>
                  <td className="py-1 pr-2">{t.name}</td>
                  <td className="py-1 pr-2">{t.amount?.toFixed ? t.amount.toFixed(2) : t.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
