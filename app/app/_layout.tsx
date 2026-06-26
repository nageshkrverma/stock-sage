import React, { useEffect } from 'react'
import { Tabs, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { AlertsProvider } from '../context/AlertsContext'
import { useOTAUpdate } from '../hooks/useOTAUpdate'
import { registerForPushNotifications } from '../lib/notifications'

const queryClient = new QueryClient()

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return
    const path = segments.join('/')
    const inAuthGroup = path.includes('login') || path.includes('register')
    if (!user && !inAuthGroup) {
      router.replace('/login')
    } else if (user && inAuthGroup) {
      router.replace('/')
    }
  }, [user, loading, segments])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>📊</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>StockSage</Text>
        <ActivityIndicator color="#6C63FF" style={{ marginTop: 24 }} />
      </View>
    )
  }

  return <>{children}</>
}

function OTAUpdateChecker() {
  useOTAUpdate()
  return null
}

function PushNotificationRegistrar() {
  const { profile } = useAuth()
  useEffect(() => {
    if (profile?.email) {
      registerForPushNotifications(profile.email).catch(() => {})
    }
  }, [profile?.email])
  return null
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AlertsProvider>
        <OTAUpdateChecker />
        <PushNotificationRegistrar />
        <StatusBar style="light" backgroundColor="#0A0A0F" />
        <AuthGuard>
          <Tabs
            screenOptions={{
              headerStyle: { backgroundColor: '#0A0A0F', shadowColor: 'transparent', elevation: 0 },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '800', fontSize: 20, letterSpacing: -0.5 },
              tabBarStyle: {
                backgroundColor: '#0D0D14',
                borderTopColor: '#1E1E2E',
                borderTopWidth: 1,
                height: 64,
                paddingBottom: 8,
                paddingTop: 6,
              },
              tabBarActiveTintColor: '#6C63FF',
              tabBarInactiveTintColor: '#4A4A6A',
              tabBarLabelStyle: { fontSize: 12, fontWeight: '700', marginTop: 2 },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'StockSage',
                tabBarLabel: 'Signals',
                tabBarIcon: ({ color, focused }) => <TabIcon icon="📊" color={color} focused={focused} />,
                headerShown: true,
                headerRight: () => <ProfileHeaderButton />,
              }}
            />
            <Tabs.Screen
              name="scanner"
              options={{
                title: 'Stock Search',
                tabBarLabel: 'Search',
                tabBarIcon: ({ color, focused }) => <TabIcon icon="🔍" color={color} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="learn"
              options={{
                title: 'Psychology Guide',
                tabBarLabel: 'Learn',
                tabBarIcon: ({ color, focused }) => <TabIcon icon="🧠" color={color} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="mytrades"
              options={{
                title: 'Paper Trades',
                tabBarLabel: 'Trades',
                tabBarIcon: ({ color, focused }) => <TabIcon icon="💼" color={color} focused={focused} />,
              }}
            />
            <Tabs.Screen name="signal/[id]" options={{ href: null, headerShown: true, title: 'Signal Detail' }} />
            <Tabs.Screen name="stock/[symbol]" options={{ href: null, headerShown: true, title: 'Stock Analysis' }} />
            <Tabs.Screen name="nse_stocks" options={{ href: null }} />
            <Tabs.Screen name="login" options={{ href: null, headerShown: false }} />
            <Tabs.Screen name="register" options={{ href: null, headerShown: false }} />
            <Tabs.Screen name="profile" options={{ href: null, headerShown: false, title: 'My Profile' }} />
            <Tabs.Screen name="paywall" options={{ href: null, headerShown: false }} />
          </Tabs>
        </AuthGuard>
        </AlertsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function ProfileHeaderButton() {
  const router = useRouter()
  const { profile, isAdmin } = useAuth()
  return (
    <TouchableOpacity
      onPress={() => router.navigate(profile ? '/profile' : '/login' as any)}
      style={tabStyles.profileBtn}
    >
      <View style={[tabStyles.profileAvatar, !profile && tabStyles.profileAvatarGuest]}>
        <Text style={tabStyles.profileAvatarText}>
          {profile ? profile.fullName.charAt(0).toUpperCase() : '👤'}
        </Text>
      </View>
      <View>
        <Text style={tabStyles.profileName} numberOfLines={1}>
          {profile ? profile.fullName.split(' ')[0] : 'Sign In'}
        </Text>
        {profile && (
          <Text style={tabStyles.profileRole}>
            {isAdmin() ? '⚙️ Admin' : '✅ Active'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function TabIcon({ icon, color, focused }: { icon: string; color: string; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={tabStyles.icon}>{icon}</Text>
    </View>
  )
}

const tabStyles = StyleSheet.create({
  iconWrap: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  iconWrapActive: { backgroundColor: '#6C63FF20' },
  icon: { fontSize: 18 },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, paddingVertical: 4 },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center' },
  profileAvatarGuest: { backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#3A3A5A' },
  profileAvatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  profileName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  profileRole: { color: '#8B8FA8', fontSize: 10, marginTop: 1 },
})
