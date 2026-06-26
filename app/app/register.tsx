import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import DOBPickerModal from '../components/DOBPickerModal'

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Chandigarh','Puducherry','Other',
]

export default function RegisterScreen() {
  const router = useRouter()
  const { register } = useAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)

  // Step 1 - Account
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Step 2 - Profile
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [showDobPicker, setShowDobPicker] = useState(false)
  const [dobDay, setDobDay] = useState(1)
  const [dobMonth, setDobMonth] = useState(1)
  const [dobYear, setDobYear] = useState(2000)
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [showStates, setShowStates] = useState(false)

  function validateStep1() {
    if (!email.trim() || !password || !confirmPass) {
      Alert.alert('Missing fields', 'Please fill all fields.'); return false
    }
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email.'); return false
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.'); return false
    }
    if (password !== confirmPass) {
      Alert.alert('Password mismatch', 'Passwords do not match.'); return false
    }
    return true
  }

  function validateStep2() {
    if (!fullName.trim() || !dob.trim() || !city.trim() || !state) {
      Alert.alert('Missing fields', 'Please fill all profile fields.'); return false
    }
    return true
  }

  async function handleRegister() {
    if (!validateStep2()) return
    setLoading(true)
    try {
      await register(email.trim().toLowerCase(), password, { fullName, dob, city, state })
      router.replace('/')
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use' ? 'This email is already registered.' :
                  e.code === 'auth/invalid-email' ? 'Invalid email address.' :
                  'Registration failed. Please try again.'
      Alert.alert('Error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Text style={styles.logoIcon}>📊</Text>
          <Text style={styles.logoText}>StockSage</Text>
          <Text style={styles.trialBadge}>🎉 30 Days FREE Trial</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
          <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        </View>
        <Text style={styles.stepLabel}>{step === 1 ? 'Step 1: Create Account' : 'Step 2: Your Profile'}</Text>

        <View style={styles.card}>
          {step === 1 ? (
            <>
              <Text style={styles.title}>Create Account</Text>

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor="#4A4A6A"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <View style={styles.passRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min 6 characters"
                  placeholderTextColor="#4A4A6A"
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(!showPass)}>
                  <Text>{showPass ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPass}
                onChangeText={setConfirmPass}
                placeholder="Repeat password"
                placeholderTextColor="#4A4A6A"
                secureTextEntry={!showPass}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={() => validateStep1() && setStep(2)}>
                <Text style={styles.primaryBtnText}>Next →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Tell us about you</Text>

              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Rahul Sharma"
                placeholderTextColor="#4A4A6A"
              />

              <Text style={styles.label}>Date of Birth</Text>
              <TouchableOpacity style={[styles.input, styles.selectBtn]} onPress={() => setShowDobPicker(true)}>
                <Text style={{ color: dob ? '#FFFFFF' : '#4A4A6A', fontSize: 15 }}>{dob || 'Select date of birth'}</Text>
                <Text style={{ color: '#8B8FA8' }}>📅</Text>
              </TouchableOpacity>
              <DOBPickerModal
                visible={showDobPicker}
                day={dobDay} month={dobMonth} year={dobYear}
                onDayChange={setDobDay} onMonthChange={setDobMonth} onYearChange={setDobYear}
                onConfirm={() => {
                  const d = String(dobDay).padStart(2, '0')
                  const m = String(dobMonth).padStart(2, '0')
                  setDob(`${d}/${m}/${dobYear}`)
                  setShowDobPicker(false)
                }}
                onClose={() => setShowDobPicker(false)}
              />

              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="Mumbai"
                placeholderTextColor="#4A4A6A"
              />

              <Text style={styles.label}>State</Text>
              <TouchableOpacity
                style={[styles.input, styles.selectBtn]}
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

              <View style={styles.trialInfo}>
                <Text style={styles.trialInfoText}>✅ 30 days free trial starts now</Text>
                <Text style={styles.trialInfoText}>✅ No credit card required</Text>
                <Text style={styles.trialInfoText}>✅ ₹499/month after trial</Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleRegister} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity onPress={() => router.push('/login' as any)} style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.link}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 48 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logoIcon: { fontSize: 40, marginBottom: 6 },
  logoText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  trialBadge: { backgroundColor: '#00C89620', color: '#00C896', fontSize: 13, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 8, overflow: 'hidden' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E1E2E' },
  stepDotActive: { backgroundColor: '#6C63FF' },
  stepLine: { width: 60, height: 2, backgroundColor: '#1E1E2E', marginHorizontal: 6 },
  stepLineActive: { backgroundColor: '#6C63FF' },
  stepLabel: { color: '#8B8FA8', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  card: { backgroundColor: '#13131A', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1E1E2E' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 20 },
  label: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#1E1E2E',
    color: '#FFFFFF', fontSize: 15, paddingHorizontal: 14, height: 48,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 10 },
  selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chevron: { color: '#8B8FA8' },
  stateList: { maxHeight: 180, backgroundColor: '#0A0A0F', borderRadius: 10, borderWidth: 1, borderColor: '#1E1E2E', marginTop: 4 },
  stateItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  stateItemActive: { backgroundColor: '#6C63FF15' },
  stateText: { color: '#FFFFFF', fontSize: 14 },
  trialInfo: { backgroundColor: '#00C89610', borderRadius: 10, padding: 14, marginTop: 20, gap: 6 },
  trialInfoText: { color: '#00C896', fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  primaryBtn: { backgroundColor: '#6C63FF', borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  backBtn: { backgroundColor: '#1E1E2E', borderRadius: 12, height: 50, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  backBtnText: { color: '#8B8FA8', fontSize: 14, fontWeight: '600' },
  linkRow: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#8B8FA8', fontSize: 13 },
  link: { color: '#6C63FF', fontWeight: '700' },
})
