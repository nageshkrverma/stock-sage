import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, ScrollView, Modal, Animated,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSignals, filterSignals } from '../hooks/useSignals'
import { Signal } from '../types/signal'
import SignalCard, { getUrgency, DISMISSED_KEY } from '../components/SignalCard'
import { formatRelativeTime } from '../utils/formatters'
import { useAuth } from '../context/AuthContext'

type UrgencyLevel = 'IN_ZONE' | 'NEAR_ZONE' | 'WAITING' | 'ZONE_PASSED'

const URGENCY_ORDER: Record<UrgencyLevel, number> = { IN_ZONE: 0, NEAR_ZONE: 1, WAITING: 2, ZONE_PASSED: 3 }

const HOLDING_FILTERS = [
  { key: 'ALL',    label: 'All',   periods: [] as string[] },
  { key: '15D',    label: '15D',   periods: ['15D'] },
  { key: '30D',    label: '30D',   periods: ['30D'] },
  { key: '3M',     label: '3M',    periods: ['3M'] },
  { key: '6M-1Y',  label: '6M-1Y', periods: ['6M', '1Y'] },
]

type SortKey = 'confidence' | 'day_change' | 'price_asc' | 'price_desc' | 'urgency'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'urgency',    label: '🎯 Zone Urgency' },
  { key: 'confidence', label: '% Probability' },
  { key: 'day_change', label: '% Day Change' },
  { key: 'price_asc',  label: 'Price: Low → High' },
  { key: 'price_desc', label: 'Price: High → Low' },
]

function sortSignals(signals: Signal[], key: SortKey): Signal[] {
  return [...signals].sort((a, b) => {
    if (key === 'urgency')    return URGENCY_ORDER[getUrgency(a)] - URGENCY_ORDER[getUrgency(b)]
    if (key === 'confidence') return b.confidence - a.confidence
    if (key === 'day_change') return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0)
    if (key === 'price_asc')  return (a.current_price ?? 0) - (b.current_price ?? 0)
    if (key === 'price_desc') return (b.current_price ?? 0) - (a.current_price ?? 0)
    return 0
  })
}

