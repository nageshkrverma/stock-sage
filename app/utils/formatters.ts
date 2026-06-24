export function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

export function formatINRCompact(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function formatPct(value: number, showSign = true): string {
  const sign = showSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

export function formatDaysHeld(entryDate: string): string {
  const diff = Date.now() - new Date(entryDate).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function rsiLabel(rsi: number): string {
  if (rsi < 30) return 'Oversold'
  if (rsi > 70) return 'Overbought'
  return 'Neutral'
}
