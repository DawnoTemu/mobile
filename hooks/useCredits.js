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
import {
  getCredits as fetchCreditsFromService,
  getStoryCredits as fetchStoryCredits,
  primeStoryCredits as primeStoryCreditsService,
  invalidateCreditsCache as invalidateCreditsCacheService,
  invalidateStoryCredits as invalidateStoryCreditsService
} from '../services/creditService';
import { CREDIT_CACHE_TTL } from '../services/config';
import { subscribeAuthEvents } from '../services/authService';

const CreditContext = createContext(null);

const initialState = {
  balance: 0,
  unitLabel: 'Story Points (Punkty Magii)',
  unitSize: 1000,
  lots: [],
  recentTransactions: [],
  loading: false,
  initializing: true,
  error: null,
  stale: false,
  fromCache: false,
  lastUpdated: null,
  pendingAdjustments: {}
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'LOAD_START':
      return {
        ...state,
        loading: true,
        error: action.payload?.preserveError ? state.error : null
      };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        ...action.payload.data,
        loading: false,
        initializing: false,
        error: null,
        stale: action.payload.stale,
        fromCache: action.payload.fromCache,
        lastUpdated: action.payload.lastUpdated,
        pendingAdjustments: {}
      };
    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        initializing: false,
        error: {
          message: action.payload?.error || 'Unable to fetch credits',
          code: action.payload?.code || 'API_ERROR'
        }
      };
    case 'APPLY_ADJUSTMENT': {
      const { id, delta, metadata } = action.payload;
      if (!id || !Number.isFinite(delta) || delta === 0) {
        return state;
      }

      const pendingAdjustments = {
        ...state.pendingAdjustments,
        [id]: { delta, metadata }
      };

      return {
        ...state,
        balance: state.balance + delta,
        pendingAdjustments
      };
    }
    case 'ROLLBACK_ADJUSTMENT': {
      const { id } = action.payload || {};
      if (!id || !state.pendingAdjustments[id]) {
        return state;
      }

      const { delta } = state.pendingAdjustments[id];
      const pendingAdjustments = { ...state.pendingAdjustments };
      delete pendingAdjustments[id];

      return {
        ...state,
        balance: state.balance - delta,
        pendingAdjustments
      };
    }
    case 'RESOLVE_ADJUSTMENT': {
      const { id } = action.payload || {};
      if (!id || !state.pendingAdjustments[id]) {
        return state;
      }

      const pendingAdjustments = { ...state.pendingAdjustments };
      delete pendingAdjustments[id];

      return {
        ...state,
        pendingAdjustments
      };
    }
    case 'RESET':
      return {
        ...initialState,
        initializing: false
      };
    default:
      return state;
  }
};

