import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { PortfolioPosition } from '../types/analysis'

const STORAGE_KEY = 'stocksage_portfolio'

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPositions(JSON.parse(raw))
      })
      .finally(() => setLoading(false))
  }, [])

  async function persist(updated: PortfolioPosition[]) {
    setPositions(updated)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const addPosition = useCallback(async (data: Omit<PortfolioPosition, 'id' | 'addedAt'>) => {
    const position: PortfolioPosition = {
      ...data,
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      addedAt: new Date().toISOString(),
    }
    await persist([...positions, position])
    return position
  }, [positions])

  const updatePosition = useCallback(async (id: string, data: Partial<Pick<PortfolioPosition, 'entryPrice' | 'quantity' | 'entryDate' | 'name'>>) => {
    const updated = positions.map((p) => p.id === id ? { ...p, ...data } : p)
    await persist(updated)
  }, [positions])

  const removePosition = useCallback(async (id: string) => {
    await persist(positions.filter((p) => p.id !== id))
  }, [positions])

  return { positions, loading, addPosition, updatePosition, removePosition }
}
