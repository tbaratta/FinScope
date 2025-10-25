import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'finscope_settings'

const defaultSettings = {
  defaultSymbols: 'SPY, QQQ, DIA',
  chartDays: 7,
  currency: 'USD',
  timezone: 'America/New_York',
}

const SettingsContext = createContext({
  settings: defaultSettings,
  setSettings: () => {},
  updateSettings: () => {},
})

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setSettings({ ...defaultSettings, ...parsed })
      }
    } catch (_) {}
  }, [])

  const updateSettings = (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }

  const value = useMemo(() => ({ settings, setSettings, updateSettings }), [settings])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
