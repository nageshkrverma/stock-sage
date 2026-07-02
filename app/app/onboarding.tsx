import React, { useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated,
} from 'react-native'
import * as Notifications from 'expo-notifications'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    emoji: '📊',
    title: '1800 NSE Stocks.\nScanned Daily.',
    body: 'Every listed stock analysed against demand/supply zones. Only the best setups surface — so you never miss an opportunity.',
    accent: '#6C63FF',
  },
  {
    emoji: '🧠',
    title: 'Know What Smart\nMoney Is Doing',
    body: 'See where institutions are buying and selling. Zone signals, volume spikes, and OI buildup — all explained in plain English.',
    accent: '#FF9800',
  },
  {
    emoji: '💼',
    title: 'Already Own Stocks?\nWe Have You Covered.',
    body: 'Add your holdings and get live EXIT / ADD MORE / HOLD verdicts with alerts when it matters most.',
    accent: '#00C896',
  },
]

interface Props {
  onComplete: () => void
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [page, setPage] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  function goNext() {
    if (page < SLIDES.length - 1) {
      const next = page + 1
      scrollRef.current?.scrollTo({ x: next * width, animated: true })
      setPage(next)
    } else {
      handleFinish()
    }
  }

  function goSkip() {
    handleFinish()
  }

  async function handleFinish() {
    if (page === SLIDES.length - 1) {
      try {
        await Notifications.requestPermissionsAsync()
      } catch {}
    }
    onComplete()
  }

  const slide = SLIDES[page]

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.scroll}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.iconCircle, { backgroundColor: s.accent + '20', borderColor: s.accent + '40' }]}>
              <Text style={styles.emoji}>{s.emoji}</Text>
            </View>
            <Text style={[styles.title, { color: s.accent }]}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === page && { backgroundColor: slide.accent, width: 24 },
            ]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.skipBtn} onPress={goSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.nextBtn, { backgroundColor: slide.accent }]} onPress={goNext}>
          <Text style={styles.nextText}>
            {page === SLIDES.length - 1 ? 'Get Started' : 'Next  →'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        Research by SEBI Registered Research Analyst — Not investment advice
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1, width },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  emoji: { fontSize: 56 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    color: '#C0C0D8',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: '#2A2A4A',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    width: '100%',
  },
  skipBtn: {
    flex: 1,
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  skipText: { color: '#8B8FA8', fontSize: 15, fontWeight: '700' },
  nextBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disclaimer: {
    color: '#2A2A3A',
    fontSize: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
})
