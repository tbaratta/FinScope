import React from 'react'

export default function Loader({ label = 'Generating report' }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 rounded-md bg-primary/95 text-sm font-medium text-white shadow-sm">
      <span className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" aria-hidden="true"></span>
      <span>{label}</span>
    </div>
  )
}
