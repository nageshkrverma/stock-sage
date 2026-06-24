import { Target } from '../types/signal'

export function calcProgress(
  entryPrice: number,
  currentPrice: number,
  stopLoss: number,
  targets: Target[]
): number {
  // Returns 0.0 (at SL) to 1.0 (at T2)
  const t2 = targets[1]?.price ?? targets[0]?.price ?? entryPrice * 1.1
  const range = t2 - stopLoss
  if (range <= 0) return 0.5
  return Math.max(0, Math.min(1, (currentPrice - stopLoss) / range))
}

export function calcPnlFromTrade(
  entryPrice: number,
  currentPrice: number,
  quantity: number
): { pnl: number; pnlPct: number; invested: number } {
  const invested = entryPrice * quantity
  const current = currentPrice * quantity
  const pnl = current - invested
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  return {
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 100) / 100,
    invested: Math.round(invested * 100) / 100,
  }
}