function getISTTime(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

const FILTER_KEY = 'tradingbabaji_last_filter'
const SORT_KEY   = 'tradingbabaji_last_sort'

type SectionItem = Signal | { type: 'show_more'; count: number }

export default function HomeScreen() {
  const router = useRouter()
  const { profile, daysLeftInTrial, isTrialActive } = useAuth()
  const { signals, isLoading, error, refetch, lastUpdated, isFromHistory } = useSignals()

  const [activeFilter,   setActiveFilter]   = useState('ALL')
  const [activeSort,     setActiveSort]     = useState<SortKey>('urgency')
  const [signalDir,      setSignalDir]      = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [refreshing,     setRefreshing]     = useState(false)
  const [showSortSheet,  setShowSortSheet]  = useState(false)
  const [allExpanded,    setAllExpanded]    = useState(false)
  const [dismissedMap,   setDismissedMap]   = useState<Record<string, string>>({})
  const [istTime,        setIstTime]        = useState(getISTTime())

  const dotPulse = useRef(new Animated.Value(0.3)).current

  // Live IST clock
  useEffect(() => {
    const t = setInterval(() => setIstTime(getISTTime()), 1000)
    return () => clearInterval(t)
  }, [])

  // Pulsing green dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // Load persisted filter/sort + dismissed map
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FILTER_KEY),
      AsyncStorage.getItem(SORT_KEY),
      AsyncStorage.getItem(DISMISSED_KEY),
    ]).then(([f, s, d]) => {
      if (f) setActiveFilter(f)
      if (s) setActiveSort(s as SortKey)
      if (d) setDismissedMap(JSON.parse(d))
    })
  }, [])

  function changeFilter(f: string) { setActiveFilter(f); AsyncStorage.setItem(FILTER_KEY, f) }
  function changeSort(s: SortKey)  { setActiveSort(s);   AsyncStorage.setItem(SORT_KEY, s) }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // Active signals (not dismissed today)
  const activeSignals = useMemo(() => {
    return signals.filter((s) => dismissedMap[s.id] !== today)
  }, [signals, dismissedMap, today])

  // Filtered + sorted pool
  const filtered = useMemo(() => {
    const tab = HOLDING_FILTERS.find((f) => f.key === activeFilter)
    const byHolding = filterSignals(activeSignals, { holding: tab?.periods.length ? tab.periods : undefined })
    const byDir = signalDir === 'ALL' ? byHolding : byHolding.filter((s) => s.signal_type === (signalDir === 'SELL' ? 'SELL' : 'BUY'))
    return sortSignals(byDir, activeSort)
  }, [activeSignals, activeFilter, activeSort, signalDir])

  // Counts for summary bar
  const buyCount    = useMemo(() => activeSignals.filter((s) => s.signal_type === 'BUY').length,  [activeSignals])
  const sellCount   = useMemo(() => activeSignals.filter((s) => s.signal_type === 'SELL').length, [activeSignals])
  const inZoneCount = useMemo(() => activeSignals.filter((s) => getUrgency(s) === 'IN_ZONE').length, [activeSignals])

  // Sections
  const actionNow = useMemo(() =>
    filtered.filter((s) => getUrgency(s) === 'IN_ZONE').slice(0, 5), [filtered])

  const topSetups = useMemo(() =>
    filtered.filter((s) => getUrgency(s) !== 'IN_ZONE')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5),
  [filtered])

  const restSignals = useMemo(() =>
    filtered.filter((s) =>
      !actionNow.some((x) => x.id === s.id) && !topSetups.some((x) => x.id === s.id)
    ),
  [filtered, actionNow, topSetups])

  const daysLeft    = daysLeftInTrial()
  const trialActive = isTrialActive()

  const activeSortLabel = SORT_OPTIONS.find((s) => s.key === activeSort)?.label ?? 'Sort'

  const handleDismiss = useCallback((id: string) => {
    setDismissedMap((prev) => ({ ...prev, [id]: today }))
  }, [today])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  // Build SectionList data
  const sections = useMemo(() => {
    const result: { title: string; emoji: string; data: SectionItem[] }[] = []

    if (actionNow.length > 0) {
      result.push({ title: 'Action Needed Now', emoji: '🔥', data: actionNow })
    }
    if (topSetups.length > 0) {
      result.push({ title: 'Top Setups Today', emoji: '⭐', data: topSetups })
    }
    if (restSignals.length > 0) {
      const displayed = allExpanded ? restSignals : restSignals.slice(0, 3)
      const data: SectionItem[] = [...displayed]
      if (!allExpanded && restSignals.length > 3) {
        data.push({ type: 'show_more', count: restSignals.length - 3 })
      }
      result.push({ title: 'All Signals', emoji: '📊', data })
    }

    return result
  }, [actionNow, topSetups, restSignals, allExpanded])

  // Global card index for stagger (across all sections)
  const cardIndexMap = useMemo(() => {
    const map: Record<string, number> = {}
    let i = 0
    actionNow.forEach((s) => { map[s.id] = i++ })
    topSetups.forEach((s) => { map[s.id] = i++ })
    restSignals.forEach((s) => { map[s.id] = i++ })
    return map
  }, [actionNow, topSetups, restSignals])

  function renderItem({ item }: { item: SectionItem }) {
    if ((item as any).type === 'show_more') {
      const mi = item as { type: 'show_more'; count: number }
      return (
        <TouchableOpacity style={styles.showMoreBtn} onPress={() => setAllExpanded(true)}>
          <Text style={styles.showMoreText}>Show {mi.count} more signals ↓</Text>
        </TouchableOpacity>
      )
    }
    const signal = item as Signal
    return (
      <SignalCard
        signal={signal}
        cardIndex={cardIndexMap[signal.id] ?? 0}
        onDismiss={handleDismiss}
      />
    )
  }

  function renderSectionHeader({ section }: { section: { title: string; emoji: string } }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.emoji} {section.title}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Trial banners */}
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

      {/* Sticky secondary header: IST clock + summary + filter */}
      <View style={styles.stickyTop}>
        {/* IST clock row */}
        <View style={styles.clockRow}>
          <Animated.View style={[styles.liveDoc, { opacity: dotPulse }]} />
          <Text style={styles.clockText}>{istTime} IST</Text>
          {lastUpdated && (
            <Text style={styles.updatedText}>Updated {formatRelativeTime(lastUpdated)}</Text>
          )}
        </View>

        {/* Summary chips */}
        <View style={styles.summaryBar}>
          <SummaryChip label="BUY"     value={buyCount}    color="#00C896" active={signalDir === 'BUY'}  onPress={() => setSignalDir(signalDir === 'BUY'  ? 'ALL' : 'BUY')} />
          <SummaryChip label="SELL"    value={sellCount}   color="#FF4757" active={signalDir === 'SELL'} onPress={() => setSignalDir(signalDir === 'SELL' ? 'ALL' : 'SELL')} />
          <SummaryChip label="🔥 Zone" value={inZoneCount} color="#FF9800" active={false} onPress={() => {}} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSortSheet(true)}>
            <Text style={styles.sortBtnText}>⬆⬇ {activeSortLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Holding filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {HOLDING_FILTERS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, activeFilter === item.key && styles.filterChipActive]}
              onPress={() => changeFilter(item.key)}
            >
              <Text style={[styles.filterChipText, activeFilter === item.key && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* History fallback banner */}
      {isFromHistory && (
        <View style={styles.historyBanner}>
          <Text style={styles.historyBannerText}>
            📊 Price moved away from zones — showing last valid signals
          </Text>
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
          <Text style={styles.emptyText}>No signals today</Text>
          <Text style={styles.emptySub}>
            {activeFilter !== 'ALL'
              ? 'No stocks match this time frame'
              : 'Check back after 3:45 PM on a trading day'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections as any}
          keyExtractor={(item: any) => item.id ?? item.type}
          renderItem={renderItem as any}
          renderSectionHeader={renderSectionHeader as any}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" colors={['#6C63FF']} />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Sort bottom sheet */}
      <Modal visible={showSortSheet} transparent animationType="slide" onRequestClose={() => setShowSortSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowSortSheet(false)} />
        <View style={styles.sheetContent}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Sort Signals</Text>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sheetOption, activeSort === opt.key && styles.sheetOptionActive]}
              onPress={() => { changeSort(opt.key); setShowSortSheet(false) }}
            >
              <Text style={[styles.sheetOptionText, activeSort === opt.key && { color: '#6C63FF', fontWeight: '700' }]}>
                {activeSort === opt.key ? '✓  ' : '    '}{opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  )
}

