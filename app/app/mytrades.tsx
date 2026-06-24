import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useTrades } from '../hooks/useTrades'
import TradeCard from '../components/TradeCard'
import { formatINR, formatPct } from '../utils/formatters'
import { TradeEntry } from '../types/signal'

type Tab = 'OPEN' | 'CLOSED'

export default function MyTradesScreen() {
  const { openTrades, closedTrades, loading, portfolioSummary, closeTrade, deleteTrade } = useTrades()
  const [activeTab, setActiveTab] = useState<Tab>('OPEN')

  const displayTrades = activeTab === 'OPEN' ? openTrades : closedTrades

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6C63FF" />
      </View>
    )
  }

  const pnlPositive = portfolioSummary.totalPnl >= 0

  return (
    <View style={styles.container}>
      {/* Portfolio summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Invested</Text>
            <Text style={styles.summaryValue}>{formatINR(portfolioSummary.totalInvested)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Closed P&L</Text>
            <Text style={[styles.summaryValue, { color: pnlPositive ? '#00C896' : '#FF4757' }]}>
              {formatINR(Math.abs(portfolioSummary.totalPnl))}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Return</Text>
            <Text style={[styles.summaryValue, { color: pnlPositive ? '#00C896' : '#FF4757' }]}>
              {formatPct(portfolioSummary.totalPnlPct)}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.countChip, { borderColor: '#6C63FF40' }]}>
            <Text style={[styles.countValue, { color: '#6C63FF' }]}>{portfolioSummary.openCount}</Text>
            <Text style={styles.countLabel}>Open</Text>
          </View>
          <View style={[styles.countChip, { borderColor: '#8B8FA840' }]}>
            <Text style={[styles.countValue, { color: '#8B8FA8' }]}>{portfolioSummary.closedCount}</Text>
            <Text style={styles.countLabel}>Closed</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'OPEN' && styles.tabActive]}
          onPress={() => setActiveTab('OPEN')}
        >
          <Text style={[styles.tabText, activeTab === 'OPEN' && styles.tabTextActive]}>
            Open Trades ({openTrades.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'CLOSED' && styles.tabActive]}
          onPress={() => setActiveTab('CLOSED')}
        >
          <Text style={[styles.tabText, activeTab === 'CLOSED' && styles.tabTextActive]}>
            Closed ({closedTrades.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Trades list */}
      {displayTrades.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {activeTab === 'OPEN' ? 'No open trades' : 'No closed trades yet'}
          </Text>
          <Text style={styles.emptySub}>
            {activeTab === 'OPEN'
              ? 'Find a signal and tap "Add to My Trades"'
              : 'Close a trade to see it here'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayTrades}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TradeCard
              trade={item}
              onClose={closeTrade}
              onDelete={deleteTrade}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  summaryCard: {
    backgroundColor: '#13131A',
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    padding: 14,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginBottom: 2,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  countChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  countValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  countLabel: {
    color: '#8B8FA8',
    fontSize: 10,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#13131A',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#6C63FF20',
  },
  tabText: {
    color: '#8B8FA8',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#6C63FF',
  },
  list: {
    paddingTop: 4,
    paddingBottom: 24,
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
