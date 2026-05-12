import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, User, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { fetchWallet, fetchRiskScore, fetchWalletTransfers } from '../api/client'
import { Badge, severityColor, statusColor, bandColor } from '../components/common/Badge'
import Spinner from '../components/common/Spinner'
import ChartsPanel from '../components/wallet/ChartsPanel'
import { RULE_NAMES, shortAddr, formatAmount, formatTs, formatIso } from '../utils/format'

const KYC_LABELS: Record<string, string> = {
  NONE: 'None',
  BASIC: 'Basic',
  ENHANCED: 'Enhanced',
  CORPORATE: 'Corporate',
}

const BAND_BAR: Record<string, { width: string; bg: string; text: string }> = {
  LOW: { width: 'w-1/4', bg: 'bg-green-500', text: 'Wallet is in good standing.' },
  MEDIUM: { width: 'w-2/4', bg: 'bg-yellow-500', text: 'Moderate compliance risk. Review recommended.' },
  HIGH: { width: 'w-3/4', bg: 'bg-orange-500', text: 'High risk. Compliance review in progress.' },
  CRITICAL: { width: 'w-full', bg: 'bg-red-500', text: 'Critical risk. Account under review.' },
}

export default function UserDashboard() {
  const [input, setInput] = useState('')
  const [walletId, setWalletId] = useState<string | null>(null)
  const [tab, setTab] = useState<'alerts' | 'txns' | 'charts'>('txns')

  const walletQ = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => fetchWallet(walletId!),
    enabled: !!walletId,
    retry: 1,
  })

  const riskQ = useQuery({
    queryKey: ['risk', walletId],
    queryFn: () => fetchRiskScore(walletId!),
    enabled: !!walletId,
    retry: 1,
  })

  const txnsQ = useQuery({
    queryKey: ['txns', walletId],
    queryFn: () => fetchWalletTransfers(walletId!),
    enabled: !!walletId,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed) setWalletId(trimmed.toLowerCase())
  }

  const wallet = walletQ.data
  const risk = riskQ.data
  const band = risk?.band ?? 'LOW'
  const bar = BAND_BAR[band]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* header */}
      <div>
        <h1 className="text-xl font-bold text-white">User Wallet Lookup</h1>
        <p className="text-sm text-slate-500 mt-0.5">Check wallet profile and transaction history</p>
      </div>

      {/* search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter wallet address (0x…)"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
        >
          Look up
        </button>
      </form>

      {/* loading */}
      {walletQ.isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner className="h-4 w-4" />
          <span className="text-sm">Fetching wallet…</span>
        </div>
      )}

      {/* not found */}
      {walletQ.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          Wallet not found. Make sure the address is a registered custodial wallet.
        </div>
      )}

      {/* wallet found */}
      {wallet && (
        <div className="space-y-4">
          {/* profile card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-start gap-4 px-5 py-5 border-b border-slate-800">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <User className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-white">{wallet.fullName}</h2>
                  {wallet.isPEP && <Badge color="orange">PEP</Badge>}
                  {wallet.isBlocked && <Badge color="red">Blocked</Badge>}
                </div>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{wallet.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-800">
              {[
                ['Customer ID', wallet.customerId],
                ['KYC Tier', KYC_LABELS[wallet.kycTier]],
                ['Nationality', wallet.nationality],
                ['Date of Birth', new Date(wallet.dob).toLocaleDateString('en-PK')],
                ['Occupation', wallet.occupation ?? '—'],
                ['Opened', formatIso(wallet.openedAt)],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-900 px-4 py-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-sm text-slate-200 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* compliance status */}
          {risk && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">Compliance Status</h3>
                <Badge color={bandColor(risk.band)}>{risk.band} RISK</Badge>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full ${bar.width} ${bar.bg}`} />
              </div>
              <p className="text-xs text-slate-500">{bar.text}</p>
            </div>
          )}

          {/* tabs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex border-b border-slate-800 px-5">
              {(['txns', 'alerts', 'charts'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t
                      ? 'border-indigo-500 text-indigo-300'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t === 'txns'
                    ? 'Transaction History'
                    : t === 'alerts'
                    ? `Compliance Alerts (${risk?.alerts?.length ?? 0})`
                    : 'Analytics'}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === 'txns' && (
                <TxnsPanel
                  walletId={wallet.id}
                  isLoading={txnsQ.isLoading}
                  txns={txnsQ.data ?? []}
                  isError={txnsQ.isError}
                />
              )}
              {tab === 'alerts' && (
                <AlertsPanel alerts={risk?.alerts ?? []} />
              )}
              {tab === 'charts' && (
                <ChartsPanel
                  walletId={wallet.id}
                  alerts={risk?.alerts ?? []}
                  txns={txnsQ.data ?? []}
                  txnsLoading={txnsQ.isLoading}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* empty state */}
      {!walletId && !walletQ.isLoading && (
        <div className="text-center py-16 text-slate-700">
          <Search className="h-8 w-8 mx-auto mb-3" />
          <p className="text-sm">Enter a wallet address to look up</p>
        </div>
      )}
    </div>
  )
}

function TxnsPanel({
  walletId,
  isLoading,
  txns,
  isError,
}: {
  walletId: string
  isLoading: boolean
  txns: import('../types').SubgraphTransfer[]
  isError: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner className="h-4 w-4" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }
  if (isError) {
    return <p className="text-sm text-slate-500">Subgraph unavailable.</p>
  }
  if (!txns.length) {
    return <p className="text-sm text-slate-500">No transactions indexed yet.</p>
  }

  return (
    <div className="space-y-2">
      {txns.map((t) => {
        const outgoing = t.from.id.toLowerCase() === walletId.toLowerCase()
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800"
          >
            <div
              className={`shrink-0 p-1.5 rounded-full ${outgoing ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}
            >
              {outgoing ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownLeft className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-slate-400">{outgoing ? 'To' : 'From'}</span>
                <span className="font-mono text-slate-300">
                  {shortAddr(outgoing ? t.to.id : t.from.id)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{formatTs(t.timestamp)}</p>
            </div>
            <div className="text-right shrink-0">
              <p
                className={`text-sm font-medium ${outgoing ? 'text-red-400' : 'text-green-400'}`}
              >
                {outgoing ? '−' : '+'}{formatAmount(t.amount)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AlertsPanel({ alerts }: { alerts: import('../types').Alert[] }) {
  if (!alerts.length) {
    return <p className="text-sm text-slate-500">No compliance alerts on this wallet.</p>
  }

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-200">
                Rule {a.ruleId} — {RULE_NAMES[a.ruleId] ?? 'Unknown'}
              </span>
              <Badge color={severityColor(a.severity)}>{a.severity}</Badge>
              <Badge color={statusColor(a.status)}>{a.status.replace('_', ' ')}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-slate-500">
              <span>{formatAmount(a.amount)}</span>
              <span>{formatTs(a.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