function SummaryChip({ label, value, color, active, onPress }: {
  label: string; value: number; color: string; active: boolean; onPress: () => void
}) {
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
  wrap:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '800' },
  label: { color: '#8B8FA8', fontSize: 10, fontWeight: '600', marginTop: 1 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },

  trialExpiredBar:  { backgroundColor: '#FF475720', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FF4757' },
  trialExpiredText: { color: '#FF4757', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  trialWarnBar:     { backgroundColor: '#FF990020', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FF9900' },
  trialWarnText:    { color: '#FF9900', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  stickyTop: {
    backgroundColor: '#0A0A0F',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
    paddingBottom: 6,
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  liveDoc: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#00C896',
  },
  clockText: { color: '#00C896', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  updatedText: { color: '#555566', fontSize: 11, marginLeft: 8 },

  summaryBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },

  sortBtn: {
    backgroundColor: '#13131A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#6C63FF40',
  },
  sortBtnText: { color: '#6C63FF', fontSize: 11, fontWeight: '700' },

  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 2 },
  filterChip: {
    backgroundColor: '#13131A', borderRadius: 18,
    paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#1E1E2E',
  },
  filterChipActive:     { borderColor: '#6C63FF', backgroundColor: '#6C63FF20' },
  filterChipText:       { color: '#8B8FA8', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#6C63FF' },

  historyBanner: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 2,
    backgroundColor: '#1A1A2E', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#6C63FF40',
  },
  historyBannerText: { color: '#A0A0C0', fontSize: 12, lineHeight: 18 },

  sectionHeader: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  sectionHeaderText: {
    color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.2,
  },

  showMoreBtn: {
    marginHorizontal: 16, marginVertical: 8,
    backgroundColor: '#13131A', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#1E1E2E',
  },
  showMoreText: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },

  list:        { paddingBottom: 40, paddingTop: 4 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8B8FA8', marginTop: 12, fontSize: 14 },
  errorText:   { color: '#FF4757', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  errorSub:    { color: '#8B8FA8', fontSize: 13, marginBottom: 16 },
  retryBtn:    { backgroundColor: '#6C63FF', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryText:   { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  emptyText:   { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySub:    { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  sheetOverlay: { flex: 1, backgroundColor: '#00000080' },
  sheetContent: {
    backgroundColor: '#13131A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A2A3A',
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  sheetTitle:       { color: '#FFFFFF', fontSize: 16, fontWeight: '800', paddingHorizontal: 20, paddingVertical: 12 },
  sheetOption:      { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  sheetOptionActive:{ backgroundColor: '#6C63FF12' },
  sheetOptionText:  { color: '#FFFFFF', fontSize: 14 },
})
