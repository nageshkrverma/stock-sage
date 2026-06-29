import { useQuery } from '@tanstack/react-query'
import { Signal, SignalFilters, SignalsResponse } from '../types/signal'
import { GITHUB_RAW_URL, SIGNALS_HISTORY_URL, REFRESH_INTERVAL } from '../constants/config'

async function fetchSignals(): Promise<SignalsResponse & { isFromHistory?: boolean }> {
  const res = await fetch(`${GITHUB_RAW_URL}?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  })
  if (!res.ok) throw new Error(`Failed to fetch signals: ${res.status}`)
  const data: SignalsResponse = await res.json()

  // If no current signals, fall back to most recent signals from history
  if (!data.signals || data.signals.length === 0) {
    try {
      const hres = await fetch(`${SIGNALS_HISTORY_URL}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      })
      if (hres.ok) {
        const history: Signal[] = await hres.json()
        if (Array.isArray(history) && history.length > 0) {
          // Get the most recent batch — signals from the latest generated_at date
          const sorted = [...history].sort((a, b) =>
            new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
          )
          const latestDate = sorted[0].generated_at.slice(0, 10)
          const latest = sorted.filter(s => s.generated_at.slice(0, 10) === latestDate)
          // Deduplicate by symbol, keep highest confidence
          const seen = new Set<string>()
          const deduped = latest.filter(s => {
            if (seen.has(s.symbol)) return false
            seen.add(s.symbol)
            return true
          })
          return { ...data, signals: deduped, isFromHistory: true }
        }
      }
    } catch (_) {}
  }

  return data
}

export function useSignals() {
  const query = useQuery<SignalsResponse & { isFromHistory?: boolean }, Error>({
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
    isFromHistory: query.data?.isFromHistory ?? false,
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
