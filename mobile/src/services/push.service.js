import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

// expo-notifications native module is unavailable in Expo Go (SDK 53+).
// Lazy-load so Expo Go doesn't crash at module init; real devices / dev builds work normally.
const IS_EXPO_GO = Constants.appOwnership === 'expo';
let Notifications = null;
let Device = null;

function loadNativeModules() {
    if (IS_EXPO_GO) return false;
    if (Notifications) return true;
    try {
        Notifications = require('expo-notifications');
        Device = require('expo-device');
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
        return true;
    } catch (err) {
        console.warn('[Push] expo-notifications unavailable:', err?.message || err);
        return false;
    }
}

/**
 * Request permission and obtain Expo push token.
 * Returns the token string, or null if not granted / not on a real device.
 */
export async function registerForPushNotificationsAsync() {
    if (!loadNativeModules()) {
        console.log('[Push] Running in Expo Go or native module missing — skipping push registration');
        return null;
    }
    if (!Device.isDevice) {
        console.log('[Push] Not a physical device — skipping push registration');
        return null;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        console.log('[Push] Permission not granted');
        return null;
    }

    try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        return tokenData.data;
    } catch (err) {
        console.warn('[Push] Failed to get expo push token:', err?.message || err);
        return null;
    }
}

/**
 * Register the current device's push token with the backend.
 * Safe to call multiple times — backend just upserts.
 */
export async function syncPushTokenWithBackend() {
    try {
        const token = await registerForPushNotificationsAsync();
        if (!token) return null;
        await api.post('/api/push/register', { expoPushToken: token });
        return token;
    } catch (err) {
        console.warn('[Push] sync failed:', err?.message || err);
        return null;
    }
}

/**
 * Tell backend to forget this device's token (logout).
 */
export async function unregisterPushToken() {
    try {
        await api.post('/api/push/unregister');
    } catch (err) {
        console.warn('[Push] unregister failed:', err?.message || err);
    }
}

export default {
    registerForPushNotificationsAsync,
    syncPushTokenWithBackend,
    unregisterPushToken,
};
