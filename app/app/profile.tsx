import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, TextInput, Platform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Chandigarh','Puducherry','Other',
]

export default function ProfileScreen() {
  const router = useRouter()
  const { profile, logout, isTrialActive, daysLeftInTrial, isAdmin, updateUserProfile } = useAuth()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState(profile?.fullName ?? '')
  const [dob, setDob] = useState(profile?.dob ?? '')
  const [dobDate, setDobDate] = useState<Date>(() => {
    if (profile?.dob) {
      const [d, m, y] = profile.dob.split('/')
      return new Date(Number(y), Number(m) - 1, Number(d))
    }
    return new Date(2000, 0, 1)
  })
  const [showDobPicker, setShowDobPicker] = useState(false)
  const [city, setCity] = useState(profile?.city ?? '')
  const [state, setState] = useState(profile?.state ?? '')
  const [showStates, setShowStates] = useState(false)

  if (!profile) return null

  const daysLeft = daysLeftInTrial()
  const active = isTrialActive()
  const registeredDate = new Date(profile.registeredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const freeUntilDate = new Date(profile.freeUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  function startEdit() {
    setFullName(profile.fullName)
    setDob(profile.dob)
    setCity(profile.city)
    setState(profile.state)
    setShowStates(false)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setShowStates(false)
  }

  async function saveEdit() {
    if (!fullName.trim()) { Alert.alert('Error', 'Full name is required.'); return }
    if (!city.trim()) { Alert.alert('Error', 'City is required.'); return }
    setSaving(true)
    try {
      await updateUserProfile({ fullName: fullName.trim(), dob, city: city.trim(), state })
      setEditing(false)
      Alert.alert('Saved', 'Profile updated successfully.')
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{profile.fullName}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        {isAdmin() && (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>⚙️ Admin · Unlimited Access</Text>
          </View>
        )}
      </View>

      {/* Plan status */}
      <View style={[styles.planCard, active ? styles.planCardActive : styles.planCardExpired]}>
        <View style={styles.planRow}>
          <Text style={styles.planLabel}>Plan Status</Text>
          <View style={[styles.planBadge, { backgroundColor: active ? '#00C89620' : '#FF475720' }]}>
            <Text style={[styles.planBadgeText, { color: active ? '#00C896' : '#FF4757' }]}>
              {profile.plan === 'paid' ? '✅ Active' : active ? `⏳ Trial (${daysLeft}d left)` : '❌ Expired'}
            </Text>
          </View>
        </View>
        {profile.plan !== 'paid' && (
          <Text style={styles.planSub}>
            {active ? `Free trial until ${freeUntilDate}` : 'Your trial has expired'}
          </Text>
        )}
        {!active && (
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/paywall' as any)}>
            <Text style={styles.upgradeBtnText}>Upgrade to Pro — ₹499/month</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Profile info / edit */}
      <View style={styles.infoCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          {!editing ? (
            <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
              <Text style={styles.editBtnText}>✏️  Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Name"
              placeholderTextColor="#4A4A6A"
            />

            <Text style={styles.fieldLabel}>Date of Birth</Text>
            <TouchableOpacity style={[styles.fieldInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowDobPicker(true)}>
              <Text style={{ color: dob ? '#FFFFFF' : '#4A4A6A', fontSize: 15 }}>
                {dob || 'Select date of birth'}
              </Text>
              <Text style={{ color: '#8B8FA8' }}>📅</Text>
            </TouchableOpacity>
            {showDobPicker && (
              <DateTimePicker
                value={dobDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                minimumDate={new Date(1940, 0, 1)}
                onChange={(_, selected) => {
                  setShowDobPicker(Platform.OS === 'ios')
                  if (selected) {
                    setDobDate(selected)
                    const d = selected.getDate().toString().padStart(2, '0')
                    const m = (selected.getMonth() + 1).toString().padStart(2, '0')
                    const y = selected.getFullYear()
                    setDob(`${d}/${m}/${y}`)
                  }
                }}
              />
            )}

            <Text style={styles.fieldLabel}>City</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#4A4A6A"
            />

            <Text style={styles.fieldLabel}>State</Text>
            <TouchableOpacity
              style={[styles.fieldInput, styles.selectBtn]}
              onPress={() => setShowStates(!showStates)}
            >
              <Text style={{ color: state ? '#FFFFFF' : '#4A4A6A', fontSize: 15 }}>
                {state || 'Select state...'}
              </Text>
              <Text style={styles.chevron}>{showStates ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showStates && (
              <ScrollView style={styles.stateList} nestedScrollEnabled>
                {INDIAN_STATES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.stateItem, state === s && styles.stateItemActive]}
                    onPress={() => { setState(s); setShowStates(false) }}
                  >
                    <Text style={[styles.stateText, state === s && { color: '#6C63FF', fontWeight: '700' }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.readonlyRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValueMuted}>{profile.email}</Text>
            </View>
            <View style={styles.readonlyRow}>
              <Text style={styles.infoLabel}>Member Since</Text>
              <Text style={styles.infoValueMuted}>{registeredDate}</Text>
            </View>
          </>
        ) : (
          <>
            {[
              { label: 'Full Name', value: profile.fullName },
              { label: 'Date of Birth', value: profile.dob || '—' },
              { label: 'City', value: profile.city || '—' },
              { label: 'State', value: profile.state || '—' },
              { label: 'Email', value: profile.email },
              { label: 'Member Since', value: registeredDate },
            ].map(({ label, value }) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* About App */}
      <View style={styles.aboutCard}>
        <Text style={styles.aboutAppName}>📈 StockSage</Text>
        <Text style={styles.aboutTagline}>Smart NSE Stock Signals & Analysis</Text>
        <View style={styles.aboutDivider} />
        <Text style={styles.aboutDevLabel}>Developed by</Text>
        <Text style={styles.aboutDevName}>TradingBabaji</Text>
        <Text style={styles.aboutVersion}>Version 1.0.0</Text>
      </View>

      {/* Support */}
      <View style={styles.supportCard}>
        <Text style={styles.supportTitle}>Need Help?</Text>
        <Text style={styles.supportText}>Email us at:</Text>
        <Text style={styles.supportEmail}>tradingbabaaji@gmail.com</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { padding: 24, paddingBottom: 60 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#6C63FF', fontSize: 14, fontWeight: '600' },
  avatarWrap: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  email: { color: '#8B8FA8', fontSize: 14, marginTop: 4 },
  adminBadge: { backgroundColor: '#FFD70020', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8, borderWidth: 1, borderColor: '#FFD700' },
  adminBadgeText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  planCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  planCardActive: { backgroundColor: '#13131A', borderColor: '#00C89640' },
  planCardExpired: { backgroundColor: '#13131A', borderColor: '#FF475740' },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  planBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  planBadgeText: { fontSize: 12, fontWeight: '700' },
  planSub: { color: '#8B8FA8', fontSize: 13, marginTop: 6 },
  upgradeBtn: { backgroundColor: '#6C63FF', borderRadius: 10, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  upgradeBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  infoCard: { backgroundColor: '#13131A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E2E' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  editBtn: { backgroundColor: '#6C63FF20', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#6C63FF50' },
  editBtnText: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { backgroundColor: '#1E1E2E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelBtnText: { color: '#8B8FA8', fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  fieldLabel: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  fieldInput: {
    backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A',
    color: '#FFFFFF', fontSize: 15, paddingHorizontal: 14, height: 48,
  },
  selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chevron: { color: '#8B8FA8' },
  stateList: { maxHeight: 160, backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', marginTop: 4 },
  stateItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  stateItemActive: { backgroundColor: '#6C63FF15' },
  stateText: { color: '#FFFFFF', fontSize: 14 },
  readonlyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E2E', marginTop: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  infoLabel: { color: '#8B8FA8', fontSize: 13 },
  infoValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  infoValueMuted: { color: '#4A4A6A', fontSize: 13, maxWidth: '60%', textAlign: 'right' },
  supportCard: { backgroundColor: '#13131A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E2E', alignItems: 'center' },
  supportTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  supportText: { color: '#8B8FA8', fontSize: 13 },
  supportEmail: { color: '#6C63FF', fontSize: 14, fontWeight: '700', marginTop: 4 },
  logoutBtn: { backgroundColor: '#FF475720', borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF4757' },
  logoutText: { color: '#FF4757', fontSize: 15, fontWeight: '800' },
  aboutCard: { backgroundColor: '#13131A', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1E1E2E', alignItems: 'center' },
  aboutAppName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  aboutTagline: { color: '#8B8FA8', fontSize: 13, marginTop: 4, textAlign: 'center' },
  aboutDivider: { width: 40, height: 2, backgroundColor: '#6C63FF', borderRadius: 1, marginVertical: 14 },
  aboutDevLabel: { color: '#8B8FA8', fontSize: 12, fontWeight: '500' },
  aboutDevName: { color: '#6C63FF', fontSize: 18, fontWeight: '800', marginTop: 2 },
  aboutVersion: { color: '#4A4A6A', fontSize: 12, marginTop: 6 },
})
