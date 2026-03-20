import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

const REVENUECAT_API_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_PLACEHOLDER',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || 'goog_PLACEHOLDER'
};

const ENTITLEMENT_ID = 'premium';

let configured = false;

const configure = async () => {
  if (configured) {
    return { success: true, data: null };
  }

  try {
    const apiKey = Platform.OS === 'ios'
      ? REVENUECAT_API_KEYS.ios
      : REVENUECAT_API_KEYS.android;

    await Purchases.configure({ apiKey });
    configured = true;
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const loginUser = async (userId) => {
  try {
    const { customerInfo } = await Purchases.logIn(String(userId));
    return { success: true, data: customerInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const logoutUser = async () => {
  try {
    const customerInfo = await Purchases.logOut();
    return { success: true, data: customerInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return { success: true, data: offerings };
  } catch (error) {
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
  }
};

const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    return { success: true, data: { customerInfo, isActive } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return { success: true, data: customerInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const onCustomerInfoUpdate = (callback) => {
  const listener = Purchases.addCustomerInfoUpdateListener(callback);
  return listener;
};

const parseCustomerInfo = (customerInfo) => {
  if (!customerInfo) {
    return { isSubscribed: false, expirationDate: null, willRenew: false };
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
