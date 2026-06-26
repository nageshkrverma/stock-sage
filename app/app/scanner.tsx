import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSignals } from '../hooks/useSignals'
import { useTrades } from '../hooks/useTrades'
import { Signal } from '../types/signal'
import { formatINR } from '../utils/formatters'
import ConfidenceRing from '../components/ConfidenceRing'
import { useRouter } from 'expo-router'
import { useAlerts } from '../context/AlertsContext'

import { NSE_STOCKS } from './nse_stocks'

interface StockSuggestion {
  symbol: string
  shortname: string
  exchDisp: string
}

interface StockQuote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketVolume: number
  marketCap: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  regularMarketOpen: number
  regularMarketDayHigh: number
  regularMarketDayLow: number
  regularMarketPreviousClose: number
}

// Local autocomplete — instant, no network
function getLocalSuggestions(query: string): StockSuggestion[] {
  const q = query.toUpperCase()
  return NSE_STOCKS
    .filter((s) => s.symbol.startsWith(q) || s.name.toUpperCase().includes(q))
    .slice(0, 8)
    .map((s) => ({ symbol: s.symbol, shortname: s.name, exchDisp: 'NSE' }))
}

// Replace this URL after deploying the Google Apps Script
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec'

async function fetchStockQuote(nsSymbol: string): Promise<StockQuote | null> {
  const sym = nsSymbol.toUpperCase()
  const localStock = NSE_STOCKS.find((s) => s.symbol === sym)

  try {
    const res = await fetch(`${GAS_URL}?action=quote&symbol=${sym}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.error || !data.price || data.price <= 0) return null
    return {
      symbol: sym,
      shortName: localStock?.name ?? data.name ?? sym,
      regularMarketPrice: data.price,
      regularMarketChange: data.change,
      regularMarketChangePercent: data.changePct,
      regularMarketVolume: data.volume,
      marketCap: data.marketCap,
      fiftyTwoWeekHigh: data.week52High,
      fiftyTwoWeekLow: data.week52Low,
      regularMarketOpen: data.open,
      regularMarketDayHigh: data.high,
      regularMarketDayLow: data.low,
      regularMarketPreviousClose: data.prevClose,
    }
  } catch {
    return null
  }
}

function formatVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
  return String(v)
}

function formatMarketCap(v: number): string {
  if (!v) return '—'
  if (v >= 1e12) return `₹${(v / 1e12).toFixed(2)}L Cr`
  if (v >= 1e9) return `₹${(v / 1e9).toFixed(2)}K Cr`
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  return `₹${v}`
}

export default function ScannerScreen() {
  const { signals } = useSignals()
  const { addTrade } = useTrades()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [tradeModal, setTradeModal] = useState(false)

  const debounceRef = useRef<any>(null)
  const selectingRef = useRef(false)

  const matchedSignal = useMemo(() => {
    if (!quote) return null
    return signals.find((s) => s.symbol === quote.symbol) ?? null
  }, [quote, signals])

  function onChangeQuery(text: string) {
    if (selectingRef.current) return  // ignore Android's spurious onChangeText after setQuery
    setQuery(text)
    setNotFound(false)
    setQuote(null)
    if (text.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const results = getLocalSuggestions(text.trim())
    setSuggestions(results)
    setShowSuggestions(results.length > 0)
  }

  function selectStock(symbol: string, _name: string) {
    setQuery('')
    setShowSuggestions(false)
    setSuggestions([])
    router.push(`/stock/${symbol.toUpperCase()}` as any)
  }

  const isUp = (quote?.regularMarketChangePercent ?? 0) >= 0
  const { addAlert, alerts, checkAlerts } = useAlerts()
  const [alertModal, setAlertModal] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [alertCondition, setAlertCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE')

  // Check alerts when quote loads
  useEffect(() => {
    if (quote) checkAlerts(quote.symbol, quote.regularMarketPrice)
  }, [quote])

  function openAlertModal() {
    setAlertPrice(quote?.regularMarketPrice.toFixed(2) ?? '')
    setAlertCondition('ABOVE')
    setAlertModal(true)
  }

  async function saveAlert() {
    if (!quote || !alertPrice || isNaN(parseFloat(alertPrice))) {
      Alert.alert('Invalid', 'Please enter a valid price.')
      return
    }
    await addAlert({
      symbol: quote.symbol,
      name: quote.shortName,
      condition: alertCondition,
      targetPrice: parseFloat(alertPrice),
      currentPrice: quote.regularMarketPrice,
    })
    setAlertModal(false)
    Alert.alert('✅ Alert Set', `You'll be notified when ${quote.symbol} goes ${alertCondition.toLowerCase()} ₹${alertPrice}`)
  }

  const hasAlert = quote ? alerts.some((a) => a.symbol === quote.symbol && !a.triggered) : false

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="Search any NSE stock symbol..."
            placeholderTextColor="#4A4A6A"
            value={query}
            onChangeText={onChangeQuery}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setQuote(null); setSuggestions([]); setShowSuggestions(false); setNotFound(false) }} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdown suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.dropdown}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s.symbol}
                style={styles.dropdownItem}
                onPress={() => selectStock(s.symbol, s.shortname)}
              >
                <View style={styles.dropdownLeft}>
                  <Text style={styles.dropdownSymbol}>{s.symbol}</Text>
                  <Text style={styles.dropdownName} numberOfLines={1}>{s.shortname}</Text>
                </View>
                <Text style={styles.dropdownExch}>{s.exchDisp}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Empty state */}
      {!quote && !quoteLoading && !notFound && query.length < 2 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>Search any NSE Stock</Text>
          <Text style={styles.emptySub}>Get live price, day change, 52W range{'\n'}and today's signal if available</Text>
          <View style={styles.chipsRow}>
            {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TATAMOTORS', 'ADANIENT'].map((s) => (
              <TouchableOpacity key={s} style={styles.chip} onPress={() => selectStock(s, s)}>
                <Text style={styles.chipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {quoteLoading && (
        <View style={styles.center}>
          <ActivityIndicator color="#6C63FF" size="large" />
          <Text style={styles.loadingText}>Fetching live data…</Text>
        </View>
      )}

      {notFound && !quoteLoading && (
        <View style={styles.center}>
          <Text style={styles.notFoundIcon}>❌</Text>
          <Text style={styles.notFoundTitle}>"{query}" not found</Text>
          <Text style={styles.notFoundSub}>Make sure you enter the exact NSE symbol.{'\n'}Example: RELIANCE, TATASTEEL, HDFCBANK</Text>
        </View>
      )}

      {quote && !quoteLoading && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Price card */}
          <View style={styles.priceCard}>
            <View style={styles.priceCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stockSymbol}>{quote.symbol}</Text>
                <Text style={styles.stockName} numberOfLines={2}>{quote.shortName}</Text>
              </View>
              <View style={styles.priceRight}>
                <Text style={styles.ltp}>{formatINR(quote.regularMarketPrice)}</Text>
                <View style={[styles.changePill, { backgroundColor: isUp ? '#00C89620' : '#FF475720' }]}>
                  <Text style={[styles.changeVal, { color: isUp ? '#00C896' : '#FF4757' }]}>
                    {isUp ? '▲' : '▼'} {Math.abs(quote.regularMarketChange).toFixed(2)}  ({Math.abs(quote.regularMarketChangePercent).toFixed(2)}%)
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.statsGrid}>
              {[
                { label: 'Open', value: formatINR(quote.regularMarketOpen) },
                { label: 'Prev Close', value: formatINR(quote.regularMarketPreviousClose) },
                { label: 'Day High', value: formatINR(quote.regularMarketDayHigh) },
                { label: 'Day Low', value: formatINR(quote.regularMarketDayLow) },
                { label: '52W High', value: formatINR(quote.fiftyTwoWeekHigh) },
                { label: '52W Low', value: formatINR(quote.fiftyTwoWeekLow) },
                { label: 'Volume', value: formatVolume(quote.regularMarketVolume) },
                { label: 'Mkt Cap', value: formatMarketCap(quote.marketCap) },
              ].map(({ label, value }) => (
                <View key={label} style={styles.statBox}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Signal card */}
          {matchedSignal ? (
            <View style={styles.signalCard}>
              <View style={styles.signalHeader}>
                <Text style={styles.signalTitle}>📊 Today's Signal</Text>
                <TouchableOpacity onPress={() => router.push(`/signal/${matchedSignal.id}` as any)}>
                  <Text style={styles.viewDetail}>View Detail →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.signalRow}>
                <View style={[styles.signalBadge, { backgroundColor: matchedSignal.signal_type === 'BUY' ? '#00C89620' : '#FF475720', borderColor: matchedSignal.signal_type === 'BUY' ? '#00C896' : '#FF4757' }]}>
                  <Text style={[styles.signalBadgeText, { color: matchedSignal.signal_type === 'BUY' ? '#00C896' : '#FF4757' }]}>
                    {matchedSignal.signal_type === 'BUY' ? '📈 BUY' : '📉 SHORT'}
                  </Text>
                </View>
                <View style={styles.holdBadge}><Text style={styles.holdText}>{matchedSignal.holding_label}</Text></View>
                <ConfidenceRing confidence={matchedSignal.confidence} size={44} />
              </View>
              <View style={styles.zoneRow}>
                <View style={styles.zoneBox}><Text style={styles.zoneLabel}>Entry Zone</Text><Text style={styles.zoneValue}>{formatINR(matchedSignal.entry.low)} – {formatINR(matchedSignal.entry.high)}</Text></View>
                <View style={styles.zoneBox}><Text style={styles.zoneLabelRed}>Stop Loss</Text><Text style={styles.zoneValue}>{formatINR(matchedSignal.stop_loss)}</Text></View>
              </View>
              <View style={styles.zoneRow}>
                <View style={styles.zoneBox}><Text style={styles.zoneLabelGreen}>Target 1</Text><Text style={styles.zoneValue}>{formatINR(matchedSignal.targets[0]?.price ?? 0)}</Text></View>
                <View style={styles.zoneBox}><Text style={styles.zoneLabelGreen}>Target 2</Text><Text style={styles.zoneValue}>{formatINR(matchedSignal.targets[1]?.price ?? 0)}</Text></View>
              </View>
            </View>
          ) : (
            <View style={styles.noSignalCard}>
              <Text style={styles.noSignalIcon}>🔍</Text>
              <Text style={styles.noSignalText}>No signal for {quote.symbol} in today's scan</Text>
              <Text style={styles.noSignalSub}>You can still add it to your paper trades manually</Text>
            </View>
          )}

          {/* Add to Trade — always visible */}
          <TouchableOpacity
            style={[styles.addTradeBtn, { borderColor: matchedSignal?.signal_type === 'SELL' ? '#FF4757' : '#00C896' }]}
            onPress={() => setTradeModal(true)}
          >
            <Text style={[styles.addTradeBtnText, { color: matchedSignal?.signal_type === 'SELL' ? '#FF4757' : '#00C896' }]}>
              + Add to My Trades
            </Text>
          </TouchableOpacity>

          {/* Set Price Alert */}
          <TouchableOpacity style={[styles.alertBtn, hasAlert && styles.alertBtnActive]} onPress={openAlertModal}>
            <Text style={[styles.alertBtnText, hasAlert && { color: '#FFD700' }]}>
              {hasAlert ? '🔔 Alert Set' : '🔔 Set Price Alert'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Price Alert Modal */}
      <Modal visible={alertModal} transparent animationType="slide" onRequestClose={() => setAlertModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.alertModalBox}>
            <Text style={styles.alertModalTitle}>🔔 Set Price Alert</Text>
            {quote && <Text style={styles.alertModalSub}>{quote.symbol} — Current: ₹{quote.regularMarketPrice.toFixed(2)}</Text>}

            <Text style={styles.alertLabel}>Notify me when price is:</Text>
            <View style={styles.alertConditionRow}>
              <TouchableOpacity
                style={[styles.alertConditionBtn, alertCondition === 'ABOVE' && styles.alertConditionActive]}
                onPress={() => setAlertCondition('ABOVE')}
              >
                <Text style={[styles.alertConditionText, alertCondition === 'ABOVE' && { color: '#00C896' }]}>▲ Above</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alertConditionBtn, alertCondition === 'BELOW' && styles.alertConditionActive]}
                onPress={() => setAlertCondition('BELOW')}
              >
                <Text style={[styles.alertConditionText, alertCondition === 'BELOW' && { color: '#FF4757' }]}>▼ Below</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.alertInput}
              value={alertPrice}
              onChangeText={setAlertPrice}
              keyboardType="numeric"
              placeholder="Enter target price"
              placeholderTextColor="#4A4A6A"
            />

            <View style={styles.alertModalActions}>
              <TouchableOpacity style={styles.alertCancelBtn} onPress={() => setAlertModal(false)}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertSaveBtn} onPress={saveAlert}>
                <Text style={styles.alertSaveText}>Set Alert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {quote && (
        <AddTradeModal
          visible={tradeModal}
          symbol={quote.symbol}
          name={quote.shortName}
          defaultPrice={quote.regularMarketPrice}
          defaultType={matchedSignal?.signal_type === 'SELL' ? 'SHORT' : 'BUY'}
          onClose={() => setTradeModal(false)}
          onAdd={async (type, qty, price) => {
            await addTrade({
              signalId: matchedSignal?.id ?? `${quote.symbol}_manual_${Date.now()}`,
              symbol: quote.symbol,
              name: quote.shortName,
              entryPrice: price,
              quantity: qty,
              trade_type: type,
              entryDate: new Date().toISOString(),
              stopLoss: matchedSignal?.stop_loss,
              targets: matchedSignal?.targets,
              holding_period: matchedSignal?.holding_period,
            })
            setTradeModal(false)
            Alert.alert('Added!', `${quote.symbol} added to your trades.`)
          }}
        />
      )}
    </View>
  )
}

