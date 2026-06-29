import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg'

import { FNO_RAW_URL, REFRESH_INTERVAL } from '../constants/config'
const MAX_TRADES_PER_DAY = 2
const TRADE_KEY = 'fno_trade_count'
const TRADE_DATE_KEY = 'fno_trade_date'

interface OIStrike {
  strike: number
  calls_oi: number
  puts_oi: number
}

interface FNOSignal {
  option_name: string
  action: string
  expiry: string
  lot_size: number
  premium: number
  entry_low: number
  entry_high: number
  sl: number
  target: number
  risk_per_lot: number
  reward_per_lot: number
  rr_ratio: string
}

interface IndexSetup {
  current_level: number
  direction: 'CALL' | 'PUT'
  probability: number
  demand_zone: { low: number; high: number }
  supply_zone: { low: number; high: number }
  stop_loss: number
  target: number
  suggested_strike: number
  strike_type: string
  iv_rank: number
  iv_label: string
  pcr: number
  pcr_label: string
  max_pain: number
  time_window: 'GOOD' | 'AVOID' | 'CAUTION'
  zone_strength: number
  psychology_signals: string[]
  timeframe_alignment: number
  oi_analysis: string
  oi_data: OIStrike[]
  change: number
  change_pct: number
  signal?: FNOSignal
}

interface FNOData {
  nifty: IndexSetup
  banknifty: IndexSetup
  timestamp: string
  is_demo?: boolean
}

const DEMO_DATA: FNOData = {
  is_demo: true,
  timestamp: new Date().toISOString(),
  nifty: {
    current_level: 24450,
    direction: 'CALL',
    probability: 68,
    demand_zone: { low: 24300, high: 24380 },
    supply_zone: { low: 24600, high: 24680 },
    stop_loss: 24250,
    target: 24650,
    suggested_strike: 24450,
    strike_type: 'ATM',
    iv_rank: 22,
    iv_label: 'CHEAP',
    pcr: 1.18,
    pcr_label: 'BULLISH',
    max_pain: 24400,
    time_window: 'GOOD',
    zone_strength: 74,
    psychology_signals: ['SMART_MONEY_ACCUMULATION'],
    timeframe_alignment: 71,
    oi_analysis: 'Heavy PUT writing at 24000 and 24200 — strong support below. Max PUT base at 24000.',
    change: 85,
    change_pct: 0.35,
    signal: {
      option_name: 'NIFTY 24450 CE',
      action: 'BUY CALL',
      expiry: 'Weekly',
      lot_size: 75,
      premium: 185,
      entry_low: 175,
      entry_high: 195,
      sl: 130,
      target: 296,
      risk_per_lot: 4125,
      reward_per_lot: 8325,
      rr_ratio: '1:2',
    },
    oi_data: [
      { strike: 24000, calls_oi: 42000, puts_oi: 118000 },
      { strike: 24100, calls_oi: 38000, puts_oi: 95000 },
      { strike: 24200, calls_oi: 55000, puts_oi: 102000 },
      { strike: 24300, calls_oi: 61000, puts_oi: 88000 },
      { strike: 24400, calls_oi: 74000, puts_oi: 76000 },
      { strike: 24500, calls_oi: 89000, puts_oi: 52000 },
      { strike: 24600, calls_oi: 112000, puts_oi: 38000 },
      { strike: 24700, calls_oi: 95000, puts_oi: 28000 },
      { strike: 24800, calls_oi: 78000, puts_oi: 22000 },
    ],
  },
  banknifty: {
    current_level: 52480,
    direction: 'PUT',
    probability: 62,
    demand_zone: { low: 52000, high: 52200 },
    supply_zone: { low: 52800, high: 53000 },
    stop_loss: 52850,
    target: 52000,
    suggested_strike: 52500,
    strike_type: 'ATM',
    iv_rank: 41,
    iv_label: 'CHEAP',
    pcr: 0.88,
    pcr_label: 'BEARISH',
    max_pain: 52500,
    time_window: 'CAUTION',
    zone_strength: 61,
    psychology_signals: ['DISTRIBUTION'],
    timeframe_alignment: 58,
    oi_analysis: 'Heavy CALL writing at 53000 — strong resistance above. Bearish bias below 52500.',
    change: -120,
    change_pct: -0.23,
    signal: {
      option_name: 'BANKNIFTY 52500 PE',
      action: 'BUY PUT',
      expiry: 'Weekly',
      lot_size: 30,
      premium: 320,
      entry_low: 304,
      entry_high: 336,
      sl: 224,
      target: 512,
      risk_per_lot: 2880,
      reward_per_lot: 5760,
      rr_ratio: '1:2',
    },
    oi_data: [
      { strike: 51500, calls_oi: 28000, puts_oi: 95000 },
      { strike: 52000, calls_oi: 35000, puts_oi: 112000 },
      { strike: 52500, calls_oi: 68000, puts_oi: 88000 },
      { strike: 53000, calls_oi: 124000, puts_oi: 42000 },
      { strike: 53500, calls_oi: 98000, puts_oi: 31000 },
      { strike: 54000, calls_oi: 72000, puts_oi: 18000 },
    ],
  },
}