const generateAdjustmentId = () => `credit-adj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const CreditProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastFetchRef = useRef(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleLoadSuccess = useCallback((result) => {
    if (!mountedRef.current) return;

    const lastUpdated = result.data?.fetchedAt || result.cachedAt || Date.now();
    lastFetchRef.current = lastUpdated;

    dispatch({
      type: 'LOAD_SUCCESS',
      payload: {
        data: {
          balance: result.data?.balance ?? 0,
          unitLabel: result.data?.unitLabel ?? 'Story Points (Punkty Magii)',
          unitSize: result.data?.unitSize ?? 1000,
          lots: result.data?.lots ?? [],
          recentTransactions: result.data?.recentTransactions ?? []
        },
        stale: Boolean(result.stale),
        fromCache: Boolean(result.fromCache),
        lastUpdated
      }
    });
  }, []);

  const handleLoadError = useCallback((result) => {
    if (!mountedRef.current) return;
    dispatch({
      type: 'LOAD_ERROR',
      payload: {
        error: result?.error,
        code: result?.code
      }
    });
  }, []);

  const fetchCredits = useCallback(
    async ({ forceRefresh = false } = {}) => {
      if (inFlightRef.current) {
        return inFlightRef.current;
      }

      const sessionId = sessionRef.current;

      dispatch({ type: 'LOAD_START' });

      const promise = (async () => {
        const result = await fetchCreditsFromService({ forceRefresh });
        if (sessionRef.current !== sessionId) {
          return result;
        }

        if (result.success && result.data) {
          handleLoadSuccess(result);
        } else {
          handleLoadError(result);
        }
        return result;
      })();

      inFlightRef.current = promise;

      try {
        return await promise;
      } finally {
        if (inFlightRef.current === promise) {
          inFlightRef.current = null;
        }
      }
    },
    [handleLoadError, handleLoadSuccess]
  );

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const maybeRefresh = useCallback(() => {
    if (state.loading) return;
    const lastUpdated = lastFetchRef.current || state.lastUpdated;
    const isStale = state.stale || !lastUpdated || Date.now() - lastUpdated > CREDIT_CACHE_TTL;
    if (isStale) {
      fetchCredits({ forceRefresh: true });
    }
  }, [fetchCredits, state.lastUpdated, state.loading, state.stale]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        maybeRefresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [maybeRefresh]);

  useEffect(() => {
    const unsubscribe = subscribeAuthEvents((event) => {
      if (event === 'LOGIN') {
        fetchCredits({ forceRefresh: true });
      } else if (event === 'LOGOUT') {
        sessionRef.current += 1;
        dispatch({ type: 'RESET' });
        invalidateCreditsCacheService().catch(() => {});
      }
    });

    return unsubscribe;
  }, [fetchCredits]);

  const applyAdjustment = useCallback(
    (delta, { id, metadata } = {}) => {
      if (!Number.isFinite(delta) || delta === 0) {
        return { id: null, rollback: () => {}, resolve: () => {} };
      }
      const adjustmentId = id || generateAdjustmentId();
      dispatch({
        type: 'APPLY_ADJUSTMENT',
        payload: { id: adjustmentId, delta, metadata }
      });

      return {
        id: adjustmentId,
        rollback: () => dispatch({ type: 'ROLLBACK_ADJUSTMENT', payload: { id: adjustmentId } }),
        resolve: () => dispatch({ type: 'RESOLVE_ADJUSTMENT', payload: { id: adjustmentId } })
      };
    },
    []
  );

  const applyDebitOptimistic = useCallback(
    ({ amount, id, metadata } = {}) => {
      const value = Number.isFinite(amount) ? -Math.abs(amount) : 0;
      return applyAdjustment(value, { id, metadata: { ...metadata, type: 'debit' } });
    },
    [applyAdjustment]
  );

  const applyRefundOptimistic = useCallback(
    ({ amount, id, metadata } = {}) => {
      const value = Number.isFinite(amount) ? Math.abs(amount) : 0;
      return applyAdjustment(value, { id, metadata: { ...metadata, type: 'refund' } });
    },
    [applyAdjustment]
  );

  const refreshCredits = useCallback(
    (options = {}) => fetchCredits({ forceRefresh: options.force ?? true }),
    [fetchCredits]
  );

  const contextValue = useMemo(
    () => ({
      state,
      actions: {
        refreshCredits,
        getStoryCredits: fetchStoryCredits,
        primeStoryCredits: primeStoryCreditsService,
        invalidateCreditsCache: invalidateCreditsCacheService,
        invalidateStoryCredits: invalidateStoryCreditsService,
        applyDebitOptimistic,
        applyRefundOptimistic,
        resolveAdjustment: (id) => dispatch({ type: 'RESOLVE_ADJUSTMENT', payload: { id } }),
        rollbackAdjustment: (id) => dispatch({ type: 'ROLLBACK_ADJUSTMENT', payload: { id } })
      }
    }),
    [
      state,
      refreshCredits,
      applyDebitOptimistic,
      applyRefundOptimistic
    ]
  );

  return <CreditContext.Provider value={contextValue}>{children}</CreditContext.Provider>;
};

export const useCredits = () => {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error('useCredits must be used within a CreditProvider');
  }
  return context.state;
};

export const useCreditActions = () => {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error('useCreditActions must be used within a CreditProvider');
  }
  return context.actions;
};

export const __TESTING__ = {
  initialState,
  reducer,
  generateAdjustmentId
};
