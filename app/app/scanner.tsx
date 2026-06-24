import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSignals, filterSignals, getUniqueSectors } from '../hooks/useSignals'
import { Signal, SignalFilters } from '../types/signal'
import SignalCard from '../components/SignalCard'
import FilterSheet from '../components/FilterSheet'

const DEFAULT_FILTERS: SignalFilters = {
  signalType: 'ALL',
  holding: [],
  sentiment: [],
  sector: [],
  minConfidence: 65,
  searchQuery: '',
}

export default function ScannerScreen() {
  const { signals, isLoading } = useSignals()
  const [filters, setFilters] = useState<SignalFilters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const sectors = getUniqueSectors(signals)
  const filtered = filterSignals(signals, filters)

  const renderItem = useCallback(
    ({ item }: { item: Signal }) => <SignalCard signal={item} />,
    []
  )

  const activeFilterCount = [
    filters.signalType !== 'ALL' ? 1 : 0,
    (filters.holding?.length ?? 0),
    (filters.sentiment?.length ?? 0),
    (filters.sector?.length ?? 0),
    (filters.minConfidence ?? 65) > 65 ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search symbol or company..."
            placeholderTextColor="#8B8FA8"
            value={filters.searchQuery}
            onChangeText={(q) => setFilters((f) => ({ ...f, searchQuery: q }))}
            autoCapitalize="characters"
          />
          {filters.searchQuery ? (
            <TouchableOpacity onPress={() => setFilters((f) => ({ ...f, searchQuery: '' }))}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters((v) => !v)}
        >
          <Text style={styles.filterBtnText}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results count */}
      <Text style={styles.resultsCount}>
        {filtered.length} signal{filtered.length !== 1 ? 's' : ''} match
      </Text>

      {showFilters ? (
        <FilterSheet
          filters={filters}
          sectors={sectors}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C63FF" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No signals match your filters</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  clearBtn: {
    color: '#8B8FA8',
    fontSize: 12,
    padding: 4,
  },
  filterBtn: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    paddingHorizontal: 14,
    height: 42,
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: '#6C63FF',
    backgroundColor: '#6C63FF20',
  },
  filterBtnText: {
    color: '#8B8FA8',
    fontWeight: '600',
    fontSize: 13,
  },
  resultsCount: {
    color: '#8B8FA8',
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  list: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#8B8FA8',
    fontSize: 14,
  },
})
