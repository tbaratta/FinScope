export function formatCurrency(value, currency = 'USD') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

export function formatPercent(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function formatDateTime(value, timeZone = 'America/New_York') {
  try {
    const d = value instanceof Date ? value : new Date(value)
    return d.toLocaleString(undefined, { timeZone })
  } catch {
    return String(value)
  }
}
