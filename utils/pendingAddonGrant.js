import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { STORAGE_KEYS } from '../services/config';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const persistPendingAddonGrant = async (grantData) => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PENDING_ADDON_GRANT,
      JSON.stringify({ ...grantData, createdAt: Date.now() })
    );
    return true;
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'persist_pending_addon_grant' } });
    return false;
  }
};

export const clearPendingAddonGrant = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_ADDON_GRANT);
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'clear_pending_addon_grant' } });
  }
};

export const loadPendingAddonGrant = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_ADDON_GRANT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.createdAt > ONE_DAY_MS) {
      await clearPendingAddonGrant();
      return null;
    }
    return parsed;
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'load_pending_addon_grant' } });
    await clearPendingAddonGrant();
    return null;
  }
};
