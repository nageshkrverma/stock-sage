import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'

const PSYCHOLOGY_PATTERNS = [
  {
    type: 'LIQUIDITY_GRAB',
    icon: '🎯',
    title: 'Liquidity Grab',
    tagline: 'Smart money hunts retail stop-losses before reversing',
    color: '#6C63FF',
    whatHappened:
      'The price dips below a key support level, triggering stop-loss orders from retail traders who placed stops just below support. It then quickly reverses and closes back above that level.',
    whatItMeans:
      'Institutional traders deliberately pushed the price down to fill their own buy orders cheaply, using retail stop-losses as liquidity. The fast snapback above support shows strong buying conviction.',
    action:
      'This is one of the highest-probability buy setups in trading. Look to enter on the next candle if it confirms bullish direction. Place your stop-loss below the wick low — not below support where everyone else had theirs.',
    diagram:
      '↓ Price sweeps below support → Long wick forms → Price closes back above support → Rally begins',
  },
  {
    type: 'CAPITULATION',
    icon: '😨',
    title: 'Capitulation',
    tagline: 'Mass panic selling creates the final low',
    color: '#FF4757',
    whatHappened:
      'A sudden surge in selling volume creates a dramatic drop with a long lower wick on the candle. Scared holders dump their positions all at once.',
    whatItMeans:
      'When everyone who wanted to sell has sold in panic, there are simply no more sellers left. This exhaustion point often marks the lowest price in a down move — institutions are on the other side buying.',
    action:
      'Wait for the panic candle to close, then look for the next candle to confirm a green bounce. Entering during the panic wick is risky — wait for confirmation first.',
    diagram: '📉 Large red candle + massive volume → Long lower wick → Next candle closes green → Accumulation begins',
  },
  {
    type: 'SMART_MONEY_ACCUMULATION',
    icon: '🐋',
    title: 'Institutional Accumulation',
    tagline: 'Big players quietly building positions',
    color: '#00C896',
    whatHappened:
      'The price moves in an unusually tight range for several days near a demand zone. Volume in delivery (not intraday) is elevated, but the price barely moves.',
    whatItMeans:
      'Large institutions want to buy a huge quantity without moving the price against themselves. They slowly absorb supply at a fixed range. Once they finish accumulating, they let the price run.',
    action:
      'This is a patient setup — the breakout from the accumulation range can be explosive. Enter near the range bottom, place stop below the zone. Hold for the full target.',
    diagram: '━━ Tight range 10 days + high delivery volume → Small upward drift in closes → Breakout bar →  🚀',
  },
  {
    type: 'DISTRIBUTION',
    icon: '📤',
    title: 'Distribution',
    tagline: 'Big players offloading to retail buyers',
    color: '#FF8C42',
    whatHappened:
      'Price is stuck in a range near resistance. Upper wicks (rejection at highs) are appearing repeatedly, and volume is declining on up-moves.',
    whatItMeans:
      'Institutions are selling their positions into the demand created by retail buyers who see a "consolidation before breakout." The repeated rejections show sellers overwhelming buyers at resistance.',
    action:
      'Avoid buying near this range. If you hold the stock, consider taking partial profits. A breakdown from this range typically falls fast because buyers are already trapped.',
    diagram: '↑ Up to resistance → Upper wick rejection → Declining volume on up days → 📉 Breakdown',
  },
  {
    type: 'BULL_TRAP',
    icon: '⚠️',
    title: 'Bull Trap',
    tagline: 'False breakout traps eager buyers',
    color: '#FFD32A',
    whatHappened:
      'The price broke above a key resistance level, which attracted many buyers hoping for a breakout. But it quickly fell back below resistance — the breakout was on weak volume and didn\'t hold.',
    whatItMeans:
      'Retail traders who bought the breakout are now trapped with positions above resistance. When they eventually cut losses, their selling adds more downward pressure. The setup favors the short side.',
    action:
      'Do not buy a breakout that fails to hold for more than 1-2 days. If you\'re already in, set a tight stop at the high of the failed breakout bar.',
    diagram: '→ Resistance line → Price breaks above (weak volume) → Returns below resistance → Trapped longs sell →  📉',
  },
  {
    type: 'BEAR_TRAP',
    icon: '⚠️',
    title: 'Bear Trap',
    tagline: 'False breakdown squeezes shorts upward',
    color: '#FFD32A',
    whatHappened:
      'The price broke below a key support level, triggering short-sellers to enter bearish positions. But it then quickly reversed back above support — the breakdown was also on weak volume.',
    whatItMeans:
      'Short sellers are now trapped below support. As price rises back above, they are forced to buy back (cover) their losing shorts, which creates additional buying pressure — a "short squeeze."',
    action:
      'This is a bullish reversal signal. Enter long with a stop-loss below the trap wick low. The short-covering rally can be rapid and significant.',
    diagram: '→ Support line → Price breaks below (weak volume) → Returns above support → Shorts cover → 🚀 Rally',
  },
  {
    type: 'FOMO_ZONE',
    icon: '🚫',
    title: 'FOMO Risk Zone',
    tagline: 'Too late — chasing leads to losses',
    color: '#FF4757',
    whatHappened:
      'The stock has already run up significantly from its demand zone. RSI is elevated (above 72), price is far above the nearest support, and volume is actually declining — fewer buyers are participating.',
    whatItMeans:
      'The move is overextended. "Fear of Missing Out" is driving new buyers in at the top, while informed traders are starting to sell. The risk/reward ratio is extremely unfavorable here.',
    action:
      'Do NOT enter. Missing a move is much better than buying at the top and holding a loss. Wait patiently for price to pull back to a fresh demand zone before considering entry.',
    diagram: '📈 Strong rally from zone → Price extends far from zone → RSI overbought → Volume fades → 🚫 Avoid',
  },
  {
    type: 'EUPHORIA',
    icon: '🤑',
    title: 'Euphoria Zone',
    tagline: 'Extreme greed — the smart money exit',
    color: '#FF4757',
    whatHappened:
      'The price is dramatically above its 200-day average, RSI shows extreme readings above 78, and the stock is near or above a known supply zone where sellers have previously stepped in.',
    whatItMeans:
      'Euphoria means almost everyone who wants to buy has already bought. There are very few new buyers left to push the price higher, while sellers are lined up in significant quantities overhead.',
    action:
      'Absolutely avoid new entries. If you already hold the stock, this is the time to consider taking profits, not adding more. The downside risk from euphoria levels is historically severe.',
    diagram: '🚀 Extended rally → 200 EMA far below → RSI > 78 → Supply zone overhead → 📉 Sharp correction',
  },
]

