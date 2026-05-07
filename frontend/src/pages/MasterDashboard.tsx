import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, ChevronDown, AlertTriangle, Flag, FileText, ShieldAlert } from 'lucide-react'
import { fetchAlerts, fetchWallets, acknowledgeAlert, fileStr } from '../api/client'
import { Badge, severityColor, statusColor } from '../components/common/Badge'
import Spinner from '../components/common/Spinner'
import WalletDrawer from '../components/wallet/WalletDrawer'
import { RULE_NAMES, shortAddr, formatAmount, formatIso } from '../utils/format'
import type { Alert, Wallet } from '../types'

const STATUS_OPTIONS = ['ALL', 'OPEN', 'ACKNOWLEDGED', 'STR_FILED', 'DISMISSED']
const SEVERITY_OPTIONS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const RULE_OPTIONS = ['ALL', '1', '2', '5', '7', '8', '9', '12']

export default function MasterDashboard() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [ruleFilter, setRuleFilter] = useState('ALL')
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

  const alertsQ = useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetchAlerts(),
    refetchInterval: 10_000,
  })

  const walletsQ = useQuery({
    queryKey: ['wallets'],
    queryFn: fetchWallets,
    staleTime: 60_000,
  })

  const walletMap = useMemo(() => {
    const m = new Map<string, Wallet>()
    walletsQ.data?.forEach((w) => m.set(w.id.toLowerCase(), w))
    return m
  }, [walletsQ.data])

  const alerts = alertsQ.data ?? []

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
      if (ruleFilter !== 'ALL' && String(a.ruleId) !== ruleFilter) return false
      return true
    })
  }, [alerts, statusFilter, severityFilter, ruleFilter])

  const stats = useMemo(() => ({
    total: alerts.length,
    open: alerts.filter((a) => a.status === 'OPEN').length,
    critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
    strFiled: alerts.filter((a) => a.status === 'STR_FILED').length,
  }), [alerts])

  const ackMut = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const strMut = useMutation({
    mutationFn: fileStr,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  return (
    <div className="p-6 space-y-6">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Compliance Hub</h1>
          <p className="text-sm text-slate-500 mt-0.5">Pakistan AML/CFT — flagged wallet activity</p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['alerts'] })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${alertsQ.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Flag} label="Total Flags" value={stats.total} color="indigo" />
        <StatCard icon={AlertTriangle} label="Open" value={stats.open} color="blue" />
        <StatCard icon={ShieldAlert} label="Critical" value={stats.critical} color="red" />
        <StatCard icon={FileText} label="STR Filed" value={stats.strFiled} color="purple" />
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <FilterSelect label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        <FilterSelect label="Severity" value={severityFilter} options={SEVERITY_OPTIONS} onChange={setSeverityFilter} />
        <FilterSelect label="Rule" value={ruleFilter} options={RULE_OPTIONS} onChange={setRuleFilter} />
        {(statusFilter !== 'ALL' || severityFilter !== 'ALL' || ruleFilter !== 'ALL') && (
          <button
            onClick={() => { setStatusFilter('ALL'); setSeverityFilter('ALL'); setRuleFilter('ALL') }}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-600 self-center">
          {filtered.length} of {alerts.length} alerts
        </span>
      </div>

      {/* table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        {alertsQ.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : alertsQ.isError ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            Failed to load alerts — is the backend running?
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No alerts match filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Wallet</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Rule</th>
                <th className="px-4 py-3 text-left font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Severity</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Score</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  wallet={walletMap.get(alert.walletId.toLowerCase())}
                  onWalletClick={() => setSelectedWallet(alert.walletId)}
                  onAck={() => ackMut.mutate(alert.id)}
                  onStr={() => strMut.mutate(alert.id)}
                  isPending={ackMut.isPending || strMut.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedWallet && (
        <WalletDrawer walletId={selectedWallet} onClose={() => setSelectedWallet(null)} />
      )}
    </div>
  )
}

function AlertRow({
  alert,
  wallet,
  onWalletClick,
  onAck,
  onStr,
  isPending,
}: {
  alert: Alert
  wallet: Wallet | undefined
  onWalletClick: () => void
  onAck: () => void
  onStr: () => void
  isPending: boolean
}) {
  return (
    <tr className="bg-slate-950 hover:bg-slate-900/60 transition-colors">
      <td className="px-4 py-3">
        <button
          onClick={onWalletClick}
          className="font-mono text-indigo-400 hover:text-indigo-300 hover:underline transition-colors text-xs"
        >
          {shortAddr(alert.walletId)}
        </button>
      </td>
      <td className="px-4 py-3 text-slate-300 max-w-[120px] truncate">
        {wallet?.fullName ?? <span className="text-slate-600">—</span>}
      </td>
      <td className="px-4 py-3">
        <div>
          <span className="text-slate-300 font-medium">Rule {alert.ruleId}</span>
          <p className="text-xs text-slate-500 mt-0.5">{RULE_NAMES[alert.ruleId] ?? '—'}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
        {formatAmount(alert.amount)}
      </td>
      <td className="px-4 py-3">
        <Badge color={severityColor(alert.severity)}>{alert.severity}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge color={statusColor(alert.status)}>{alert.status.replace('_', ' ')}</Badge>
      </td>
      <td className="px-4 py-3 text-slate-400 text-xs">+{alert.score}pt</td>
      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
        {formatIso(alert.createdAt)}
      </td>
      <td className="px-4 py-3">
        <ActionMenu alert={alert} onAck={onAck} onStr={onStr} isPending={isPending} />
      </td>
    </tr>
  )
}

function ActionMenu({
  alert,
  onAck,
  onStr,
  isPending,
}: {
  alert: Alert
  onAck: () => void
  onStr: () => void
  isPending: boolean
}) {
  const [open, setOpen] = useState(false)

  if (alert.status === 'STR_FILED' || alert.status === 'DISMISSED') {
    return <span className="text-xs text-slate-700">—</span>
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors disabled:opacity-40"
      >
        Actions
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
            {alert.status === 'OPEN' && (
              <button
                onClick={() => { onAck(); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Acknowledge
              </button>
            )}
            {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
              <button
                onClick={() => { onStr(); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                File STR
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: 'indigo' | 'blue' | 'red' | 'purple'
}) {
  const iconColors = {
    indigo: 'text-indigo-400 bg-indigo-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    red: 'text-red-400 bg-red-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${iconColors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-7 py-1.5 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === 'ALL' ? `${label}: All` : o}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
    </div>
  )
}