function formatNum(n: number): string {
  return n.toLocaleString('en-IN')
}

function timeWindowColor(w: string): string {
  if (w === 'GOOD') return '#00C896'
  if (w === 'CAUTION') return '#FFD32A'
  return '#FF4757'
}

function timeWindowLabel(w: string): string {
  if (w === 'GOOD') return '🟢 Good time to trade'
  if (w === 'CAUTION') return '🟡 Trade with caution'
  return '🔴 Avoid new trades now'
}

// ── OI Heatmap ───────────────────────────────────────────────────────────────
function OIHeatmap({ data, title }: { data: OIStrike[]; title: string }) {
  if (!data || data.length === 0) return null

  const sorted = [...data].sort((a, b) => a.strike - b.strike)
  const maxOI = Math.max(...sorted.flatMap((d) => [d.calls_oi, d.puts_oi]))
  const W = 320
  const rowH = 28
  const labelW = 60
  const barMaxW = (W - labelW - 8) / 2
  const H = sorted.length * rowH + 36

  return (
    <View style={s.heatmapWrap}>
      <Text style={s.heatmapTitle}>{title} — OI Heatmap</Text>
      <View style={s.heatmapLegend}>
        <View style={[s.legendDot, { backgroundColor: '#FF4757' }]} /><Text style={s.legendText}>Calls OI</Text>
        <View style={[s.legendDot, { backgroundColor: '#00C896' }]} /><Text style={s.legendText}>Puts OI</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={W} height={H}>
          {/* Header */}
          <SvgText x={labelW / 2} y={18} fill="#8B8FA8" fontSize={10} textAnchor="middle" fontWeight="700">STRIKE</SvgText>
          <SvgText x={labelW + 4} y={18} fill="#FF4757" fontSize={10} textAnchor="start" fontWeight="700">← CALLS</SvgText>
          <SvgText x={W - 4} y={18} fill="#00C896" fontSize={10} textAnchor="end" fontWeight="700">PUTS →</SvgText>

          {sorted.map((row, i) => {
            const y = 26 + i * rowH
            const callW = maxOI > 0 ? (row.calls_oi / maxOI) * barMaxW : 0
            const putW  = maxOI > 0 ? (row.puts_oi  / maxOI) * barMaxW : 0
            const isMaxCall = row.calls_oi === Math.max(...sorted.map((d) => d.calls_oi))
            const isMaxPut  = row.puts_oi  === Math.max(...sorted.map((d) => d.puts_oi))
            return (
              <React.Fragment key={row.strike}>
                {/* Strike label */}
                <SvgText x={labelW / 2} y={y + 16} fill={isMaxCall || isMaxPut ? '#FFFFFF' : '#8B8FA8'} fontSize={10} textAnchor="middle" fontWeight={isMaxCall || isMaxPut ? '700' : '400'}>
                  {formatNum(row.strike)}
                </SvgText>
                {/* Calls bar — left side */}
                <Rect x={labelW - callW} y={y + 4} width={callW} height={rowH - 10} fill={isMaxCall ? '#FF475799' : '#FF475740'} rx={3} />
                {/* Puts bar — right side */}
                <Rect x={labelW + 4} y={y + 4} width={putW} height={rowH - 10} fill={isMaxPut ? '#00C89699' : '#00C89640'} rx={3} />
                {/* Row divider */}
                <Line x1={0} y1={y + rowH - 1} x2={W} y2={y + rowH - 1} stroke="#1E1E2E" strokeWidth={0.5} />
              </React.Fragment>
            )
          })}
        </Svg>
      </ScrollView>
    </View>
  )
}

