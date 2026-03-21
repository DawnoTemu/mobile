import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
  refreshing: false,
  expirationDate: null,
  willRenew: false,
  error: null,
  trial: {
    active: false,
    expiresAt: null,
    daysRemaining: 0
  },
  backendCanGenerate: null,
  backendResyncPending: false,
  showOnboarding: false,
  showLapseModal: false
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_REFRESHING':
      return { ...state, refreshing: true, error: null };
    case 'SET_CUSTOMER_INFO': {
      // When subscription status changes via real-time listener and backendCanGenerate
      // is stale (disagrees with the new entitlement direction), reset it to null so the
      // fallback (isSubscribed || trial.active) takes over until the backend resync completes.
      // This is symmetric: gaining entitlement clears stale false, losing it clears stale true.
      const resetBackend =
        (action.payload.isSubscribed && state.backendCanGenerate === false) ||
        (!action.payload.isSubscribed && state.backendCanGenerate === true);
      return {
        ...state,
        isSubscribed: action.payload.isSubscribed,
        expirationDate: action.payload.expirationDate,
        willRenew: action.payload.willRenew,
        backendCanGenerate: resetBackend ? null : state.backendCanGenerate,
        backendResyncPending: resetBackend ? true : state.backendResyncPending,
        loading: false,
        refreshing: false,
        error: null
      };
    }
    case 'SET_REFRESH_COMPLETE':
      return {
        ...state,
        isSubscribed: action.payload.customer.isSubscribed,
        expirationDate: action.payload.customer.expirationDate,
        willRenew: action.payload.customer.willRenew,
        trial: action.payload.trial ?? state.trial,
        backendCanGenerate: action.payload.backendCanGenerate ?? state.backendCanGenerate,
        backendResyncPending: false,
        loading: false,
        refreshing: false,
        error: null
      };
    case 'SET_TRIAL_STATUS':
      return {
        ...state,
        trial: action.payload.trial,
        backendCanGenerate: action.payload.backendCanGenerate ?? null,
        backendResyncPending: false
      };
    case 'CLEAR_BACKEND_RESYNC_PENDING':
      return { ...state, backendResyncPending: false };
    case 'CANCEL_LOADING':
      return { ...state, loading: false };
    case 'SET_ERROR':
      return { ...state, loading: false, refreshing: false, error: action.payload };
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
    return true;
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'persist_subscription_state' } });
    return false;
  }
};

const getLastSubscriptionState = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    Sentry.captureException(error, { extra: { context: 'get_last_subscription_state' } });
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE).catch((cleanupErr) => {
      Sentry.captureException(cleanupErr, { extra: { context: 'cleanup_corrupted_subscription_state' } });
    });
    return null;
  }
};

