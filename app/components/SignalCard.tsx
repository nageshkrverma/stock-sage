import React, { useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Signal } from '../types/signal'

export const DISMISSED_KEY = 'tradingbabaji_dismissed_signals'
export const SAVED_KEY = 'tradingbabaji_saved_signals'

type UrgencyLevel = 'IN_ZONE' | 'NEAR_ZONE' | 'WAITING' | 'ZONE_PASSED'

export function getUrgency(signal: Signal): UrgencyLevel {
  const price = signal.current_price ?? 0
  const { low, high } = signal.entry
  const isBuy = signal.signal_type === 'BUY'
  if (price >= low && price <= high) return 'IN_ZONE'
  if (price >= low * 0.98 && price <= high * 1.02) return 'NEAR_ZONE'
  if (isBuy && price > high * 1.05) return 'ZONE_PASSED'
  if (!isBuy && price < low * 0.95) return 'ZONE_PASSED'
  return 'WAITING'
}

const URGENCY_CONFIG = {
  IN_ZONE:     { label: '🔥 In Zone',    color: '#FF9800', textDark: false },
  NEAR_ZONE:   { label: '👀 Near Zone',  color: '#FFD32A', textDark: true  },
  WAITING:     { label: '⏳ Watching',   color: '#555566', textDark: false },
  ZONE_PASSED: { label: '✅ Zone Passed',color: '#333344', textDark: false },
}

const HOLDING_LABELS: Record<string, string> = {
  '7D': '7 Days', '15D': '15 Days', '30D': '30 Days',
  '3M': '3 Months', '6M': '6 Months', '1Y': '1 Year',
}

function DotBar({ score }: { score: number }) {
  const filled = Math.round(score / 10)
  const filledColor = score >= 80 ? '#00C896' : score >= 65 ? '#FFD32A' : '#555566'
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: 10 }, (_, i) => (
        <View
          key={i}
          style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: i < filled ? filledColor : '#2A2A3A',
            marginRight: 0,
          }}
        />
      ))}
    </View>
  )
}

interface Props {
  signal: Signal
  cardIndex?: number
  onDismiss?: (id: string) => void
  onSave?: (id: string) => void
}

export default function SignalCard({ signal, cardIndex = 0, onDismiss, onSave }: Props) {
  const router = useRouter()
  const urgency = getUrgency(signal)
  const urgConf = URGENCY_CONFIG[urgency]
  const isInZone = urgency === 'IN_ZONE'
  const isBuy = signal.signal_type === 'BUY'

  // Entrance animation
  const entranceOpacity = useRef(new Animated.Value(0)).current
  const entranceY = useRef(new Animated.Value(8)).current

  // IN ZONE pulse
  const pulseScale = useRef(new Animated.Value(1)).current

  // Swipe
  const swipeX = useRef(new Animated.Value(0)).current
  const swipeOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const delay = cardIndex * 50
    Animated.parallel([
      Animated.timing(entranceOpacity, { toValue: 1, duration: 250, delay, useNativeDriver: true }),
      Animated.timing(entranceY, { toValue: 0, duration: 250, delay, useNativeDriver: true }),
    ]).start()

    if (isInZone) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.04, duration: 1250, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1.0,  duration: 1250, useNativeDriver: true }),
        ])
      ).start()
    }
  }, [])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => swipeX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -80) {
          // Dismiss
          Animated.parallel([
            Animated.timing(swipeX, { toValue: -500, duration: 200, useNativeDriver: true }),
            Animated.timing(swipeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            AsyncStorage.getItem(DISMISSED_KEY).then((val) => {
              const map = val ? JSON.parse(val) : {}
              map[signal.id] = today
              return AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(map))
            }).then(() => onDismiss?.(signal.id))
          })
        } else if (g.dx > 80) {
          // Save — bounce back
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start()
          AsyncStorage.getItem(SAVED_KEY).then((val) => {
            const arr: string[] = val ? JSON.parse(val) : []
            if (!arr.includes(signal.id)) {
              arr.push(signal.id)
              return AsyncStorage.setItem(SAVED_KEY, JSON.stringify(arr))
            }
          }).then(() => onSave?.(signal.id))
        } else {
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  const holdLabel = HOLDING_LABELS[signal.holding_period] ?? signal.holding_label ?? signal.holding_period

  // Background color for swipe reveal
  const dismissOpacity = swipeX.interpolate({ inputRange: [-120, -10, 0], outputRange: [1, 0.5, 0], extrapolate: 'clamp' })
  const saveOpacity    = swipeX.interpolate({ inputRange: [0, 10, 120],    outputRange: [0, 0.5, 1], extrapolate: 'clamp' })

  return (
    <Animated.View
      style={[
        styles.outerWrap,
        { opacity: Animated.multiply(entranceOpacity, swipeOpacity) },
        { transform: [{ translateY: entranceY }] },
      ]}
    >
      {/* Swipe reveal backgrounds */}
      <Animated.View style={[styles.swipeBg, styles.swipeBgLeft, { opacity: dismissOpacity }]}>
        <Text style={styles.dismissText}>✕  Not Interested</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeBgRight, { opacity: saveOpacity }]}>
        <Text style={styles.saveText}>Save  🔖</Text>
      </Animated.View>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          isInZone && styles.cardInZone,
          { transform: [{ translateX: swipeX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={() => router.push(`/signal/${signal.id}` as any)}
          activeOpacity={0.85}
        >
          {/* Row 1: Symbol + BUY/SELL */}
          <View style={styles.row}>
            <Text style={styles.symbol}>{signal.symbol}</Text>
            <View style={[styles.typePill, { backgroundColor: isBuy ? '#00C896' : '#FF4757' }]}>
              <Text style={styles.typePillText}>{isBuy ? 'BUY' : 'SELL'}</Text>
            </View>
          </View>

          {/* Row 2: Name + Holding */}
          <View style={[styles.row, { marginTop: 4 }]}>
            <Text style={styles.name}>{signal.name}</Text>
            <Text style={styles.holding}>{holdLabel}</Text>
          </View>

          {/* Row 3: Spacer */}
          <View style={{ height: 12 }} />

          {/* Row 4: Dots + Score + Urgency */}
          <View style={[styles.row, { alignItems: 'center' }]}>
            <DotBar score={signal.confidence} />
            <Text style={styles.score}>{signal.confidence}%</Text>
            <Animated.View
              style={[
                styles.urgencyPill,
                { backgroundColor: urgConf.color + '25' },
                isInZone && { transform: [{ scale: pulseScale }] },
              ]}
            >
              <Text style={[styles.urgencyText, { color: urgConf.color }]}>
                {urgConf.label}
              </Text>
            </Animated.View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  outerWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    position: 'relative',
  },
  swipeBg: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: '100%',
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  swipeBgLeft: {
    backgroundColor: '#FF4757',
    alignItems: 'flex-end',
  },
  swipeBgRight: {
    backgroundColor: '#00C896',
    alignItems: 'flex-start',
  },
  dismissText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  saveText:    { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  card: {
    backgroundColor: '#13131A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    padding: 14,
  },
  cardInZone: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
    borderColor: '#FF980040',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  typePill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  typePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    color: '#8B8FA8',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  holding: {
    color: '#8B8FA8',
    fontSize: 13,
  },
  score: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  urgencyPill: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
})
