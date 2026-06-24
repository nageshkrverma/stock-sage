import React from 'react'
import { Tabs } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { View, Text, StyleSheet } from 'react-native'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#0A0A0F" />
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
          options={{ href: null }}
        />
        <Tabs.Screen
          name="signal/[id]"
          options={{ href: null, headerShown: true, title: 'Signal Detail' }}
        />
      </Tabs>
    </QueryClientProvider>
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
  iconWrap: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconWrapActive: {
    backgroundColor: '#6C63FF20',
  },
  icon: {
    fontSize: 18,
  },
})