export const SubscriptionProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sdkConfigured, setSdkConfigured] = useState(false);
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
      // Note: setSdkConfigured(true) is intentionally NOT called here.
      // It is deferred until after login completes (in the init effect and
      // LOGIN auth handler) to avoid registering the real-time listener
      // on an anonymous RevenueCat user, which would flash unsubscribed state.
    } else {
      Sentry.captureMessage('RevenueCat SDK configuration failed', {
        level: 'error',
        extra: { error: result.error }
      });
    }
    return result;
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
      Sentry.captureException(error, { extra: { context: 'check_onboarding' } });
      if (mountedRef.current) {
        dispatch({ type: 'SHOW_ONBOARDING' });
      }
    }
  }, []);

  const dismissOnboarding = useCallback(async () => {
    dispatch({ type: 'DISMISS_ONBOARDING' });
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_SEEN, 'true');
    } catch (error) {
      Sentry.captureException(error, { extra: { context: 'dismiss_onboarding' } });
    }
  }, []);

  const dismissLapseModal = useCallback(() => {
    dispatch({ type: 'DISMISS_LAPSE_MODAL' });
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return { success: true, skipped: true };
    refreshingRef.current = true;

    dispatch({ type: 'SET_REFRESHING' });

    try {
      if (!isConfiguredRef.current) {
        const initResult = await initSDK();
        if (!initResult.success) {
          if (mountedRef.current) {
            dispatch({ type: 'SET_ERROR', payload: initResult.error || 'SDK configuration failed' });
          }
          return { success: false, error: initResult.error || 'SDK configuration failed' };
        }
      }

      const [customerResult, trialResult] = await Promise.all([
        getCustomerInfo(),
        fetchSubscriptionStatus()
      ]);

      if (!mountedRef.current) return { success: false, error: 'unmounted' };

      if (!trialResult.success) {
        Sentry.captureMessage('Failed to fetch trial status', {
          level: 'warning',
          extra: { error: trialResult.error, code: trialResult.code }
        });
      }

      if (customerResult.success) {
        const parsed = parseCustomerInfo(customerResult.data);
        dispatch({
          type: 'SET_REFRESH_COMPLETE',
          payload: {
            customer: parsed,
            trial: trialResult.success ? trialResult.data.trial : undefined,
            backendCanGenerate: trialResult.success ? trialResult.data.canGenerate : undefined
          }
        });
        await checkLapse(parsed.isSubscribed);
        return { success: true };
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'Nie udało się pobrać danych subskrypcji.' });
        return { success: false, error: 'Nie udało się pobrać danych subskrypcji.' };
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { context: 'refresh_subscription' } });
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: 'Nie udało się odświeżyć danych subskrypcji.' });
      }
      return { success: false, error: error.message };
    } finally {
      refreshingRef.current = false;
    }
  }, [initSDK, checkLapse]);

  // Initialization effect — guarded by ref to prevent double-fire
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const init = async () => {
      try {
        const initResult = await initSDK();
        if (!mountedRef.current) return;
        if (!initResult.success) {
          dispatch({ type: 'SET_ERROR', payload: initResult.error || 'SDK configuration failed' });
          return;
        }

        const userId = await getCurrentUserId();
        if (userId) {
          const loginResult = await loginUser(String(userId));
          if (!loginResult.success) {
            Sentry.captureMessage('RevenueCat login failed during init', {
              level: 'error',
              extra: { error: loginResult.error, userId }
            });
            if (mountedRef.current) {
              dispatch({ type: 'SET_ERROR', payload: 'Nie udało się połączyć konta z serwisem subskrypcji.' });
            }
            return;
          }
        }

        await refresh();
        if (mountedRef.current) setSdkConfigured(true);
        await checkOnboarding();
      } catch (error) {
        Sentry.captureException(error, { extra: { context: 'subscription_init' } });
        if (mountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: 'Nie udało się zainicjalizować subskrypcji.' });
        }
      }
    };

    init();
  }, [initSDK, refresh, checkOnboarding]);

  // Real-time subscription update listener — re-registers when SDK becomes configured
  useEffect(() => {
    if (!sdkConfigured) return;

    let removeListener = null;

    const result = onCustomerInfoUpdate((customerInfo) => {
      try {
        if (!mountedRef.current) return;
        const parsed = parseCustomerInfo(customerInfo);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        persistSubscriptionState(parsed.isSubscribed).catch((err) =>
          Sentry.captureException(err, { extra: { context: 'persist_on_customer_update' } })
        );
        // Resync backend status to reduce stale backendCanGenerate window
        fetchSubscriptionStatus().then((trialResult) => {
          if (!mountedRef.current) return;
          if (trialResult.success) {
            dispatch({
              type: 'SET_TRIAL_STATUS',
              payload: {
                trial: trialResult.data.trial,
                backendCanGenerate: trialResult.data.canGenerate
              }
            });
          } else {
            Sentry.captureMessage('Backend resync failed after listener update', {
              level: 'warning',
              extra: { error: trialResult.error, code: trialResult.code }
            });
            dispatch({ type: 'CLEAR_BACKEND_RESYNC_PENDING' });
          }
        }).catch((err) => {
          Sentry.captureException(err, { extra: { context: 'backend_resync_after_listener' } });
          if (mountedRef.current) {
            dispatch({ type: 'CLEAR_BACKEND_RESYNC_PENDING' });
          }
        });
      } catch (error) {
        Sentry.captureException(error, { extra: { context: 'customer_info_update_listener' } });
      }
    });

    if (result.success) {
      const listener = result.data;
      if (typeof listener === 'function') {
        removeListener = listener;
      } else if (listener && typeof listener.remove === 'function') {
        removeListener = () => listener.remove();
      }
    } else {
      Sentry.captureMessage('Failed to register customer info listener', {
        level: 'error',
        extra: { error: result.error }
      });
    }

    return () => {
      if (removeListener) removeListener();
    };
  }, [sdkConfigured]);

  useEffect(() => {
    const unsubscribe = subscribeAuthEvents(async (event) => {
      if (!isConfiguredRef.current) return;

      try {
        if (event === 'LOGIN') {
          const userId = await getCurrentUserId();
          if (userId) {
            const loginResult = await loginUser(String(userId));
            if (!loginResult.success) {
              Sentry.captureMessage('RevenueCat login failed on auth event', {
                level: 'warning',
                extra: { error: loginResult.error, userId }
              });
              if (mountedRef.current) {
                dispatch({ type: 'SET_ERROR', payload: 'Nie udało się połączyć konta z serwisem subskrypcji.' });
              }
              return;
            }
          }
          await refresh();
          if (mountedRef.current) setSdkConfigured(true);
          await checkOnboarding();
        } else if (event === 'LOGOUT') {
          const logoutResult = await logoutUser();
          if (!logoutResult.success) {
            Sentry.captureMessage('RevenueCat logout failed', {
              level: 'warning',
              extra: { error: logoutResult.error }
            });
          }
          if (mountedRef.current) {
            setSdkConfigured(false);
            dispatch({ type: 'RESET' });
          }
          try {
            await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SUBSCRIPTION_STATE);
          } catch (err) {
            Sentry.captureException(err, { extra: { context: 'logout_cleanup_subscription_state' } });
          }
          try {
            await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_SEEN);
          } catch (err) {
            Sentry.captureException(err, { extra: { context: 'logout_cleanup_onboarding' } });
          }
        }
      } catch (error) {
        Sentry.captureException(error, { extra: { context: 'auth_event_handler', event } });
        if (mountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: 'Wystąpił problem z synchronizacją subskrypcji.' });
        }
      }
    });

    return unsubscribe;
  }, [refresh, checkOnboarding]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isConfiguredRef.current) {
        refresh().catch((error) => Sentry.captureException(error, { extra: { context: 'foreground_refresh' } }));
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const handlePurchasePackage = useCallback(async (pkg, { isAddon = false } = {}) => {
    if (!isAddon) {
      dispatch({ type: 'SET_LOADING' });
    }
    try {
      const result = await purchasePkg(pkg);
      if (!mountedRef.current) return { success: false, error: 'unmounted' };

      if (result.success) {
        const parsed = parseCustomerInfo(result.data.customerInfo);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        await persistSubscriptionState(parsed.isSubscribed);
      } else if (result.code === 'USER_CANCELLED') {
        if (!isAddon) {
          dispatch({ type: 'CANCEL_LOADING' });
        }
      } else {
        if (!isAddon) {
          dispatch({ type: 'SET_ERROR', payload: result.error });
        }
      }
      return result;
    } catch (error) {
      Sentry.captureException(error, { extra: { context: 'purchase_package' } });
      if (mountedRef.current && !isAddon) {
        dispatch({ type: 'SET_ERROR', payload: 'Nie udało się dokonać zakupu. Spróbuj ponownie.' });
      }
      return { success: false, error: error.message };
    }
  }, []);

  // Returns { success: true, isSubscribed: boolean } on success,
  // or { success: false, error: string } on failure.
  // Note: `isSubscribed` is lifted to the top level (not nested under `data`)
  // so callers can branch on it directly without parsing customerInfo.
  const handleRestorePurchases = useCallback(async () => {
    dispatch({ type: 'SET_LOADING' });
    try {
      const result = await restorePurchasesService();
      if (!mountedRef.current) return { success: false, error: 'unmounted' };

      if (result.success) {
        const parsed = parseCustomerInfo(result.data.customerInfo);
        dispatch({ type: 'SET_CUSTOMER_INFO', payload: parsed });
        await persistSubscriptionState(parsed.isSubscribed);
        return { success: true, isSubscribed: parsed.isSubscribed };
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { context: 'restore_purchases' } });
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: 'Nie udało się przywrócić zakupów. Spróbuj ponownie.' });
      }
      return { success: false, error: error.message };
    }
  }, []);

  const handleGetOfferings = useCallback(async () => {
    try {
      return await fetchOfferings();
    } catch (error) {
      Sentry.captureException(error, { extra: { context: 'get_offerings' } });
      return { success: false, error: error.message };
    }
  }, []);

  const canGenerate = useMemo(
    () => {
      if (state.backendCanGenerate !== null) return state.backendCanGenerate;
      // During initial loading, avoid granting access based on potentially stale
      // RevenueCat data alone.
      if (state.loading) return false;
      // During a backend resync (triggered by a listener-driven entitlement change),
      // preserve the current RevenueCat entitlement so subscribed/trial-active users
      // are not briefly gated with canGenerate=false.
      return state.isSubscribed || state.trial.active;
    },
    [state.backendCanGenerate, state.loading, state.isSubscribed, state.trial.active]
  );

  const enrichedState = useMemo(
    () => ({ ...state, canGenerate }),
    [state, canGenerate]
  );

  const contextValue = useMemo(
    () => ({
      state: enrichedState,
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
      enrichedState,
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