// ── Trade Signal Card ────────────────────────────────────────────────────────
function TradeSignalCard({ signal, timeWindow }: { signal: FNOSignal; timeWindow: string }) {
  const isBull = signal.action === 'BUY CALL'
  const accentColor = isBull ? '#00C896' : '#FF4757'
  const isAvoid = timeWindow === 'AVOID'

  return (
    <View style={[ts.card, { borderColor: accentColor + '60' }]}>
      {/* Header */}
      <View style={ts.header}>
        <View style={[ts.badge, { backgroundColor: accentColor + '20' }]}>
          <Text style={[ts.badgeText, { color: accentColor }]}>🎯 TRADE SIGNAL</Text>
        </View>
        {isAvoid && (
          <View style={ts.avoidBadge}>
            <Text style={ts.avoidText}>Market Closed</Text>
          </View>
        )}
      </View>

      {/* Option name — big and bold */}
      <Text style={[ts.optionName, { color: accentColor }]}>{signal.option_name}</Text>
      <View style={ts.ltpRow}>
        <Text style={ts.actionLabel}>{signal.action} · {signal.expiry} · Lot: {signal.lot_size}</Text>
        <View style={[ts.ltpBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '60' }]}>
          <Text style={ts.ltpLabel}>LTP</Text>
          <Text style={[ts.ltpValue, { color: accentColor }]}>₹{signal.premium}</Text>
        </View>
      </View>

      {/* Entry / SL / Target boxes */}
      <View style={ts.levelsRow}>
        <View style={[ts.levelBox, { borderColor: '#FFD32A40' }]}>
          <Text style={ts.levelLabel}>ENTRY</Text>
          <Text style={[ts.levelValue, { color: '#FFD32A' }]}>₹{signal.entry_low} – ₹{signal.entry_high}</Text>
          <Text style={ts.levelSub}>Premium range</Text>
        </View>
        <View style={[ts.levelBox, { borderColor: '#FF475740' }]}>
          <Text style={ts.levelLabel}>STOP LOSS</Text>
          <Text style={[ts.levelValue, { color: '#FF4757' }]}>₹{signal.sl}</Text>
          <Text style={ts.levelSub}>30% below entry</Text>
        </View>
        <View style={[ts.levelBox, { borderColor: '#00C89640' }]}>
          <Text style={ts.levelLabel}>TARGET</Text>
          <Text style={[ts.levelValue, { color: '#00C896' }]}>₹{signal.target}</Text>
          <Text style={ts.levelSub}>60% above entry</Text>
        </View>
      </View>

      {/* Risk / Reward per lot */}
      <View style={ts.rrRow}>
        <View style={ts.rrBox}>
          <Text style={ts.rrLabel}>Risk per lot</Text>
          <Text style={[ts.rrValue, { color: '#FF4757' }]}>₹{signal.risk_per_lot.toLocaleString('en-IN')}</Text>
        </View>
        <View style={[ts.rrDivider]} />
        <View style={ts.rrBox}>
          <Text style={ts.rrLabel}>Reward per lot</Text>
          <Text style={[ts.rrValue, { color: '#00C896' }]}>₹{signal.reward_per_lot.toLocaleString('en-IN')}</Text>
        </View>
        <View style={[ts.rrDivider]} />
        <View style={ts.rrBox}>
          <Text style={ts.rrLabel}>Risk : Reward</Text>
          <Text style={[ts.rrValue, { color: '#6C63FF' }]}>{signal.rr_ratio}</Text>
        </View>
      </View>

      {/* Disclaimer */}
      <Text style={ts.disclaimer}>Exit before 3:15 PM · Max 2 trades/day · Based on NSE option chain OI</Text>
    </View>
  )
}

// ── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.scoreRow}>
      <Text style={s.scoreLabel}>{label}</Text>
      <View style={s.scoreTrack}>
        <View style={[s.scoreFill, { width: `${Math.min(100, value)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[s.scoreValue, { color }]}>{value}%</Text>
    </View>
  )
}

// ── Index setup card ─────────────────────────────────────────────────────────
function IndexCard({
  name, setup, tradesUsed, onLogTrade, isLive,
}: {
  name: string
  setup: IndexSetup
  tradesUsed: number
  onLogTrade: () => void
  isLive?: boolean
}) {
  const isBull = setup.direction === 'CALL'
  const dirColor = isBull ? '#00C896' : '#FF4757'
  const dirLabel = isBull ? 'CALL SIDE 📈' : 'PUT SIDE 📉'
  const tradesLeft = MAX_TRADES_PER_DAY - tradesUsed
  const timeColor = timeWindowColor(setup.time_window)

  return (
    <View style={s.indexCard}>
      {/* Header */}
      <View style={s.indexHeader}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.indexName}>{name}</Text>
            {isLive && <View style={s.liveDot}><Text style={s.liveText}>LIVE</Text></View>}
          </View>
          <Text style={s.indexLevel}>
            {formatNum(setup.current_level)}{' '}
            <Text style={{ color: setup.change_pct >= 0 ? '#00C896' : '#FF4757', fontSize: 13 }}>
              {setup.change_pct >= 0 ? '+' : ''}{setup.change_pct?.toFixed(2)}%
            </Text>
          </Text>
        </View>
        <View style={[s.probBadge, { borderColor: dirColor }]}>
          <Text style={[s.probValue, { color: dirColor }]}>{setup.probability}%</Text>
          <Text style={s.probSub}>Probability</Text>
        </View>
      </View>

      {/* Direction badge */}
      <View style={[s.dirBadge, { backgroundColor: dirColor + '20', borderColor: dirColor }]}>
        <Text style={[s.dirText, { color: dirColor }]}>{dirLabel}</Text>
      </View>

      {/* Trade signal or ORB status */}
      {setup.signal && (setup.signal as any).premium > 0 ? (
        <TradeSignalCard signal={setup.signal} timeWindow={setup.time_window} />
      ) : (setup as any).orb_message ? (
        <View style={s.orbBanner}>
          <Text style={s.orbIcon}>
            {(setup as any).orb_status === 'FORMING'       ? '⏳' :
             (setup as any).orb_status === 'FALSE_BREAKOUT' ? '⚠️' :
             (setup as any).orb_status === 'CHOPPY'         ? '🚫' : '📊'}
          </Text>
          <Text style={s.orbText}>{(setup as any).orb_message}</Text>
        </View>
      ) : null}

      {/* Time window */}
      <View style={[s.timeRow, { backgroundColor: timeColor + '15' }]}>
        <Text style={[s.timeText, { color: timeColor }]}>{timeWindowLabel(setup.time_window)}</Text>
        <Text style={[s.timeText, { color: timeColor }]}>Exit before 3:15 PM ⏰</Text>
      </View>

      {/* Key levels grid */}
      <View style={s.levelsGrid}>
        <LevelBox label="Demand Zone" value={`${formatNum(setup.demand_zone.low)} – ${formatNum(setup.demand_zone.high)}`} color="#00C896" />
        <LevelBox label="Supply Zone" value={`${formatNum(setup.supply_zone.low)} – ${formatNum(setup.supply_zone.high)}`} color="#FF4757" />
        <LevelBox label="Stop Loss" value={formatNum(setup.stop_loss)} color="#FF4757" />
        <LevelBox label="Target" value={formatNum(setup.target)} color="#00C896" />
        <LevelBox label="Max Pain" value={formatNum(setup.max_pain)} color="#FFD32A" />
        <LevelBox label="PCR" value={`${setup.pcr?.toFixed(2)} — ${setup.pcr_label}`} color={setup.pcr_label === 'BULLISH' ? '#00C896' : '#FF4757'} />
      </View>

      {/* Strike suggestion */}
      <View style={s.strikeSuggest}>
        <Text style={s.strikeLabel}>Suggested Strike</Text>
        <Text style={s.strikeValue}>{name === 'NIFTY' ? 'NIFTY' : 'BANKNIFTY'} {formatNum(setup.suggested_strike)} {isBull ? 'CE' : 'PE'}</Text>
        <Text style={s.strikeType}>
          IV Rank: {setup.iv_rank}% — {setup.iv_label === 'CHEAP' ? '✅ Options are CHEAP' : '⚠️ Options are EXPENSIVE'} — {setup.strike_type}
        </Text>
      </View>

      {/* Confluence breakdown */}
      <Text style={s.sectionTitle}>Confluence Breakdown</Text>
      <ScoreBar label="Zone Strength"       value={setup.zone_strength}        color="#6C63FF" />
      <ScoreBar label="Timeframe Alignment" value={setup.timeframe_alignment}   color="#00C896" />
      <ScoreBar label="Overall Probability" value={setup.probability}           color={dirColor} />

      {/* OI analysis */}
      {setup.oi_analysis ? (
        <View style={s.oiNote}>
          <Text style={s.oiNoteTitle}>OI Reading</Text>
          <Text style={s.oiNoteText}>{setup.oi_analysis}</Text>
        </View>
      ) : null}

      {/* Psychology signals */}
      {setup.psychology_signals?.length > 0 && (
        <View style={s.psyWrap}>
          {setup.psychology_signals.map((p) => (
            <View key={p} style={s.psyChip}>
              <Text style={s.psyChipText}>{p.replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Trade counter */}
      <View style={s.tradeCountRow}>
        <Text style={s.tradeCountText}>
          Today's trades: <Text style={{ color: tradesLeft > 0 ? '#00C896' : '#FF4757', fontWeight: '800' }}>{tradesUsed}/{MAX_TRADES_PER_DAY}</Text>
        </Text>
        {tradesLeft > 0 ? (
          <TouchableOpacity style={s.logTradeBtn} onPress={onLogTrade}>
            <Text style={s.logTradeBtnText}>+ Log Trade</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.maxTradesReached}>
            <Text style={s.maxTradesText}>Max trades reached for today</Text>
          </View>
        )}
      </View>
    </View>
  )
}

function LevelBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.levelBox}>
      <Text style={s.levelLabel}>{label}</Text>
      <Text style={[s.levelValue, { color }]}>{value}</Text>
    </View>
  )
}

const YAHOO_SYMBOLS: Record<'NIFTY' | 'BANKNIFTY', string> = {
  NIFTY:     '%5ENSEI',
  BANKNIFTY: '%5ENSEBANK',
}

async function fetchLivePrice(index: 'NIFTY' | 'BANKNIFTY'): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const sym = YAHOO_SYMBOLS[index]
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`,
      { headers: { 'Cache-Control': 'no-cache' } }
    )
    if (!res.ok) return null
    const json = await res.json()
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta) return null
    const price     = meta.regularMarketPrice ?? 0
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change    = +(price - prevClose).toFixed(2)
    const changePct = prevClose ? +(change / prevClose * 100).toFixed(2) : 0
    return { price, change, changePct }
  } catch {
    return null
  }
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function FNOScreen() {
  const [data, setData] = useState<FNOData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tradesUsed, setTradesUsed] = useState(0)
  const [activeIndex, setActiveIndex] = useState<'NIFTY' | 'BANKNIFTY'>('NIFTY')
  const [livePrice, setLivePrice] = useState<Record<'NIFTY' | 'BANKNIFTY', { price: number; change: number; changePct: number } | null>>({ NIFTY: null, BANKNIFTY: null })

  async function loadTradeCount() {
    const today = new Date().toISOString().slice(0, 10)
    const savedDate = await AsyncStorage.getItem(TRADE_DATE_KEY)
    if (savedDate !== today) {
      await AsyncStorage.setItem(TRADE_DATE_KEY, today)
      await AsyncStorage.setItem(TRADE_KEY, '0')
      setTradesUsed(0)
    } else {
      const count = parseInt((await AsyncStorage.getItem(TRADE_KEY)) ?? '0')
      setTradesUsed(count)
    }
  }

  async function logTrade() {
    if (tradesUsed >= MAX_TRADES_PER_DAY) return
    const next = tradesUsed + 1
    await AsyncStorage.setItem(TRADE_KEY, String(next))
    setTradesUsed(next)
    Alert.alert('Trade Logged ✅', `${next}/${MAX_TRADES_PER_DAY} trades used today. Remember to exit before 3:15 PM.`)
  }

  async function fetchData() {
    setError(null)
    try {
      const res  = await fetch(`${FNO_RAW_URL}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json?.nifty || !json?.banknifty) {
        setData({ ...DEMO_DATA, timestamp: new Date().toISOString() })
      } else {
        setData(json)
      }
    } catch (e: any) {
      const msg = e?.message || 'Unknown error'
      setError(msg)
      setData({ ...DEMO_DATA, timestamp: new Date().toISOString() })
    }
  }

  // Live price polling every 30 seconds from Yahoo Finance
  useEffect(() => {
    async function refreshLive() {
      const [n, b] = await Promise.all([fetchLivePrice('NIFTY'), fetchLivePrice('BANKNIFTY')])
      setLivePrice({ NIFTY: n, BANKNIFTY: b })
    }
    refreshLive()
    const id = setInterval(refreshLive, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    loadTradeCount()
    fetchData().finally(() => setLoading(false))
    const id = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#6C63FF" size="large" />
        <Text style={s.loadingText}>Loading FNO setups...</Text>
      </View>
    )
  }

  if (!data) return null

  const baseSetup = activeIndex === 'NIFTY' ? data.nifty : data.banknifty
  const live = livePrice[activeIndex]
  const setup = live
    ? { ...baseSetup, current_level: live.price, change: live.change, change_pct: live.changePct }
    : baseSetup

  return (
    <ScrollView
      style={s.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" colors={['#6C63FF']} />}
    >
      {/* Index selector */}
      <View style={s.indexToggle}>
        {(['NIFTY', 'BANKNIFTY'] as const).map((idx) => (
          <TouchableOpacity
            key={idx}
            style={[s.indexToggleBtn, activeIndex === idx && s.indexToggleBtnActive]}
            onPress={() => setActiveIndex(idx)}
          >
            <Text style={[s.indexToggleText, activeIndex === idx && s.indexToggleTextActive]}>{idx}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Demo banner */}
      {data.is_demo && (
        <View style={s.demoBanner}>
          <Text style={s.demoBannerText}>⚠️ Demo data — {error ? `Error: ${error}` : 'live data loads during market hours'}</Text>
        </View>
      )}
      {/* Estimated data banner (Yahoo fallback) */}
      {!data.is_demo && (data.nifty as any)?.is_estimated && (
        <View style={[s.demoBanner, { backgroundColor: '#6C63FF15', borderColor: '#6C63FF40' }]}>
          <Text style={[s.demoBannerText, { color: '#6C63FF' }]}>ℹ️ Price-action analysis — NSE OI data unavailable from server</Text>
        </View>
      )}

      {/* Timestamp */}
      {data.timestamp && !data.is_demo && (
        <Text style={s.timestamp}>Last updated: {new Date(data.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
      )}

      <IndexCard
        name={activeIndex}
        setup={setup}
        tradesUsed={tradesUsed}
        onLogTrade={logTrade}
        isLive={!!live}
      />

      {/* OI Heatmap */}
      {setup.oi_data?.length > 0 && (
        <OIHeatmap data={setup.oi_data} title={activeIndex} />
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0A0A0F' },
  loadingText: { color: '#8B8FA8', marginTop: 12, fontSize: 14 },
  errorText: { color: '#FF4757', fontSize: 15, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: '#6C63FF', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  indexToggle: { flexDirection: 'row', margin: 16, backgroundColor: '#13131A', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#1E1E2E' },
  indexToggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  indexToggleBtnActive: { backgroundColor: '#6C63FF' },
  indexToggleText: { color: '#8B8FA8', fontWeight: '700', fontSize: 15 },
  indexToggleTextActive: { color: '#FFFFFF' },

  demoBanner: { backgroundColor: '#FFD32A20', borderWidth: 1, borderColor: '#FFD32A40', marginHorizontal: 16, marginBottom: 10, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  demoBannerText: { color: '#FFD32A', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  timestamp: { color: '#4A4A6A', fontSize: 11, textAlign: 'center', marginBottom: 8 },
  liveDot:  { backgroundColor: '#00C89620', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#00C89660' },
  liveText: { color: '#00C896', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  orbBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderColor: '#2E2E4E', gap: 10 },
  orbIcon:   { fontSize: 20 },
  orbText:   { color: '#A0A0C0', fontSize: 13, fontWeight: '600', flex: 1 },

  indexCard: { backgroundColor: '#13131A', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: '#1E1E2E' },

  indexHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  indexName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  indexLevel: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },

  probBadge: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  probValue: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  probSub: { color: '#8B8FA8', fontSize: 10, fontWeight: '600', marginTop: 2 },

  dirBadge: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center', marginBottom: 12 },
  dirText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  timeRow: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  timeText: { fontSize: 12, fontWeight: '700' },

  levelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  levelBox: { backgroundColor: '#0A0A0F', borderRadius: 10, padding: 10, width: '47%', borderWidth: 1, borderColor: '#1E1E2E' },
  levelLabel: { color: '#8B8FA8', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  levelValue: { fontSize: 13, fontWeight: '800' },

  strikeSuggest: { backgroundColor: '#6C63FF15', borderRadius: 12, borderWidth: 1, borderColor: '#6C63FF40', padding: 14, marginBottom: 14 },
  strikeLabel: { color: '#6C63FF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  strikeValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  strikeType: { color: '#8B8FA8', fontSize: 12 },

  sectionTitle: { color: '#8B8FA8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  scoreLabel: { color: '#CCCCDD', fontSize: 12, width: 130 },
  scoreTrack: { flex: 1, height: 6, backgroundColor: '#1E1E2E', borderRadius: 3, overflow: 'hidden' },
  scoreFill: { height: 6, borderRadius: 3 },
  scoreValue: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },

  oiNote: { backgroundColor: '#0A0A0F', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1E1E2E' },
  oiNoteTitle: { color: '#FFD32A', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  oiNoteText: { color: '#CCCCDD', fontSize: 13, lineHeight: 19 },

  psyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  psyChip: { backgroundColor: '#6C63FF20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#6C63FF40' },
  psyChipText: { color: '#6C63FF', fontSize: 11, fontWeight: '600' },

  tradeCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#1E1E2E', paddingTop: 12, marginTop: 4 },
  tradeCountText: { color: '#8B8FA8', fontSize: 13 },
  logTradeBtn: { backgroundColor: '#00C89620', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#00C896' },
  logTradeBtnText: { color: '#00C896', fontSize: 12, fontWeight: '700' },
  maxTradesReached: { backgroundColor: '#FF475720', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  maxTradesText: { color: '#FF4757', fontSize: 11, fontWeight: '600' },

  heatmapWrap: { backgroundColor: '#13131A', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: '#1E1E2E' },
})

const ts = StyleSheet.create({
  card: { backgroundColor: '#0D0D16', borderRadius: 14, borderWidth: 1.5, padding: 14, marginVertical: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  avoidBadge: { backgroundColor: '#FF475720', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  avoidText: { color: '#FF4757', fontSize: 10, fontWeight: '700' },
  optionName: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  ltpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  actionLabel: { color: '#8B8FA8', fontSize: 12 },
  ltpBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  ltpLabel: { color: '#8B8FA8', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  ltpValue: { fontSize: 16, fontWeight: '900' },
  levelsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  levelBox: { flex: 1, backgroundColor: '#13131A', borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center' },
  levelLabel: { color: '#8B8FA8', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  levelValue: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  levelSub: { color: '#4A4A6A', fontSize: 9, marginTop: 2, textAlign: 'center' },
  rrRow: { flexDirection: 'row', backgroundColor: '#13131A', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 10 },
  rrBox: { flex: 1, alignItems: 'center' },
  rrLabel: { color: '#8B8FA8', fontSize: 10, marginBottom: 4 },
  rrValue: { fontSize: 15, fontWeight: '900' },
  rrDivider: { width: 1, height: 28, backgroundColor: '#1E1E2E' },
  disclaimer: { color: '#3A3A5A', fontSize: 10, textAlign: 'center', lineHeight: 14 },

  heatmapTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  heatmapLegend: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#8B8FA8', fontSize: 11 },
})
