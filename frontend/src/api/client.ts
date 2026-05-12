import axios from 'axios'
import type { Alert, RiskScoreResponse, SubgraphTransfer, Wallet } from '../types'

const api = axios.create({ baseURL: '/api' })

export async function fetchAlerts(status?: string): Promise<Alert[]> {
  const { data } = await api.get<Alert[]>('/alerts', { params: status ? { status } : {} })
  return data
}

export async function fetchWallets(): Promise<Wallet[]> {
  const { data } = await api.get<Wallet[]>('/wallets')
  return data
}

export async function fetchWallet(id: string): Promise<Wallet> {
  const { data } = await api.get<Wallet>(`/wallets/${encodeURIComponent(id)}`)
  return data
}

export async function fetchRiskScore(walletId: string): Promise<RiskScoreResponse> {
  const { data } = await api.get<RiskScoreResponse>(
    `/wallets/${encodeURIComponent(walletId)}/risk-score`,
  )
  return data
}

export async function transferFunds(fromId: string, to: string, amount: string): Promise<void> {
  await api.post(`/wallets/${encodeURIComponent(fromId)}/transfer`, { to, amount })
}

export async function blockWallet(walletId: string, blocked: boolean): Promise<void> {
  await api.post(`/wallets/${encodeURIComponent(walletId)}/block`, null, { params: { blocked } })
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  await api.post(`/alerts/${encodeURIComponent(alertId)}/acknowledge`)
}

export async function fileStr(alertId: string): Promise<void> {
  await api.post(`/alerts/${encodeURIComponent(alertId)}/file-str`)
}

const SUBGRAPH = '/subgraph/subgraphs/name/bank/aml'

const TRANSFER_FIELDS = `
  id
  from { id }
  to { id }
  amount
  txHash
  blockNumber
  timestamp
  isLargeTransaction
  isPEPTransaction
  isNewAccountTransaction
`

export async function fetchWalletTransfers(walletAddress: string): Promise<SubgraphTransfer[]> {
  const addr = walletAddress.toLowerCase()
  const [outRes, inRes] = await Promise.all([
    axios.post(SUBGRAPH, {
      query: `query($w: Bytes!) { transfers(where:{from:$w}, orderBy:timestamp, orderDirection:desc, first:30) { ${TRANSFER_FIELDS} } }`,
      variables: { w: addr },
    }),
    axios.post(SUBGRAPH, {
      query: `query($w: Bytes!) { transfers(where:{to:$w}, orderBy:timestamp, orderDirection:desc, first:30) { ${TRANSFER_FIELDS} } }`,
      variables: { w: addr },
    }),
  ])

  const out: SubgraphTransfer[] = outRes.data?.data?.transfers ?? []
  const ins: SubgraphTransfer[] = inRes.data?.data?.transfers ?? []
  const merged = [...out, ...ins]
  const unique = Array.from(new Map(merged.map((t) => [t.id, t])).values())
  unique.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
  return unique.slice(0, 50)
}
