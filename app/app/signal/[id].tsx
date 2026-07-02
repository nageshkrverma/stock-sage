import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSignals } from '../../hooks/useSignals'
import { useTrades } from '../../hooks/useTrades'
import ConfidenceRing from '../../components/ConfidenceRing'
import HoldingBadge from '../../components/HoldingBadge'
import PsychologyBadge from '../../components/PsychologyBadge'
import SentimentGauge from '../../components/SentimentGauge'
import ZoneChart from '../../components/ZoneChart'
import { formatINR, formatPct, rsiLabel } from '../../utils/formatters'
import { getUrgency } from '../../components/SignalCard'

const ZONE_STATUS_CONFIG = {
  IN_ZONE:     { label: '🔥 Price is IN the entry zone — Act now', color: '#FF9800', bg: '#FF980020', border: '#FF980050' },
  NEAR_ZONE:   { label: '👀 Price is NEAR the zone — Watch closely', color: '#FFD32A', bg: '#FFD32A15', border: '#FFD32A40' },
  WAITING:     { label: '⏳ Waiting for price to reach zone', color: '#6C63FF', bg: '#6C63FF15', border: '#6C63FF40' },
  ZONE_PASSED: { label: '✅ Zone was passed — signal may be invalid', color: '#8B8FA8', bg: '#8B8FA815', border: '#8B8FA830' },
}

