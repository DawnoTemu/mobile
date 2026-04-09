import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../services/config';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

let mockAppStateCallback = null;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((event, cb) => {
      mockAppStateCallback = cb;
      return { remove: jest.fn() };
    })
  },
  Platform: { OS: 'ios' }
}));

jest.mock('react-native-purchases', () => ({}));

const mockConfigure = jest.fn();
const mockLoginUser = jest.fn();
const mockLogoutUser = jest.fn();
const mockFetchOfferings = jest.fn();
const mockPurchasePkg = jest.fn();
const mockRestorePurchasesService = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockOnCustomerInfoUpdate = jest.fn();

let mockCustomerInfoUpdateCallback = null;

const mockPresentPaywall = jest.fn().mockResolvedValue({ success: true, data: 'CANCELLED' });
const mockPresentPaywallIfNeeded = jest.fn().mockResolvedValue({ success: true, data: 'NOT_PRESENTED' });
const mockPresentCustomerCenter = jest.fn().mockResolvedValue({ success: true, data: null });

jest.mock('../../services/subscriptionService', () => {
  const actual = jest.requireActual('../../services/subscriptionService');
  return {
    configure: (...args) => mockConfigure(...args),
    loginUser: (...args) => mockLoginUser(...args),
    logoutUser: (...args) => mockLogoutUser(...args),
    getOfferings: (...args) => mockFetchOfferings(...args),
    purchasePackage: (...args) => mockPurchasePkg(...args),
    restorePurchases: (...args) => mockRestorePurchasesService(...args),
    getCustomerInfo: (...args) => mockGetCustomerInfo(...args),
    onCustomerInfoUpdate: (...args) => mockOnCustomerInfoUpdate(...args),
    parseCustomerInfo: actual.parseCustomerInfo,
    presentPaywall: (...args) => mockPresentPaywall(...args),
    presentPaywallIfNeeded: (...args) => mockPresentPaywallIfNeeded(...args),
    presentCustomerCenter: (...args) => mockPresentCustomerCenter(...args),
    PAYWALL_RESULT: {
      PURCHASED: 'PURCHASED',
      RESTORED: 'RESTORED',
      CANCELLED: 'CANCELLED',
      NOT_PRESENTED: 'NOT_PRESENTED',
      ERROR: 'ERROR',
    }
  };
});

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
  fetchSubscriptionStatus: (...args) => mockFetchSubscriptionStatus(...args),
  linkRevenueCat: jest.fn().mockResolvedValue({ success: true })
}));

