import { useQuery } from '@tanstack/react-query'
import { Signal, SignalFilters, SignalsResponse } from '../types/signal'
import { GITHUB_RAW_URL, REFRESH_INTERVAL } from '../constants/config'

async function fetchSignals(): Promise<SignalsResponse> {
  const url = `${GITHUB_RAW_URL}?t=${Date.now()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch signals: ${res.status}`)
  return res.json()
}

export function useSignals() {
  const query = useQuery<SignalsResponse, Error>({
    queryKey: ['signals'],
    queryFn: fetchSignals,
    staleTime: REFRESH_INTERVAL,
    gcTime: REFRESH_INTERVAL * 2,
    retry: 3,
  })

  return {
    data: query.data,
    signals: query.data?.signals ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: query.data?.generated_at ?? null,
    marketDate: query.data?.market_date ?? null,
    totalSignals: query.data?.total_signals ?? 0,
  }
}

export function filterSignals(signals: Signal[], filters: SignalFilters): Signal[] {
  let result = [...signals]

  if (filters.signalType && filters.signalType !== 'ALL') {
    result = result.filter((s) => s.signal_type === filters.signalType)
  }

  if (filters.holding && filters.holding.length > 0) {
    result = result.filter((s) => filters.holding!.includes(s.holding_period))
  }

  if (filters.sentiment && filters.sentiment.length > 0) {
    result = result.filter((s) => filters.sentiment!.includes(s.sentiment))
  }

  if (filters.sector && filters.sector.length > 0) {
    result = result.filter((s) => filters.sector!.includes(s.sector))
  }

  if (filters.minConfidence !== undefined) {
    result = result.filter((s) => s.confidence >= filters.minConfidence!)
  }

  if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
    const q = filters.searchQuery.trim().toUpperCase()
    result = result.filter(
      (s) =>
        s.symbol.toUpperCase().includes(q) ||
        s.name.toUpperCase().includes(q)
    )
  }

  return result
}

export function getUniqueSectors(signals: Signal[]): string[] {
  return Array.from(new Set(signals.map((s) => s.sector))).sort()
}
