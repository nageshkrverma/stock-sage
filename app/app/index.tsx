import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useSignals, filterSignals } from '../hooks/useSignals'
import { Signal } from '../types/signal'
import SignalCard from '../components/SignalCard'
import { formatRelativeTime } from '../utils/formatters'

const HOLDING_FILTERS = ['ALL', '7D', '15D', '30D', '3M', '6M', '1Y']

type SortKey = 'confidence' | 'day_change' | 'price_asc' | 'price_desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'confidence', label: '% Probability' },
  { key: 'day_change', label: '% Day Change' },
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
]

function sortSignals(signals: Signal[], sortKey: SortKey): Signal[] {
  return [...signals].sort((a, b) => {
    switch (sortKey) {
      case 'confidence':
        return b.confidence - a.confidence
      case 'day_change':
        return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0)
      case 'price_asc':
        return (a.current_price ?? 0) - (b.current_price ?? 0)
      case 'price_desc':
        return (b.current_price ?? 0) - (a.current_price ?? 0)
      default:
        return 0
    }
  })
}

export default function HomeScreen() {
  const { signals, isLoading, error, refetch, lastUpdated } = useSignals()
  const [activeHolding, setActiveHolding] = useState('ALL')
  const [activeSort, setActiveSort] = useState<SortKey>('confidence')
  const [refreshing, setRefreshing] = useState(false)
  const [showSort, setShowSort] = useState(false)

  const filtered = useMemo(() => {
    const f = filterSignals(signals, {
      holding: activeHolding === 'ALL' ? undefined : [activeHolding],
    })
    return sortSignals(f, activeSort)
  }, [signals, activeHolding, activeSort])

  const buyCount = filtered.filter((s) => s.signal_type === 'BUY').length
  const sellCount = filtered.filter((s) => s.signal_type === 'SELL').length

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const renderItem = useCallback(
    ({ item }: { item: Signal }) => <SignalCard signal={item} />,
    []
  )

  const keyExtractor = useCallback((item: Signal) => item.id, [])

  const activeSortLabel = SORT_OPTIONS.find((s) => s.key === activeSort)?.label ?? 'Sort'

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryChip label="Total" value={filtered.length} color="#6C63FF" />
        <SummaryChip label="BUY" value={buyCount} color="#00C896" />
        <SummaryChip label="SHORT" value={sellCount} color="#FF4757" />
        {lastUpdated && (
          <Text style={styles.updated}>Updated {formatRelativeTime(lastUpdated)}</Text>
        )}
      </View>

      {/* Holding filter chips */}
      <FlatList
        horizontal
        data={HOLDING_FILTERS}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, activeHolding === item && styles.filterChipActive]}
            onPress={() => setActiveHolding(item)}
          >
            <Text style={[styles.filterChipText, activeHolding === item && styles.filterChipTextActive]}>
              {item === '7D' ? '⚡ 1-7D' : item}
            </Text>
          </TouchableOpacity>
        )}
        style={styles.filterList}
      />

      {/* Sort row */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(!showSort)}>
          <Text style={styles.sortBtnText}>{activeSortLabel} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* Sort dropdown */}
      {showSort && (
        <View style={styles.sortDropdown}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortOption, activeSort === opt.key && styles.sortOptionActive]}
              onPress={() => { setActiveSort(opt.key); setShowSort(false) }}
            >
              <Text style={[styles.sortOptionText, activeSort === opt.key && styles.sortOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C63FF" size="large" />
          <Text style={styles.loadingText}>Fetching signals...</Text>
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
          <Text style={styles.emptyText}>No signals for selected filter</Text>
          <Text style={styles.emptySub}>Try a different holding period or check back tomorrow</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6C63FF"
              colors={['#6C63FF']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[summaryStyles.chip, { borderColor: color + '40' }]}>
      <Text style={[summaryStyles.value, { color }]}>{value}</Text>
      <Text style={summaryStyles.label}>{label}</Text>
    </View>
  )
}

const summaryStyles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
  },
  label: {
    color: '#8B8FA8',
    fontSize: 10,
    fontWeight: '600',
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  summaryBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  updated: {
    flex: 1,
    color: '#8B8FA8',
    fontSize: 10,
    textAlign: 'right',
  },
  filterList: {
    maxHeight: 44,
    marginBottom: 4,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    paddingVertical: 4,
  },
  filterChip: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  filterChipActive: {
    borderColor: '#6C63FF',
    backgroundColor: '#6C63FF20',
  },
  filterChipText: {
    color: '#8B8FA8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#6C63FF',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  sortLabel: {
    color: '#8B8FA8',
    fontSize: 12,
  },
  sortBtn: {
    backgroundColor: '#1E1E2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#6C63FF40',
  },
  sortBtnText: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '700',
  },
  sortDropdown: {
    marginHorizontal: 16,
    backgroundColor: '#13131A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    marginBottom: 6,
    overflow: 'hidden',
  },
  sortOption: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  sortOptionActive: {
    backgroundColor: '#6C63FF15',
  },
  sortOptionText: {
    color: '#8B8FA8',
    fontSize: 13,
  },
  sortOptionTextActive: {
    color: '#6C63FF',
    fontWeight: '700',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#8B8FA8',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#FF4757',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorSub: {
    color: '#8B8FA8',
    fontSize: 13,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: '#8B8FA8',
    fontSize: 13,
    textAlign: 'center',
  },
})
