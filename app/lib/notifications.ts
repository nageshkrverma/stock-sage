import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const FCM_TOKEN_KEY = 'stocksage_fcm_token'
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec'

// How notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotifications(userEmail: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null // won't work on emulator

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return null

    // Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'StockSage Signals',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C63FF',
        sound: 'default',
      })
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '6aae6d2f-c7f5-4c1a-b0f0-ddd4ef1ecec0',
    })
    const token = tokenData.data

    // Save token locally
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token)

    // Sync token to Google Sheet via GAS
    await syncTokenToSheet(userEmail, token)

    return token
  } catch (e) {
    return null
  }
}

async function syncTokenToSheet(email: string, token: string) {
  try {
    const params = new URLSearchParams({
      action: 'saveToken',
      email,
      token,
      platform: Platform.OS,
      updatedAt: new Date().toISOString(),
    })
    await fetch(`${GAS_URL}?${params.toString()}`)
  } catch {}
}

export async function getSavedToken(): Promise<string | null> {
  return AsyncStorage.getItem(FCM_TOKEN_KEY)
}
