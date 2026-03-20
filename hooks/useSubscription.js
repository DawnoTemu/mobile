import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  } catch (_) {
    // non-critical
  }
};

const getLastSubscriptionState = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

export const SubscriptionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(true);
  const configuredRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initSDK = useCallback(async () => {
    if (configuredRef.current) {
      return;
    }

    const result = await configure();
    if (result.success) {
      configuredRef.current = true;
    }
  }, []);

  const fetchTrialStatus = useCallback(async () => {
    const result = await fetchSubscriptionStatus();
    if (!mountedRef.current) return;

    if (result.success) {
      dispatch({ type: 'SET_TRIAL_STATUS', payload: result.data.trial });
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
    } catch (_) {
      // non-critical
    }
  }, []);

  const dismissOnboarding = useCallback(async () => {
    dispatch({ type: 'DISMISS_ONBOARDING' });
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_SEEN, 'true');
    } catch (_) {
      // non-critical
    }
  }, []);

  const dismissLapseModal = useCallback(() => {
    dispatch({ type: 'DISMISS_LAPSE_MODAL' });
  }, []);

  const refresh = useCallback(async () => {
    if (!configuredRef.current) {
      await initSDK();
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
  }, [initSDK, checkLapse, fetchTrialStatus]);

  useEffect(() => {
    const init = async () => {
      await initSDK();
      if (!configuredRef.current || !mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: 'SDK configuration failed' });
        return;
      }

      const userId = await getCurrentUserId();
      if (userId) {
        await loginUser(String(userId));
      }

      await refresh();
      await checkOnboarding();
    };

    init();
  }, [initSDK, refresh, checkOnboarding]);

  useEffect(() => {
    if (!configuredRef.current) return;

    const remove = onCustomerInfoUpdate((customerInfo) => {
      if (!mountedRef.current) return;
      const parsed = parseCustomerInfo(customerInfo);
      dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
      persistSubscriptionState(parsed.isSubscribed);
    });

    return () => {
      if (typeof remove === 'function') {
        remove();
      } else if (remove && typeof remove.remove === 'function') {
        remove.remove();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when SDK becomes configured
  }, [configuredRef.current]);

  useEffect(() => {
    const unsubscribe = subscribeAuthEvents(async (event) => {
      if (!configuredRef.current) return;

      if (event === 'LOGIN') {
        const userId = await getCurrentUserId();
        if (userId) {
          await loginUser(String(userId));
        }
        await refresh();
        await checkOnboarding();
      } else if (event === 'LOGOUT') {
        await logoutUser();
        if (mountedRef.current) {
          dispatch({ type: 'RESET' });
        }
        try {
          await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
          await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_SEEN);
        } catch (_) {
          // non-critical
        }
      }
    });

    return unsubscribe;
  }, [refresh, checkOnboarding]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && configuredRef.current) {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const handlePurchasePackage = useCallback(async (pkg) => {
    dispatch({ type: 'SET_LOADING' });
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
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
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
