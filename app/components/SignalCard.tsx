import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert as RNAlert, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { Signal } from '../types/signal'
import ConfidenceRing from './ConfidenceRing'
import HoldingBadge from './HoldingBadge'
import { formatINR, formatPct } from '../utils/formatters'
import { useAlerts } from '../context/AlertsContext'

interface Props {
  signal: Signal
}

type UrgencyLevel = 'IN_ZONE' | 'NEAR_ZONE' | 'WAITING' | 'ZONE_PASSED'

function getUrgency(signal: Signal): UrgencyLevel {
  const price = signal.current_price ?? 0
  const { low, high } = signal.entry
  const isBuy = signal.signal_type === 'BUY'

  if (price >= low && price <= high) return 'IN_ZONE'

  const nearLow = low * 0.98
  const nearHigh = high * 1.02
  if (price >= nearLow && price <= nearHigh) return 'NEAR_ZONE'

  if (isBuy && price > high * 1.05) return 'ZONE_PASSED'
  if (!isBuy && price < low * 0.95) return 'ZONE_PASSED'

  return 'WAITING'
}

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; bg: string }> = {
  IN_ZONE:     { label: '🎯 IN ZONE',    color: '#00C896', bg: '#00C89622' },
  NEAR_ZONE:   { label: '⚡ NEAR ZONE',  color: '#FFD32A', bg: '#FFD32A22' },
  WAITING:     { label: '⏳ WAITING',    color: '#6C63FF', bg: '#6C63FF22' },
  ZONE_PASSED: { label: '✗ ZONE PASSED', color: '#8B8FA8', bg: '#8B8FA822' },
}

function getPriceContext(signal: Signal): { label: string; color: string } {
  const price = signal.current_price ?? 0
  const { low, high } = signal.entry
  const isBuy = signal.signal_type === 'BUY'

  if (price >= low && price <= high) return { label: 'Price is inside entry zone — ideal entry area', color: '#00C896' }
  if (price < low) {
    return isBuy
      ? { label: `₹${(low - price).toFixed(1)} below entry zone — price needs to rise to enter`, color: '#FFD32A' }
      : { label: `₹${(low - price).toFixed(1)} below entry zone — approaching short zone`, color: '#00C896' }
  }
  return isBuy
    ? { label: `₹${(price - high).toFixed(1)} above entry zone — possible missed entry`, color: '#FF4757' }
    : { label: `₹${(price - high).toFixed(1)} above entry zone — wait for pullback to zone`, color: '#FFD32A' }
}

