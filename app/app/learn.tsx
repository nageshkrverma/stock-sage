import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import PatternVisual from '../components/PatternVisual'

const LEARN_PROGRESS_KEY = 'tradingbabaji_learn_read'

const PSYCHOLOGY_PATTERNS = [
  {
    type: 'LIQUIDITY_GRAB',
    icon: '🎯',
    title: 'Possible Stop Hunt',
    tagline: 'Price may have dipped to trigger stops before a possible reversal',
    color: '#6C63FF',
    whatHappened:
      'Price briefly dipped below a key support level then snapped back up quickly.',
    whatItMeans:
      'This can be a pattern where large players pushed price down to trigger stop losses before the real move begins. Historically this type of move has been followed by upward price action — can be a possible buy opportunity on the snapback.',
    action:
      'This can be worth watching as a possible buy setup. Look for the next candle to confirm direction before considering any entry. Can be a higher-probability possible zone if volume confirms.',
    diagram:
      '↓ Price sweeps below support → Long wick forms → Price closes back above support → Possible rally begins',
  },
  {
    type: 'CAPITULATION',
    icon: '😨',
    title: 'Possible Panic Selling',
    tagline: 'Mass selling may have created a possible demand zone',
    color: '#FF4757',
    whatHappened:
      'A large number of traders may have sold in panic — visible from the unusually high volume and long lower wick on the candle.',
    whatItMeans:
      'Historically this type of panic selling near a demand zone has been followed by price recovery as buyers absorb the selling. Can be a possible buy zone forming here.',
    action:
      'Can be worth watching for a possible bounce. Historically waiting for the next candle to confirm green may offer a better possible entry than entering during the wick.',
    diagram: '📉 Large red candle + high volume → Long lower wick → Next candle may close green → Possible recovery',
  },
  {
    type: 'SMART_MONEY_ACCUMULATION',
    icon: '🐋',
    title: 'Possible Quiet Accumulation',
    tagline: 'Large players may be slowly building positions near this zone',
    color: '#00C896',
    whatHappened:
      'Price has been moving sideways in a tight range near a demand zone with above average buying activity.',
    whatItMeans:
      'This can be a pattern where large players are slowly building positions. Historically this type of quiet accumulation near a zone has preceded upward moves — can be worth watching for a possible buy opportunity.',
    action:
      'This can be a patient possible setup. Historically a breakout from the accumulation range can be significant — can be worth watching for a possible entry near the zone bottom.',
    diagram: '━━ Tight range + above-average volume → Small upward drift → Possible breakout bar → 🚀 Possible move',
  },
  {
    type: 'DISTRIBUTION',
    icon: '📤',
    title: 'Possible Selling Pressure',
    tagline: 'Large players may be reducing positions near this supply zone',
    color: '#FF8C42',
    whatHappened:
      'Price has been unable to move higher and may be showing repeated rejection near a supply zone.',
    whatItMeans:
      'This can be a pattern where large players are slowly reducing positions. Historically this type of distribution near a supply zone has preceded downward moves — can be worth watching as a possible sell zone.',
    action:
      'Can be worth avoiding new buys near this area. If you hold the stock, can be worth considering partial profit-taking. Historically breakdowns from this type of range can move quickly.',
    diagram: '↑ Up to possible resistance → Upper wick rejection → Volume declining on up days → 📉 Possible breakdown',
  },
  {
    type: 'BULL_TRAP',
    icon: '⚠️',
    title: 'Possible False Breakout',
    tagline: 'Breakout may have failed — possible trap for buyers',
    color: '#FFD32A',
    whatHappened:
      'Price broke above resistance but quickly fell back below it on weak volume.',
    whatItMeans:
      'This can be a bull trap — a situation where traders who bought the breakout may now be stuck. Historically this pattern has been followed by downward movement. Can be worth watching for a possible sell opportunity on the breakdown.',
    action:
      'Can be worth avoiding buying breakouts that fail to hold. Historically waiting 1-2 days for confirmation may help identify whether a breakout is valid or possibly a trap.',
    diagram: '→ Possible resistance → Price breaks above (weak volume) → Returns below → Possible trapped longs → 📉',
  },
  {
    type: 'BEAR_TRAP',
    icon: '⚠️',
    title: 'Possible False Breakdown',
    tagline: 'Breakdown may have failed — possible trap for sellers',
    color: '#FFD32A',
    whatHappened:
      'Price broke below support but quickly recovered above it on weak volume.',
    whatItMeans:
      'This can be a bear trap — a situation where traders who sold the breakdown may now be stuck. Historically this pattern has been followed by upward movement. Can be worth watching for a possible buy opportunity on the recovery.',
    action:
      'Can be worth watching as a possible bullish reversal zone. Historically a recovery above the broken level with increasing volume may signal a possible upward move from here.',
    diagram: '→ Possible support → Price breaks below (weak volume) → Recovers above → Possible short squeeze → 🚀',
  },
  {
    type: 'FOMO_ZONE',
    icon: '🚫',
    title: 'Price May Be Extended',
    tagline: 'Price may be far from its zone — can be worth waiting for a better possible entry',
    color: '#FF4757',
    whatHappened:
      'Price has moved far from the nearest demand zone and momentum may be at elevated levels.',
    whatItMeans:
      'Historically entering when price is this far extended from its zone has offered less favourable risk compared to waiting for a possible pullback to the zone. Can be worth waiting for a better possible entry zone.',
    action:
      'Can be worth waiting for a possible pullback to the zone rather than chasing price here. Historically missing a move may be better than entering at an extended level with unfavourable zone risk.',
    diagram: '📈 Possible rally from zone → Price extends far from zone → Momentum elevated → 🚫 Can be worth waiting',
  },
  {
    type: 'EUPHORIA',
    icon: '🤑',
    title: 'Possible Extreme Greed',
    tagline: 'Price may be well above average near a possible supply zone',
    color: '#FF4757',
    whatHappened:
      'Price may be well above its average levels and near a supply zone with momentum at high readings.',
    whatItMeans:
      'Historically this combination near supply zones has preceded possible pullbacks or reversals. Can be a zone where selling pressure may appear.',
    action:
      'Can be worth avoiding new entries at this level. Historically if you already hold the stock, this area near supply can be worth watching for a possible exit or partial profit-taking.',
    diagram: '🚀 Possible extended rally → Far above average → Momentum high → Possible supply zone overhead → 📉',
  },
]

