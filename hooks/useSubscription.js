import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import {
  configure,
  loginUser,
  logoutUser,
  getOfferings as fetchOfferings,
  purchasePackage as purchasePkg,
  restorePurchases as restorePurchasesService,
  getCustomerInfo,
  onCustomerInfoUpdate,
  parseCustomerInfo
} from '../services/subscriptionService';
import { fetchSubscriptionStatus } from '../services/subscriptionStatusService';
import { subscribeAuthEvents, getCurrentUserId } from '../services/authService';
import { STORAGE_KEYS } from '../services/config';

const SubscriptionContext = createContext(null);

const initialState = {
  isSubscribed: false,
  loading: true,
  expirationDate: null,
  willRenew: false,
  error: null,
  trial: {
    active: false,
    expiresAt: null,
    daysRemaining: 0
  },
  canGenerate: false,
  showOnboarding: false,
  showLapseModal: false
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_CUSTOMER_INFO':
      return {
        ...state,
        isSubscribed: action.payload.isSubscribed,
        expirationDate: action.payload.expirationDate,
        willRenew: action.payload.willRenew,
        canGenerate: action.payload.isSubscribed || state.trial.active,
        loading: false,
        error: null
      };
    case 'SET_TRIAL_STATUS':
      return {
        ...state,
        trial: action.payload,
        canGenerate: state.isSubscribed || action.payload.active
      };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SHOW_ONBOARDING':
      return { ...state, showOnboarding: true };
    case 'DISMISS_ONBOARDING':
      return { ...state, showOnboarding: false };
    case 'SHOW_LAPSE_MODAL':
      return { ...state, showLapseModal: true };
    case 'DISMISS_LAPSE_MODAL':
      return { ...state, showLapseModal: false };
    case 'RESET':
      return { ...initialState, loading: false };
    default:
      return state;
  }
};

const persistSubscriptionState = async (isSubscribed) => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.LAST_SUBSCRIPTION_STATE,
      JSON.stringify({ isSubscribed, timestamp: Date.now() })
    );
  } catch (error) {
    Sentry.captureException(error);
  }
};

const getLastSubscriptionState = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

