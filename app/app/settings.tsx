import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Linking,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'

const NOTIF_KEYS = {
  zone_entry:      'tradingbabaji_alert_zone_entry',
  zone_invalid:    'tradingbabaji_alert_zone_invalid',
  target_hit:      'tradingbabaji_alert_target_hit',
  oi_buildup:      'tradingbabaji_alert_oi_buildup',
  fno_exit:        'tradingbabaji_alert_fno_exit',
  morning_brief:   'tradingbabaji_alert_morning_brief',
}

type NotifKey = keyof typeof NOTIF_KEYS

const NOTIF_LABELS: Record<NotifKey, { label: string; desc: string }> = {
  zone_entry:    { label: 'Zone Entry Alert',       desc: 'When a stock price enters your setup zone' },
  zone_invalid:  { label: 'Zone Invalidation',      desc: 'When a setup is invalidated by price action' },
  target_hit:    { label: 'Target Hit',             desc: 'When price reaches your first target' },
  oi_buildup:    { label: 'OI Buildup Alert',       desc: 'Large open interest changes in F&O' },
  fno_exit:      { label: 'F&O Exit Reminder',      desc: 'Daily reminder at 3:10 PM to exit options' },
  morning_brief: { label: 'Morning Briefing 9 AM',  desc: 'Daily market overview before the opening bell' },
}

export default function SettingsScreen() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>({
    zone_entry:    true,
    zone_invalid:  true,
    target_hit:    true,
    oi_buildup:    false,
    fno_exit:      true,
    morning_brief: true,
  })
  const [fnoView, setFnoView] = useState<'detailed' | 'simple'>('detailed')

  useEffect(() => {
    const keys = Object.values(NOTIF_KEYS)
    AsyncStorage.multiGet([...keys, 'tradingbabaji_fno_view_mode']).then((pairs) => {
      const updates: Partial<Record<NotifKey, boolean>> = {}
      pairs.forEach(([k, v]) => {
        const notifKey = (Object.entries(NOTIF_KEYS).find(([, val]) => val === k)?.[0]) as NotifKey | undefined
        if (notifKey && v !== null) updates[notifKey] = v === 'true'
        if (k === 'tradingbabaji_fno_view_mode' && v) setFnoView(v as any)
      })
      setNotifs((prev) => ({ ...prev, ...updates }))
    })
  }, [])

  function toggleNotif(key: NotifKey, val: boolean) {
    setNotifs((prev) => ({ ...prev, [key]: val }))
    AsyncStorage.setItem(NOTIF_KEYS[key], String(val))
  }

  function toggleFnoView(val: boolean) {
    const mode = val ? 'simple' : 'detailed'
    setFnoView(mode)
    AsyncStorage.setItem('tradingbabaji_fno_view_mode', mode)
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Notification Toggles */}
      <Text style={styles.sectionHeader}>Notifications</Text>
      <View style={styles.card}>
        {(Object.keys(NOTIF_LABELS) as NotifKey[]).map((key, i, arr) => (
          <View key={key} style={[styles.row, i < arr.length - 1 && styles.rowBorder]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>{NOTIF_LABELS[key].label}</Text>
              <Text style={styles.rowDesc}>{NOTIF_LABELS[key].desc}</Text>
            </View>
            <Switch
              value={notifs[key]}
              onValueChange={(v) => toggleNotif(key, v)}
              trackColor={{ false: '#2A2A3A', true: '#6C63FF' }}
              thumbColor={notifs[key] ? '#FFFFFF' : '#8B8FA8'}
            />
          </View>
        ))}
      </View>

      {/* Preferences */}
      <Text style={styles.sectionHeader}>Preferences</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>F&O Simple View</Text>
            <Text style={styles.rowDesc}>Show arrow + probability instead of full analysis</Text>
          </View>
          <Switch
            value={fnoView === 'simple'}
            onValueChange={toggleFnoView}
            trackColor={{ false: '#2A2A3A', true: '#6C63FF' }}
            thumbColor={fnoView === 'simple' ? '#FFFFFF' : '#8B8FA8'}
          />
        </View>
      </View>

      {/* Account */}
      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.card}>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>Name</Text>
          <Text style={styles.rowValue}>{profile?.fullName ?? '—'}</Text>
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{profile?.email ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Research Analyst</Text>
          <Text style={styles.rowValue}>SEBI Registered RA</Text>
        </View>
      </View>

      {/* Legal */}
      <Text style={styles.sectionHeader}>Legal</Text>
      <View style={styles.card}>
        <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => router.push('/legal' as any)}>
          <Text style={styles.rowLabel}>Disclaimer & Legal</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('mailto:support@tradingbabaji.in')}>
          <Text style={styles.rowLabel}>Contact Support</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* App version */}
      <Text style={styles.version}>TradingBabaji · v2.0</Text>

      {profile && (
        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut?.()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },

  sectionHeader: {
    color: '#555566',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  card: {
    backgroundColor: '#13131A',
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    justifyContent: 'space-between',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowDesc:  { color: '#555566', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#8B8FA8', fontSize: 13 },
  chevron:  { color: '#555566', fontSize: 20 },

  version: { color: '#333344', fontSize: 12, textAlign: 'center', marginTop: 24 },

  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FF475715',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF475740',
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#FF4757', fontSize: 15, fontWeight: '700' },
})
