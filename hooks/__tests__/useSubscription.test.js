import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }) }
}));

const mockConfigure = jest.fn();
const mockLoginUser = jest.fn();
const mockLogoutUser = jest.fn();
const mockFetchOfferings = jest.fn();
const mockPurchasePkg = jest.fn();
const mockRestorePurchasesService = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockOnCustomerInfoUpdate = jest.fn();

const mockParseCustomerInfo = (customerInfo) => {
  if (!customerInfo?.entitlements || typeof customerInfo.entitlements !== 'object') {
    return { isSubscribed: false, expirationDate: null, willRenew: false };
  }
  const entitlement = customerInfo.entitlements?.active?.premium;
  const isSubscribed = entitlement !== undefined;
  let expirationDate = null;
  if (entitlement?.expirationDate) {
    const parsed = new Date(entitlement.expirationDate);
    if (Number.isFinite(parsed.getTime())) {
      expirationDate = parsed;
    }
  }
  return {
    isSubscribed,
    expirationDate,
    willRenew: entitlement?.willRenew ?? false
  };
};

let mockCustomerInfoUpdateCallback = null;

jest.mock('../../services/subscriptionService', () => ({
  configure: (...args) => mockConfigure(...args),
  loginUser: (...args) => mockLoginUser(...args),
  logoutUser: (...args) => mockLogoutUser(...args),
  getOfferings: (...args) => mockFetchOfferings(...args),
  purchasePackage: (...args) => mockPurchasePkg(...args),
  restorePurchases: (...args) => mockRestorePurchasesService(...args),
  getCustomerInfo: (...args) => mockGetCustomerInfo(...args),
  onCustomerInfoUpdate: (...args) => mockOnCustomerInfoUpdate(...args),
  parseCustomerInfo: mockParseCustomerInfo
}));

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
      expirationDate: null,
      willRenew: false,
      error: null,
      trial: {
        active: false,
        expiresAt: null,
        daysRemaining: 0
      },
      backendCanGenerate: null,
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

  test('SET_TRIAL_STATUS updates trial and stores backendCanGenerate', () => {
    const trial = { active: true, expiresAt: new Date('2026-04-01'), daysRemaining: 12 };

    const next = reducer(initialState, {
      type: 'SET_TRIAL_STATUS',
      payload: { trial, backendCanGenerate: true }
    });

    expect(next.trial).toBe(trial);
    expect(next.backendCanGenerate).toBe(true);
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
    mockAuthEventCallback = null;
    mockCustomerInfoUpdateCallback = null;
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
                premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
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
        'subscription_last_known_state',
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
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
            }
          }
        }
      });

      mockGetCustomerInfo.mockResolvedValueOnce({
        success: true,
        data: {
          entitlements: {
            active: {
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
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
              premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
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
                premium: { expirationDate: '2026-12-01T00:00:00Z', willRenew: true }
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
});
