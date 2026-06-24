import React from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { VictoryLine, VictoryChart, VictoryAxis, VictoryArea, VictoryScatter } from 'victory-native'
import { Signal } from '../types/signal'

const { width } = Dimensions.get('window')

interface Props {
  signal: Signal
  priceData?: { date: string; close: number }[]
}

// Generate mock price data around the signal's zone if no real data provided
function generateMockData(signal: Signal): { x: number; y: number }[] {
  const { zone, entry, stop_loss, targets } = signal
  const zoneMid = (zone.top + zone.bottom) / 2
  const points: { x: number; y: number }[] = []
  const count = 60
  let price = zoneMid * 1.12

  for (let i = 0; i < count; i++) {
    const progress = i / count
    // simulate price coming down to zone then potentially bouncing
    if (i < 35) {
      price = price - (price - zoneMid) * 0.04 + (Math.random() - 0.48) * zoneMid * 0.008
    } else {
      price = price + (Math.random() - 0.4) * zoneMid * 0.01
    }
    points.push({ x: i, y: Math.max(stop_loss * 0.95, price) })
  }
  return points
}

export default function ZoneChart({ signal, priceData }: Props) {
  const data = priceData
    ? priceData.map((d, i) => ({ x: i, y: d.close }))
    : generateMockData(signal)

  if (data.length === 0) return null

  const prices = data.map((d) => d.y)
  const minPrice = Math.min(...prices, signal.stop_loss * 0.98)
  const maxPrice = Math.max(...prices, signal.targets[1]?.price ?? signal.targets[0]?.price ?? 0)
  const padding = (maxPrice - minPrice) * 0.05

  const chartMin = minPrice - padding
  const chartMax = maxPrice + padding

  const zoneAreaData = data.map((d) => ({
    x: d.x,
    y: signal.zone.top,
    y0: signal.zone.bottom,
  }))

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Price Action (Last 60 Days)</Text>
      <VictoryChart
        width={width - 32}
        height={220}
        padding={{ top: 16, bottom: 32, left: 48, right: 16 }}
        domain={{ y: [chartMin, chartMax] }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: '#1E1E2E' },
            tickLabels: { fill: '#8B8FA8', fontSize: 9 },
            grid: { stroke: '#1E1E2E', strokeWidth: 0.5 },
          }}
          tickCount={5}
        />
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: '#1E1E2E' },
            tickLabels: { fill: '#8B8FA8', fontSize: 9 },
            grid: { stroke: '#1E1E2E', strokeWidth: 0.5 },
          }}
          tickFormat={(t) => `₹${(t as number).toFixed(0)}`}
          tickCount={5}
        />

        {/* Zone band */}
        <VictoryArea
          data={zoneAreaData}
          style={{
            data: {
              fill: signal.zone.type === 'DEMAND' ? '#00C89620' : '#FF475720',
              stroke: signal.zone.type === 'DEMAND' ? '#00C896' : '#FF4757',
              strokeWidth: 1,
              strokeDasharray: '4,3',
            },
          }}
        />

        {/* Price line */}
        <VictoryLine
          data={data}
          style={{
            data: { stroke: '#6C63FF', strokeWidth: 2 },
          }}
          interpolation="monotoneX"
        />

        {/* Stop Loss line */}
        <VictoryLine
          data={data.map((d) => ({ x: d.x, y: signal.stop_loss }))}
          style={{
            data: { stroke: '#FF4757', strokeWidth: 1, strokeDasharray: '4,3' },
          }}
        />

        {/* Target 1 */}
        {signal.targets[0] && (
          <VictoryLine
            data={data.map((d) => ({ x: d.x, y: signal.targets[0].price }))}
            style={{
              data: { stroke: '#00C896', strokeWidth: 1, strokeDasharray: '4,3' },
            }}
          />
        )}

        {/* Target 2 */}
        {signal.targets[1] && (
          <VictoryLine
            data={data.map((d) => ({ x: d.x, y: signal.targets[1].price }))}
            style={{
              data: { stroke: '#00C89680', strokeWidth: 1, strokeDasharray: '4,3' },
            }}
          />
        )}
      </VictoryChart>

      <View style={styles.legend}>
        <LegendItem color="#6C63FF" label="Price" />
        <LegendItem
          color={signal.zone.type === 'DEMAND' ? '#00C896' : '#FF4757'}
          label={signal.zone.type === 'DEMAND' ? 'Demand Zone' : 'Supply Zone'}
        />
        <LegendItem color="#FF4757" label="Stop Loss" dashed />
        <LegendItem color="#00C896" label="Targets" dashed />
      </View>
    </View>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={legendStyles.item}>
      <View style={[legendStyles.line, { backgroundColor: color, opacity: dashed ? 0.7 : 1 }]} />
      <Text style={legendStyles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13131A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    overflow: 'hidden',
    paddingTop: 12,
    paddingHorizontal: 0,
  },
  title: {
    color: '#8B8FA8',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
})

const legendStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  line: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  label: {
    color: '#8B8FA8',
    fontSize: 10,
  },
})
