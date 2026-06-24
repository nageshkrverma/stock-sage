import React, { useState, useCallback } from 'react'
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

const HOLDING_FILTERS = ['ALL', '15D', '30D', '3M', '6M', '1Y']

export default function HomeScreen() {
  const { signals, isLoading, error, refetch, lastUpdated } = useSignals()
  const [activeHolding, setActiveHolding] = useState('ALL')
  const [refreshing, setRefreshing] = useState(false)

  const filtered = filterSignals(signals, {
    holding: activeHolding === 'ALL' ? undefined : [activeHolding],
  })

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

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <SummaryChip label="Total" value={filtered.length} color="#6C63FF" />
        <SummaryChip label="BUY" value={buyCount} color="#00C896" />
        <SummaryChip label="SELL" value={sellCount} color="#FF4757" />
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
              {item}
            </Text>
          </TouchableOpacity>
        )}
        style={styles.filterList}
      />

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
