import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

const COLORS: Record<string, string> = {
  '15D': '#FF6B9D',
  '30D': '#FF8C42',
  '3M': '#6C63FF',
  '6M': '#00B4D8',
  '1Y': '#00C896',
}

interface Props {
  period: string
  label: string
}

export default function HoldingBadge({ period, label }: Props) {
  const color = COLORS[period] ?? '#8B8FA8'
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
  },
})