export default function LearnScreen() {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Market Psychology Guide</Text>
        <Text style={styles.subtitle}>Why prices move the way they do</Text>
      </View>

      {PSYCHOLOGY_PATTERNS.map((pattern) => {
        const isOpen = expanded === pattern.type
        return (
          <TouchableOpacity
            key={pattern.type}
            style={[styles.card, { borderColor: isOpen ? pattern.color + '60' : '#1E1E2E' }]}
            onPress={() => setExpanded(isOpen ? null : pattern.type)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>{pattern.icon}</Text>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: pattern.color }]}>{pattern.title}</Text>
                <Text style={styles.cardTagline}>{pattern.tagline}</Text>
              </View>
              <Text style={[styles.chevron, { color: pattern.color }]}>{isOpen ? '▲' : '▼'}</Text>
            </View>

            {isOpen && (
              <View style={styles.cardBody}>
                <View style={styles.divider} />

                <View style={[styles.diagramBox, { borderColor: pattern.color + '40' }]}>
                  <Text style={[styles.diagramText, { color: pattern.color }]}>{pattern.diagram}</Text>
                </View>

                <SectionBlock
                  label="What happened"
                  color="#FFD32A"
                  text={pattern.whatHappened}
                />
                <SectionBlock
                  label="What it means"
                  color="#6C63FF"
                  text={pattern.whatItMeans}
                />
                <SectionBlock
                  label="Your action"
                  color="#00C896"
                  text={pattern.action}
                />
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