export default function LearnScreen() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [readSet, setReadSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    AsyncStorage.getItem(LEARN_PROGRESS_KEY).then((val) => {
      if (val) {
        try { setReadSet(new Set(JSON.parse(val))) } catch {}
      }
    })
  }, [])

  async function markRead(type: string) {
    const next = new Set(readSet)
    next.add(type)
    setReadSet(next)
    await AsyncStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify([...next]))
  }

  function handleExpand(type: string) {
    const isOpen = expanded === type
    setExpanded(isOpen ? null : type)
    if (!isOpen && !readSet.has(type)) markRead(type)
  }

  async function handleShare(pattern: typeof PSYCHOLOGY_PATTERNS[0]) {
    await Share.share({
      message: `📊 ${pattern.title}\n\n${pattern.tagline}\n\n${pattern.whatItMeans}\n\nLearn more on TradingBabaji`,
      title: pattern.title,
    })
  }

  const readCount = readSet.size
  const total = PSYCHOLOGY_PATTERNS.length
  const progressPct = Math.round((readCount / total) * 100)

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Understanding What The Market May Be Doing</Text>
        <Text style={styles.subtitle}>Learn to read possible market signals and zone behaviour — so you can make more informed decisions yourself</Text>

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>{readCount}/{total} concepts read</Text>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
        </View>
      </View>

      {PSYCHOLOGY_PATTERNS.map((pattern) => {
        const isOpen = expanded === pattern.type
        const isRead = readSet.has(pattern.type)
        return (
          <TouchableOpacity
            key={pattern.type}
            style={[styles.card, { borderColor: isOpen ? pattern.color + '60' : '#1E1E2E' }]}
            onPress={() => handleExpand(pattern.type)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>{pattern.icon}</Text>
              <View style={styles.cardHeaderText}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: pattern.color }]}>{pattern.title}</Text>
                  {isRead && <Text style={styles.readBadge}>✓ Read</Text>}
                </View>
                <Text style={styles.cardTagline}>{pattern.tagline}</Text>
              </View>
              <Text style={[styles.chevron, { color: pattern.color }]}>{isOpen ? '▲' : '▼'}</Text>
            </View>

            {isOpen && (
              <View style={styles.cardBody}>
                <View style={styles.divider} />

                <PatternVisual type={pattern.type} />

                <View style={[styles.diagramBox, { borderColor: pattern.color + '40' }]}>
                  <Text style={[styles.diagramText, { color: pattern.color }]}>{pattern.diagram}</Text>
                </View>

                <SectionBlock label="What happened" color="#FFD32A" text={pattern.whatHappened} />
                <SectionBlock label="What it means" color="#6C63FF" text={pattern.whatItMeans} />
                <SectionBlock label="Zone analysis shows" color="#00C896" text={pattern.action} />

                {/* Share button */}
                <TouchableOpacity
                  style={[styles.shareBtn, { borderColor: pattern.color + '50' }]}
                  onPress={(e) => { e.stopPropagation?.(); handleShare(pattern) }}
                >
                  <Text style={[styles.shareBtnText, { color: pattern.color }]}>Share this insight ↗</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function SectionBlock({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={[sectionStyles.label, { color }]}>{label}</Text>
      <Text style={sectionStyles.text}>{text}</Text>
    </View>
  )
}

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 20,
  },
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8B8FA8',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#13131A',
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardTagline: {
    color: '#8B8FA8',
    fontSize: 12,
  },
  chevron: {
    fontSize: 11,
  },
  progressWrap: {
    marginTop: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    color: '#8B8FA8',
    fontSize: 12,
  },
  progressPct: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1E1E2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#6C63FF',
    borderRadius: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  readBadge: {
    color: '#00C896',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#00C89615',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shareBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1E2E',
    marginBottom: 12,
  },
  diagramBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    backgroundColor: '#0A0A0F',
  },
  diagramText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
})
