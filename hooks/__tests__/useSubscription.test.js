import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }) }
}));

const mockPurchases = {
  configure: jest.fn().mockResolvedValue(undefined),
  logIn: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getOfferings: jest.fn().mockResolvedValue({ current: null }),
  purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  addCustomerInfoUpdateListener: jest.fn()
};

let customerInfoUpdateCallback = null;
mockPurchases.addCustomerInfoUpdateListener.mockImplementation((cb) => {
  customerInfoUpdateCallback = cb;
  return () => { customerInfoUpdateCallback = null; };
});

jest.mock('react-native-purchases', () => mockPurchases);

const mockFetchSubscriptionStatus = jest.fn().mockResolvedValue({
  success: true,
  data: {
    trial: { active: false, expiresAt: null, daysRemaining: 0 },
    subscription: { active: false },
    canGenerate: false,
    initialCredits: 10
  }
});

jest.mock('../../services/subscriptionStatusService', () => ({
  fetchSubscriptionStatus: (...args) => mockFetchSubscriptionStatus(...args)
}));

let authEventCallback = null;
const mockSubscribeAuthEvents = jest.fn((cb) => {
  authEventCallback = cb;
  return () => { authEventCallback = null; };
});
const mockGetCurrentUserId = jest.fn().mockResolvedValue(null);

jest.mock('../../services/authService', () => ({
  subscribeAuthEvents: (...args) => mockSubscribeAuthEvents(...args),
  getCurrentUserId: (...args) => mockGetCurrentUserId(...args),
  getAccessToken: jest.fn().mockResolvedValue(null)
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn()
}));

const {
  SubscriptionProvider,
  useSubscription,
  useSubscriptionActions,
  __TEST_ONLY__
} = require('../useSubscription');
const { reducer, initialState } = __TEST_ONLY__;

