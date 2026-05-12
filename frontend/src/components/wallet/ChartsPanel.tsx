import type { ReactNode } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line,
} from 'recharts'
import type { Alert, SubgraphTransfer } from '../../types'
import Spinner from '../common/Spinner'

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
}

interface TipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string; fill?: string }>
  label?: string
}

function DarkTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      {label && <p className="text-slate-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color ?? p.fill ?? '#e2e8f0' }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

function ChartCard({
  title,
  children,
  isEmpty,
  emptyMsg,
}: {
  title: string
  children: ReactNode
  isEmpty?: boolean
  emptyMsg?: string
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4">
      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">{title}</h4>
      {isEmpty ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-600">
          {emptyMsg ?? 'No data'}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export default function ChartsPanel({
  walletId,
  alerts,
  txns,
  txnsLoading,
}: {
  walletId: string
  alerts: Alert[]
  txns: SubgraphTransfer[]
  txnsLoading: boolean
}) {
  const tick = { fill: '#64748b', fontSize: 11 }

  // Alerts count by rule
  const alertsByRule = Object.entries(
    alerts.reduce<Record<string, number>>((acc, a) => {
      const key = `R${a.ruleId}`
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  )
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => parseInt(a.rule.slice(1)) - parseInt(b.rule.slice(1)))

  // Severity distribution for pie
  const bySeverity = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const)
    .map((s) => ({
      name: s,
      value: alerts.filter((a) => a.severity === s).length,
      color: SEVERITY_COLORS[s],
    }))
    .filter((s) => s.value > 0)

  // Cumulative risk score by rule
  const scoreByRule = Object.entries(
    alerts.reduce<Record<string, number>>((acc, a) => {
      const key = `R${a.ruleId}`
      acc[key] = (acc[key] ?? 0) + a.score
      return acc
    }, {}),
  )
    .map(([rule, score]) => ({ rule, score }))
    .sort((a, b) => b.score - a.score)

  // Transaction volume grouped by calendar day
  const sortedTxns = [...txns].sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp))
  const txnsByDay = sortedTxns.reduce<
    Record<string, { day: string; ts: number; in: number; out: number }>
  >((acc, t) => {
    const ts = parseInt(t.timestamp)
    const day = new Date(ts * 1000).toLocaleDateString('en-PK', {
      month: 'short',
      day: 'numeric',
    })
    if (!acc[day]) acc[day] = { day, ts, in: 0, out: 0 }
    const amt = Number(BigInt(t.amount) / BigInt(1_000_000))
    const isOut = t.from.id.toLowerCase() === walletId.toLowerCase()
    if (isOut) acc[day].out += amt
    else acc[day].in += amt
    return acc
  }, {})
  const txnVolumeData = Object.values(txnsByDay).sort((a, b) => a.ts - b.ts)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Alerts by Rule */}
      <ChartCard title="Alerts by Rule" isEmpty={!alertsByRule.length} emptyMsg="No alerts triggered">
        <ResponsiveContainer width="100%" height={192}>
          <BarChart data={alertsByRule} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
            <XAxis dataKey="rule" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
            <Bar dataKey="count" name="Alerts" radius={[4, 4, 0, 0]} fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Severity Distribution */}
      <ChartCard
        title="Severity Distribution"
        isEmpty={!bySeverity.length}
        emptyMsg="No alerts triggered"
      >
        <ResponsiveContainer width="100%" height={192}>
          <PieChart>
            <Pie
              data={bySeverity}
              cx="50%"
              cy="45%"
              innerRadius={52}
              outerRadius={76}
              dataKey="value"
              paddingAngle={2}
            >
              {bySeverity.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '6px' }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Risk Score by Rule */}
      <ChartCard
        title="Risk Score by Rule"
        isEmpty={!scoreByRule.length}
        emptyMsg="No alerts triggered"
      >
        <ResponsiveContainer width="100%" height={192}>
          <BarChart
            data={scoreByRule}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          >
            <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="rule"
              tick={tick}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(249,115,22,0.06)' }} />
            <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]} fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Transaction Volume Over Time */}
      <ChartCard
        title="Transaction Volume (bPKR)"
        isEmpty={!txnsLoading && txnVolumeData.length === 0}
        emptyMsg="No transactions indexed"
      >
        {txnsLoading ? (
          <div className="h-48 flex items-center justify-center">
            <Spinner className="h-5 w-5 text-slate-600" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <LineChart data={txnVolumeData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
              <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Line
                type="monotone"
                dataKey="in"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="In"
              />
              <Line
                type="monotone"
                dataKey="out"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="Out"
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '6px' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
