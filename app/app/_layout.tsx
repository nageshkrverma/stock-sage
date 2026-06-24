import React from 'react'
import { Tabs } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#0A0A0F" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#0A0A0F' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700' },
          tabBarStyle: {
            backgroundColor: '#0A0A0F',
            borderTopColor: '#1E1E2E',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#6C63FF',
          tabBarInactiveTintColor: '#8B8FA8',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'StockSage',
            tabBarLabel: 'Signals',
            tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
            headerShown: true,
          }}
        />
        <Tabs.Screen
          name="scanner"
          options={{
            title: 'Scanner',
            tabBarLabel: 'Scanner',
            tabBarIcon: ({ color }) => <TabIcon emoji="🔍" color={color} />,
          }}
        />
        <Tabs.Screen
          name="mytrades"
          options={{
            title: 'My Trades',
            tabBarLabel: 'Trades',
            tabBarIcon: ({ color }) => <TabIcon emoji="💼" color={color} />,
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            title: 'Psychology Guide',
            tabBarLabel: 'Learn',
            tabBarIcon: ({ color }) => <TabIcon emoji="🧠" color={color} />,
          }}
        />
        <Tabs.Screen
          name="signal/[id]"
          options={{ href: null, headerShown: true, title: 'Signal Detail' }}
        />
      </Tabs>
    </QueryClientProvider>
  )
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return (
    <View style={{ opacity: color === '#6C63FF' ? 1 : 0.6 }}>
      {/* Use text emoji as icon */}
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {/* placeholder — in production replace with vector icons */}
      </View>
    </View>
  )
}
