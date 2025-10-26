import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../utils/api'

const STORAGE_KEY = 'finscope_settings'
const USER_ID_KEY = 'finscope_user_id'

function getOrCreateUserId() {
  try {
    let id = localStorage.getItem(USER_ID_KEY)
    if (!id) {
      id = `u_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
      localStorage.setItem(USER_ID_KEY, id)
    }
    return id
  } catch {
    return 'demo-user'
  }
}

const defaultSettings = {
  defaultSymbols: 'SPY, QQQ, DIA',
  chartDays: 7,
  currency: 'USD',
  timezone: 'America/New_York',
  beginnerMode: false,
  favorites: [],
}

const SettingsContext = createContext({
  settings: defaultSettings,
  setSettings: () => {},
  updateSettings: () => {},
})

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)
  const [userId] = useState(getOrCreateUserId())

  useEffect(() => {
    // Load from localStorage first for instant UX
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setSettings({ ...defaultSettings, ...parsed })
      }
    } catch (_) {}
    // Attempt to load from server to sync across devices
    ;(async () => {
      try {
        const { data } = await api.get('/api/settings', { headers: { 'X-User-Id': userId } })
        if (data?.settings && typeof data.settings === 'object') {
          const next = { ...defaultSettings, ...data.settings }
          setSettings(next)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
        }
      } catch (_) {
        // ignore server failures; stay with local
      }
    })()
  }, [userId])

  const updateSettings = (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
      // Fire-and-forget server sync
      try { api.put('/api/settings', next, { headers: { 'X-User-Id': userId } }).catch(() => {}) } catch (_) {}
      return next
    })
  }

  const value = useMemo(() => ({ settings, setSettings, updateSettings, userId }), [settings, userId])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
