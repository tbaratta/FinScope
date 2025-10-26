import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings.jsx'
import FavoriteStar from './FavoriteStar.jsx'

// Small colored dot for direction/ready state
function Dot({ color = 'bg-slate-500' }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function FavChip({ sym, onOpen }) {
  // No preloading: neutral dot and simple title
  const color = 'bg-slate-500'
  const title = `${sym}: click to open full report`
  return (
    <button
      onClick={onOpen}
      title={title}
      className={`flex items-center gap-2 px-2.5 py-1 rounded border text-xs whitespace-nowrap bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200`}
    >
      <Dot color={color} />
      <span className="font-semibold tracking-wide">{sym}</span>
      <FavoriteStar symbol={sym} size="xs" />
    </button>
  )
}

export default function FavoriteReports({ onOpenFullReport }) {
  const { settings } = useSettings()
  const favorites = useMemo(() => (
    Array.isArray(settings?.favorites) ? settings.favorites.map(s => String(s).toUpperCase()).filter(Boolean).slice(0, 5) : []
  ), [settings?.favorites])

  // No preloading of favorite reports; clicking a chip will fetch on demand via parent handler

  if (!favorites.length) return null

  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-xs text-slate-400">Favorites:</span>
      <div className="flex gap-2 overflow-x-auto py-1">
        {favorites.map(sym => {
          const open = () => { onOpenFullReport?.(sym) }
          return (
            <FavChip key={sym} sym={sym} onOpen={open} />
          )
        })}
      </div>
    </div>
  )
}
