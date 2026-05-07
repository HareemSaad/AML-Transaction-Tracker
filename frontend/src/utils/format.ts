export const RULE_NAMES: Record<number, string> = {
  1: 'Cash Transaction Report',
  2: 'Structuring / Smurfing',
  5: 'Velocity Spike',
  7: 'Third-Party Payer',
  8: 'Layering',
  9: 'PEP Outgoing',
  12: 'New Account',
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatAmount(raw?: string | null): string {
  if (!raw) return '—'
  try {
    const n = BigInt(raw)
    if (n >= BigInt('1000000000000000')) {
      const whole = n / BigInt('1000000000000000000')
      const frac = (n % BigInt('1000000000000000000')) / BigInt('100000000000000')
      return `${whole.toLocaleString()}.${frac.toString().padStart(4, '0').slice(0, 2)} bPKR`
    }
    return `${n.toLocaleString()} bPKR`
  } catch {
    return `${raw} bPKR`
  }
}

export function formatTs(unixSecs: string | number): string {
  const ms = (typeof unixSecs === 'string' ? parseInt(unixSecs) : unixSecs) * 1000
  return new Date(ms).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatIso(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
