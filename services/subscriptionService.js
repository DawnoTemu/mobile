import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import * as Sentry from '@sentry/react-native';

const REVENUECAT_API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
};

// Must match the entitlement identifier in RevenueCat > Project > Entitlements.
// A mismatch causes isSubscribed to always return false with no error.
// Dashboard path: RevenueCat > Project Settings > Entitlements > [identifier]
const ENTITLEMENT_ID = 'DawnoTemu Subscription';

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

    if (__DEV__) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }

    await Purchases.configure({ apiKey });
    return { success: true, data: null };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_configure' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const loginUser = async (userId) => {
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_login' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const logoutUser = async () => {
  try {
    const customerInfo = await Purchases.logOut();
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_logout' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return { success: true, data: offerings };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_get_offerings' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const purchasePackage = async (pkg) => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isActive = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    if (error.userCancelled) {
      return { success: false, error: 'USER_CANCELLED', code: 'USER_CANCELLED' };
    }
    Sentry.captureException(error, { extra: { context: 'revenuecat_purchase' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_restore' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { success: true, data: customerInfo };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_get_customer_info' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const onCustomerInfoUpdate = (callback) => {
  try {
    const listener = Purchases.addCustomerInfoUpdateListener(callback);
    return { success: true, data: listener };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_listener_setup' } });
    return { success: false, error: error.message };
  }
};

const parseCustomerInfo = (customerInfo) => {
  if (!customerInfo) {
    Sentry.captureMessage('parseCustomerInfo received null customerInfo', 'warning');
    return { ...UNSUBSCRIBED_DEFAULT };
  }

  if (typeof customerInfo.entitlements !== 'object' || customerInfo.entitlements === null) {
    Sentry.captureMessage('parseCustomerInfo received malformed customerInfo', {
      level: 'warning',
      extra: { type: typeof customerInfo.entitlements, keys: Object.keys(customerInfo) }
    });
    return { ...UNSUBSCRIBED_DEFAULT };
  }

  const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];
  const isSubscribed = entitlement !== undefined;

  let expirationDate = null;
  if (entitlement?.expirationDate) {
    const parsed = new Date(entitlement.expirationDate);
    if (Number.isFinite(parsed.getTime())) {
      expirationDate = parsed;
    } else {
      Sentry.captureMessage('parseCustomerInfo received invalid expirationDate', {
        level: 'warning',
        extra: { raw: entitlement.expirationDate }
      });
    }
  }

  return {
    isSubscribed,
    expirationDate,
    willRenew: entitlement?.willRenew ?? false
  };
};

const presentPaywall = async ({ offering, displayCloseButton = true } = {}) => {
  try {
    const options = { displayCloseButton };
    if (offering) {
      options.offering = offering;
    }
    const result = await RevenueCatUI.presentPaywall(options);
    return { success: true, data: result };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_present_paywall' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const presentPaywallIfNeeded = async ({ requiredEntitlementIdentifier } = {}) => {
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: requiredEntitlementIdentifier || ENTITLEMENT_ID
    });
    return { success: true, data: result };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_present_paywall_if_needed' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const presentCustomerCenter = async () => {
  try {
    await RevenueCatUI.presentCustomerCenter();
    return { success: true, data: null };
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'revenuecat_customer_center' } });
    return { success: false, error: error.message, code: error.code };
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
  presentPaywall,
  presentPaywallIfNeeded,
  presentCustomerCenter,
  ENTITLEMENT_ID,
  PAYWALL_RESULT
};
