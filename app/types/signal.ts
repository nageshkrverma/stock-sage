export interface Zone {
  type: 'DEMAND' | 'SUPPLY'
  top: number
  bottom: number
  strength_score: number
  fresh: boolean
  origin_date: string
  touches: number
}

export interface Target {
  price: number
  pct: number
  label: string
}

export interface Psychology {
  type: string
  label: string
  description: string
  weight: number
}

export interface CandlestickPattern {
  pattern: string
  score: number
  bullish: boolean
}

export interface VolumeConfirmation {
  ratio: number
  confirmed: boolean
}

export interface ExpectedProfit {
  min_pct: number
  max_pct: number
  label: string
}

export interface Signal {
  id: string
  symbol: string
  name: string
  sector: string
  exchange: string
  signal_type: 'BUY' | 'SELL'
  generated_at: string
  holding_period: '15D' | '30D' | '3M' | '6M' | '1Y'
  holding_label: string
  entry: { low: number; high: number }
  stop_loss: number
  stop_loss_pct: number
  targets: Target[]
  expected_profit: ExpectedProfit
  risk_reward: number
  confidence: number
  zone: Zone
  trend_bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  candlestick_pattern: CandlestickPattern | null
  volume_confirmation: VolumeConfirmation
  psychology: Psychology[]
  sentiment: 'STRONG_BUY' | 'BUY' | 'WEAK_BUY' | 'AVOID'
  fear_greed_position: number
  disqualifiers: Psychology[]
  rsi: number
  current_price: number
  day_change_pct: number
}

export interface SignalsResponse {
  generated_at: string
  market_date: string
  total_signals: number
  total_scanned: number
  signals: Signal[]
}

export interface TradeEntry {
  id: string
  signalId: string
  symbol: string
  name: string
  sector: string
  entryPrice: number
  quantity: number
  entryDate: string
  stopLoss: number
  targets: Target[]
  holding_period: string
  status: 'OPEN' | 'CLOSED' | 'SL_HIT'
  exitPrice?: number
  exitDate?: string
  pnl?: number
  pnlPct?: number
  notes?: string
}

export type HoldingPeriod = '15D' | '30D' | '3M' | '6M' | '1Y' | 'ALL'
export type SignalType = 'BUY' | 'SELL' | 'ALL'
export type SentimentType = 'STRONG_BUY' | 'BUY' | 'WEAK_BUY' | 'ALL'

export interface SignalFilters {
  holding?: string[]
  sentiment?: string[]
  sector?: string[]
  minConfidence?: number
  signalType?: SignalType
  searchQuery?: string
}