export default function SignalCard({ signal }: Props) {
  const router = useRouter()
  const { addAlert, alerts } = useAlerts()
  const isBuy = signal.signal_type === 'BUY'
  const dayUp = (signal.day_change_pct ?? 0) >= 0
  const [showAlertModal, setShowAlertModal] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [alertCondition, setAlertCondition] = useState<'ABOVE' | 'BELOW'>(isBuy ? 'BELOW' : 'ABOVE')
  const hasAlert = alerts.some((a) => a.symbol === signal.symbol && !a.triggered)

  const urgency = getUrgency(signal)
  const urgencyConf = URGENCY_CONFIG[urgency]
  const priceCtx = getPriceContext(signal)

  async function handleSetAlert() {
    const price = parseFloat(alertPrice)
    if (isNaN(price) || price <= 0) {
      RNAlert.alert('Invalid price', 'Please enter a valid price.')
      return
    }
    await addAlert({
      symbol: signal.symbol,
      name: signal.name,
      condition: alertCondition,
      targetPrice: price,
      currentPrice: signal.current_price ?? 0,
    })
    setShowAlertModal(false)
    setAlertPrice('')
    RNAlert.alert('Alert Set 🔔', `You'll be notified when ${signal.symbol} goes ${alertCondition.toLowerCase()} ₹${price}`)
  }

  return (
    <TouchableOpacity
      style={[styles.card, urgency === 'IN_ZONE' && styles.cardInZone]}
      onPress={() => router.push(`/signal/${signal.id}` as any)}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={styles.symbolRow}>
            <Text style={styles.symbol}>{signal.symbol}</Text>
            <View style={[styles.urgencyBadge, { backgroundColor: urgencyConf.bg }]}>
              <Text style={[styles.urgencyText, { color: urgencyConf.color }]}>{urgencyConf.label}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.sectorChip}>
              <Text style={styles.sectorText}>{signal.sector}</Text>
            </View>
            <HoldingBadge period={signal.holding_period} label={signal.holding_label} />
            <View style={[styles.signalBadge, { backgroundColor: isBuy ? '#00C89620' : '#FF475720', borderColor: isBuy ? '#00C896' : '#FF4757' }]}>
              <Text style={[styles.signalText, { color: isBuy ? '#00C896' : '#FF4757' }]}>{isBuy ? 'BUY' : 'SELL'}</Text>
            </View>
          </View>
        </View>
        <ConfidenceRing confidence={signal.confidence} size={56} />
      </View>

      {/* LTP row */}
      <View style={styles.ltpRow}>
        <Text style={styles.ltpPrice}>{formatINR(signal.current_price ?? 0)}</Text>
        <View style={[styles.dayChangeBadge, { backgroundColor: dayUp ? '#00C89620' : '#FF475720' }]}>
          <Text style={[styles.dayChangeText, { color: dayUp ? '#00C896' : '#FF4757' }]}>
            {dayUp ? '▲' : '▼'} {Math.abs(signal.day_change_pct ?? 0).toFixed(2)}%
          </Text>
        </View>
      </View>

      <Text style={styles.name} numberOfLines={1}>{signal.name}</Text>

      {/* Price context box */}
      <View style={[styles.priceContextBox, { borderColor: priceCtx.color + '40', backgroundColor: priceCtx.color + '12' }]}>
        <Text style={[styles.priceContextText, { color: priceCtx.color }]}>{priceCtx.label}</Text>
      </View>

      {/* Price grid */}
      <View style={styles.priceGrid}>
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Entry Zone</Text>
          <Text style={styles.priceValue}>{formatINR(signal.entry.low)} – {formatINR(signal.entry.high)}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={[styles.priceLabel, { color: '#FF4757' }]}>Stop Loss</Text>
          <Text style={[styles.priceValue, { color: '#FF4757' }]}>
            {formatINR(signal.stop_loss)} ({formatPct(-signal.stop_loss_pct)})
          </Text>
        </View>
      </View>

      <View style={styles.priceGrid}>
        {signal.targets.map((t, i) => (
          <View key={i} style={styles.priceBox}>
            <Text style={[styles.priceLabel, { color: '#00C896' }]}>{i === 0 ? 'Target 1' : 'Target 2'}</Text>
            <Text style={[styles.priceValue, { color: '#00C896' }]}>
              {formatINR(t.price)} ({formatPct(t.pct)})
            </Text>
          </View>
        ))}
      </View>

      {/* Psychology insights — always visible */}
      {signal.psychology && signal.psychology.length > 0 && (
        <View style={styles.psychSection}>
          {signal.psychology.slice(0, 2).map((p, i) => (
            <View key={i} style={styles.psychRow}>
              <Text style={styles.psychDot}>◆</Text>
              <Text style={styles.psychInline} numberOfLines={2}>
                <Text style={styles.psychLabel}>{p.label}: </Text>
                <Text style={styles.psychDesc}>{p.description}</Text>
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.profitBadge}>
          <Text style={styles.profitText}>📈 Expected Move: {signal.expected_profit.label}</Text>
        </View>
        <TouchableOpacity
          style={[styles.alertBtn, hasAlert && styles.alertBtnActive]}
          onPress={(e) => { e.stopPropagation?.(); setShowAlertModal(true) }}
        >
          <Text style={[styles.alertBtnText, hasAlert && styles.alertBtnTextActive]}>
            {hasAlert ? '🔔 Alert Set' : '🔔 Set Alert'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Data timestamp */}
      {signal.generated_at && (
        <Text style={styles.timestamp}>
          Signal: {new Date(signal.generated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}

      {/* Alert Modal */}
      <Modal visible={showAlertModal} transparent animationType="fade" onRequestClose={() => setShowAlertModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAlertModal(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.modalBox} onPress={() => {}}>
              <Text style={styles.modalTitle}>Set Price Alert</Text>
              <Text style={styles.modalSymbol}>{signal.symbol}</Text>
              <Text style={styles.modalCurrent}>Current: {formatINR(signal.current_price ?? 0)}</Text>

              <View style={styles.conditionRow}>
                <TouchableOpacity
                  style={[styles.condBtn, alertCondition === 'BELOW' && styles.condBtnActive]}
                  onPress={() => setAlertCondition('BELOW')}
                >
                  <Text style={[styles.condText, alertCondition === 'BELOW' && styles.condTextActive]}>Price drops below</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.condBtn, alertCondition === 'ABOVE' && styles.condBtnActive]}
                  onPress={() => setAlertCondition('ABOVE')}
                >
                  <Text style={[styles.condText, alertCondition === 'ABOVE' && styles.condTextActive]}>Price rises above</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.alertInput}
                placeholder="Enter alert price (₹)"
                placeholderTextColor="#4A4A6A"
                keyboardType="numeric"
                value={alertPrice}
                onChangeText={setAlertPrice}
                autoFocus
              />

              <View style={styles.suggestRow}>
                <Text style={styles.suggestLabel}>Quick set:</Text>
                <TouchableOpacity style={styles.suggestChip} onPress={() => { setAlertPrice(String(signal.entry.low)); setAlertCondition('BELOW') }}>
                  <Text style={styles.suggestText}>Entry Low {formatINR(signal.entry.low)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.suggestChip} onPress={() => { setAlertPrice(String(signal.stop_loss)); setAlertCondition('BELOW') }}>
                  <Text style={styles.suggestText}>SL {formatINR(signal.stop_loss)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.suggestChip} onPress={() => { setAlertPrice(String(signal.targets[0]?.price)); setAlertCondition('ABOVE') }}>
                  <Text style={styles.suggestText}>T1 {formatINR(signal.targets[0]?.price)}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAlertModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirm} onPress={handleSetAlert}>
                  <Text style={styles.modalConfirmText}>Set Alert 🔔</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#13131A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardInZone: {
    borderColor: '#00C89650',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  topLeft: {
    flex: 1,
    marginRight: 8,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  urgencyBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  urgencyText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  sectorChip: {
    backgroundColor: '#1E1E2E',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sectorText: {
    color: '#8B8FA8',
    fontSize: 10,
  },
  signalBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ltpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  ltpPrice: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  dayChangeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dayChangeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    color: '#8B8FA8',
    fontSize: 12,
    marginBottom: 8,
  },
  priceContextBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  priceContextText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  priceBox: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    borderRadius: 8,
    padding: 8,
  },
  priceLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginBottom: 2,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  psychSection: {
    marginTop: 8,
    marginBottom: 4,
    gap: 5,
  },
  psychRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  psychDot: {
    color: '#6C63FF',
    fontSize: 8,
    marginTop: 3,
  },
  psychInline: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  psychLabel: {
    color: '#6C63FF',
    fontWeight: '700',
  },
  psychDesc: {
    color: '#A0A0C0',
  },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  profitBadge: {
    backgroundColor: '#00C89615',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  profitText: {
    color: '#00C896',
    fontSize: 11,
    fontWeight: '600',
  },
  alertBtn: {
    backgroundColor: '#1E1E2E',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  alertBtnActive: {
    backgroundColor: '#FFD32A20',
    borderColor: '#FFD32A60',
  },
  alertBtnText: { color: '#8B8FA8', fontSize: 11, fontWeight: '700' },
  alertBtnTextActive: { color: '#FFD32A' },
  timestamp: {
    color: '#3A3A5A',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
  },
  modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#13131A', borderRadius: 18, padding: 22, width: '88%', borderWidth: 1, borderColor: '#1E1E2E' },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSymbol: { color: '#6C63FF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  modalCurrent: { color: '#8B8FA8', fontSize: 12, marginBottom: 16 },
  conditionRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  condBtn: { flex: 1, backgroundColor: '#1E1E2E', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A3A' },
  condBtnActive: { backgroundColor: '#6C63FF20', borderColor: '#6C63FF' },
  condText: { color: '#8B8FA8', fontSize: 12, fontWeight: '600' },
  condTextActive: { color: '#6C63FF', fontWeight: '700' },
  alertInput: { backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', color: '#FFFFFF', fontSize: 18, fontWeight: '700', padding: 14, marginBottom: 12 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 18 },
  suggestLabel: { color: '#4A4A6A', fontSize: 11 },
  suggestChip: { backgroundColor: '#1E1E2E', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  suggestText: { color: '#8B8FA8', fontSize: 11 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, backgroundColor: '#1E1E2E', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalCancelText: { color: '#8B8FA8', fontWeight: '700' },
  modalConfirm: { flex: 1, backgroundColor: '#6C63FF', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '800' },
})
