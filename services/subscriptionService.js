import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import * as Sentry from '@sentry/react-native';

const REVENUECAT_API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
};

// Must match the entitlement identifier in RevenueCat > Project > Entitlements.
// A mismatch causes isSubscribed to always return false with no error.
const ENTITLEMENT_ID = 'premium';

const UNSUBSCRIBED_DEFAULT = { isSubscribed: false, expirationDate: null, willRenew: false };

const configure = async () => {
  try {
    const apiKey = Platform.OS === 'ios'
      ? REVENUECAT_API_KEYS.ios
      : REVENUECAT_API_KEYS.android;

    if (!apiKey) {
      const platform = Platform.OS === 'ios' ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY' : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';
      return { success: false, error: `RevenueCat API key not configured. Set ${platform} in .env`, code: 'MISSING_API_KEY' };
    }

    await Purchases.configure({ apiKey });
    return { success: true, data: null };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const loginUser = async (userId) => {
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const logoutUser = async () => {
  try {
    const customerInfo = await Purchases.logOut();
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return { success: true, data: offerings };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const purchasePackage = async (pkg) => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    if (error.userCancelled) {
      return { success: false, error: 'USER_CANCELLED', code: 'USER_CANCELLED' };
    }
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message, code: error.code };
  }
};

const onCustomerInfoUpdate = (callback) => {
  try {
    const listener = Purchases.addCustomerInfoUpdateListener(callback);
    return { success: true, data: listener };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message };
  }
};

const parseCustomerInfo = (customerInfo) => {
  try {
    if (!customerInfo) {
      return { ...UNSUBSCRIBED_DEFAULT };
    }

    const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];
    const isSubscribed = entitlement !== undefined;

    return {
      isSubscribed,
      expirationDate: entitlement?.expirationDate
        ? new Date(entitlement.expirationDate)
        : null,
      willRenew: entitlement?.willRenew ?? false
    };
  } catch (error) {
    Sentry.captureException(error);
    return { ...UNSUBSCRIBED_DEFAULT };
  }
};

export {
  configure,
  loginUser,
  logoutUser,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  onCustomerInfoUpdate,
  parseCustomerInfo,
  ENTITLEMENT_ID
};

export default {
  configure,
  loginUser,
  logoutUser,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  onCustomerInfoUpdate,
  parseCustomerInfo,
  ENTITLEMENT_ID
};
