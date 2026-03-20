jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }) }
}));

jest.mock('react-native-purchases', () => ({
  configure: jest.fn().mockResolvedValue(undefined),
  logIn: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getOfferings: jest.fn().mockResolvedValue({ current: null }),
  purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  addCustomerInfoUpdateListener: jest.fn().mockReturnValue(() => {})
}));

jest.mock('../../services/subscriptionStatusService', () => ({
  fetchSubscriptionStatus: jest.fn().mockResolvedValue({
    success: true,
    data: {
      trial: { active: false, expiresAt: null, daysRemaining: 0 },
      subscription: { active: false },
      canGenerate: false,
      initialCredits: 10
    }
  })
}));

jest.mock('../../services/authService', () => ({
  subscribeAuthEvents: jest.fn().mockReturnValue(() => {}),
  getCurrentUserId: jest.fn().mockResolvedValue(null),
  getAccessToken: jest.fn().mockResolvedValue(null)
}));

const { __TEST_ONLY__ } = require('../useSubscription');
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
