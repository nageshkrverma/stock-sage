import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTrades } from '../hooks/useTrades'
import { usePortfolio } from '../hooks/usePortfolio'
import TradeCard from '../components/TradeCard'
import { formatINR, formatPct } from '../utils/formatters'
import { PortfolioPosition, VerdictType, VerdictResult } from '../types/analysis'

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec'

type MainTab = 'PAPER' | 'PORTFOLIO'
type TradeTab = 'OPEN' | 'CLOSED'

const VERDICT_CONFIG: Record<VerdictType, { color: string; bg: string; emoji: string; label: string }> = {
  HOLD:         { color: '#6C63FF', bg: '#6C63FF20', emoji: '🤝', label: 'HOLD' },
  EXIT:         { color: '#FF4757', bg: '#FF475720', emoji: '🚪', label: 'EXIT' },
  ADD_MORE:     { color: '#00C896', bg: '#00C89620', emoji: '➕', label: 'ADD MORE' },
  PARTIAL_EXIT: { color: '#FFD32A', bg: '#FFD32A20', emoji: '📤', label: 'PARTIAL EXIT' },
}

interface PositionLiveData {
  price?: number
  verdict?: VerdictResult
  loading: boolean
  error?: string
}

export default function MyTradesScreen() {
  const router = useRouter()
  const { openTrades, closedTrades, loading, portfolioSummary, closeTrade, deleteTrade } = useTrades()
  const { positions, loading: posLoading, addPosition, updatePosition, removePosition } = usePortfolio()

  const [mainTab, setMainTab] = useState<MainTab>('PAPER')
  const [tradeTab, setTradeTab] = useState<TradeTab>('OPEN')
  const [livePnlMap, setLivePnlMap] = useState<Record<string, number>>({})
  const [liveDataMap, setLiveDataMap] = useState<Record<string, PositionLiveData>>({})

  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<PortfolioPosition | null>(null)
  const [addSymbol, setAddSymbol] = useState('')
  const [addName, setAddName] = useState('')
  const [addEntry, setAddEntry] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10))
  const [addLoading, setAddLoading] = useState(false)

  const onLivePnl = useCallback((id: string, pnl: number) => {
    setLivePnlMap((prev) => ({ ...prev, [id]: pnl }))
  }, [])

  // Fetch live data for portfolio when portfolio tab is active
  useEffect(() => {
    if (mainTab !== 'PORTFOLIO' || positions.length === 0) return
    positions.forEach((pos) => {
      setLiveDataMap((prev) => ({ ...prev, [pos.id]: { loading: true } }))
      const ep = pos.entryPrice
      const qty = pos.quantity
      // Fetch live price from GAS + verdict from Render in parallel
      const gasPromise = fetch(`${GAS_URL}?action=quote&symbol=${pos.symbol}`)
        .then((r) => r.json())
        .then((d) => (d.price > 0 ? d.price : null))
        .catch(() => null)

      const renderPromise = fetch(`${GAS_URL}?action=analyse&symbol=${pos.symbol}&entry_price=${ep}&quantity=${qty}`)
        .then((r) => r.json())
        .then((d) => (d.verdict ? d.verdict as VerdictResult : null))
        .catch(() => null)

      Promise.all([gasPromise, renderPromise]).then(([price, verdict]) => {
        setLiveDataMap((prev) => ({
          ...prev,
          [pos.id]: { loading: false, price: price ?? undefined, verdict: verdict ?? undefined },
        }))
      })
    })
  }, [mainTab, positions.length])

  async function handleAddPosition() {
    const sym = addSymbol.trim().toUpperCase()
    const ep = parseFloat(addEntry)
    const qty = parseInt(addQty)
    if (!sym) { Alert.alert('Required', 'Enter a stock symbol.'); return }
    if (isNaN(ep) || ep <= 0) { Alert.alert('Invalid', 'Enter a valid entry price.'); return }
    if (isNaN(qty) || qty <= 0) { Alert.alert('Invalid', 'Enter a valid quantity.'); return }

    setAddLoading(true)
    // Try to get the company name from GAS
    let name = addName.trim() || sym
    if (!addName.trim()) {
      try {
        const d = await fetch(`${GAS_URL}?action=quote&symbol=${sym}`).then((r) => r.json())
        if (d.shortName) name = d.shortName
      } catch {}
    }

    if (editTarget) {
      await updatePosition(editTarget.id, { entryPrice: ep, quantity: qty, entryDate: addDate, name })
    } else {
      await addPosition({ symbol: sym, name, entryPrice: ep, quantity: qty, entryDate: addDate })
    }
    setAddLoading(false)
    resetAddForm()
  }

  function resetAddForm() {
    setShowAddModal(false)
    setEditTarget(null)
    setAddSymbol('')
    setAddName('')
    setAddEntry('')
    setAddQty('')
    setAddDate(new Date().toISOString().slice(0, 10))
  }

  function openEdit(pos: PortfolioPosition) {
    setEditTarget(pos)
    setAddSymbol(pos.symbol)
    setAddName(pos.name)
    setAddEntry(String(pos.entryPrice))
    setAddQty(String(pos.quantity))
    setAddDate(pos.entryDate.slice(0, 10))
    setShowAddModal(true)
  }

  // Paper trades summary
  const totalLivePnl = Object.values(livePnlMap).reduce((s, v) => s + v, 0)
  const livePnlPct = portfolioSummary.totalInvested > 0 ? (totalLivePnl / portfolioSummary.totalInvested) * 100 : 0
  const displayPnl = Object.keys(livePnlMap).length > 0 ? totalLivePnl : portfolioSummary.totalPnl
  const displayPnlPct = Object.keys(livePnlMap).length > 0 ? livePnlPct : portfolioSummary.totalPnlPct
  const pnlPositive = displayPnl >= 0

  // Portfolio summary
  const portfolioTotalInvested = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0)
  const portfolioTotalValue = positions.reduce((s, p) => {
    const live = liveDataMap[p.id]
    const price = live?.price ?? p.entryPrice
    return s + price * p.quantity
  }, 0)
  const portfolioTotalPnl = portfolioTotalValue - portfolioTotalInvested
  const portfolioTotalPnlPct = portfolioTotalInvested > 0 ? (portfolioTotalPnl / portfolioTotalInvested) * 100 : 0
  const verdictCounts = positions.reduce(
    (acc, p) => {
      const v = liveDataMap[p.id]?.verdict?.verdict
      if (v) acc[v] = (acc[v] ?? 0) + 1
      return acc
    },
    {} as Record<VerdictType, number>
  )

  if (loading && mainTab === 'PAPER') {
    return <View style={s.center}><ActivityIndicator color="#6C63FF" /></View>
  }

  return (
    <View style={s.container}>
      {/* MAIN TAB TOGGLE */}
      <View style={s.mainTabRow}>
        <TouchableOpacity style={[s.mainTab, mainTab === 'PAPER' && s.mainTabActive]} onPress={() => setMainTab('PAPER')}>
          <Text style={[s.mainTabText, mainTab === 'PAPER' && s.mainTabTextActive]}>💼 Paper Trades</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.mainTab, mainTab === 'PORTFOLIO' && s.mainTabActive]} onPress={() => setMainTab('PORTFOLIO')}>
          <Text style={[s.mainTabText, mainTab === 'PORTFOLIO' && s.mainTabTextActive]}>📈 My Portfolio</Text>
        </TouchableOpacity>
      </View>

      {/* ─────────────────── PAPER TRADES ─────────────────── */}
      {mainTab === 'PAPER' && (
        <>
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Invested</Text>
                <Text style={s.summaryValue}>{formatINR(portfolioSummary.totalInvested)}</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Open P&L</Text>
                <Text style={[s.summaryValue, { color: pnlPositive ? '#00C896' : '#FF4757' }]}>
                  {pnlPositive ? '+' : '-'}{formatINR(Math.abs(displayPnl))}
                </Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={s.summaryLabel}>Return</Text>
                <Text style={[s.summaryValue, { color: pnlPositive ? '#00C896' : '#FF4757' }]}>
                  {formatPct(displayPnlPct)}
                </Text>
              </View>
            </View>
            <View style={s.summaryRow}>
              <View style={[s.countChip, { borderColor: '#6C63FF40' }]}>
                <Text style={[s.countValue, { color: '#6C63FF' }]}>{portfolioSummary.openCount}</Text>
                <Text style={s.countLabel}>Open</Text>
              </View>
              <View style={[s.countChip, { borderColor: '#8B8FA840' }]}>
                <Text style={[s.countValue, { color: '#8B8FA8' }]}>{portfolioSummary.closedCount}</Text>
                <Text style={s.countLabel}>Closed</Text>
              </View>
            </View>
          </View>

          <View style={s.tabRow}>
            {(['OPEN', 'CLOSED'] as TradeTab[]).map((t) => (
              <TouchableOpacity key={t} style={[s.tab, tradeTab === t && s.tabActive]} onPress={() => setTradeTab(t)}>
                <Text style={[s.tabText, tradeTab === t && s.tabTextActive]}>
                  {t === 'OPEN' ? `Open Trades (${openTrades.length})` : `Closed (${closedTrades.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(tradeTab === 'OPEN' ? openTrades : closedTrades).length === 0 ? (
            <View style={s.center}>
              <Text style={s.emptyText}>{tradeTab === 'OPEN' ? 'No open trades' : 'No closed trades yet'}</Text>
              <Text style={s.emptySub}>{tradeTab === 'OPEN' ? 'Find a signal and tap "Add to My Trades"' : 'Close a trade to see it here'}</Text>
            </View>
          ) : (
            <FlatList
              data={tradeTab === 'OPEN' ? openTrades : closedTrades}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TradeCard trade={item} onClose={closeTrade} onDelete={deleteTrade} onLivePnl={onLivePnl} />
              )}
              contentContainerStyle={s.list}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* ─────────────────── MY PORTFOLIO ─────────────────── */}
      {mainTab === 'PORTFOLIO' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
          {/* Portfolio Summary Card */}
          {positions.length > 0 && (
            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Invested</Text>
                  <Text style={s.summaryValue}>{formatINR(portfolioTotalInvested)}</Text>
                </View>
                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Current Value</Text>
                  <Text style={s.summaryValue}>{formatINR(portfolioTotalValue)}</Text>
                </View>
                <View style={s.summaryItem}>
                  <Text style={s.summaryLabel}>Total P&L</Text>
                  <Text style={[s.summaryValue, { color: portfolioTotalPnl >= 0 ? '#00C896' : '#FF4757' }]}>
                    {portfolioTotalPnl >= 0 ? '+' : '-'}{formatINR(Math.abs(portfolioTotalPnl))}
                  </Text>
                </View>
              </View>
              {Object.keys(verdictCounts).length > 0 && (
                <View style={s.verdictCountRow}>
                  {(Object.entries(verdictCounts) as [VerdictType, number][]).map(([v, count]) => (
                    <View key={v} style={[s.verdictCountChip, { borderColor: VERDICT_CONFIG[v].color + '60', backgroundColor: VERDICT_CONFIG[v].bg }]}>
                      <Text style={[s.verdictCountText, { color: VERDICT_CONFIG[v].color }]}>{VERDICT_CONFIG[v].emoji} {VERDICT_CONFIG[v].label}: {count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Add Position Button */}
          <TouchableOpacity style={s.addPositionBtn} onPress={() => { resetAddForm(); setShowAddModal(true) }}>
            <Text style={s.addPositionText}>+ Add Stock Position</Text>
          </TouchableOpacity>

          {posLoading ? (
            <View style={s.center}><ActivityIndicator color="#6C63FF" /></View>
          ) : positions.length === 0 ? (
            <View style={[s.center, { paddingVertical: 40 }]}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
              <Text style={s.emptyText}>No positions yet</Text>
              <Text style={s.emptySub}>Add stocks you own to track performance{'\n'}and get personalised verdicts</Text>
            </View>
          ) : (
            positions.map((pos) => {
              const live = liveDataMap[pos.id]
              const currentPrice = live?.price ?? pos.entryPrice
              const pnl = (currentPrice - pos.entryPrice) * pos.quantity
              const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
              const invested = pos.entryPrice * pos.quantity
              const verdict = live?.verdict

              return (
                <TouchableOpacity
                  key={pos.id}
                  style={[s.posCard, verdict && { borderColor: VERDICT_CONFIG[verdict.verdict].color + '40' }]}
                  onPress={() => router.push(`/stock/${pos.symbol}?entry=${pos.entryPrice}&qty=${pos.quantity}` as any)}
                >
                  <View style={s.posHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.posSymbol}>{pos.symbol}</Text>
                      <Text style={s.posName} numberOfLines={1}>{pos.name}</Text>
                    </View>
                    {live?.loading ? (
                      <ActivityIndicator color="#6C63FF" size="small" />
                    ) : verdict ? (
                      <View style={[s.verdictBadge, { backgroundColor: VERDICT_CONFIG[verdict.verdict].bg, borderColor: VERDICT_CONFIG[verdict.verdict].color }]}>
                        <Text style={[s.verdictBadgeText, { color: VERDICT_CONFIG[verdict.verdict].color }]}>
                          {VERDICT_CONFIG[verdict.verdict].emoji} {VERDICT_CONFIG[verdict.verdict].label}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={s.posMetrics}>
                    <View style={s.posMetric}>
                      <Text style={s.posMetricLabel}>Invested</Text>
                      <Text style={s.posMetricValue}>{formatINR(invested)}</Text>
                    </View>
                    <View style={s.posMetric}>
                      <Text style={s.posMetricLabel}>Current</Text>
                      <Text style={s.posMetricValue}>{formatINR(currentPrice * pos.quantity)}</Text>
                    </View>
                    <View style={s.posMetric}>
                      <Text style={s.posMetricLabel}>P&L</Text>
                      <Text style={[s.posMetricValue, { color: pnl >= 0 ? '#00C896' : '#FF4757' }]}>
                        {pnl >= 0 ? '+' : '-'}{formatINR(Math.abs(pnl))}{'\n'}
                        <Text style={{ fontSize: 11 }}>{formatPct(pnlPct)}</Text>
                      </Text>
                    </View>
                  </View>

                  <Text style={s.posEntryInfo}>{pos.quantity} shares · Entry {formatINR(pos.entryPrice)} · LTP {formatINR(currentPrice)}</Text>

                  <View style={s.posActions}>
                    <TouchableOpacity style={s.posEditBtn} onPress={(e) => { e.stopPropagation?.(); openEdit(pos) }}>
                      <Text style={s.posEditText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.posDeleteBtn} onPress={(e) => {
                      e.stopPropagation?.()
                      Alert.alert('Remove Position', `Remove ${pos.symbol} from your portfolio?`, [
                        { text: 'Cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removePosition(pos.id) },
                      ])
                    }}>
                      <Text style={s.posDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      )}

      {/* ADD / EDIT POSITION MODAL */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={resetAddForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={resetAddForm}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>{editTarget ? 'Edit Position' : 'Add Stock Position'}</Text>
            <Text style={s.sheetSub}>Track your real holdings and get personalised verdicts</Text>

            <Text style={s.fieldLabel}>Stock Symbol (NSE)</Text>
            <TextInput
              style={[s.fieldInput, editTarget && { color: '#4A4A6A' }]}
              value={addSymbol}
              onChangeText={(t) => setAddSymbol(t.toUpperCase())}
              placeholder="e.g. RELIANCE"
              placeholderTextColor="#4A4A6A"
              autoCapitalize="characters"
              editable={!editTarget}
            />

            <Text style={s.fieldLabel}>Company Name (optional)</Text>
            <TextInput style={s.fieldInput} value={addName} onChangeText={setAddName} placeholder="Auto-filled if left blank" placeholderTextColor="#4A4A6A" />

            <Text style={s.fieldLabel}>My Entry Price (₹)</Text>
            <TextInput style={s.fieldInput} value={addEntry} onChangeText={setAddEntry} keyboardType="numeric" placeholder="Average buy price" placeholderTextColor="#4A4A6A" />

            <Text style={s.fieldLabel}>Quantity (shares)</Text>
            <TextInput style={s.fieldInput} value={addQty} onChangeText={setAddQty} keyboardType="numeric" placeholder="Total shares held" placeholderTextColor="#4A4A6A" />

            <Text style={s.fieldLabel}>Purchase Date</Text>
            <TextInput style={s.fieldInput} value={addDate} onChangeText={setAddDate} placeholder="YYYY-MM-DD" placeholderTextColor="#4A4A6A" />

            {addEntry && addQty ? (
              <Text style={s.estInvested}>Investment: {formatINR(parseFloat(addEntry || '0') * parseInt(addQty || '0'))}</Text>
            ) : null}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={resetAddForm}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, addLoading && { opacity: 0.6 }]} onPress={handleAddPosition} disabled={addLoading}>
                {addLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{editTarget ? 'Save Changes' : '+ Add Position'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  mainTabRow: { flexDirection: 'row', margin: 16, marginBottom: 4, backgroundColor: '#13131A', borderRadius: 12, padding: 3, borderWidth: 1, borderColor: '#1E1E2E' },
  mainTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  mainTabActive: { backgroundColor: '#6C63FF20', borderWidth: 1, borderColor: '#6C63FF40' },
  mainTabText: { color: '#4A4A6A', fontSize: 13, fontWeight: '700' },
  mainTabTextActive: { color: '#6C63FF' },

  summaryCard: { backgroundColor: '#13131A', margin: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#1E1E2E', padding: 14, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1 },
  summaryLabel: { color: '#8B8FA8', fontSize: 10, marginBottom: 2 },
  summaryValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  countChip: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  countValue: { fontSize: 20, fontWeight: '800' },
  countLabel: { color: '#8B8FA8', fontSize: 10, marginTop: 2 },
  verdictCountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  verdictCountChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  verdictCountText: { fontSize: 11, fontWeight: '700' },

  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#13131A', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: '#1E1E2E' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#6C63FF20' },
  tabText: { color: '#8B8FA8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#6C63FF' },

  list: { paddingTop: 4, paddingBottom: 24 },
  emptyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  addPositionBtn: { marginHorizontal: 16, marginBottom: 12, height: 50, backgroundColor: '#6C63FF20', borderRadius: 12, borderWidth: 1, borderColor: '#6C63FF', alignItems: 'center', justifyContent: 'center' },
  addPositionText: { color: '#6C63FF', fontSize: 15, fontWeight: '800' },

  posCard: { backgroundColor: '#13131A', borderRadius: 14, borderWidth: 1, borderColor: '#1E1E2E', padding: 14, marginHorizontal: 16, marginBottom: 12 },
  posHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  posSymbol: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  posName: { color: '#8B8FA8', fontSize: 11, marginTop: 2 },
  verdictBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  verdictBadgeText: { fontSize: 11, fontWeight: '800' },
  posMetrics: { flexDirection: 'row', marginBottom: 10 },
  posMetric: { flex: 1 },
  posMetricLabel: { color: '#8B8FA8', fontSize: 10, marginBottom: 2 },
  posMetricValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  posEntryInfo: { color: '#4A4A6A', fontSize: 10, marginBottom: 10 },
  posActions: { flexDirection: 'row', gap: 8 },
  posEditBtn: { flex: 1, height: 36, backgroundColor: '#1E1E2E', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  posEditText: { color: '#8B8FA8', fontSize: 12, fontWeight: '600' },
  posDeleteBtn: { width: 36, height: 36, backgroundColor: '#FF475715', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  posDeleteText: { color: '#FF4757', fontSize: 13, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: '#2A2A3A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sheetSub: { color: '#8B8FA8', fontSize: 13, marginBottom: 20 },
  fieldLabel: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fieldInput: { backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', color: '#FFFFFF', fontSize: 15, paddingHorizontal: 14, height: 48, marginBottom: 12 },
  estInvested: { color: '#4A4A6A', fontSize: 12, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 50, backgroundColor: '#1E1E2E', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#8B8FA8', fontSize: 14, fontWeight: '700' },
  saveBtn: { flex: 2, height: 50, backgroundColor: '#6C63FF', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
})