const FG_EMOJIS = ['😱', '😨', '😐', '😊', '🤑'] // Extreme Fear → Extreme Greed

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { signals } = useSignals()
  const { addTrade } = useTrades()
  const router = useRouter()

  const signal = signals.find((s) => s.id === id)
  const [showAddTrade, setShowAddTrade] = useState(false)
  const [entryPrice, setEntryPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [psychExpanded, setPsychExpanded] = useState(false)

  if (!signal) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Signal not found or expired</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const isBuy = signal.signal_type === 'BUY'
  const entryMid = (signal.entry.low + signal.entry.high) / 2
  const [tradeType, setTradeType] = useState<'BUY' | 'SHORT'>(isBuy ? 'BUY' : 'SHORT')

  const urgency = getUrgency(signal)
  const zoneConf = ZONE_STATUS_CONFIG[urgency]
  const currentPrice = signal.current_price ?? 0
  const lossIfHold = isBuy
    ? ((currentPrice - signal.stop_loss) / currentPrice) * 100
    : ((signal.stop_loss - currentPrice) / currentPrice) * 100
  const fgIndex = Math.min(4, Math.max(0, Math.floor((signal.fear_greed_position ?? 50) / 20)))

  async function handleShare() {
    const t1 = signal.targets[0]
    await Share.share({
      message: [
        `📊 ${signal.signal_type} Signal — ${signal.symbol}`,
        `${signal.name}`,
        ``,
        `📍 Entry Zone: ₹${signal.entry.low} – ₹${signal.entry.high}`,
        `🛡 Stop Loss: ₹${signal.stop_loss} (${signal.stop_loss_pct.toFixed(1)}%)`,
        t1 ? `🎯 Target 1: ₹${t1.price} (+${t1.pct.toFixed(1)}%)` : '',
        ``,
        `Confidence: ${signal.confidence}% · Expected: ${signal.expected_profit.label}`,
        ``,
        `📲 TradingBabaji — Research by SEBI RA`,
      ].filter(Boolean).join('\n'),
      title: `${signal.symbol} ${signal.signal_type} Signal`,
    })
  }

  async function handleAddTrade() {
    const price = parseFloat(entryPrice)
    const qty = parseInt(quantity)
    if (isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid input', 'Please enter valid entry price and quantity.')
      return
    }
    await addTrade({
      signalId: signal.id,
      symbol: signal.symbol,
      name: signal.name,
      sector: signal.sector,
      entryPrice: price,
      quantity: qty,
      entryDate: new Date().toISOString(),
      stopLoss: signal.stop_loss,
      targets: signal.targets,
      holding_period: signal.holding_period,
      notes,
      trade_type: tradeType,
    })
    setShowAddTrade(false)
    Alert.alert('Trade Added', `${signal.symbol} added to My Trades`)
  }

  const dayUp = (signal.day_change_pct ?? 0) >= 0

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Sticky live price bar */}
      <View style={styles.livePriceBar}>
        <View>
          <Text style={styles.livePriceSymbol}>{signal.symbol}</Text>
          <Text style={styles.livePriceName} numberOfLines={1}>{signal.name}</Text>
        </View>
        <View style={styles.livePriceRight}>
          <Text style={styles.livePriceValue}>{formatINR(signal.current_price ?? 0)}</Text>
          <View style={[styles.liveChangeBadge, { backgroundColor: dayUp ? '#00C89620' : '#FF475720' }]}>
            <Text style={[styles.liveChangeText, { color: dayUp ? '#00C896' : '#FF4757' }]}>
              {dayUp ? '▲' : '▼'} {Math.abs(signal.day_change_pct ?? 0).toFixed(2)}%
            </Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>↗ Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zone Status Box */}
      <View style={[styles.zoneStatusBox, { backgroundColor: zoneConf.bg, borderColor: zoneConf.border }]}>
        <Text style={[styles.zoneStatusText, { color: zoneConf.color }]}>{zoneConf.label}</Text>
      </View>

      {/* SECTION 1 — Header */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.stockName} numberOfLines={2}>{signal.name}</Text>
            <Text style={styles.stockSub}>{signal.symbol} · {signal.exchange}</Text>
            <View style={styles.badgeRow}>
              <View style={[
                styles.signalBadge,
                { borderColor: isBuy ? '#00C896' : '#FF4757', backgroundColor: isBuy ? '#00C89615' : '#FF475715' }
              ]}>
                <Text style={[styles.signalBadgeText, { color: isBuy ? '#00C896' : '#FF4757' }]}>
                  {isBuy ? 'BUY' : 'SELL'}
                </Text>
              </View>
              <HoldingBadge period={signal.holding_period} label={signal.holding_label} />
            </View>
          </View>
          <View style={styles.headerRight}>
            <ConfidenceRing confidence={signal.confidence} size={72} />
            <Text style={styles.confLabel}>Confidence</Text>
          </View>
        </View>
      </View>

      {/* SECTION 2 — Trade Setup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Setup</Text>
        <View style={styles.setupCard}>
          <View style={[styles.setupRow, styles.entryRow]}>
            <Text style={styles.setupLabel}>Entry Zone</Text>
            <Text style={styles.entryValue}>{formatINR(signal.entry.low)} – {formatINR(signal.entry.high)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.setupRow}>
            <Text style={styles.setupLabel}>Stop Loss</Text>
            <Text style={[styles.setupValue, { color: '#FF4757' }]}>
              {formatINR(signal.stop_loss)} ({formatPct(-signal.stop_loss_pct)})
            </Text>
          </View>
          {signal.targets.map((t, i) => (
            <View key={i} style={styles.setupRow}>
              <Text style={styles.setupLabel}>{i === 0 ? 'Target 1' : 'Target 2'}</Text>
              <Text style={[styles.setupValue, { color: '#00C896' }]}>
                {formatINR(t.price)} ({formatPct(t.pct)})
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.rrRow}>
            <View style={styles.rrItem}>
              <Text style={styles.rrLabel}>Risk : Reward</Text>
              <Text style={styles.rrValue}>1 : {signal.risk_reward.toFixed(1)}</Text>
            </View>
            <View style={styles.rrItem}>
              <Text style={styles.rrLabel}>Expected Move</Text>
              <Text style={[styles.rrValue, { color: '#00C896' }]}>{signal.expected_profit.label}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* SECTION 3 — Zone Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price Action</Text>
        <ZoneChart signal={signal} />
      </View>

      {/* SECTION 4 — Psychology */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market Psychology</Text>

        {/* Fear Greed 5-emoji track */}
        <View style={styles.fgTrack}>
          {FG_EMOJIS.map((em, i) => (
            <View key={i} style={[styles.fgEmoji, i === fgIndex && styles.fgEmojiActive]}>
              <Text style={{ fontSize: i === fgIndex ? 24 : 18 }}>{em}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.fgLabel}>
          {['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'][fgIndex]}
        </Text>

        <View style={{ height: 12 }} />

        {/* Psychology inline — one-liner always visible, tap to expand */}
        {signal.psychology.length > 0 ? (
          <TouchableOpacity
            style={styles.psychCard}
            onPress={() => setPsychExpanded(!psychExpanded)}
            activeOpacity={0.8}
          >
            <View style={styles.psychRow}>
              <Text style={styles.psychIcon}>{signal.psychology[0]?.icon ?? '🧠'}</Text>
              <Text style={styles.psychInline} numberOfLines={psychExpanded ? undefined : 2}>
                {signal.psychology[0]?.explanation ?? signal.psychology[0]?.label}
              </Text>
              <Text style={styles.psychChevron}>{psychExpanded ? '▲' : '▼'}</Text>
            </View>
            {psychExpanded && signal.psychology.slice(1).map((p, i) => (
              <PsychologyBadge key={i} psychology={p} />
            ))}
          </TouchableOpacity>
        ) : (
          <Text style={styles.noneText}>No specific psychology pattern detected</Text>
        )}
      </View>

      {/* SECTION 4b — What If I Hold */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What If I Hold?</Text>
        <View style={styles.holdCard}>
          <View style={styles.holdRow}>
            <Text style={styles.holdLabel}>Current price vs Stop Loss</Text>
            <Text style={[styles.holdValue, { color: lossIfHold < 0 ? '#FF4757' : '#00C896' }]}>
              {lossIfHold >= 0 ? `+${lossIfHold.toFixed(1)}%` : `${lossIfHold.toFixed(1)}%`} risk
            </Text>
          </View>
          <View style={styles.holdDivider} />
          <Text style={styles.holdVerdict}>
            {urgency === 'IN_ZONE'
              ? '✅ Price is in zone — wait for your entry before trading'
              : urgency === 'ZONE_PASSED'
              ? '🚫 Zone was passed. EXIT the trade if you are holding — do not average down.'
              : urgency === 'NEAR_ZONE'
              ? '⏳ Price approaching zone — be ready, entry may trigger soon'
              : '📊 Zone not yet reached. Stay patient, set a price alert.'}
          </Text>
        </View>
      </View>

      {/* SECTION 5 — Technical Confirmation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technical Confirmation</Text>
        <View style={styles.techCard}>
          <TechRow
            label="Trend Bias"
            value={signal.trend_bias}
            color={signal.trend_bias === 'BULLISH' ? '#00C896' : signal.trend_bias === 'BEARISH' ? '#FF4757' : '#8B8FA8'}
            icon={signal.trend_bias === 'BULLISH' ? '🟢' : signal.trend_bias === 'BEARISH' ? '🔴' : '⚪'}
          />
          <TechRow
            label="Candlestick"
            value={signal.candlestick_pattern ? `${signal.candlestick_pattern.pattern}` : 'None'}
            color={signal.candlestick_pattern?.bullish ? '#00C896' : '#8B8FA8'}
            icon={signal.candlestick_pattern ? '🕯️' : '—'}
          />
          <TechRow
            label="Volume"
            value={`${signal.volume_confirmation.ratio.toFixed(1)}x average${signal.volume_confirmation.confirmed ? ' — Confirmed ✅' : ''}`}
            color={signal.volume_confirmation.confirmed ? '#00C896' : '#8B8FA8'}
            icon="📊"
          />
          <TechRow
            label="RSI"
            value={`${signal.rsi.toFixed(1)} — ${rsiLabel(signal.rsi)}`}
            color={signal.rsi < 30 ? '#00C896' : signal.rsi > 70 ? '#FF4757' : '#8B8FA8'}
            icon="📈"
          />
          <TechRow
            label="Zone"
            value={signal.zone.fresh ? 'Fresh Zone — Never Tested ✅' : `Zone Tested Once ⚠️`}
            color={signal.zone.fresh ? '#00C896' : '#FFD32A'}
            icon={signal.zone.fresh ? '🆕' : '🔄'}
            last
          />
        </View>
      </View>

      {/* SECTION 6 — Add to My Trades */}
      <View style={[styles.section, { paddingBottom: 40 }]}>
        <TouchableOpacity
          style={styles.addTradeBtn}
          onPress={() => {
            setEntryPrice(signal.current_price.toFixed(2))
            setShowAddTrade(true)
          }}
        >
          <Text style={styles.addTradeBtnText}>+ Add to My Trades</Text>
        </TouchableOpacity>
      </View>

      {/* Add Trade Modal */}
      <Modal visible={showAddTrade} transparent animationType="slide" onRequestClose={() => setShowAddTrade(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddTrade(false)}
        >
          <View style={styles.bottomSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to Paper Trades</Text>
            <Text style={styles.sheetSubtitle}>{signal.symbol} · {signal.name}</Text>

            {/* BUY / SHORT toggle */}
            <View style={styles.tradeTypeRow}>
              <TouchableOpacity
                style={[styles.tradeTypeBtn, tradeType === 'BUY' && styles.tradeTypeBuyActive]}
                onPress={() => setTradeType('BUY')}
              >
                <Text style={[styles.tradeTypeTxt, tradeType === 'BUY' && { color: '#00C896', fontWeight: '800' }]}>
                  📈  BUY / LONG
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tradeTypeBtn, tradeType === 'SHORT' && styles.tradeTypeShortActive]}
                onPress={() => setTradeType('SHORT')}
              >
                <Text style={[styles.tradeTypeTxt, tradeType === 'SHORT' && { color: '#FF4757', fontWeight: '800' }]}>
                  📉  SELL / SHORT
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Entry Price (₹)</Text>
            <TextInput
              style={styles.input}
              value={entryPrice}
              onChangeText={setEntryPrice}
              keyboardType="numeric"
              placeholderTextColor="#8B8FA8"
              placeholder={entryMid.toFixed(2)}
            />

            <Text style={styles.inputLabel}>Quantity (shares)</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholderTextColor="#8B8FA8"
              placeholder="e.g. 50"
            />

            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, { height: 72 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor="#8B8FA8"
              placeholder="Your trading notes..."
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddTrade}>
              <Text style={styles.saveBtnText}>Save Trade</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  )
}

function TechRow({
  label,
  value,
  color,
  icon,
  last,
}: {
  label: string
  value: string
  color: string
  icon: string
  last?: boolean
}) {
  return (
    <View style={[techStyles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={techStyles.icon}>{icon}</Text>
      <View style={techStyles.content}>
        <Text style={techStyles.label}>{label}</Text>
        <Text style={[techStyles.value, { color }]}>{value}</Text>
      </View>
    </View>
  )
}

const techStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  icon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    color: '#8B8FA8',
    fontSize: 11,
    marginBottom: 1,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  livePriceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  livePriceSymbol: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  livePriceName: { color: '#8B8FA8', fontSize: 11, marginTop: 1, maxWidth: 180 },
  livePriceRight: { alignItems: 'flex-end', gap: 4 },
  livePriceValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  liveChangeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  liveChangeText: { fontSize: 13, fontWeight: '700' },
  shareBtn: { backgroundColor: '#6C63FF20', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#6C63FF40' },
  shareBtnText: { color: '#6C63FF', fontSize: 11, fontWeight: '700' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0F',
    padding: 32,
  },
  notFoundText: {
    color: '#FF4757',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  backText: {
    color: '#6C63FF',
    fontSize: 14,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    color: '#8B8FA8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerRight: {
    alignItems: 'center',
  },
  confLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginTop: 4,
  },
  stockName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  stockSub: {
    color: '#8B8FA8',
    fontSize: 12,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  signalBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  signalBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  setupCard: {
    backgroundColor: '#13131A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    padding: 14,
  },
  setupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  entryRow: {
    backgroundColor: '#6C63FF15',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  setupLabel: {
    color: '#8B8FA8',
    fontSize: 13,
  },
  entryValue: {
    color: '#6C63FF',
    fontSize: 14,
    fontWeight: '700',
  },
  setupValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1E2E',
    marginVertical: 6,
  },
  rrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  rrItem: {
    flex: 1,
  },
  rrLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginBottom: 2,
  },
  rrValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  techCard: {
    backgroundColor: '#13131A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    paddingHorizontal: 14,
  },
  noneText: {
    color: '#8B8FA8',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
  addTradeBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addTradeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#13131A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#1E1E2E',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#1E1E2E',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  sheetSubtitle: {
    color: '#8B8FA8',
    fontSize: 12,
    marginBottom: 16,
  },
  tradeTypeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  tradeTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#0A0A0F', borderWidth: 1, borderColor: '#1E1E2E',
  },
  tradeTypeBuyActive: { borderColor: '#00C896', backgroundColor: '#00C89615' },
  tradeTypeShortActive: { borderColor: '#FF4757', backgroundColor: '#FF475715' },
  tradeTypeTxt: { color: '#8B8FA8', fontSize: 13 },
  inputLabel: {
    color: '#8B8FA8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0A0A0F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  zoneStatusBox: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  zoneStatusText: { fontSize: 13, fontWeight: '700' },

  fgTrack: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 4,
  },
  fgEmoji: { padding: 4, borderRadius: 8 },
  fgEmojiActive: { backgroundColor: '#1E1E2E' },
  fgLabel: { color: '#8B8FA8', fontSize: 12, textAlign: 'center', marginBottom: 8 },

  psychCard: {
    backgroundColor: '#13131A', borderRadius: 12,
    borderWidth: 1, borderColor: '#1E1E2E', padding: 12,
  },
  psychRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  psychIcon: { fontSize: 18, marginTop: 1 },
  psychInline: { flex: 1, color: '#C0C0D8', fontSize: 13, lineHeight: 20 },
  psychChevron: { color: '#555566', fontSize: 12, marginTop: 3 },

  holdCard: {
    backgroundColor: '#13131A', borderRadius: 12,
    borderWidth: 1, borderColor: '#1E1E2E', padding: 14,
  },
  holdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  holdLabel: { color: '#8B8FA8', fontSize: 13 },
  holdValue: { fontSize: 14, fontWeight: '800' },
  holdDivider: { height: 1, backgroundColor: '#1E1E2E', marginBottom: 10 },
  holdVerdict: { color: '#C0C0D8', fontSize: 13, lineHeight: 20 },
})
