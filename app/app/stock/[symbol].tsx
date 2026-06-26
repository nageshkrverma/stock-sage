import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert, Animated,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSignals } from '../../hooks/useSignals'
import { useTrades } from '../../hooks/useTrades'
import { useAlerts } from '../../context/AlertsContext'
import { StockAnalysis, VerdictResult, VerdictType } from '../../types/analysis'
import { formatINR, formatPct } from '../../utils/formatters'
import ConfidenceRing from '../../components/ConfidenceRing'

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec'

interface LiveQuote {
  price: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
}

const VERDICT_CONFIG: Record<VerdictType, { color: string; bg: string; emoji: string; label: string }> = {
  HOLD:          { color: '#6C63FF', bg: '#6C63FF20', emoji: '🤝', label: 'HOLD' },
  EXIT:          { color: '#FF4757', bg: '#FF475720', emoji: '🚪', label: 'EXIT NOW' },
  ADD_MORE:      { color: '#00C896', bg: '#00C89620', emoji: '➕', label: 'ADD MORE' },
  PARTIAL_EXIT:  { color: '#FFD32A', bg: '#FFD32A20', emoji: '📤', label: 'PARTIAL EXIT' },
}

function rsiPlain(rsi: number): string {
  if (rsi < 30) return 'Oversold — value buyers likely stepping in'
  if (rsi < 45) return 'Mildly weak — below-average momentum'
  if (rsi < 55) return 'Neutral — balanced buyer and seller activity'
  if (rsi < 70) return 'Healthy momentum — buyers in control'
  return 'Overheated — risk of pullback is higher'
}

function rsiColor(rsi: number): string {
  if (rsi < 30) return '#00C896'
  if (rsi > 70) return '#FF4757'
  return '#8B8FA8'
}

function trendPlain(t: string): string {
  if (t === 'BULLISH') return 'Upward trend — stock is above its long-term average'
  if (t === 'BEARISH') return 'Downward trend — stock is below its long-term average'
  return 'Sideways — no clear direction yet'
}

function trendColor(t: string): string {
  if (t === 'BULLISH') return '#00C896'
  if (t === 'BEARISH') return '#FF4757'
  return '#8B8FA8'
}

function fgLabel(v: number): string {
  if (v < 0.2) return 'Extreme Fear'
  if (v < 0.4) return 'Fear'
  if (v < 0.6) return 'Neutral'
  if (v < 0.8) return 'Greed'
  return 'Extreme Greed'
}

function fgColor(v: number): string {
  if (v < 0.3) return '#00C896'
  if (v < 0.5) return '#8B8FA8'
  if (v < 0.7) return '#FFD32A'
  return '#FF4757'
}

function volumePlain(ratio: number, confirmed: boolean): string {
  if (confirmed) return `${ratio.toFixed(1)}× average — strong conviction`
  if (ratio > 0.8) return 'Near-average volume — normal activity'
  return 'Below-average volume — moves lack conviction'
}

