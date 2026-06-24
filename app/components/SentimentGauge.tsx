import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  position: number // 0.0 (extreme fear) to 1.0 (extreme greed)
}

const EMOJIS = ['😨', '😟', '😐', '😊', '🤑']
const LABELS = ['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed']
const GRADIENT_COLORS = ['#FF4757', '#FF8C42', '#FFD32A', '#7ED56F', '#00C896']

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function getColor(position: number) {
  const idx = Math.min(3, Math.floor(position * 4))
  const t = (position * 4) - idx
  const c1 = hexToRgb(GRADIENT_COLORS[idx])
  const c2 = hexToRgb(GRADIENT_COLORS[Math.min(4, idx + 1)])
  const r = Math.round(lerp(c1.r, c2.r, t))
  const g = Math.round(lerp(c1.g, c2.g, t))
  const b = Math.round(lerp(c1.b, c2.b, t))
  return `rgb(${r},${g},${b})`
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

export default function SentimentGauge({ position }: Props) {
  const clampedPos = Math.max(0, Math.min(1, position))
  const indicatorColor = getColor(clampedPos)
  const labelIndex = Math.min(4, Math.floor(clampedPos * 5))
  const emoji = EMOJIS[labelIndex]
  const label = LABELS[labelIndex]

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fear & Greed</Text>
      <View style={styles.trackContainer}>
        {/* Gradient track using segments */}
        <View style={styles.track}>
          {GRADIENT_COLORS.map((color, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: color }]} />
          ))}
        </View>
        {/* Indicator dot */}
        <View
          style={[
            styles.indicator,
            {
              left: `${clampedPos * 100}%` as any,
              backgroundColor: indicatorColor,
            },
          ]}
        />
      </View>
      <View style={styles.labelRow}>
        <Text style={styles.endLabel}>😨 Fear</Text>
        <Text style={styles.endLabel}>Greed 🤑</Text>
      </View>
      <View style={styles.currentLabel}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.label, { color: indicatorColor }]}>{label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13131A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  title: {
    color: '#8B8FA8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  trackContainer: {
    height: 12,
    marginBottom: 4,
    position: 'relative',
  },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
  },
  segment: {
    flex: 1,
  },
  indicator: {
    position: 'absolute',
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0A0A0F',
    marginLeft: -8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  endLabel: {
    color: '#8B8FA8',
    fontSize: 10,
  },
  currentLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  emoji: {
    fontSize: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
})
