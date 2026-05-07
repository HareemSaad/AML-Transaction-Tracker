import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Copy,
  Check,
  Ban,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
} from 'lucide-react'
import { fetchWallet, fetchRiskScore, fetchWalletTransfers, blockWallet } from '../../api/client'
import { Badge, severityColor, statusColor, bandColor } from '../common/Badge'
import Spinner from '../common/Spinner'
import { RULE_NAMES, shortAddr, formatAmount, formatTs, formatIso } from '../../utils/format'

interface Props {
  walletId: string
  onClose: () => void
}

const KYC_LABELS: Record<string, string> = {
  NONE: 'None',
  BASIC: 'Basic',
  ENHANCED: 'Enhanced',
  CORPORATE: 'Corporate',
}

const BAND_BAR: Record<string, { width: string; color: string }> = {
  LOW: { width: 'w-1/4', color: 'bg-green-500' },
  MEDIUM: { width: 'w-2/4', color: 'bg-yellow-500' },
  HIGH: { width: 'w-3/4', color: 'bg-orange-500' },
  CRITICAL: { width: 'w-full', color: 'bg-red-500' },
}

export default function WalletDrawer({ walletId, onClose }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'alerts' | 'txns'>('alerts')
  const [copied, setCopied] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)

  const walletQ = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => fetchWallet(walletId),
  })

  const riskQ = useQuery({
    queryKey: ['risk', walletId],
    queryFn: () => fetchRiskScore(walletId),
  })

  const txnsQ = useQuery({
    queryKey: ['txns', walletId],
    queryFn: () => fetchWalletTransfers(walletId),
    enabled: tab === 'txns',
  })

  const blockMut = useMutation({
    mutationFn: (blocked: boolean) => blockWallet(walletId, blocked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet', walletId] })
      setConfirmBlock(false)
    },
  })

  const wallet = walletQ.data
  const risk = riskQ.data

  function copyAddr() {
    navigator.clipboard.writeText(walletId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const band = risk?.band ?? 'LOW'
  const bar = BAND_BAR[band]

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* drawer */}
      <div className="fixed right-0 top-0 h-full w-[640px] max-w-full bg-slate-900 border-l border-slate-800 z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-slate-300">{shortAddr(walletId)}</span>
              <button
                onClick={copyAddr}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy address"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              {wallet?.isPEP && (
                <Badge color="orange">PEP</Badge>
              )}
              {wallet?.isBlocked && (
                <Badge color="red">Blocked</Badge>
              )}
            </div>
            {wallet && (
              <p className="mt-1 text-base font-semibold text-white">{wallet.fullName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {walletQ.isLoading || riskQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner />
            </div>
          ) : walletQ.isError ? (
            <div className="px-6 py-8 text-center text-slate-500">Failed to load wallet</div>
          ) : wallet ? (
            <>
              {/* profile grid */}
              <div className="px-6 pt-5 pb-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-800">
                {[
                  ['Customer ID', wallet.customerId],
                  ['KYC Tier', KYC_LABELS[wallet.kycTier]],
                  ['Nationality', wallet.nationality],
                  ['Date of Birth', new Date(wallet.dob).toLocaleDateString('en-PK')],
                  ['Occupation', wallet.occupation ?? '—'],
                  ['Source of Funds', wallet.sourceOfFunds ?? '—'],
                  ['Opened', formatIso(wallet.openedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-sm text-slate-200 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* risk score */}
              {risk && (
                <div className="px-6 py-4 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Risk Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{risk.score}</span>
                      <Badge color={bandColor(risk.band)}>{risk.band}</Badge>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${bar.width} ${bar.color}`} />
                  </div>
                </div>
              )}

              {/* block action */}
              <div className="px-6 py-4 border-b border-slate-800">
                {confirmBlock ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-slate-300 flex-1">
                      {wallet.isBlocked
                        ? 'Unblock this wallet and allow transfers?'
                        : 'Blacklist this wallet? All transfers will be blocked.'}
                    </p>
                    <button
                      onClick={() => blockMut.mutate(!wallet.isBlocked)}
                      disabled={blockMut.isPending}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
                    >
                      {blockMut.isPending ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmBlock(false)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmBlock(true)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      wallet.isBlocked
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    }`}
                  >
                    {wallet.isBlocked ? (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        Unblock Wallet
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" />
                        Blacklist Wallet
                      </>
                    )}
                  </button>
                )}
                {blockMut.isError && (
                  <p className="mt-2 text-xs text-red-400">Action failed. Try again.</p>
                )}
              </div>

              {/* tabs */}
              <div className="flex border-b border-slate-800 px-6">
                {(['alerts', 'txns'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`py-3 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                      tab === t
                        ? 'border-indigo-500 text-indigo-300'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t === 'alerts' ? `Alerts (${risk?.alerts?.length ?? 0})` : 'Transaction History'}
                  </button>
                ))}
              </div>

              {/* tab content */}
              <div className="px-6 py-4">
                {tab === 'alerts' && (
                  <AlertsTab alerts={risk?.alerts ?? []} />
                )}
                {tab === 'txns' && (
                  <TxnsTab walletId={walletId} isLoading={txnsQ.isLoading} txns={txnsQ.data ?? []} isError={txnsQ.isError} />
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

function AlertsTab({ alerts }: { alerts: import('../../types').Alert[] }) {
  if (!alerts.length) {
    return <p className="text-sm text-slate-500 py-4">No alerts on record.</p>
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-400" />
          <div className="min-w-0 flex-1">
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
              <a
                href={`https://etherscan.io/tx/${a.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 hover:text-indigo-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {shortAddr(a.txHash)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
          <span className="text-xs text-slate-600 shrink-0">+{a.score}pt</span>
        </div>
      ))}
    </div>
  )
}

function TxnsTab({
  walletId,
  isLoading,
  txns,
  isError,
}: {
  walletId: string
  isLoading: boolean
  txns: import('../../types').SubgraphTransfer[]
  isError: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-slate-500">
        <Spinner className="h-4 w-4" />
        <span className="text-sm">Loading transactions…</span>
      </div>
    )
  }
  if (isError) {
    return <p className="text-sm text-slate-500 py-4">Subgraph unavailable.</p>
  }
  if (!txns.length) {
    return <p className="text-sm text-slate-500 py-4">No transactions indexed yet.</p>
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
              {outgoing ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-slate-400">{outgoing ? 'To' : 'From'}</span>
                <span className="font-mono text-slate-300">
                  {shortAddr(outgoing ? t.to.id : t.from.id)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span>{formatTs(t.timestamp)}</span>
                {t.isLargeTransaction && <Badge color="red">Large Tx</Badge>}
                {t.isPEPTransaction && <Badge color="orange">PEP</Badge>}
                {t.isNewAccountTransaction && <Badge color="yellow">New Acct</Badge>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-medium ${outgoing ? 'text-red-400' : 'text-green-400'}`}>
                {outgoing ? '−' : '+'}{formatAmount(t.amount)}
              </p>
              <p className="text-xs text-slate-600">Block {t.blockNumber}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