export default function StockDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>()
  const { entry, qty } = useLocalSearchParams<{ entry?: string; qty?: string }>()
  const router = useRouter()
  const { signals } = useSignals()
  const { addTrade } = useTrades()
  const { addAlert, alerts, checkAlerts } = useAlerts()

  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null)
  const [liveLoading, setLiveLoading] = useState(true)

  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(true)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [showVerdictModal, setShowVerdictModal] = useState(false)
  const [entryPrice, setEntryPrice] = useState(entry ?? '')
  const [quantity, setQuantity] = useState(qty ?? '')
  const [verdictLoading, setVerdictLoading] = useState(false)

  const [showAddTrade, setShowAddTrade] = useState(false)
  const [alertModal, setAlertModal] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [alertCondition, setAlertCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE')

  const scrollRef = useRef<ScrollView>(null)
  const verdictAnim = useRef(new Animated.Value(0)).current

  const sym = symbol?.toUpperCase() ?? ''
  const existingSignal = signals.find((s) => s.symbol === sym) ?? null

  // Fetch live quote from GAS
  useEffect(() => {
    if (!sym) return
    setLiveLoading(true)
    fetch(`${GAS_URL}?action=quote&symbol=${sym}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.price && d.price > 0) {
          setLiveQuote({
            price: d.price,
            change: d.change ?? 0,
            changePct: d.changePct ?? 0,
            open: d.open ?? 0,
            high: d.high ?? 0,
            low: d.low ?? 0,
            prevClose: d.prevClose ?? 0,
            volume: d.volume ?? 0,
          })
          checkAlerts(sym, d.price)
        }
      })
      .catch(() => {})
      .finally(() => setLiveLoading(false))
  }, [sym])

  // Fetch full analysis from Render
  useEffect(() => {
    if (!sym) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    fetch(`${GAS_URL}?action=analyse&symbol=${sym}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setAnalysisError(d.error); return }
        setAnalysis(d.analysis)
        if (d.verdict) setVerdict(d.verdict)
      })
      .catch((e) => {
        if (e.name === 'AbortError') {
          setAnalysisError('Analysis is taking longer than usual. The server may be waking up — please retry in a moment.')
        } else {
          setAnalysisError('Could not load analysis. Check your connection and try again.')
        }
      })
      .finally(() => { setAnalysisLoading(false); clearTimeout(timeout) })

    return () => { controller.abort(); clearTimeout(timeout) }
  }, [sym])

  // Auto-submit verdict if entry+qty came from portfolio navigation
  useEffect(() => {
    if (entry && qty && analysis && !verdict) {
      fetchVerdict(parseFloat(entry), parseInt(qty))
    }
  }, [analysis])

  async function fetchVerdict(ep: number, q: number) {
    if (!ep || !q || ep <= 0 || q <= 0) {
      Alert.alert('Invalid input', 'Please enter a valid entry price and quantity.')
      return
    }
    setVerdictLoading(true)
    try {
      const r = await fetch(`${GAS_URL}?action=analyse&symbol=${sym}&entry_price=${ep}&quantity=${q}`)
      const d = await r.json()
      if (d.verdict) {
        setVerdict(d.verdict)
        setShowVerdictModal(false)
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true })
          Animated.spring(verdictAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start()
        }, 300)
      } else {
        Alert.alert('Error', d.error ?? 'Could not compute verdict.')
      }
    } catch {
      Alert.alert('Error', 'Could not reach analysis server. Try again.')
    } finally {
      setVerdictLoading(false)
    }
  }

  function handleGetVerdict() {
    const ep = parseFloat(entryPrice)
    const q = parseInt(quantity)
    if (isNaN(ep) || ep <= 0) { Alert.alert('Invalid', 'Enter a valid entry price.'); return }
    if (isNaN(q) || q <= 0) { Alert.alert('Invalid', 'Enter a valid quantity.'); return }
    fetchVerdict(ep, q)
  }

  async function handleAddTrade(type: 'BUY' | 'SHORT', price: number, q: number) {
    await addTrade({
      signalId: existingSignal?.id ?? `${sym}_manual_${Date.now()}`,
      symbol: sym,
      name: analysis?.name ?? existingSignal?.name ?? sym,
      sector: analysis?.sector,
      entryPrice: price,
      quantity: q,
      entryDate: new Date().toISOString(),
      stopLoss: existingSignal?.stop_loss,
      targets: existingSignal?.targets,
      holding_period: existingSignal?.holding_period,
      trade_type: type,
    })
    setShowAddTrade(false)
    Alert.alert('Added!', `${sym} added to Paper Trades.`)
  }

  async function saveAlert() {
    if (!liveQuote || !alertPrice || isNaN(parseFloat(alertPrice))) {
      Alert.alert('Invalid', 'Enter a valid price.')
      return
    }
    await addAlert({
      symbol: sym,
      name: analysis?.name ?? sym,
      condition: alertCondition,
      targetPrice: parseFloat(alertPrice),
      currentPrice: liveQuote.price,
    })
    setAlertModal(false)
    Alert.alert('Alert Set ✅', `You will be notified when ${sym} goes ${alertCondition.toLowerCase()} ₹${alertPrice}`)
  }

  const isUp = (liveQuote?.changePct ?? 0) >= 0
  const hasAlert = alerts.some((a) => a.symbol === sym && !a.triggered)
  const displayName = analysis?.name ?? existingSignal?.name ?? sym

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* LIVE PRICE CARD */}
        <View style={styles.priceCard}>
          <Text style={styles.symText}>{sym}</Text>
          <Text style={styles.nameText} numberOfLines={2}>{displayName}</Text>
          {liveLoading ? (
            <ActivityIndicator color="#6C63FF" style={{ marginTop: 10 }} />
          ) : liveQuote ? (
            <View style={styles.priceTop}>
              <Text style={styles.ltp}>{formatINR(liveQuote.price)}</Text>
              <Text style={[styles.changeText, { color: isUp ? '#00C896' : '#FF4757', marginLeft: 10 }]}>
                {isUp ? '▲' : '▼'} {Math.abs(liveQuote.change).toFixed(2)} ({Math.abs(liveQuote.changePct).toFixed(2)}%)
              </Text>
            </View>
          ) : (
            <Text style={styles.noPrice}>Price unavailable</Text>
          )}
          {liveQuote && (
            <View style={styles.statsGrid}>
              {[
                { label: 'Open', value: formatINR(liveQuote.open) },
                { label: 'Prev Close', value: formatINR(liveQuote.prevClose) },
                { label: 'Day High', value: formatINR(liveQuote.high) },
                { label: 'Day Low', value: formatINR(liveQuote.low) },
              ].map(({ label, value }) => (
                <View key={label} style={styles.statBox}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* EXISTING SIGNAL CARD */}
        {existingSignal && (
          <View style={styles.signalCard}>
            <View style={styles.signalHeader}>
              <Text style={styles.signalTitle}>📊 Active Trade Signal</Text>
              <TouchableOpacity onPress={() => router.push(`/signal/${existingSignal.id}` as any)}>
                <Text style={styles.viewDetail}>Full Signal →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.signalRow}>
              <View style={[styles.sigBadge, {
                backgroundColor: existingSignal.signal_type === 'BUY' ? '#00C89620' : '#FF475720',
                borderColor: existingSignal.signal_type === 'BUY' ? '#00C896' : '#FF4757',
              }]}>
                <Text style={[styles.sigBadgeText, { color: existingSignal.signal_type === 'BUY' ? '#00C896' : '#FF4757' }]}>
                  {existingSignal.signal_type === 'BUY' ? '📈 BUY' : '📉 SHORT'}
                </Text>
              </View>
              <View style={styles.holdBadge}><Text style={styles.holdText}>{existingSignal.holding_label}</Text></View>
              <ConfidenceRing confidence={existingSignal.confidence} size={44} />
            </View>
            <View style={styles.zoneRow}>
              <View style={styles.zoneBox}><Text style={styles.zoneLabel}>Entry Zone</Text><Text style={styles.zoneVal}>{formatINR(existingSignal.entry.low)} – {formatINR(existingSignal.entry.high)}</Text></View>
              <View style={styles.zoneBox}><Text style={[styles.zoneLabel, { color: '#FF4757' }]}>Stop Loss</Text><Text style={styles.zoneVal}>{formatINR(existingSignal.stop_loss)}</Text></View>
            </View>
          </View>
        )}

        {/* FULL ANALYSIS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Full Market Analysis</Text>

          {analysisLoading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#6C63FF" />
              <Text style={styles.loadingText}>Loading analysis… (may take ~30s on first use)</Text>
            </View>
          )}

          {!analysisLoading && analysisError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {analysisError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => {
                setAnalysisError(null)
                setAnalysisLoading(true)
                fetch(`${GAS_URL}?action=analyse&symbol=${sym}`)
                  .then((r) => r.json())
                  .then((d) => { if (!d.error) setAnalysis(d.analysis); else setAnalysisError(d.error) })
                  .catch(() => setAnalysisError('Could not reach analysis server.'))
                  .finally(() => setAnalysisLoading(false))
              }}>
                <Text style={styles.retryText}>↺ Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {analysis && (
            <>
              {/* Trend + RSI + Volume */}
              <View style={styles.metricCard}>
                <MetricRow icon="📈" label="Market Trend" value={trendPlain(analysis.trend_bias)} valueColor={trendColor(analysis.trend_bias)} />
                <MetricRow icon="⚡" label={`RSI ${analysis.rsi}`} value={rsiPlain(analysis.rsi)} valueColor={rsiColor(analysis.rsi)} />
                <MetricRow icon="📊" label="Volume" value={volumePlain(analysis.volume_confirmation.ratio, analysis.volume_confirmation.confirmed)}
                  valueColor={analysis.volume_confirmation.confirmed ? '#00C896' : '#8B8FA8'} />
                {analysis.candlestick_pattern && (
                  <MetricRow icon={analysis.candlestick_pattern.bullish ? '🕯️' : '🕯️'} label="Candlestick" value={analysis.candlestick_pattern.pattern}
                    valueColor={analysis.candlestick_pattern.bullish ? '#00C896' : '#FF4757'} last />
                )}
              </View>

              {/* Zones */}
              <Text style={styles.subTitle}>🗺️ Key Price Zones</Text>
              <View style={styles.zoneCards}>
                {analysis.nearest_demand_zone ? (
                  <View style={[styles.zoneCardBox, { borderColor: '#00C89640' }]}>
                    <Text style={[styles.zoneCardLabel, { color: '#00C896' }]}>🛡️ Nearest Support</Text>
                    <Text style={styles.zoneCardPrice}>{formatINR(analysis.nearest_demand_zone.bottom)} – {formatINR(analysis.nearest_demand_zone.top)}</Text>
                    <Text style={styles.zoneCardSub}>
                      {analysis.nearest_demand_zone.fresh ? '✅ Fresh zone — never tested' : `⚠️ Tested ${analysis.nearest_demand_zone.touches}× before`}
                      {' · '}Strength {analysis.nearest_demand_zone.strength_score.toFixed(0)}/100
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.zoneCardBox, { borderColor: '#8B8FA820' }]}>
                    <Text style={[styles.zoneCardLabel, { color: '#8B8FA8' }]}>🛡️ Support</Text>
                    <Text style={styles.zoneCardSub}>No active support zone detected below current price</Text>
                  </View>
                )}
                {analysis.nearest_supply_zone ? (
                  <View style={[styles.zoneCardBox, { borderColor: '#FF475740' }]}>
                    <Text style={[styles.zoneCardLabel, { color: '#FF4757' }]}>🔴 Nearest Resistance</Text>
                    <Text style={styles.zoneCardPrice}>{formatINR(analysis.nearest_supply_zone.bottom)} – {formatINR(analysis.nearest_supply_zone.top)}</Text>
                    <Text style={styles.zoneCardSub}>
                      {analysis.nearest_supply_zone.fresh ? '✅ Fresh zone' : `⚠️ Tested ${analysis.nearest_supply_zone.touches}×`}
                      {' · '}Strength {analysis.nearest_supply_zone.strength_score.toFixed(0)}/100
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.zoneCardBox, { borderColor: '#8B8FA820' }]}>
                    <Text style={[styles.zoneCardLabel, { color: '#8B8FA8' }]}>🔴 Resistance</Text>
                    <Text style={styles.zoneCardSub}>No active resistance zone detected above current price</Text>
                  </View>
                )}
              </View>

              {/* Psychology */}
              {(analysis.psychology.length > 0 || analysis.disqualifiers.length > 0) && (
                <>
                  <Text style={styles.subTitle}>🧠 Market Psychology</Text>
                  <View style={styles.psychList}>
                    {analysis.psychology.map((p, i) => (
                      <View key={i} style={[styles.psychChip, { borderColor: '#00C89640', backgroundColor: '#00C89610' }]}>
                        <Text style={styles.psychLabel}>{p.label}</Text>
                        <Text style={styles.psychDesc}>{p.description}</Text>
                      </View>
                    ))}
                    {analysis.disqualifiers.map((p, i) => (
                      <View key={i} style={[styles.psychChip, { borderColor: '#FF475740', backgroundColor: '#FF475710' }]}>
                        <Text style={[styles.psychLabel, { color: '#FF4757' }]}>{p.label}</Text>
                        <Text style={styles.psychDesc}>{p.description}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Fear & Greed */}
              <Text style={styles.subTitle}>😨 Fear & Greed Index</Text>
              <View style={styles.fgCard}>
                <View style={styles.fgTrack}>
                  <View style={[styles.fgFill, { width: `${Math.round(analysis.fear_greed_position * 100)}%` as any, backgroundColor: fgColor(analysis.fear_greed_position) }]} />
                  <View style={[styles.fgDot, { left: `${Math.round(analysis.fear_greed_position * 100)}%` as any }]} />
                </View>
                <View style={styles.fgLabels}>
                  <Text style={styles.fgEnd}>😨 Extreme Fear</Text>
                  <Text style={[styles.fgCurrent, { color: fgColor(analysis.fear_greed_position) }]}>
                    {fgLabel(analysis.fear_greed_position)} ({Math.round(analysis.fear_greed_position * 100)})
                  </Text>
                  <Text style={styles.fgEnd}>🤑 Extreme Greed</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.tradeBtn} onPress={() => setShowAddTrade(true)}>
            <Text style={styles.tradeBtnText}>+ Paper Trade</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.alertBtn, hasAlert && styles.alertBtnActive]} onPress={() => {
            setAlertPrice(liveQuote?.price.toFixed(2) ?? '')
            setAlertCondition('ABOVE')
            setAlertModal(true)
          }}>
            <Text style={[styles.alertBtnText, hasAlert && { color: '#FFD700' }]}>
              {hasAlert ? '🔔 Alert Set' : '🔔 Alert'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.analyseBtn, !analysis && styles.analyseBtnDisabled]}
          disabled={!analysis}
          onPress={() => {
            setEntryPrice(entry ?? '')
            setQuantity(qty ?? '')
            setShowVerdictModal(true)
          }}
        >
          <Text style={styles.analyseBtnText}>🔍 Analyse My Position</Text>
          <Text style={styles.analyseBtnSub}>Enter your buy price to get a personalised verdict</Text>
        </TouchableOpacity>

        {/* VERDICT CARD */}
        {verdict && (
          <Animated.View style={[styles.verdictCard, { borderColor: VERDICT_CONFIG[verdict.verdict].color, opacity: verdictAnim, transform: [{ translateY: verdictAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <View style={[styles.verdictBadge, { backgroundColor: VERDICT_CONFIG[verdict.verdict].bg }]}>
              <Text style={styles.verdictEmoji}>{VERDICT_CONFIG[verdict.verdict].emoji}</Text>
              <Text style={[styles.verdictLabel, { color: VERDICT_CONFIG[verdict.verdict].color }]}>
                {VERDICT_CONFIG[verdict.verdict].label}
              </Text>
            </View>
            <View style={styles.pnlRow}>
              <Text style={[styles.pnlValue, { color: verdict.pnl >= 0 ? '#00C896' : '#FF4757' }]}>
                {verdict.pnl >= 0 ? '+' : '-'}{formatINR(Math.abs(verdict.pnl))}
              </Text>
              <Text style={[styles.pnlPct, { color: verdict.pnl >= 0 ? '#00C896' : '#FF4757' }]}>
                {formatPct(verdict.pnl_pct)}
              </Text>
            </View>
            <Text style={styles.verdictSummary}>{verdict.summary}</Text>

            <Text style={styles.verdictSubTitle}>What's influencing this verdict</Text>
            {verdict.factors.map((f, i) => (
              <View key={i} style={styles.factorRow}>
                <Text style={styles.factorIcon}>{f.icon}</Text>
                <Text style={[styles.factorText, { color: f.positive ? '#CCCCDD' : '#8B8FA8' }]}>{f.description}</Text>
                <Text style={{ color: f.positive ? '#00C896' : '#FF4757', fontSize: 12 }}>{f.positive ? '✓' : '✕'}</Text>
              </View>
            ))}

            <View style={styles.protectBox}>
              <Text style={styles.protectLabel}>🛡️ Protect your position at</Text>
              <Text style={styles.protectPrice}>{formatINR(verdict.protect_at)}</Text>
              <Text style={styles.protectSub}>Exit if price closes below this level</Text>
            </View>

            <Text style={styles.verdictSubTitle}>What could change this verdict</Text>
            {verdict.what_changes.map((w, i) => (
              <View key={i} style={styles.changeRow}>
                <Text style={styles.changeBullet}>→</Text>
                <Text style={styles.changeText}>{w}</Text>
              </View>
            ))}

            <TouchableOpacity style={styles.reanalyseBtn} onPress={() => {
              setEntryPrice(entryPrice)
              setQuantity(quantity)
              setShowVerdictModal(true)
            }}>
              <Text style={styles.reanalyseTxt}>↺ Re-analyse with different position</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* VERDICT INPUT MODAL */}
      <Modal visible={showVerdictModal} transparent animationType="slide" onRequestClose={() => setShowVerdictModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowVerdictModal(false)}>
          <View style={styles.bottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Analyse My Position</Text>
            <Text style={styles.sheetSub}>{sym} — {displayName}</Text>

            <Text style={styles.inputLabel}>I bought at price (₹)</Text>
            <TextInput
              style={styles.sheetInput}
              value={entryPrice}
              onChangeText={setEntryPrice}
              keyboardType="numeric"
              placeholder="e.g. 2500.00"
              placeholderTextColor="#4A4A6A"
            />

            <Text style={styles.inputLabel}>Number of shares I hold</Text>
            <TextInput
              style={styles.sheetInput}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="e.g. 10"
              placeholderTextColor="#4A4A6A"
            />

            {entryPrice && quantity && liveQuote && (
              <Text style={styles.estPnl}>
                Est. position: {formatINR(parseFloat(entryPrice || '0') * parseInt(quantity || '0'))}  ·
                Current: {formatINR(liveQuote.price * parseInt(quantity || '0'))}
              </Text>
            )}

            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setShowVerdictModal(false)}>
                <Text style={styles.sheetCancelText}>Just show analysis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetGetBtn, verdictLoading && { opacity: 0.6 }]}
                onPress={handleGetVerdict}
                disabled={verdictLoading}
              >
                {verdictLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sheetGetText}>Get My Verdict ▶</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ADD PAPER TRADE MODAL */}
      <Modal visible={showAddTrade} transparent animationType="slide" onRequestClose={() => setShowAddTrade(false)}>
        <AddTradeSheet
          symbol={sym}
          name={displayName}
          defaultPrice={liveQuote?.price ?? 0}
          defaultType={existingSignal?.signal_type === 'SELL' ? 'SHORT' : 'BUY'}
          onClose={() => setShowAddTrade(false)}
          onAdd={handleAddTrade}
        />
      </Modal>

      {/* PRICE ALERT MODAL */}
      <Modal visible={alertModal} transparent animationType="slide" onRequestClose={() => setAlertModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheet, { paddingBottom: 40 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>🔔 Set Price Alert</Text>
            <Text style={styles.sheetSub}>{sym} · Current: {formatINR(liveQuote?.price ?? 0)}</Text>
            <Text style={styles.inputLabel}>Notify me when price is:</Text>
            <View style={styles.condRow}>
              {(['ABOVE', 'BELOW'] as const).map((c) => (
                <TouchableOpacity key={c} style={[styles.condBtn, alertCondition === c && { borderColor: '#6C63FF', backgroundColor: '#6C63FF15' }]} onPress={() => setAlertCondition(c)}>
                  <Text style={[styles.condText, alertCondition === c && { color: '#6C63FF' }]}>{c === 'ABOVE' ? '▲ Above' : '▼ Below'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.sheetInput} value={alertPrice} onChangeText={setAlertPrice} keyboardType="numeric" placeholder="Target price" placeholderTextColor="#4A4A6A" />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancelBtn} onPress={() => setAlertModal(false)}><Text style={styles.sheetCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.sheetGetBtn} onPress={saveAlert}><Text style={styles.sheetGetText}>Set Alert</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function MetricRow({ icon, label, value, valueColor, last }: { icon: string; label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.metricRow, !last && styles.metricRowBorder]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      </View>
    </View>
  )
}

function AddTradeSheet({ symbol, name, defaultPrice, defaultType, onClose, onAdd }: {
  symbol: string; name: string; defaultPrice: number
  defaultType: 'BUY' | 'SHORT'; onClose: () => void
  onAdd: (type: 'BUY' | 'SHORT', price: number, qty: number) => void
}) {
  const [type, setType] = useState<'BUY' | 'SHORT'>(defaultType)
  const [price, setPrice] = useState(defaultPrice > 0 ? defaultPrice.toFixed(2) : '')
  const [qty, setQty] = useState('10')

  return (
    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
      <View style={styles.bottomSheet} onStartShouldSetResponder={() => true}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Add to Paper Trades</Text>
        <Text style={styles.sheetSub}>{symbol} · {name}</Text>
        <View style={styles.condRow}>
          <TouchableOpacity style={[styles.condBtn, type === 'BUY' && { borderColor: '#00C896', backgroundColor: '#00C89615' }]} onPress={() => setType('BUY')}>
            <Text style={[styles.condText, type === 'BUY' && { color: '#00C896' }]}>📈 BUY / LONG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.condBtn, type === 'SHORT' && { borderColor: '#FF4757', backgroundColor: '#FF475715' }]} onPress={() => setType('SHORT')}>
            <Text style={[styles.condText, type === 'SHORT' && { color: '#FF4757' }]}>📉 SHORT / SELL</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.inputLabel}>Entry Price (₹)</Text>
        <TextInput style={styles.sheetInput} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#4A4A6A" />
        <Text style={styles.inputLabel}>Quantity</Text>
        <TextInput style={styles.sheetInput} value={qty} onChangeText={setQty} keyboardType="numeric" placeholderTextColor="#4A4A6A" />
        <View style={styles.sheetBtns}>
          <TouchableOpacity style={styles.sheetCancelBtn} onPress={onClose}><Text style={styles.sheetCancelText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.sheetGetBtn, { backgroundColor: type === 'BUY' ? '#00C896' : '#FF4757' }]}
            onPress={() => { const p = parseFloat(price), q = parseInt(qty); if (p > 0 && q > 0) onAdd(type, p, q) }}>
            <Text style={styles.sheetGetText}>+ Add Trade</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { padding: 16, paddingBottom: 32 },
  priceCard: { backgroundColor: '#13131A', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#1E1E2E' },
  priceTop: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4 },
  symText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  nameText: { color: '#8B8FA8', fontSize: 13, marginTop: 3 },
  sectorText: { color: '#4A4A6A', fontSize: 11, marginTop: 2 },
  ltp: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  changeText: { fontSize: 13, fontWeight: '700' },
  noPrice: { color: '#4A4A6A', fontSize: 13, marginTop: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  statBox: { width: '25%', paddingVertical: 8, paddingHorizontal: 2 },
  statLabel: { color: '#4A4A6A', fontSize: 10, marginBottom: 2 },
  statValue: { color: '#CCCCDD', fontSize: 12, fontWeight: '700' },

  signalCard: { backgroundColor: '#13131A', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#6C63FF40' },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  signalTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  viewDetail: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sigBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  sigBadgeText: { fontSize: 12, fontWeight: '700' },
  holdBadge: { backgroundColor: '#1E1E2E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  holdText: { color: '#8B8FA8', fontSize: 11, fontWeight: '600' },
  zoneRow: { flexDirection: 'row', gap: 8 },
  zoneBox: { flex: 1, backgroundColor: '#0A0A0F', borderRadius: 8, padding: 10 },
  zoneLabel: { color: '#8B8FA8', fontSize: 10, marginBottom: 3 },
  zoneVal: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  section: { marginBottom: 8 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  subTitle: { color: '#8B8FA8', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 10 },

  loadingBox: { backgroundColor: '#13131A', borderRadius: 12, padding: 24, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#1E1E2E' },
  loadingText: { color: '#8B8FA8', fontSize: 13, textAlign: 'center' },
  errorBox: { backgroundColor: '#13131A', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#FF475730', alignItems: 'center', gap: 12 },
  errorText: { color: '#FF4757', fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: '#1E1E2E', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  retryText: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },

  metricCard: { backgroundColor: '#13131A', borderRadius: 14, borderWidth: 1, borderColor: '#1E1E2E', overflow: 'hidden' },
  metricRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  metricRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  metricIcon: { fontSize: 18, width: 24 },
  metricBody: { flex: 1 },
  metricLabel: { color: '#4A4A6A', fontSize: 10, marginBottom: 2 },
  metricValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  zoneCards: { flexDirection: 'row', gap: 10 },
  zoneCardBox: { flex: 1, backgroundColor: '#13131A', borderRadius: 12, padding: 12, borderWidth: 1 },
  zoneCardLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  zoneCardPrice: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  zoneCardSub: { color: '#4A4A6A', fontSize: 10, lineHeight: 16 },

  psychList: { gap: 8 },
  psychChip: { borderRadius: 10, padding: 12, borderWidth: 1 },
  psychLabel: { color: '#00C896', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  psychDesc: { color: '#8B8FA8', fontSize: 11, lineHeight: 17 },

  fgCard: { backgroundColor: '#13131A', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1E1E2E' },
  fgTrack: { height: 8, backgroundColor: '#1E1E2E', borderRadius: 4, marginBottom: 8, position: 'relative', overflow: 'visible' },
  fgFill: { height: 8, borderRadius: 4 },
  fgDot: { position: 'absolute', top: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', marginLeft: -8, borderWidth: 2, borderColor: '#0A0A0F' },
  fgLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  fgEnd: { color: '#4A4A6A', fontSize: 9 },
  fgCurrent: { fontSize: 12, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 10, marginVertical: 12 },
  tradeBtn: { flex: 1, height: 46, backgroundColor: '#00C89615', borderRadius: 12, borderWidth: 1, borderColor: '#00C896', alignItems: 'center', justifyContent: 'center' },
  tradeBtnText: { color: '#00C896', fontSize: 14, fontWeight: '700' },
  alertBtn: { flex: 1, height: 46, backgroundColor: '#FFD70010', borderRadius: 12, borderWidth: 1, borderColor: '#FFD70060', alignItems: 'center', justifyContent: 'center' },
  alertBtnActive: { borderColor: '#FFD700', backgroundColor: '#FFD70020' },
  alertBtnText: { color: '#FFD700', fontSize: 14, fontWeight: '700' },

  analyseBtn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14 },
  analyseBtnDisabled: { backgroundColor: '#6C63FF60' },
  analyseBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  analyseBtnSub: { color: '#FFFFFF90', fontSize: 11, marginTop: 3 },

  verdictCard: { backgroundColor: '#13131A', borderRadius: 18, padding: 18, borderWidth: 2, marginBottom: 14 },
  verdictBadge: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  verdictEmoji: { fontSize: 28 },
  verdictLabel: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  pnlRow: { flexDirection: 'row', gap: 10, alignItems: 'baseline', marginBottom: 12 },
  pnlValue: { fontSize: 20, fontWeight: '800' },
  pnlPct: { fontSize: 14, fontWeight: '700' },
  verdictSummary: { color: '#CCCCDD', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  verdictSubTitle: { color: '#8B8FA8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  factorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  factorIcon: { fontSize: 16, width: 22 },
  factorText: { flex: 1, fontSize: 13, lineHeight: 19 },
  protectBox: { backgroundColor: '#FF475710', borderRadius: 10, padding: 14, marginVertical: 14, borderWidth: 1, borderColor: '#FF475730' },
  protectLabel: { color: '#8B8FA8', fontSize: 11, marginBottom: 4 },
  protectPrice: { color: '#FF4757', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  protectSub: { color: '#4A4A6A', fontSize: 11 },
  changeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  changeBullet: { color: '#6C63FF', fontWeight: '800', fontSize: 14 },
  changeText: { flex: 1, color: '#8B8FA8', fontSize: 12, lineHeight: 18 },
  reanalyseBtn: { marginTop: 14, alignItems: 'center' },
  reanalyseTxt: { color: '#6C63FF', fontSize: 13, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#2A2A3A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sheetSub: { color: '#8B8FA8', fontSize: 13, marginBottom: 20 },
  inputLabel: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  sheetInput: { backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', color: '#FFFFFF', fontSize: 16, paddingHorizontal: 14, height: 50, marginBottom: 14 },
  estPnl: { color: '#4A4A6A', fontSize: 12, marginBottom: 14 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetCancelBtn: { flex: 1, height: 50, backgroundColor: '#1E1E2E', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText: { color: '#8B8FA8', fontSize: 14, fontWeight: '700' },
  sheetGetBtn: { flex: 2, height: 50, backgroundColor: '#6C63FF', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetGetText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  condRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  condBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' },
  condText: { color: '#8B8FA8', fontSize: 13, fontWeight: '700' },
})
