interface Props {
  editionsCount: number
  companiesCount: number
  activeSalesCount: number
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-serif text-lg font-bold text-amber-400">{value.toLocaleString()}</span>
      <span className="text-xs uppercase tracking-[0.2em] text-stone-400">{label}</span>
    </div>
  )
}

export function HomeStatsBar({ editionsCount, companiesCount, activeSalesCount }: Props) {
  const stats = [
    { value: editionsCount, label: 'special editions' },
    { value: companiesCount, label: 'book box companies' },
    { value: activeSalesCount, label: 'active sales' },
  ]

  return (
    <div className="border-y border-stone-800 bg-stone-900/40 py-3">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-4 px-4 sm:gap-8">
        {stats.map((stat, index) => (
          <div key={stat.label} className="flex items-center gap-4 sm:gap-8">
            <Stat value={stat.value} label={stat.label} />
            {index < stats.length - 1 && <span className="hidden text-stone-600 sm:inline">•</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
