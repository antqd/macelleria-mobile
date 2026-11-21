import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
export const guestStorage = {
  get: (key: string) => SecureStore.getItemAsync(key, options),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, options),
};
export const tapFeedback = () => { void Haptics.selectionAsync().catch(() => {}); };

export async function requestPushToken() {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Le notifiche non sono configurate per questa versione.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('orders', { name: 'Ordini', importance: Notifications.AndroidImportance.DEFAULT });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Puoi consentire le notifiche dalle impostazioni del telefono.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
