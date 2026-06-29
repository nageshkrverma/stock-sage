import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSignals, filterSignals } from '../hooks/useSignals'
import { Signal } from '../types/signal'
import SignalCard from '../components/SignalCard'
import { formatRelativeTime } from '../utils/formatters'
import { useAuth } from '../context/AuthContext'

const HOLDING_FILTERS = [
  { key: 'ALL',    label: 'All',     periods: [] },
  { key: '7D',     label: '⚡ 1-7D', periods: ['7D'] },
  { key: '15-30D', label: '15-30D',  periods: ['15D', '30D'] },
  { key: '1-3M',   label: '1-3M',    periods: ['3M'] },
  { key: '6M-1Y',  label: '6M-1Y',   periods: ['6M', '1Y'] },
]

type SortKey = 'confidence' | 'day_change' | 'price_asc' | 'price_desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'confidence', label: '% Probability' },
  { key: 'day_change', label: '% Day Change' },
  { key: 'price_asc',  label: 'Price: Low → High' },
  { key: 'price_desc', label: 'Price: High → Low' },
]

function sortSignals(signals: Signal[], key: SortKey): Signal[] {
  return [...signals].sort((a, b) => {
    if (key === 'confidence') return b.confidence - a.confidence
    if (key === 'day_change') return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0)
    if (key === 'price_asc') return (a.current_price ?? 0) - (b.current_price ?? 0)
    if (key === 'price_desc') return (b.current_price ?? 0) - (a.current_price ?? 0)
    return 0
  })
}