describe('useSubscription reducer', () => {
  test('initialState has expected shape', () => {
    expect(initialState).toEqual({
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
    });
  });

  test('SET_LOADING sets loading true and clears error', () => {
    const state = { ...initialState, loading: false, error: 'some error' };
    const next = reducer(state, { type: 'SET_LOADING' });

    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  test('SET_CUSTOMER_INFO updates subscription state and computes canGenerate', () => {
    const payload = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };

    const next = reducer(initialState, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.isSubscribed).toBe(true);
    expect(next.expirationDate).toEqual(new Date('2026-12-01'));
    expect(next.willRenew).toBe(true);
    expect(next.canGenerate).toBe(true);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  test('SET_CUSTOMER_INFO canGenerate is true when trial active but not subscribed', () => {
    const stateWithTrial = {
      ...initialState,
      trial: { active: true, expiresAt: null, daysRemaining: 5 }
    };

    const next = reducer(stateWithTrial, {
      type: 'SET_CUSTOMER_INFO',
      payload: { isSubscribed: false, expirationDate: null, willRenew: false }
    });

    expect(next.isSubscribed).toBe(false);
    expect(next.canGenerate).toBe(true);
  });

  test('SET_CUSTOMER_INFO canGenerate is false when neither subscribed nor trial active', () => {
    const next = reducer(initialState, {
      type: 'SET_CUSTOMER_INFO',
      payload: { isSubscribed: false, expirationDate: null, willRenew: false }
    });

    expect(next.canGenerate).toBe(false);
  });

  test('SET_TRIAL_STATUS updates trial and recomputes canGenerate', () => {
    const payload = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 12 };

    const next = reducer(initialState, { type: 'SET_TRIAL_STATUS', payload });

    expect(next.trial).toBe(payload);
    expect(next.canGenerate).toBe(true);
  });

  test('SET_TRIAL_STATUS canGenerate true when subscribed even if trial inactive', () => {
    const subscribedState = { ...initialState, isSubscribed: true };
    const payload = { active: false, expiresAt: null, daysRemaining: 0 };

    const next = reducer(subscribedState, { type: 'SET_TRIAL_STATUS', payload });

    expect(next.canGenerate).toBe(true);
  });

  test('SET_ERROR sets error and stops loading', () => {
    const next = reducer(initialState, { type: 'SET_ERROR', payload: 'Config failed' });

    expect(next.error).toBe('Config failed');
    expect(next.loading).toBe(false);
  });

  test('SHOW_ONBOARDING sets showOnboarding true', () => {
    const next = reducer(initialState, { type: 'SHOW_ONBOARDING' });
    expect(next.showOnboarding).toBe(true);
  });

  test('DISMISS_ONBOARDING sets showOnboarding false', () => {
    const state = { ...initialState, showOnboarding: true };
    const next = reducer(state, { type: 'DISMISS_ONBOARDING' });
    expect(next.showOnboarding).toBe(false);
  });

  test('SHOW_LAPSE_MODAL sets showLapseModal true', () => {
    const next = reducer(initialState, { type: 'SHOW_LAPSE_MODAL' });
    expect(next.showLapseModal).toBe(true);
  });

  test('DISMISS_LAPSE_MODAL sets showLapseModal false', () => {
    const state = { ...initialState, showLapseModal: true };
    const next = reducer(state, { type: 'DISMISS_LAPSE_MODAL' });
    expect(next.showLapseModal).toBe(false);
  });

  test('RESET returns initialState with loading false', () => {
    const dirtyState = {
      ...initialState,
      isSubscribed: true,
      error: 'something',
      loading: true,
      showOnboarding: true
    };

    const next = reducer(dirtyState, { type: 'RESET' });

    expect(next.isSubscribed).toBe(false);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
    expect(next.showOnboarding).toBe(false);
  });

  test('unknown action returns current state', () => {
    const state = { ...initialState, isSubscribed: true };
    const next = reducer(state, { type: 'UNKNOWN_ACTION' });
    expect(next).toBe(state);
  });
});

describe('SubscriptionProvider', () => {
  const wrapper = ({ children }) => (
    <SubscriptionProvider>{children}</SubscriptionProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authEventCallback = null;
    customerInfoUpdateCallback = null;
    AsyncStorage.clear();

    mockPurchases.configure.mockResolvedValue(undefined);
    mockPurchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
    mockPurchases.addCustomerInfoUpdateListener.mockImplementation((cb) => {
      customerInfoUpdateCallback = cb;
      return () => { customerInfoUpdateCallback = null; };
    });
    mockPurchases.logIn.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    mockPurchases.logOut.mockResolvedValue({ entitlements: { active: {} } });
    mockPurchases.purchasePackage.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });

    mockFetchSubscriptionStatus.mockResolvedValue({
      success: true,
      data: {
        trial: { active: false, expiresAt: null, daysRemaining: 0 },
        subscription: { active: false },
        canGenerate: false,
        initialCredits: 10
      }
    });

    mockGetCurrentUserId.mockResolvedValue(null);
  });

  describe('purchase flow', () => {
    test('successful subscription purchase sets isSubscribed true', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.actions.purchasePackage({ identifier: 'monthly' });
      });

      expect(purchaseResult.success).toBe(true);
      expect(result.current.state.isSubscribed).toBe(true);
      expect(result.current.state.expirationDate).toEqual(new Date('2026-12-01T00:00:00Z'));
    });

    test('user-cancelled purchase does not set error', async () => {
      mockPurchases.purchasePackage.mockImplementation(() => {
        const err = new Error('User cancelled');
        err.userCancelled = true;
        throw err;
      });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.actions.purchasePackage({ identifier: 'monthly' });
      });

      expect(purchaseResult.success).toBe(false);
      expect(purchaseResult.code).toBe('USER_CANCELLED');
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.isSubscribed).toBe(false);
    });

    test('purchase error sets error state', async () => {
      mockPurchases.purchasePackage.mockRejectedValue(new Error('Network failure'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let purchaseResult;
      await act(async () => {
        purchaseResult = await result.current.actions.purchasePackage({ identifier: 'monthly' });
      });

      expect(purchaseResult.success).toBe(false);
      expect(result.current.state.error).toBeTruthy();
    });

    test('addon purchase does not set global loading', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } }
      });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const loadingValues = [];
      const promise = act(async () => {
        loadingValues.push(result.current.state.loading);
        await result.current.actions.purchasePackage(
          { identifier: 'credits_10' },
          { isAddon: true }
        );
        loadingValues.push(result.current.state.loading);
      });

      await promise;

      expect(loadingValues.every((v) => v === false)).toBe(true);
    });
  });

  describe('lapse detection', () => {
    test('shows lapse modal when previously subscribed but now unsubscribed', async () => {
      await AsyncStorage.setItem(
        'subscription_last_known_state',
        JSON.stringify({ isSubscribed: true, timestamp: Date.now() })
      );

      mockPurchases.getCustomerInfo.mockResolvedValue({
        entitlements: { active: {} }
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(result.current.showLapseModal).toBe(true));
    });

    test('does not show lapse modal on first install (no prior state)', async () => {
      mockPurchases.getCustomerInfo.mockResolvedValue({
        entitlements: { active: {} }
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.showLapseModal).toBe(false);
    });
  });

  describe('auth events', () => {
    test('LOGIN event triggers refresh and logs in RevenueCat user', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(authEventCallback).toBeTruthy();

      mockGetCurrentUserId.mockResolvedValue(42);
      mockPurchases.logIn.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      await act(async () => {
        await authEventCallback('LOGIN');
      });

      expect(mockPurchases.logIn).toHaveBeenCalledWith('42');
      expect(result.current.isSubscribed).toBe(true);
    });

    test('LOGIN event with failed RevenueCat login sets error and skips refresh', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      mockGetCurrentUserId.mockResolvedValue(42);
      mockPurchases.logIn.mockRejectedValue(new Error('Account conflict'));

      await act(async () => {
        await authEventCallback('LOGIN');
      });

      expect(result.current.error).toBeTruthy();
      expect(mockPurchases.getCustomerInfo).toHaveBeenCalledTimes(1);
    });

    test('LOGOUT event resets state and logs out RevenueCat', async () => {
      mockPurchases.getCustomerInfo.mockResolvedValue({
        entitlements: {
          active: {
            premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
          }
        }
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(result.current.isSubscribed).toBe(true));

      await act(async () => {
        await authEventCallback('LOGOUT');
      });

      expect(mockPurchases.logOut).toHaveBeenCalled();
      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('real-time customer info listener', () => {
    test('listener updates subscription state when RevenueCat pushes new customer info', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(customerInfoUpdateCallback).toBeTruthy();

      await act(async () => {
        customerInfoUpdateCallback({
          entitlements: {
            active: {
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        });
      });

      await waitFor(() => expect(result.current.isSubscribed).toBe(true));
      expect(result.current.expirationDate).toEqual(new Date('2026-12-01T00:00:00Z'));
    });
  });

  describe('refresh when SDK not configured', () => {
    test('refresh attempts SDK init and reports error on failure', async () => {
      mockPurchases.configure.mockRejectedValue(new Error('SDK init failed'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));
      expect(result.current.state.error).toBeTruthy();
    });
  });

  describe('restorePurchases', () => {
    test('successful restore updates subscription state', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({
        entitlements: {
          active: {
            premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
          }
        }
      });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let restoreResult;
      await act(async () => {
        restoreResult = await result.current.actions.restorePurchases();
      });

      expect(restoreResult.success).toBe(true);
      expect(result.current.state.isSubscribed).toBe(true);
      expect(result.current.state.expirationDate).toEqual(new Date('2026-12-01T00:00:00Z'));
    });

    test('failed restore sets error state', async () => {
      mockPurchases.restorePurchases.mockRejectedValue(new Error('Restore failed'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let restoreResult;
      await act(async () => {
        restoreResult = await result.current.actions.restorePurchases();
      });

      expect(restoreResult.success).toBe(false);
      expect(result.current.state.error).toBeTruthy();
    });

    test('restore with no active entitlements keeps unsubscribed', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({
        entitlements: { active: {} }
      });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      await act(async () => {
        await result.current.actions.restorePurchases();
      });

      expect(result.current.state.isSubscribed).toBe(false);
    });
  });

  describe('getOfferings', () => {
    test('successful getOfferings returns offerings data', async () => {
      const mockOffering = {
        identifier: 'default',
        availablePackages: [{ identifier: 'monthly', product: { priceString: '$9.99' } }]
      };
      mockPurchases.getOfferings.mockResolvedValue({ current: mockOffering });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let offeringsResult;
      await act(async () => {
        offeringsResult = await result.current.actions.getOfferings();
      });

      expect(offeringsResult.success).toBe(true);
    });

    test('failed getOfferings returns error', async () => {
      mockPurchases.getOfferings.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let offeringsResult;
      await act(async () => {
        offeringsResult = await result.current.actions.getOfferings();
      });

      expect(offeringsResult.success).toBe(false);
      expect(offeringsResult.error).toBe('Network error');
    });
  });
});