function AddTradeModal({ visible, symbol, name, defaultPrice, defaultType, onClose, onAdd }: {
  visible: boolean; symbol: string; name: string; defaultPrice: number
  defaultType: 'BUY' | 'SHORT'; onClose: () => void
  onAdd: (type: 'BUY' | 'SHORT', qty: number, price: number) => void
}) {
  const [tradeType, setTradeType] = useState<'BUY' | 'SHORT'>(defaultType)
  const [qty, setQty] = useState('10')
  const [price, setPrice] = useState(String(defaultPrice.toFixed(2)))

  useEffect(() => { setPrice(String(defaultPrice.toFixed(2))); setTradeType(defaultType) }, [defaultPrice, defaultType])

  function submit() {
    const q = parseInt(qty), p = parseFloat(price)
    if (!q || q <= 0) { Alert.alert('Invalid qty', 'Enter a valid quantity.'); return }
    if (!p || p <= 0) { Alert.alert('Invalid price', 'Enter a valid price.'); return }
    onAdd(tradeType, q, p)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <Text style={modal.title}>Add to Paper Trades</Text>
          <Text style={modal.symbol}>{symbol} · {name}</Text>
          <View style={modal.toggleRow}>
            <TouchableOpacity style={[modal.toggleBtn, tradeType === 'BUY' && modal.toggleBuyActive]} onPress={() => setTradeType('BUY')}>
              <Text style={[modal.toggleText, tradeType === 'BUY' && { color: '#00C896' }]}>📈  BUY / LONG</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[modal.toggleBtn, tradeType === 'SHORT' && modal.toggleShortActive]} onPress={() => setTradeType('SHORT')}>
              <Text style={[modal.toggleText, tradeType === 'SHORT' && { color: '#FF4757' }]}>📉  SHORT / SELL</Text>
            </TouchableOpacity>
          </View>
          <Text style={modal.label}>Entry Price (₹)</Text>
          <TextInput style={modal.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#4A4A6A" />
          <Text style={modal.label}>Quantity (shares)</Text>
          <TextInput style={modal.input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholderTextColor="#4A4A6A" />
          <Text style={modal.est}>Est. Value: {formatINR((parseFloat(price) || 0) * (parseInt(qty) || 0))}</Text>
          <View style={modal.btnRow}>
            <TouchableOpacity style={modal.cancelBtn} onPress={onClose}><Text style={modal.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[modal.addBtn, { backgroundColor: tradeType === 'BUY' ? '#00C896' : '#FF4757' }]} onPress={submit}>
              <Text style={modal.addText}>+ Add Trade</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, zIndex: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131A',
    borderRadius: 12, borderWidth: 1, borderColor: '#1E1E2E', paddingHorizontal: 14, height: 50,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  clearBtn: { padding: 6 },
  clearText: { color: '#8B8FA8', fontSize: 14 },
  dropdown: {
    backgroundColor: '#1A1A28', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A3A',
    marginTop: 4, overflow: 'hidden', elevation: 10,
  },
  dropdownItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A3A',
  },
  dropdownLeft: { flex: 1 },
  dropdownSymbol: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  dropdownName: { color: '#8B8FA8', fontSize: 12, marginTop: 1 },
  dropdownExch: { color: '#6C63FF', fontSize: 11, fontWeight: '700', backgroundColor: '#6C63FF15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { color: '#8B8FA8', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { backgroundColor: '#13131A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#6C63FF40' },
  chipText: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#8B8FA8', fontSize: 14 },
  notFoundIcon: { fontSize: 36 },
  notFoundTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  notFoundSub: { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  scroll: { padding: 16, paddingBottom: 40 },
  priceCard: { backgroundColor: '#13131A', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#1E1E2E' },
  priceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  stockSymbol: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  stockName: { color: '#8B8FA8', fontSize: 13, marginTop: 3 },
  priceRight: { alignItems: 'flex-end' },
  ltp: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  changePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  changeVal: { fontSize: 13, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statBox: { width: '25%', paddingVertical: 10, paddingHorizontal: 4 },
  statLabel: { color: '#4A4A6A', fontSize: 10, marginBottom: 3 },
  statValue: { color: '#CCCCDD', fontSize: 12, fontWeight: '700' },
  signalCard: { backgroundColor: '#13131A', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#6C63FF40' },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  signalTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  viewDetail: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  signalBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  signalBadgeText: { fontSize: 12, fontWeight: '700' },
  holdBadge: { backgroundColor: '#1E1E2E', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  holdText: { color: '#8B8FA8', fontSize: 12, fontWeight: '600' },
  zoneRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  zoneBox: { flex: 1, backgroundColor: '#0A0A0F', borderRadius: 10, padding: 10 },
  zoneLabel: { color: '#8B8FA8', fontSize: 11, marginBottom: 4 },
  zoneLabelRed: { color: '#FF4757', fontSize: 11, marginBottom: 4 },
  zoneLabelGreen: { color: '#00C896', fontSize: 11, marginBottom: 4 },
  zoneValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  noSignalCard: { backgroundColor: '#13131A', borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#1E1E2E', alignItems: 'center' },
  noSignalIcon: { fontSize: 32, marginBottom: 8 },
  noSignalText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  noSignalSub: { color: '#8B8FA8', fontSize: 12, textAlign: 'center' },
  addTradeBtn: { borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: '#00C89610' },
  addTradeBtnText: { fontSize: 16, fontWeight: '800' },
  alertBtn: { marginHorizontal: 16, marginBottom: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#FFD70060', backgroundColor: '#FFD70010', alignItems: 'center', justifyContent: 'center' },
  alertBtnActive: { borderColor: '#FFD700', backgroundColor: '#FFD70020' },
  alertBtnText: { color: '#FFD700', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  alertModalBox: { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  alertModalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  alertModalSub: { color: '#8B8FA8', fontSize: 13, marginBottom: 20 },
  alertLabel: { color: '#8B8FA8', fontSize: 13, marginBottom: 10 },
  alertConditionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  alertConditionBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' },
  alertConditionActive: { borderColor: '#6C63FF', backgroundColor: '#6C63FF15' },
  alertConditionText: { color: '#8B8FA8', fontSize: 15, fontWeight: '700' },
  alertInput: { backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', color: '#FFFFFF', fontSize: 18, fontWeight: '700', height: 52, paddingHorizontal: 16, marginBottom: 20 },
  alertModalActions: { flexDirection: 'row', gap: 10 },
  alertCancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center' },
  alertCancelText: { color: '#8B8FA8', fontSize: 15, fontWeight: '600' },
  alertSaveBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center' },
  alertSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
})

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#2A2A3A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  symbol: { color: '#8B8FA8', fontSize: 13, marginBottom: 20 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  toggleBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' },
  toggleBuyActive: { borderColor: '#00C896', backgroundColor: '#00C89615' },
  toggleShortActive: { borderColor: '#FF4757', backgroundColor: '#FF475715' },
  toggleText: { color: '#8B8FA8', fontSize: 13, fontWeight: '700' },
  label: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', color: '#FFFFFF', fontSize: 16, paddingHorizontal: 14, height: 48 },
  est: { color: '#4A4A6A', fontSize: 12, marginTop: 8 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#8B8FA8', fontSize: 15, fontWeight: '700' },
  addBtn: { flex: 2, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
})
