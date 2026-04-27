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

// RC SDK error codes that reflect store/device policy outcomes (Apple/Google),
// not bugs in our code. Capture as breadcrumb-only to avoid Sentry noise; the
// caller still sees `success: false` and can show the message to the user.
const POLICY_ERROR_CODES = new Set([
  'PURCHASE_NOT_ALLOWED_ERROR',     // parental controls / device restriction
  'PURCHASE_INVALID_ERROR',         // store rejected purchase
  'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR',
  'STORE_PROBLEM_ERROR',            // generic Apple/Google store issue
  'CONFIGURATION_ERROR',            // app store config problem (paid-app, sandbox)
  'INELIGIBLE_ERROR',
  'PAYMENT_PENDING_ERROR'
]);

const isPolicyError = (error) => {
  if (!error) return false;
  if (POLICY_ERROR_CODES.has(error.code)) return true;
  // Some RN SDK builds surface the code only inside `userInfo`.
  const inner = error.userInfo && (error.userInfo.readableErrorCode || error.userInfo.code);
  return POLICY_ERROR_CODES.has(inner);
};

const captureRCError = (error, context) => {
  if (isPolicyError(error)) {
    // Add a breadcrumb so it shows up in incident timelines, but don't fire
    // an exception event.
    try {
      Sentry.addBreadcrumb({
        category: 'revenuecat_policy',
        level: 'info',
        message: error?.message || 'RevenueCat policy outcome',
        data: { context, code: error?.code }
      });
    } catch (_) { /* ignore */ }
    return;
  }
  Sentry.captureException(error, { extra: { context } });
};

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
    captureRCError(error, 'revenuecat_configure');
    return { success: false, error: error.message, code: error.code };
  }
};

const loginUser = async (userId) => {
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return { success: true, data: customerInfo };
  } catch (error) {
    captureRCError(error, 'revenuecat_login');
    return { success: false, error: error.message, code: error.code };
  }
};

const logoutUser = async () => {
  try {
    const customerInfo = await Purchases.logOut();
    return { success: true, data: customerInfo };
  } catch (error) {
    // Expected when the SDK is still on its anonymous user (no Purchases.logIn
    // has happened in this session). Treat as a no-op rather than an exception.
    const message = String(error?.message || '');
    if (message.includes('current user is anonymous')) {
      return { success: true, data: null, anonymous: true };
    }
    Sentry.captureException(error, { extra: { context: 'revenuecat_logout' } });
    return { success: false, error: error.message, code: error.code };
  }
};

const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return { success: true, data: offerings };
  } catch (error) {
    captureRCError(error, 'revenuecat_get_offerings');
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
    captureRCError(error, 'revenuecat_purchase');
    return { success: false, error: error.message, code: error.code };
  }
};

const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    captureRCError(error, 'revenuecat_restore');
    return { success: false, error: error.message, code: error.code };
  }
};

const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { success: true, data: customerInfo };
  } catch (error) {
    captureRCError(error, 'revenuecat_get_customer_info');
    return { success: false, error: error.message, code: error.code };
  }
};

const onCustomerInfoUpdate = (callback) => {
  try {
    const listener = Purchases.addCustomerInfoUpdateListener(callback);
    return { success: true, data: listener };
  } catch (error) {
    captureRCError(error, 'revenuecat_listener_setup');
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
    captureRCError(error, 'revenuecat_present_paywall');
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
    captureRCError(error, 'revenuecat_present_paywall_if_needed');
    return { success: false, error: error.message, code: error.code };
  }
};

const presentCustomerCenter = async () => {
  try {
    await RevenueCatUI.presentCustomerCenter();
    return { success: true, data: null };
  } catch (error) {
    captureRCError(error, 'revenuecat_customer_center');
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
