import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { TradeEntry } from '../types/signal'
import { formatINR, formatPct, formatDaysHeld } from '../utils/formatters'
import { calcProgress } from '../utils/tradeCalculator'

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec'

interface Props {
  trade: TradeEntry
  onClose: (id: string, exitPrice: number) => void
  onDelete: (id: string) => void
}

export default function TradeCard({ trade, onClose, onDelete }: Props) {
  const router = useRouter()
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [exitPriceInput, setExitPriceInput] = useState('')
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)

  const isOpen = trade.status === 'OPEN'

  useEffect(() => {
    if (!isOpen) return
    setLoadingPrice(true)
    const sym = trade.symbol.replace(/\.(NS|BO)$/i, '')
    fetch(`${GAS_URL}?action=quote&symbol=${sym}`)
      .then(r => r.json())
      .then(d => {
        const price = d.price ?? d.regularMarketPrice ?? d.currentPrice
        if (price && price > 0) setLivePrice(Number(price))
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false))
  }, [trade.symbol, isOpen])

  const currentPrice = isOpen ? (livePrice ?? trade.entryPrice) : (trade.exitPrice ?? trade.entryPrice)
  const pnl = trade.pnl ?? ((currentPrice - trade.entryPrice) * trade.quantity)
  const pnlPct = trade.pnlPct ?? ((currentPrice - trade.entryPrice) / trade.entryPrice * 100)
  const invested = trade.entryPrice * trade.quantity
  const progress = calcProgress(trade.entryPrice, currentPrice, trade.stopLoss, trade.targets)

  const statusColor =
    trade.status === 'OPEN' ? '#6C63FF'
    : trade.status === 'SL_HIT' ? '#FF4757'
    : '#00C896'

  function handleClose() {
    const price = parseFloat(exitPriceInput)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid exit price')
      return
    }
    onClose(trade.id, price)
    setShowCloseForm(false)
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <View style={styles.symbolRow}>
            <Text style={styles.symbol}>{trade.symbol}</Text>
            {trade.trade_type && (
              <View style={[styles.typeBadge, { backgroundColor: trade.trade_type === 'BUY' ? '#00C89620' : '#FF475720', borderColor: trade.trade_type === 'BUY' ? '#00C896' : '#FF4757' }]}>
                <Text style={[styles.typeText, { color: trade.trade_type === 'BUY' ? '#00C896' : '#FF4757' }]}>
                  {trade.trade_type === 'BUY' ? '▲ BUY' : '▼ SHORT'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.meta}>
            {trade.quantity} shares · Entered {formatDaysHeld(trade.entryDate)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{trade.status.replace('_', ' ')}</Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Entry</Text>
          <Text style={styles.priceValue}>{formatINR(trade.entryPrice)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>
            {isOpen ? (loadingPrice ? 'Fetching...' : 'Live Price') : 'Exit'}
          </Text>
          {loadingPrice ? (
            <ActivityIndicator size="small" color="#6C63FF" style={{ marginTop: 4 }} />
          ) : (
            <Text style={[styles.priceValue, { color: pnl >= 0 ? '#00C896' : '#FF4757' }]}>
              {formatINR(currentPrice)}
            </Text>
          )}
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>P&L</Text>
          <Text style={[styles.priceValue, { color: pnl >= 0 ? '#00C896' : '#FF4757' }]}>
            {formatINR(Math.abs(pnl))}{'\n'}{formatPct(pnlPct)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>SL</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(2, progress * 100)}%` as any, backgroundColor: pnl >= 0 ? '#00C896' : '#FF4757' }]} />
          <View style={[styles.progressDot, { left: `${Math.max(2, progress * 100)}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>T2</Text>
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressSublabel}>{formatINR(trade.stopLoss)}</Text>
        <Text style={styles.progressSublabel}>{formatINR(trade.targets[1]?.price ?? trade.targets[0]?.price ?? 0)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.push(`/signal/${trade.signalId}` as any)}
        >
          <Text style={styles.viewBtnText}>View Signal</Text>
        </TouchableOpacity>
        {isOpen && (
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setShowCloseForm((v) => !v)}
          >
            <Text style={styles.closeBtnText}>Close Trade</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => Alert.alert('Delete Trade', 'Remove this trade from your history?', [
            { text: 'Cancel' },
            { text: 'Delete', onPress: () => onDelete(trade.id), style: 'destructive' },
          ])}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {showCloseForm && (
        <View style={styles.closeForm}>
          <TextInput
            style={styles.input}
            placeholder="Exit price"
            placeholderTextColor="#8B8FA8"
            value={exitPriceInput}
            onChangeText={setExitPriceInput}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.confirmBtn} onPress={handleClose}>
            <Text style={styles.confirmBtnText}>Confirm Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  meta: {
    color: '#8B8FA8',
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  priceItem: {
    flex: 1,
  },
  priceLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginBottom: 2,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  progressLabel: {
    color: '#8B8FA8',
    fontSize: 9,
    width: 20,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#1E1E2E',
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressDot: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#0A0A0F',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  progressSublabel: {
    color: '#8B8FA8',
    fontSize: 9,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewBtn: {
    flex: 1,
    backgroundColor: '#1E1E2E',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewBtnText: {
    color: '#8B8FA8',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    flex: 1,
    backgroundColor: '#6C63FF20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6C63FF',
    paddingVertical: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#FF475720',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#FF4757',
    fontSize: 12,
    fontWeight: '700',
  },
  closeForm: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  confirmBtn: {
    backgroundColor: '#00C896',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#0A0A0F',
    fontWeight: '700',
    fontSize: 12,
  },
})
