import { useMemo } from 'react'
import { useSettings } from '../hooks/useSettings.jsx'

export default function FavoriteStar({ symbol, size = 'sm' }) {
  const { settings, updateSettings } = useSettings()
  const sym = String(symbol || '').toUpperCase()
  const isFav = useMemo(() => Array.isArray(settings?.favorites) && settings.favorites.includes(sym), [settings?.favorites, sym])

  const toggle = (e) => {
    try { e?.stopPropagation?.() } catch (_) {}
    const list = Array.isArray(settings?.favorites) ? settings.favorites : []
    const next = isFav ? list.filter(s => s !== sym) : [...list, sym]
    updateSettings({ favorites: next })
  }

  const clsSize = size === 'xs' ? 'text-[10px]' : size === 'md' ? 'text-sm' : 'text-xs'
  const common = `inline-flex items-center justify-center ${clsSize} leading-none`
  if (!sym) return null
  return (
    <button
      type="button"
      onClick={toggle}
      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      className={`${common} ml-1 px-1.5 py-0.5 rounded border border-slate-700 hover:bg-slate-800 text-yellow-400`}
    >
      {isFav ? '★' : '☆'}
    </button>
  )
}
