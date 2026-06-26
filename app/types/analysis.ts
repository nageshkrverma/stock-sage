import { Zone, Psychology, CandlestickPattern, VolumeConfirmation } from './signal'

export interface StockAnalysis {
  symbol: string
  name: string
  sector: string
  current_price: number
  trend_bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  rsi: number
  volume_confirmation: VolumeConfirmation
  candlestick_pattern: CandlestickPattern | null
  nearest_demand_zone: Zone | null
  nearest_supply_zone: Zone | null
  all_demand_zones: Zone[]
  all_supply_zones: Zone[]
  psychology: Psychology[]
  disqualifiers: Psychology[]
  fear_greed_position: number
  day_change_pct: number
}

export interface VerdictFactor {
  icon: string
  description: string
  positive: boolean
}

export type VerdictType = 'HOLD' | 'EXIT' | 'ADD_MORE' | 'PARTIAL_EXIT'

export interface VerdictResult {
  verdict: VerdictType
  summary: string
  factors: VerdictFactor[]
  protect_at: number
  what_changes: string[]
  pnl: number
  pnl_pct: number
}

export interface PortfolioPosition {
  id: string
  symbol: string
  name: string
  entryPrice: number
  quantity: number
  entryDate: string
  addedAt: string
}
