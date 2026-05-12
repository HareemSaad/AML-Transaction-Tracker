import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, ArrowDownLeft, Send, User, ChevronLeft, CheckCircle2, XCircle } from 'lucide-react'
import { fetchWallets, fetchWalletTransfers, transferFunds } from '../api/client'
import { Badge } from '../components/common/Badge'
import Spinner from '../components/common/Spinner'
import { shortAddr, formatAmount, formatTs, formatIso } from '../utils/format'
import type { Wallet } from '../types'

const KYC_COLOR: Record<string, string> = {
  NONE: 'text-slate-500',
  BASIC: 'text-blue-400',
  ENHANCED: 'text-indigo-400',
  CORPORATE: 'text-purple-400',
}

export default function TransferPortal() {
  const [selected, setSelected] = useState<Wallet | null>(null)

  const walletsQ = useQuery({
    queryKey: ['wallets'],
    queryFn: fetchWallets,
  })

  const wallets = walletsQ.data ?? []

  if (selected) {
    return (
      <WalletInterface
        wallet={selected}
        allWallets={wallets}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Transfer Portal</h1>
        <p className="text-sm text-slate-500 mt-0.5">Select a wallet to initiate a transfer</p>
      </div>

      {walletsQ.isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner className="h-4 w-4" />
          <span className="text-sm">Loading wallets…</span>
        </div>
      )}

      {walletsQ.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          Failed to load wallets.
        </div>
      )}

      {!walletsQ.isLoading && wallets.length === 0 && !walletsQ.isError && (
        <div className="text-center py-16 text-slate-700">
          <User className="h-8 w-8 mx-auto mb-3" />
          <p className="text-sm">No wallets found. Create wallets via the demo script first.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {wallets.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelected(w)}
            disabled={w.isBlocked}
            className={`text-left p-4 rounded-xl border transition-all ${
              w.isBlocked
                ? 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed'
                : 'bg-slate-900 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 cursor-pointer'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <User className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {w.isPEP && <Badge color="orange">PEP</Badge>}
                {w.isBlocked && <Badge color="red">Blocked</Badge>}
              </div>
            </div>
            <p className="text-sm font-semibold text-white truncate">{w.fullName}</p>
            <p className="font-mono text-xs text-slate-500 mt-0.5">{shortAddr(w.id)}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-xs font-medium ${KYC_COLOR[w.kycTier]}`}>
                KYC: {w.kycTier}
              </span>
              <span className="text-xs text-slate-600">{formatIso(w.openedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function WalletInterface({
  wallet,
  allWallets,
  onBack,
}: {
  wallet: Wallet
  allWallets: Wallet[]
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const txnsQ = useQuery({
    queryKey: ['txns', wallet.id],
    queryFn: () => fetchWalletTransfers(wallet.id),
  })

  const mutation = useMutation({
    mutationFn: () => {
      const raw = toAddress.trim().toLowerCase()
      const amtBigInt = BigInt(Math.round(parseFloat(amount) * 1_000_000)).toString()
      return transferFunds(wallet.id, raw, amtBigInt)
    },
    onSuccess: () => {
      setToast({ ok: true, msg: 'Transfer submitted successfully.' })
      setToAddress('')
      setAmount('')
      qc.invalidateQueries({ queryKey: ['txns', wallet.id] })
      setTimeout(() => setToast(null), 4000)
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Transfer failed.'
      setToast({ ok: false, msg })
      setTimeout(() => setToast(null), 5000)
    },
  })

  const otherWallets = allWallets.filter(
    (w) => w.id.toLowerCase() !== wallet.id.toLowerCase() && !w.isBlocked,
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toAddress.trim() || !amount) return
    mutation.mutate()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All Wallets
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start gap-4">
        <div className="p-2.5 bg-indigo-500/10 rounded-xl">
          <User className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-white">{wallet.fullName}</h2>
            {wallet.isPEP && <Badge color="orange">PEP</Badge>}
          </div>
          <p className="font-mono text-xs text-slate-500 mt-0.5">{wallet.id}</p>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span>KYC: <span className={KYC_COLOR[wallet.kycTier]}>{wallet.kycTier}</span></span>
            <span>Nationality: {wallet.nationality}</span>
            <span>Opened: {formatIso(wallet.openedAt)}</span>
          </div>
        </div>
      </div>

      {/* transfer form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Send className="h-4 w-4 text-indigo-400" />
          Send bPKR
        </h3>

        {toast && (
          <div
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
              toast.ok
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {toast.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {toast.msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Recipient</label>
            {otherWallets.length > 0 ? (
              <select
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="">— Select wallet or enter address below —</option>
                {otherWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.fullName} ({shortAddr(w.id)})
                  </option>
                ))}
              </select>
            ) : null}
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="0x… recipient address"
              className="w-full mt-2 px-3 py-2.5 text-sm font-mono bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Amount (bPKR)</label>
            <input
              type="number"
              min="0.000001"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isPending || !toAddress.trim() || !amount}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            {mutation.isPending ? (
              <>
                <Spinner className="h-4 w-4" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Transfer
              </>
            )}
          </button>
        </form>
      </div>

      {/* recent transactions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-medium text-slate-300">Recent Transactions</h3>
        </div>
        <div className="p-5">
          {txnsQ.isLoading && (
            <div className="flex items-center gap-2 text-slate-500">
              <Spinner className="h-4 w-4" />
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {txnsQ.isError && (
            <p className="text-sm text-slate-500">Subgraph unavailable.</p>
          )}
          {txnsQ.data && txnsQ.data.length === 0 && (
            <p className="text-sm text-slate-500">No transactions indexed yet.</p>
          )}
          {txnsQ.data && txnsQ.data.length > 0 && (
            <div className="space-y-2">
              {txnsQ.data.map((t) => {
                const outgoing = t.from.id.toLowerCase() === wallet.id.toLowerCase()
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800"
                  >
                    <div
                      className={`shrink-0 p-1.5 rounded-full ${
                        outgoing
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-green-500/10 text-green-400'
                      }`}
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
                        className={`text-sm font-medium ${
                          outgoing ? 'text-red-400' : 'text-green-400'
                        }`}
                      >
                        {outgoing ? '−' : '+'}{formatAmount(t.amount)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
