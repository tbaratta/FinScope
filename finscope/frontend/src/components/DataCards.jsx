export default function DataCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <div key={i} className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="text-slate-400 text-xs">{c.label}</div>
          <div className="text-2xl font-semibold">{c.value}</div>
          {c.delta && (
            <div className={`text-xs mt-1 ${c.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {c.delta > 0 ? '+' : ''}{c.delta}%
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
