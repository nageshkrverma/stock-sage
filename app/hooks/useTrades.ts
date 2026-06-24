import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TradeEntry } from '../types/signal'

const STORAGE_KEY = 'stocksage_trades'

function calcPnl(trade: TradeEntry, currentPrice: number) {
  const invested = trade.entryPrice * trade.quantity
  const current = currentPrice * trade.quantity
  const pnl = current - invested
  const pnlPct = (pnl / invested) * 100
  return { pnl, pnlPct, invested }
}

export function useTrades() {
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setTrades(JSON.parse(raw))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const persist = useCallback(async (updated: TradeEntry[]) => {
    setTrades(updated)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }, [])

  const addTrade = useCallback(
    async (trade: Omit<TradeEntry, 'id' | 'status'>) => {
      const newTrade: TradeEntry = {
        ...trade,
        id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'OPEN',
      }
      await persist([...trades, newTrade])
    },
    [trades, persist]
  )

  const closeTrade = useCallback(
    async (id: string, exitPrice: number, exitDate?: string) => {
      const updated = trades.map((t) => {
        if (t.id !== id) return t
        const { pnl, pnlPct } = calcPnl(t, exitPrice)
        const isSLHit = exitPrice <= t.stopLoss
        return {
          ...t,
          status: isSLHit ? ('SL_HIT' as const) : ('CLOSED' as const),
          exitPrice,
          exitDate: exitDate ?? new Date().toISOString(),
          pnl: Math.round(pnl * 100) / 100,
          pnlPct: Math.round(pnlPct * 100) / 100,
        }
      })
      await persist(updated)
    },
    [trades, persist]
  )

  const deleteTrade = useCallback(
    async (id: string) => {
      await persist(trades.filter((t) => t.id !== id))
    },
    [trades, persist]
  )

  const updateNotes = useCallback(
    async (id: string, notes: string) => {
      await persist(trades.map((t) => (t.id === id ? { ...t, notes } : t)))
    },
    [trades, persist]
  )

  const openTrades = trades.filter((t) => t.status === 'OPEN')
  const closedTrades = trades.filter((t) => t.status !== 'OPEN')

  const totalInvested = openTrades.reduce(
    (sum, t) => sum + t.entryPrice * t.quantity,
    0
  )

  const totalClosedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const portfolioSummary = {
    totalInvested,
    totalPnl: totalClosedPnl,
    totalPnlPct: totalInvested > 0 ? (totalClosedPnl / totalInvested) * 100 : 0,
    openCount: openTrades.length,
    closedCount: closedTrades.length,
  }

  return {
    trades,
    openTrades,
    closedTrades,
    loading,
    addTrade,
    closeTrade,
    deleteTrade,
    updateNotes,
    portfolioSummary,
  }
}
