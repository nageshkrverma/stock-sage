import React, { useState, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSignals } from '../hooks/useSignals'
import { Signal } from '../types/signal'
import { formatINR } from '../utils/formatters'
import ConfidenceRing from '../components/ConfidenceRing'

export default function ScannerScreen() {
  const { signals, isLoading } = useSignals()
  const [query, setQuery] = useState('')
  const router = useRouter()

  const results = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    return signals.filter(
      (s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q)
    )
  }, [query, signals])

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Stock Search</Text>
        <Text style={styles.subtitle}>Search any NSE stock to see today's analysis</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder="Search by symbol, name or sector..."
          placeholderTextColor="#4A4A6A"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C63FF" />
        </View>
      ) : query.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hintIcon}>📈</Text>
          <Text style={styles.hintTitle}>Search {signals.length} signals</Text>
          <Text style={styles.hintSub}>Type a stock symbol like RELIANCE, TCS, HDFC{'\n'}or a sector like Banking, IT, Pharma</Text>
          <View style={styles.examplesRow}>
            {['RELIANCE', 'TCS', 'Banking', 'IT'].map((s) => (
              <TouchableOpacity key={s} style={styles.exampleChip} onPress={() => setQuery(s)}>
                <Text style={styles.exampleText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.noResultIcon}>🔎</Text>
          <Text style={styles.noResultTitle}>"{query}" not in today's signals</Text>
          <Text style={styles.noResultSub}>
            This stock was scanned but no demand/supply zone{'\n'}was found near its current price today.{'\n\n'}
            Check back tomorrow after the 3:45 PM scan.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <SearchResultCard signal={item} onPress={() => router.push(`/signal/${item.id}` as any)} />
          )}
        />
      )}
    </View>
  )
}

function SearchResultCard({ signal, onPress }: { signal: Signal; onPress: () => void }) {
  const isBuy = signal.signal_type === 'BUY'
  const dayUp = (signal.day_change_pct ?? 0) >= 0

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardSymbol}>{signal.symbol}</Text>
            <View style={[styles.typeBadge, { backgroundColor: isBuy ? '#00C89620' : '#FF475720', borderColor: isBuy ? '#00C896' : '#FF4757' }]}>
              <Text style={[styles.typeText, { color: isBuy ? '#00C896' : '#FF4757' }]}>
                {isBuy ? 'BUY' : 'SHORT'}
              </Text>
            </View>
          </View>
          <Text style={styles.cardName} numberOfLines={1}>{signal.name}</Text>
          <Text style={styles.cardSector}>{signal.sector}  ·  {signal.holding_label}</Text>
        </View>
        <View style={styles.cardRight}>
          <ConfidenceRing confidence={signal.confidence} size={52} />
        </View>
      </View>

      <View style={styles.cardPriceRow}>
        <Text style={styles.cardPrice}>{formatINR(signal.current_price ?? 0)}</Text>
        <View style={[styles.changeBadge, { backgroundColor: dayUp ? '#00C89618' : '#FF475718' }]}>
          <Text style={[styles.changeText, { color: dayUp ? '#00C896' : '#FF4757' }]}>
            {dayUp ? '▲' : '▼'} {Math.abs(signal.day_change_pct ?? 0).toFixed(2)}%
          </Text>
        </View>
        <Text style={styles.cardEntry}>
          Entry: {formatINR(signal.entry.low)}–{formatINR(signal.entry.high)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: '#8B8FA8', fontSize: 13, marginTop: 3 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#13131A', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E2E',
    marginHorizontal: 16, marginTop: 14, marginBottom: 8,
    paddingHorizontal: 14, height: 48,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  clearBtn: { padding: 4 },
  clearText: { color: '#8B8FA8', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  hintIcon: { fontSize: 40, marginBottom: 12 },
  hintTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  hintSub: { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  examplesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  exampleChip: {
    backgroundColor: '#1E1E2E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#6C63FF40',
  },
  exampleText: { color: '#6C63FF', fontSize: 12, fontWeight: '700' },
  noResultIcon: { fontSize: 36, marginBottom: 12 },
  noResultTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  noResultSub: { color: '#8B8FA8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  card: {
    backgroundColor: '#13131A', borderRadius: 14, borderWidth: 1, borderColor: '#1E1E2E',
    padding: 14, marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardLeft: { flex: 1, marginRight: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardSymbol: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cardName: { color: '#8B8FA8', fontSize: 12, marginBottom: 3 },
  cardSector: { color: '#4A4A6A', fontSize: 11 },
  cardRight: { alignItems: 'center', justifyContent: 'center' },
  cardPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPrice: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  changeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  changeText: { fontSize: 12, fontWeight: '700' },
  cardEntry: { color: '#8B8FA8', fontSize: 11, flex: 1, textAlign: 'right' },
})
