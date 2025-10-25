// Simple in-memory cache for the latest agent report
// Note: For production multi-instance, back with a shared store (e.g., Redis)

let _lastReport = null
let _lastUpdated = null

export function setLastReport(report) {
  try {
    _lastReport = report
    _lastUpdated = new Date().toISOString()
  } catch {
    // ignore
  }
}

export function getLastReport() {
  return { report: _lastReport, updated_at: _lastUpdated }
}