export const SubscriptionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(true);
  const hasInitializedRef = useRef(false);
  const isConfiguredRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initSDK = useCallback(async () => {
    if (isConfiguredRef.current) {
      return { success: true };
    }

    const result = await configure();
    if (result.success) {
      isConfiguredRef.current = true;
    } else {
      Sentry.captureMessage(`RevenueCat SDK configuration failed: ${result.error}`, 'error');
    }
    return result;
  }, []);

  const fetchTrialStatus = useCallback(async () => {
    const result = await fetchSubscriptionStatus();
    if (!mountedRef.current) return;

    if (result.success) {
      dispatch({ type: 'SET_TRIAL_STATUS', payload: result.data.trial });
    } else {
      Sentry.captureMessage(`Failed to fetch trial status: ${result.error}`, 'warning');
      // On failure, keep previous trial state rather than overwriting with defaults
    }
  }, []);

  const checkLapse = useCallback(async (currentIsSubscribed) => {
    const lastState = await getLastSubscriptionState();
    if (lastState?.isSubscribed === true && currentIsSubscribed === false) {
      if (mountedRef.current) {
        dispatch({ type: 'SHOW_LAPSE_MODAL' });
      }
    }
    await persistSubscriptionState(currentIsSubscribed);
  }, []);

  const checkOnboarding = useCallback(async () => {
    try {
      const seen = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_SEEN);
      if (!seen && mountedRef.current) {
        dispatch({ type: 'SHOW_ONBOARDING' });
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }, []);

  const dismissOnboarding = useCallback(async () => {
    dispatch({ type: 'DISMISS_ONBOARDING' });
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_SEEN, 'true');
    } catch (error) {
      Sentry.captureException(error);
    }
  }, []);

  const dismissLapseModal = useCallback(() => {
    dispatch({ type: 'DISMISS_LAPSE_MODAL' });
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    try {
      if (!isConfiguredRef.current) {
        const initResult = await initSDK();
        if (!initResult.success) return;
      }

      const result = await getCustomerInfo();
      if (!mountedRef.current) return;

      if (result.success) {
        const parsed = parseCustomerInfo(result.data);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        await checkLapse(parsed.isSubscribed);
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error });
      }

      await fetchTrialStatus();
    } catch (error) {
      Sentry.captureException(error);
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: error.message });
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [initSDK, checkLapse, fetchTrialStatus]);

  // Initialization effect — guarded by ref to prevent double-fire
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const init = async () => {
      try {
        const initResult = await initSDK();
        if (!initResult.success || !mountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: initResult.error || 'SDK configuration failed' });
          return;
        }

        const userId = await getCurrentUserId();
        if (userId) {
          const loginResult = await loginUser(String(userId));
          if (!loginResult.success) {
            Sentry.captureMessage(`RevenueCat login failed: ${loginResult.error}`, 'warning');
          }
        }

        await refresh();
        await checkOnboarding();
      } catch (error) {
        Sentry.captureException(error);
        if (mountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: error.message });
        }
      }
    };

    init();
  }, [initSDK, refresh, checkOnboarding]);

  // Real-time subscription update listener
  useEffect(() => {
    if (!isConfiguredRef.current) return;

    const result = onCustomerInfoUpdate((customerInfo) => {
      if (!mountedRef.current) return;
      const parsed = parseCustomerInfo(customerInfo);
      dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
      persistSubscriptionState(parsed.isSubscribed);
    });

    if (!result.success) {
      Sentry.captureMessage(`Failed to register customer info listener: ${result.error}`, 'error');
    }

    return () => {
      if (!result.success) return;
      const listener = result.data;
      // RevenueCat SDK returns either a removal function or an object with .remove()
      if (typeof listener === 'function') {
        listener();
      } else if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAuthEvents(async (event) => {
      if (!isConfiguredRef.current) return;

      try {
        if (event === 'LOGIN') {
          const userId = await getCurrentUserId();
          if (userId) {
            const loginResult = await loginUser(String(userId));
            if (!loginResult.success) {
              Sentry.captureMessage(`RevenueCat login failed on auth event: ${loginResult.error}`, 'warning');
            }
          }
          await refresh();
          await checkOnboarding();
        } else if (event === 'LOGOUT') {
          const logoutResult = await logoutUser();
          if (!logoutResult.success) {
            Sentry.captureMessage(`RevenueCat logout failed: ${logoutResult.error}`, 'warning');
          }
          if (mountedRef.current) {
            dispatch({ type: 'RESET' });
          }
          await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
          await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_SEEN);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    });

    return unsubscribe;
  }, [refresh, checkOnboarding]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isConfiguredRef.current) {
        refresh().catch((error) => Sentry.captureException(error));
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const handlePurchasePackage = useCallback(async (pkg) => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const result = await purchasePkg(pkg);
      if (!mountedRef.current) return result;

      if (result.success) {
        const parsed = parseCustomerInfo(result.data.customerInfo);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        await persistSubscriptionState(parsed.isSubscribed);
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error });
      }
      return result;
    } catch (error) {
      Sentry.captureException(error);
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: error.message });
      }
      return { success: false, error: error.message };
    }
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const result = await restorePurchasesService();
      if (!mountedRef.current) return result;

      if (result.success) {
        const parsed = parseCustomerInfo(result.data.customerInfo);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        await persistSubscriptionState(parsed.isSubscribed);
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error });
      }
      return result;
    } catch (error) {
      Sentry.captureException(error);
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: error.message });
      }
      return { success: false, error: error.message };
    }
  }, []);

  const handleGetOfferings = useCallback(async () => {
    return fetchOfferings();
  }, []);

  const contextValue = useMemo(
    () => ({
      state,
      actions: {
        refresh,
        purchasePackage: handlePurchasePackage,
        restorePurchases: handleRestorePurchases,
        getOfferings: handleGetOfferings,
        dismissOnboarding,
        dismissLapseModal
      }
    }),
    [
      state,
      refresh,
      handlePurchasePackage,
      handleRestorePurchases,
      handleGetOfferings,
      dismissOnboarding,
      dismissLapseModal
    ]
  );

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context.state;
};

export const useSubscriptionActions = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscriptionActions must be used within a SubscriptionProvider');
  }
  return context.actions;
};

export const __TEST_ONLY__ = { reducer, initialState };
