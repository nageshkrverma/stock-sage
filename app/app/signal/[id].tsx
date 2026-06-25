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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
                  {signal.signal_type}
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
        <Text style={styles.sectionTitle}>Trade Setup</Text>
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
              <Text style={styles.setupLabel}>{t.label}</Text>
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
              <Text style={styles.rrLabel}>Expected Profit</Text>
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
        <SentimentGauge position={signal.fear_greed_position} />
        <View style={{ height: 12 }} />
        {signal.psychology.map((p, i) => (
          <PsychologyBadge key={i} psychology={p} />
        ))}
        {signal.psychology.length === 0 && (
          <Text style={styles.noneText}>No specific psychology pattern detected</Text>
        )}
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
            value={signal.zone.fresh ? 'Fresh — Never Tested ✅' : `Tested ${signal.zone.touches}× ⚠️`}
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
      <Modal visible={showAddTrade} transparent animationType="slide">
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
})