let mockAuthEventCallback = null;
const mockSubscribeAuthEvents = jest.fn((cb) => {
  mockAuthEventCallback = cb;
  return () => { mockAuthEventCallback = null; };
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
    });
  });

  test('SET_LOADING sets loading true and clears error', () => {
    const state = { ...initialState, loading: false, error: 'some error' };
    const next = reducer(state, { type: 'SET_LOADING' });

    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  test('SET_REFRESHING sets refreshing true and clears error', () => {
    const state = { ...initialState, refreshing: false, error: 'some error' };
    const next = reducer(state, { type: 'SET_REFRESHING' });

    expect(next.refreshing).toBe(true);
    expect(next.error).toBeNull();
  });

  test('SET_CUSTOMER_INFO updates subscription state', () => {
    const payload = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };

    const next = reducer(initialState, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.isSubscribed).toBe(true);
    expect(next.expirationDate).toEqual(new Date('2026-12-01'));
    expect(next.willRenew).toBe(true);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  test('SET_CUSTOMER_INFO resets stale true backendCanGenerate when subscription is lost', () => {
    const state = { ...initialState, backendCanGenerate: true, isSubscribed: true };
    const payload = {
      isSubscribed: false,
      expirationDate: null,
      willRenew: false
    };

    const next = reducer(state, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.isSubscribed).toBe(false);
    expect(next.backendCanGenerate).toBeNull();
  });

  test('SET_CUSTOMER_INFO resets stale false backendCanGenerate when subscription is gained', () => {
    const state = { ...initialState, backendCanGenerate: false, isSubscribed: false };
    const payload = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };

    const next = reducer(state, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.isSubscribed).toBe(true);
    expect(next.backendCanGenerate).toBeNull();
  });

  test('SET_CUSTOMER_INFO sets backendResyncPending when it resets stale backendCanGenerate', () => {
    const state = { ...initialState, backendCanGenerate: false, isSubscribed: false };
    const payload = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };

    const next = reducer(state, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.backendCanGenerate).toBeNull();
    expect(next.backendResyncPending).toBe(true);
  });

  test('SET_TRIAL_STATUS clears backendResyncPending', () => {
    const state = { ...initialState, backendResyncPending: true };
    const trial = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 12 };

    const next = reducer(state, {
      type: 'SET_TRIAL_STATUS',
      payload: { trial, backendCanGenerate: true }
    });

    expect(next.backendResyncPending).toBe(false);
  });

  test('SET_REFRESH_COMPLETE clears backendResyncPending', () => {
    const state = { ...initialState, backendResyncPending: true, refreshing: true };
    const customer = { isSubscribed: true, expirationDate: new Date('2026-12-01'), willRenew: true };

    const next = reducer(state, {
      type: 'SET_REFRESH_COMPLETE',
      payload: { customer, trial: undefined, backendCanGenerate: true }
    });

    expect(next.backendResyncPending).toBe(false);
  });

  test('SET_CUSTOMER_INFO preserves backendCanGenerate when it agrees with direction', () => {
    const state = { ...initialState, backendCanGenerate: true, isSubscribed: true };
    const payload = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };

    const next = reducer(state, { type: 'SET_CUSTOMER_INFO', payload });

    expect(next.isSubscribed).toBe(true);
    expect(next.backendCanGenerate).toBe(true);
  });

  test('SET_TRIAL_STATUS updates trial and stores backendCanGenerate', () => {
    const trial = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 12 };

    const next = reducer(initialState, {
      type: 'SET_TRIAL_STATUS',
      payload: { trial, backendCanGenerate: true }
    });

    expect(next.trial).toBe(trial);
    expect(next.backendCanGenerate).toBe(true);
  });

  test('SET_REFRESH_COMPLETE atomically updates customer and trial state', () => {
    const state = { ...initialState, refreshing: true };
    const customer = {
      isSubscribed: true,
      expirationDate: new Date('2026-12-01'),
      willRenew: true
    };
    const trial = { active: false, expiresAt: null, daysRemaining: 0 };

    const next = reducer(state, {
      type: 'SET_REFRESH_COMPLETE',
      payload: { customer, trial, backendCanGenerate: true }
    });

    expect(next.isSubscribed).toBe(true);
    expect(next.expirationDate).toEqual(new Date('2026-12-01'));
    expect(next.willRenew).toBe(true);
    expect(next.trial).toBe(trial);
    expect(next.backendCanGenerate).toBe(true);
    expect(next.loading).toBe(false);
    expect(next.refreshing).toBe(false);
    expect(next.error).toBeNull();
  });

  test('SET_REFRESH_COMPLETE preserves previous trial when payload trial is undefined', () => {
    const existingTrial = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 10 };
    const state = { ...initialState, trial: existingTrial, backendCanGenerate: true, refreshing: true };
    const customer = { isSubscribed: false, expirationDate: null, willRenew: false };

    const next = reducer(state, {
      type: 'SET_REFRESH_COMPLETE',
      payload: { customer, trial: undefined, backendCanGenerate: undefined }
    });

    expect(next.trial).toBe(existingTrial);
    expect(next.backendCanGenerate).toBe(true);
    expect(next.refreshing).toBe(false);
  });

  test('SET_TRIAL_STATUS stores null when backendCanGenerate is undefined', () => {
    const trial = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 5 };

    const next = reducer(initialState, {
      type: 'SET_TRIAL_STATUS',
      payload: { trial }
    });

    expect(next.trial).toBe(trial);
    expect(next.backendCanGenerate).toBeNull();
  });

  test('CANCEL_LOADING stops loading without changing other state', () => {
    const state = { ...initialState, loading: true, isSubscribed: true, error: null };
    const next = reducer(state, { type: 'CANCEL_LOADING' });

    expect(next.loading).toBe(false);
    expect(next.isSubscribed).toBe(true);
    expect(next.error).toBeNull();
  });

  test('SET_ERROR sets error and stops loading and refreshing', () => {
    const state = { ...initialState, refreshing: true };
    const next = reducer(state, { type: 'SET_ERROR', payload: 'Config failed' });

    expect(next.error).toBe('Config failed');
    expect(next.loading).toBe(false);
    expect(next.refreshing).toBe(false);
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
    mockAuthEventCallback = null;
    mockCustomerInfoUpdateCallback = null;
    mockAppStateCallback = null;
    AsyncStorage.clear();

    mockConfigure.mockResolvedValue({ success: true, data: null });
    mockGetCustomerInfo.mockResolvedValue({
      success: true,
      data: { entitlements: { active: {} } }
    });
    mockOnCustomerInfoUpdate.mockImplementation((cb) => {
      mockCustomerInfoUpdateCallback = cb;
      return { success: true, data: () => { mockCustomerInfoUpdateCallback = null; } };
    });
    mockLoginUser.mockResolvedValue({
      success: true,
      data: { entitlements: { active: {} } }
    });
    mockLogoutUser.mockResolvedValue({
      success: true,
      data: { entitlements: { active: {} } }
    });
    mockPurchasePkg.mockResolvedValue({
      success: true,
      data: { customerInfo: { entitlements: { active: {} } }, isActive: false }
    });
    mockRestorePurchasesService.mockResolvedValue({
      success: true,
      data: { customerInfo: { entitlements: { active: {} } }, isActive: false }
    });
    mockFetchOfferings.mockResolvedValue({ success: true, data: { current: null } });

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
      mockPurchasePkg.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: {
              active: {
                'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
              }
            }
          },
          isActive: true
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
      mockPurchasePkg.mockResolvedValueOnce({
        success: false,
        error: 'USER_CANCELLED',
        code: 'USER_CANCELLED'
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
      mockPurchasePkg.mockRejectedValueOnce(new Error('Network failure'));

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
      mockPurchasePkg.mockResolvedValueOnce({
        success: true,
        data: { customerInfo: { entitlements: { active: {} } }, isActive: false }
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
        STORAGE_KEYS.LAST_SUBSCRIPTION_STATE,
        JSON.stringify({ isSubscribed: true, timestamp: Date.now() })
      );

      mockGetCustomerInfo.mockResolvedValue({
        success: true,
        data: { entitlements: { active: {} } }
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(result.current.showLapseModal).toBe(true));
    });

    test('does not show lapse modal on first install (no prior state)', async () => {
      mockGetCustomerInfo.mockResolvedValue({
        success: true,
        data: { entitlements: { active: {} } }
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
      expect(mockAuthEventCallback).toBeTruthy();

      mockGetCurrentUserId.mockResolvedValue(42);
      mockLoginUser.mockResolvedValueOnce({
        success: true,
        data: {
          entitlements: {
            active: {
              'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      mockGetCustomerInfo.mockResolvedValueOnce({
        success: true,
        data: {
          entitlements: {
            active: {
              'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      await act(async () => {
        await mockAuthEventCallback('LOGIN');
      });

      expect(mockLoginUser).toHaveBeenCalledWith('42');
      expect(result.current.isSubscribed).toBe(true);
    });

    test('LOGIN event with failed RevenueCat login sets error and skips refresh', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      mockGetCurrentUserId.mockResolvedValue(42);
      mockLoginUser.mockResolvedValueOnce({
        success: false,
        error: 'Account conflict'
      });

      await act(async () => {
        await mockAuthEventCallback('LOGIN');
      });

      expect(result.current.error).toBeTruthy();
      expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
    });

    test('LOGOUT event resets state and logs out RevenueCat', async () => {
      mockGetCustomerInfo.mockResolvedValue({
        success: true,
        data: {
          entitlements: {
            active: {
              'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(result.current.isSubscribed).toBe(true));

      await act(async () => {
        await mockAuthEventCallback('LOGOUT');
      });

      expect(mockLogoutUser).toHaveBeenCalled();
      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('real-time customer info listener', () => {
    test('listener updates subscription state when RevenueCat pushes new customer info', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockCustomerInfoUpdateCallback).toBeTruthy();

      await act(async () => {
        mockCustomerInfoUpdateCallback({
          entitlements: {
            active: {
              'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
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
      mockConfigure.mockResolvedValueOnce({ success: false, error: 'SDK init failed' });

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
      mockRestorePurchasesService.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: {
              active: {
                'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
              }
            }
          },
          isActive: true
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
      mockRestorePurchasesService.mockRejectedValueOnce(new Error('Restore failed'));

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
      mockRestorePurchasesService.mockResolvedValueOnce({
        success: true,
        data: { customerInfo: { entitlements: { active: {} } }, isActive: false }
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
      mockFetchOfferings.mockResolvedValueOnce({ success: true, data: { current: mockOffering } });

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
      mockFetchOfferings.mockRejectedValueOnce(new Error('Network error'));

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

  describe('AppState foreground refresh', () => {
    test('returning to foreground triggers refresh', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockAppStateCallback).toBeTruthy();

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        mockAppStateCallback('active');
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBeGreaterThan(customerInfoCallsBefore);
    });

    test('going to background does not trigger refresh', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        mockAppStateCallback('background');
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBe(customerInfoCallsBefore);
    });

    test('foreground refresh updates subscription state', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isSubscribed).toBe(false);

      mockGetCustomerInfo.mockResolvedValueOnce({
        success: true,
        data: {
          entitlements: {
            active: {
              'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      mockFetchSubscriptionStatus.mockResolvedValueOnce({
        success: true,
        data: {
          trial: { active: false, expiresAt: null, daysRemaining: 0 },
          subscription: { active: true },
          canGenerate: true,
          initialCredits: 10
        }
      });

      await act(async () => {
        mockAppStateCallback('active');
      });

      await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    });

    test('foreground refresh skips when SDK not configured', async () => {
      mockConfigure.mockResolvedValueOnce({ success: false, error: 'SDK init failed' });

      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        mockAppStateCallback('active');
      });

      // refresh attempts SDK init which fails, so getCustomerInfo should not be called again
      expect(mockGetCustomerInfo.mock.calls.length).toBe(customerInfoCallsBefore);
    });
  });

  describe('presentPaywall', () => {
    test('refreshes subscription state after PURCHASED result', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'PURCHASED' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      let paywallResult;
      await act(async () => {
        paywallResult = await result.current.actions.presentPaywall({ displayCloseButton: true });
      });

      expect(paywallResult.success).toBe(true);
      expect(paywallResult.data).toBe('PURCHASED');
      expect(mockGetCustomerInfo.mock.calls.length).toBeGreaterThan(customerInfoCallsBefore);
    });

    test('refreshes subscription state after RESTORED result', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'RESTORED' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentPaywall({ displayCloseButton: true });
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBeGreaterThan(customerInfoCallsBefore);
    });

    test('does not refresh after CANCELLED result', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'CANCELLED' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentPaywall({ displayCloseButton: true });
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBe(customerInfoCallsBefore);
    });

    test('returns error on failure without throwing', async () => {
      mockPresentPaywall.mockRejectedValueOnce(new Error('Paywall crashed'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let paywallResult;
      await act(async () => {
        paywallResult = await result.current.actions.presentPaywall();
      });

      expect(paywallResult.success).toBe(false);
      expect(paywallResult.error).toBe('Paywall crashed');
    });
  });

  describe('presentPaywallIfNeeded', () => {
    test('refreshes after PURCHASED result', async () => {
      mockPresentPaywallIfNeeded.mockResolvedValueOnce({ success: true, data: 'PURCHASED' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentPaywallIfNeeded();
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBeGreaterThan(customerInfoCallsBefore);
    });

    test('does not refresh when NOT_PRESENTED', async () => {
      mockPresentPaywallIfNeeded.mockResolvedValueOnce({ success: true, data: 'NOT_PRESENTED' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentPaywallIfNeeded();
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBe(customerInfoCallsBefore);
    });

    test('returns error on failure without throwing', async () => {
      mockPresentPaywallIfNeeded.mockRejectedValueOnce(new Error('Failed'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let paywallResult;
      await act(async () => {
        paywallResult = await result.current.actions.presentPaywallIfNeeded();
      });

      expect(paywallResult.success).toBe(false);
      expect(paywallResult.error).toBe('Failed');
    });
  });

  describe('presentCustomerCenter', () => {
    test('refreshes after successful customer center', async () => {
      mockPresentCustomerCenter.mockResolvedValueOnce({ success: true, data: null });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentCustomerCenter();
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBeGreaterThan(customerInfoCallsBefore);
    });

    test('does not refresh on failure', async () => {
      mockPresentCustomerCenter.mockResolvedValueOnce({ success: false, error: 'CC error' });

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      const customerInfoCallsBefore = mockGetCustomerInfo.mock.calls.length;

      await act(async () => {
        await result.current.actions.presentCustomerCenter();
      });

      expect(mockGetCustomerInfo.mock.calls.length).toBe(customerInfoCallsBefore);
    });

    test('returns error on failure without throwing', async () => {
      mockPresentCustomerCenter.mockRejectedValueOnce(new Error('Center crashed'));

      const { result } = renderHook(
        () => ({ state: useSubscription(), actions: useSubscriptionActions() }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.state.loading).toBe(false));

      let centerResult;
      await act(async () => {
        centerResult = await result.current.actions.presentCustomerCenter();
      });

      expect(centerResult.success).toBe(false);
      expect(centerResult.error).toBe('Center crashed');
    });
  });

  describe('real-time listener backend resync', () => {
    test('listener triggers backend status resync to update backendCanGenerate', async () => {
      const { result } = renderHook(() => useSubscription(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockCustomerInfoUpdateCallback).toBeTruthy();

      mockFetchSubscriptionStatus.mockResolvedValueOnce({
        success: true,
        data: {
          trial: { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 10 },
          subscription: { active: false },
          canGenerate: true,
          initialCredits: 10
        }
      });

      const statusCallsBefore = mockFetchSubscriptionStatus.mock.calls.length;

      await act(async () => {
        mockCustomerInfoUpdateCallback({
          entitlements: { active: {} }
        });
      });

      await waitFor(() =>
        expect(mockFetchSubscriptionStatus.mock.calls.length).toBeGreaterThan(statusCallsBefore)
      );

      await waitFor(() => expect(result.current.canGenerate).toBe(true));
    });
  });

  describe('canGenerate loading guard', () => {
    test('canGenerate is false during loading even when backendCanGenerate is null', async () => {
      // Delay SDK init so loading stays true during assertion
      let resolveInit;
      mockConfigure.mockImplementationOnce(() => new Promise((r) => { resolveInit = r; }));

      const { result } = renderHook(() => useSubscription(), { wrapper });

      // Still loading — canGenerate must be false regardless of fallback
      expect(result.current.loading).toBe(true);
      expect(result.current.canGenerate).toBe(false);

      // Unblock init so the hook can settle
      await act(async () => {
        resolveInit({ success: true });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('restorePurchases return shape', () => {
    test('successful restore returns isSubscribed field', async () => {
      mockRestorePurchasesService.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: {
              active: {
                'DawnoTemu Subscription': { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
              }
            }
          },
          isActive: true
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
      expect(restoreResult.isSubscribed).toBe(true);
    });

    test('restore with no entitlements returns isSubscribed false', async () => {
      mockRestorePurchasesService.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: { entitlements: { active: {} } },
          isActive: false
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
      expect(restoreResult.isSubscribed).toBe(false);
    });
  });
});
