export type KycTier = 'NONE' | 'BASIC' | 'ENHANCED' | 'CORPORATE'
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'STR_FILED' | 'DISMISSED'
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface Wallet {
  id: string
  customerId: string
  fullName: string
  passportNo: string
  dob: string
  nationality: string
  address: string
  occupation?: string
  sourceOfFunds?: string
  kycTier: KycTier
  isPEP: boolean
  isBlocked: boolean
  piiHash: string
  openedAt: string
  createdAt: string
  updatedAt: string
}

export interface Alert {
  id: string
  walletId: string
  ruleId: number
  severity: Severity
  score: number
  amount?: string
  txHash: string
  blockNumber: string
  timestamp: string
  evidence: Record<string, unknown>
  status: AlertStatus
  createdAt: string
  updatedAt: string
}

export interface RiskScoreResponse {
  walletId: string
  score: number
  band: RiskBand
  alerts: Alert[]
}

export interface SubgraphTransfer {
  id: string
  from: { id: string }
  to: { id: string }
  amount: string
  txHash: string
  blockNumber: string
  timestamp: string
  isLargeTransaction: boolean
  isPEPTransaction: boolean
  isNewAccountTransaction: boolean
}
