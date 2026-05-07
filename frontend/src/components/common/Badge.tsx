import type { ReactNode } from 'react'

type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'slate' | 'indigo'

const colorMap: Record<Color, string> = {
  red: 'bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20',
  orange: 'bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-400 ring-1 ring-inset ring-yellow-500/20',
  green: 'bg-green-500/10 text-green-400 ring-1 ring-inset ring-green-500/20',
  blue: 'bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-400 ring-1 ring-inset ring-purple-500/20',
  slate: 'bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/20',
}

export function Badge({ color, children }: { color: Color; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[color]}`}
    >
      {children}
    </span>
  )
}

export function severityColor(s: string): Color {
  if (s === 'CRITICAL') return 'red'
  if (s === 'HIGH') return 'orange'
  if (s === 'MEDIUM') return 'yellow'
  return 'green'
}

export function statusColor(s: string): Color {
  if (s === 'OPEN') return 'blue'
  if (s === 'ACKNOWLEDGED') return 'purple'
  if (s === 'STR_FILED') return 'red'
  return 'slate'
}

export function bandColor(b: string): Color {
  if (b === 'CRITICAL') return 'red'
  if (b === 'HIGH') return 'orange'
  if (b === 'MEDIUM') return 'yellow'
  return 'green'
}
