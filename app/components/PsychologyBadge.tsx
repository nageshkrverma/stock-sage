import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { Psychology } from '../types/signal'

const COLORS: Record<string, string> = {
  LIQUIDITY_GRAB: '#6C63FF',
  CAPITULATION: '#FF4757',
  SMART_MONEY_ACCUMULATION: '#00C896',
  DISTRIBUTION: '#FF8C42',
  BULL_TRAP: '#FFD32A',
  BEAR_TRAP: '#FFD32A',
  FOMO_ZONE: '#FF4757',
  EUPHORIA: '#FF4757',
}

const EXPLANATIONS: Record<string, { what_happened: string; what_it_means: string; action: string }> = {
  LIQUIDITY_GRAB: {
    what_happened: 'Price dipped below support to trigger stop-losses, then snapped back above.',
    what_it_means: 'Smart money bought cheaply from panicking retail sellers.',
    action: 'High probability reversal. Enter on next bullish candle confirmation.',
  },
  CAPITULATION: {
    what_happened: 'Mass panic selling with huge volume spike and long lower wick.',
    what_it_means: 'When all sellers are exhausted, buyers take control.',
    action: 'Wait for next green candle confirmation then enter with tight stop.',
  },
  SMART_MONEY_ACCUMULATION: {
    what_happened: 'Tight price range for 10+ days near demand zone with high delivery.',
    what_it_means: 'Institutions quietly building large positions before a move up.',
    action: 'Patient setup. Enter near zone bottom, stop below zone.',
  },
  DISTRIBUTION: {
    what_happened: 'Tight range near supply zone with upper wicks and declining buy volume.',
    what_it_means: 'Big players offloading positions to retail buyers at resistance.',
    action: 'Avoid buying. Take profits if holding. Watch for breakdown.',
  },
  BULL_TRAP: {
    what_happened: 'Breakout above resistance on weak volume, then closed back below.',
    what_it_means: 'Retail buyers trapped long above resistance, their stops will add selling pressure.',
    action: 'Do not buy. Set tight stop if in trade. Wait for re-test confirmation.',
  },
  BEAR_TRAP: {
    what_happened: 'Breakdown below support on weak volume, then recovered above support.',
    what_it_means: 'Short sellers trapped below support, their covering will push price higher.',
    action: 'Bullish signal. Enter long with stop below the wick low.',
  },
  FOMO_ZONE: {
    what_happened: 'Price ran far above its base zone with high RSI and fading volume.',
    what_it_means: 'Late buyers chasing a move — risk/reward is unfavorable.',
    action: 'Do NOT enter. Wait patiently for pullback to demand zone.',
  },
  EUPHORIA: {
    what_happened: 'Price far above 200 EMA with extreme RSI near supply zone.',
    what_it_means: 'Extreme greed — sellers waiting in large supply overhead.',
    action: 'Avoid entry completely. Consider partial profits if holding.',
  },
}

interface Props {
  psychology: Psychology
}

export default function PsychologyBadge({ psychology }: Props) {
  const [expanded, setExpanded] = useState(false)
  const color = COLORS[psychology.type] ?? '#8B8FA8'
  const exp = EXPLANATIONS[psychology.type]

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
      style={[styles.container, { borderColor: color + '40' }]}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color }]}>{psychology.label}</Text>
        <Text style={styles.expand}>{expanded ? '▲' : '▼'}</Text>
      </View>
      <Text style={styles.description}>{psychology.description}</Text>
      {expanded && exp && (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>What happened</Text>
          <Text style={styles.detailText}>{exp.what_happened}</Text>
          <Text style={styles.detailLabel}>What it means</Text>
          <Text style={styles.detailText}>{exp.what_it_means}</Text>
          <Text style={[styles.detailLabel, { color: '#00C896' }]}>Your action</Text>
          <Text style={styles.detailText}>{exp.action}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13131A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  expand: {
    color: '#8B8FA8',
    fontSize: 10,
  },
  description: {
    color: '#8B8FA8',
    fontSize: 12,
    lineHeight: 17,
  },
  detail: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E1E2E',
    paddingTop: 10,
    gap: 4,
  },
  detailLabel: {
    color: '#FFD32A',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  detailText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 18,
  },
})
