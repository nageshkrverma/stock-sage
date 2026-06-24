import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import Slider from '@react-native-community/slider'
import { SignalFilters } from '../types/signal'

const HOLDING_OPTIONS = ['15D', '30D', '3M', '6M', '1Y']
const SENTIMENT_OPTIONS = ['STRONG_BUY', 'BUY', 'WEAK_BUY']
const HOLDING_LABELS: Record<string, string> = {
  '15D': '15 Days', '30D': '30 Days', '3M': '3 Months', '6M': '6 Months', '1Y': '1 Year',
}
const SENTIMENT_LABELS: Record<string, string> = {
  STRONG_BUY: 'Strong Buy', BUY: 'Buy', WEAK_BUY: 'Weak Buy',
}

interface Props {
  filters: SignalFilters
  sectors: string[]
  onChange: (filters: SignalFilters) => void
  onReset: () => void
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
}

export default function FilterSheet({ filters, sectors, onChange, onReset }: Props) {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Signal Type */}
      <Text style={styles.sectionTitle}>Signal Type</Text>
      <View style={styles.chipRow}>
        {(['ALL', 'BUY', 'SELL'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.chip, filters.signalType === type && styles.chipActive]}
            onPress={() => onChange({ ...filters, signalType: type })}
          >
            <Text style={[styles.chipText, filters.signalType === type && styles.chipTextActive]}>
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Holding Period */}
      <Text style={styles.sectionTitle}>Holding Period</Text>
      <View style={styles.chipRow}>
        {HOLDING_OPTIONS.map((h) => {
          const active = (filters.holding ?? []).includes(h)
          return (
            <TouchableOpacity
              key={h}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange({ ...filters, holding: toggle(filters.holding ?? [], h) })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {HOLDING_LABELS[h]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Sentiment */}
      <Text style={styles.sectionTitle}>Sentiment</Text>
      <View style={styles.chipRow}>
        {SENTIMENT_OPTIONS.map((s) => {
          const active = (filters.sentiment ?? []).includes(s)
          return (
            <TouchableOpacity
              key={s}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange({ ...filters, sentiment: toggle(filters.sentiment ?? [], s) })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {SENTIMENT_LABELS[s]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Sector */}
      <Text style={styles.sectionTitle}>Sector</Text>
      <View style={styles.chipRow}>
        {sectors.map((s) => {
          const active = (filters.sector ?? []).includes(s)
          return (
            <TouchableOpacity
              key={s}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange({ ...filters, sector: toggle(filters.sector ?? [], s) })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Min Confidence */}
      <Text style={styles.sectionTitle}>
        Min Confidence: {filters.minConfidence ?? 65}
      </Text>
      <Slider
        style={{ height: 40, marginHorizontal: 4 }}
        minimumValue={65}
        maximumValue={100}
        step={1}
        value={filters.minConfidence ?? 65}
        minimumTrackTintColor="#6C63FF"
        maximumTrackTintColor="#1E1E2E"
        thumbTintColor="#6C63FF"
        onValueChange={(v) => onChange({ ...filters, minConfidence: Math.round(v) })}
      />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>65</Text>
        <Text style={styles.sliderLabel}>100</Text>
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
        <Text style={styles.resetText}>Reset All Filters</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  sectionTitle: {
    color: '#8B8FA8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  chipActive: {
    borderColor: '#6C63FF',
    backgroundColor: '#6C63FF20',
  },
  chipText: {
    color: '#8B8FA8',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 4,
  },
  sliderLabel: {
    color: '#8B8FA8',
    fontSize: 10,
  },
  resetBtn: {
    marginTop: 24,
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  resetText: {
    color: '#8B8FA8',
    fontWeight: '600',
    fontSize: 14,
  },
})
