import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Signal } from '../types/signal'
import ConfidenceRing from './ConfidenceRing'
import HoldingBadge from './HoldingBadge'
import { formatINR, formatPct } from '../utils/formatters'

interface Props {
  signal: Signal
}

export default function SignalCard({ signal }: Props) {
  const router = useRouter()
  const isBuy = signal.signal_type === 'BUY'
  const entryMid = (signal.entry.low + signal.entry.high) / 2
  const dayUp = (signal.day_change_pct ?? 0) >= 0

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/signal/${signal.id}` as any)}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.sectorChip}>
              <Text style={styles.sectorText}>{signal.sector}</Text>
            </View>
            <HoldingBadge period={signal.holding_period} label={signal.holding_label} />
            <View style={[styles.signalBadge, { backgroundColor: isBuy ? '#00C89620' : '#FF475720', borderColor: isBuy ? '#00C896' : '#FF4757' }]}>
              <Text style={[styles.signalText, { color: isBuy ? '#00C896' : '#FF4757' }]}>{signal.signal_type}</Text>
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

      {/* Entry / SL / Targets */}
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
            <Text style={[styles.priceLabel, { color: '#00C896' }]}>{t.label}</Text>
            <Text style={[styles.priceValue, { color: '#00C896' }]}>
              {formatINR(t.price)} ({formatPct(t.pct)})
            </Text>
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.profitBadge}>
          <Text style={styles.profitText}>📈 {signal.expected_profit.label} expected</Text>
        </View>
        <View style={styles.psychRow}>
          {signal.psychology.slice(0, 2).map((p, i) => (
            <View key={i} style={styles.psychChip}>
              <Text style={styles.psychText} numberOfLines={1}>{p.label}</Text>
            </View>
          ))}
        </View>
      </View>
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
  symbol: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
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
    marginBottom: 10,
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
  psychRow: {
    flexDirection: 'row',
    gap: 5,
  },
  psychChip: {
    backgroundColor: '#6C63FF20',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    maxWidth: 130,
  },
  psychText: {
    color: '#6C63FF',
    fontSize: 9,
    fontWeight: '600',
  },
})