export default function HomeScreen() {
  const router = useRouter()
  const { profile, daysLeftInTrial, isTrialActive, isAdmin } = useAuth()
  const { signals, isLoading, error, refetch, lastUpdated, isFromHistory } = useSignals()
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [activeSort, setActiveSort] = useState<SortKey>('confidence')
  const [refreshing, setRefreshing] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'BUY' | 'SHORT'>('ALL')

  const filtered = useMemo(() => {
    const tab = HOLDING_FILTERS.find((f) => f.key === activeFilter)
    const f = filterSignals(signals, {
      holding: tab?.periods.length ? tab.periods : undefined,
    })
    const byType = signalFilter === 'ALL' ? f : f.filter((s) => s.signal_type === (signalFilter === 'SHORT' ? 'SELL' : signalFilter))
    return sortSignals(byType, activeSort)
  }, [signals, activeFilter, activeSort, signalFilter])

  const allCount  = useMemo(() => {
    const tab = HOLDING_FILTERS.find((f) => f.key === activeFilter)
    return filterSignals(signals, { holding: tab?.periods.length ? tab.periods : undefined }).length
  }, [signals, activeFilter])
  const buyCount  = useMemo(() => {
    const tab = HOLDING_FILTERS.find((f) => f.key === activeFilter)
    return filterSignals(signals, { holding: tab?.periods.length ? tab.periods : undefined }).filter((s) => s.signal_type === 'BUY').length
  }, [signals, activeFilter])
  const sellCount = useMemo(() => {
    const tab = HOLDING_FILTERS.find((f) => f.key === activeFilter)
    return filterSignals(signals, { holding: tab?.periods.length ? tab.periods : undefined }).filter((s) => s.signal_type === 'SELL').length
  }, [signals, activeFilter])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const renderItem = useCallback(({ item }: { item: Signal }) => <SignalCard signal={item} />, [])
  const keyExtractor = useCallback((item: Signal) => item.id, [])
  const activeSortLabel = SORT_OPTIONS.find((s) => s.key === activeSort)?.label ?? 'Sort'

  const daysLeft = daysLeftInTrial()
  const trialActive = isTrialActive()

  return (
    <View style={styles.container}>
      {/* Trial warning banner */}
      {profile && !trialActive && (
        <TouchableOpacity style={styles.trialExpiredBar} onPress={() => router.push('/paywall' as any)}>
          <Text style={styles.trialExpiredText}>⚠️ Trial expired — tap to subscribe ₹499/month</Text>
        </TouchableOpacity>
      )}
      {profile && trialActive && daysLeft <= 5 && (
        <TouchableOpacity style={styles.trialWarnBar} onPress={() => router.push('/paywall' as any)}>
          <Text style={styles.trialWarnText}>⏳ {daysLeft} days left in trial — tap to subscribe</Text>
        </TouchableOpacity>
      )}

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryChip label="Total" value={allCount}  color="#6C63FF" active={signalFilter === 'ALL'}   onPress={() => setSignalFilter('ALL')} />
        <SummaryChip label="BUY"   value={buyCount}  color="#00C896" active={signalFilter === 'BUY'}   onPress={() => setSignalFilter('BUY')} />
        <SummaryChip label="SHORT" value={sellCount} color="#FF4757" active={signalFilter === 'SHORT'} onPress={() => setSignalFilter('SHORT')} />
        {lastUpdated && (
          <Text style={styles.updated}>🕐 {formatRelativeTime(lastUpdated)}</Text>
        )}
      </View>

      {/* History fallback banner */}
      {isFromHistory && (
        <View style={styles.historyBanner}>
          <Text style={styles.historyBannerText}>
            📊 Price moved away from zones — showing last valid signals. New signals appear when price returns to a zone.
          </Text>
        </View>
      )}

      {/* Holding filter chips — all 5 fit in one row */}
      <View style={styles.filterRow}>
        {HOLDING_FILTERS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.filterChip, activeFilter === item.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(item.key)}
          >
            <Text style={[styles.filterChipText, activeFilter === item.key && styles.filterChipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort row */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(!showSort)}>
          <Text style={styles.sortBtnText}>{activeSortLabel} ▾</Text>
        </TouchableOpacity>
      </View>

      {showSort && (
        <View style={styles.sortDropdown}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortOption, activeSort === opt.key && styles.sortOptionActive]}
              onPress={() => { setActiveSort(opt.key); setShowSort(false) }}
            >
              <Text style={[styles.sortOptionText, activeSort === opt.key && styles.sortOptionActive && { color: '#6C63FF', fontWeight: '700' }]}>
                {activeSort === opt.key ? '✓  ' : '    '}{opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C63FF" size="large" />
          <Text style={styles.loadingText}>Scanning markets...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠️ Failed to load signals</Text>
          <Text style={styles.errorSub}>Check your internet connection</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No signals found</Text>
          <Text style={styles.emptySub}>
            {activeFilter !== 'ALL'
              ? 'No stocks match this time frame today'
              : 'Check back after 3:45 PM on a trading day'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" colors={['#6C63FF']} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

function SummaryChip({ label, value, color, active, onPress }: { label: string; value: number; color: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[chip.wrap, { borderColor: active ? color : color + '30', backgroundColor: active ? color + '20' : 'transparent' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[chip.value, { color }]}>{value}</Text>
      <Text style={chip.label}>{label}</Text>
    </TouchableOpacity>
  )
}

const chip = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center' },
  value: { fontSize: 20, fontWeight: '800' },
  label: { color: '#8B8FA8', fontSize: 10, fontWeight: '600', marginTop: 1 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  trialExpiredBar: { backgroundColor: '#FF475720', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FF4757' },
  trialExpiredText: { color: '#FF4757', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  trialWarnBar: { backgroundColor: '#FF990020', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FF9900' },
  trialWarnText: { color: '#FF9900', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  summaryBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, alignItems: 'center' },
  updated: { flex: 1, color: '#8B8FA8', fontSize: 10, textAlign: 'right' },
  historyBanner: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#1A1A2E', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#6C63FF40' },
  historyBannerText: { color: '#A0A0C0', fontSize: 12, lineHeight: 18 },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, gap: 6,
    alignItems: 'center', paddingVertical: 6, marginBottom: 2,
  },
  filterChip: {
    flex: 1, backgroundColor: '#13131A', borderRadius: 18,
    paddingVertical: 7, borderWidth: 1, borderColor: '#1E1E2E',
    alignItems: 'center',
  },
  filterChipActive: { borderColor: '#6C63FF', backgroundColor: '#6C63FF20' },
  filterChipText: { color: '#8B8FA8', fontSize: 11, fontWeight: '600' },
  filterChipTextActive: { color: '#6C63FF' },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 },
  sortLabel: { color: '#8B8FA8', fontSize: 12 },
  sortBtn: {
    backgroundColor: '#13131A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#6C63FF40',
  },
  sortBtnText: { color: '#6C63FF', fontSize: 12, fontWeight: '700' },
  sortDropdown: {
    marginHorizontal: 16, backgroundColor: '#13131A', borderRadius: 12,
    borderWidth: 1, borderColor: '#1E1E2E', marginBottom: 8, overflow: 'hidden',
  },
  sortOption: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  sortOptionActive: { backgroundColor: '#6C63FF12' },
  sortOptionText: { color: '#FFFFFF', fontSize: 13 },
  list: { paddingTop: 6, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8B8FA8', marginTop: 12, fontSize: 14 },
  errorText: { color: '#FF4757', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  errorSub: { color: '#8B8FA8', fontSize: 13, marginBottom: 16 },
  retryBtn: { backgroundColor: '#6C63FF', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  emptyText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
})
