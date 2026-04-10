import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockShowToast = jest.fn();
jest.mock('../../components/StatusToast', () => ({
  useToast: () => ({ showToast: mockShowToast })
}));

const mockRefreshCredits = jest.fn().mockResolvedValue(undefined);
jest.mock('../../hooks/useCredits', () => ({
  useCreditActions: () => ({ refreshCredits: mockRefreshCredits })
}));

const mockGrantAddonCredits = jest.fn();
jest.mock('../../services/subscriptionStatusService', () => ({
  grantAddonCredits: (...args) => mockGrantAddonCredits(...args)
}));

const mockGetCurrentUserId = jest.fn().mockResolvedValue('user-1');
jest.mock('../../services/authService', () => ({
  getCurrentUserId: (...args) => mockGetCurrentUserId(...args)
}));

let mockSubscriptionState = { loading: false };
jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => mockSubscriptionState
}));

jest.mock('../../services/config', () => ({
  STORAGE_KEYS: {
    PENDING_ADDON_GRANT: 'subscription_pending_addon_grant'
  }
}));

const PENDING_KEY = 'subscription_pending_addon_grant';

let PendingAddonGrantRetrier;
beforeAll(() => {
  PendingAddonGrantRetrier = require('../PendingAddonGrantRetrier').default;
});

describe('PendingAddonGrantRetrier', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSubscriptionState = { loading: false };
    mockGetCurrentUserId.mockResolvedValue('user-1');
  });

  test('does not fire while subscription is still loading', async () => {
    mockSubscriptionState = { loading: true };
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        transactionId: 'txn-loading',
        productId: 'credits_10',
        platform: 'ios',
        credits: 10,
        userId: 'user-1',
        createdAt: Date.now(),
      })
    );

    render(<PendingAddonGrantRetrier />);

    // Give any pending microtasks a chance to run
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGrantAddonCredits).not.toHaveBeenCalled();
  });

  test('does nothing when there is no pending grant', async () => {
    render(<PendingAddonGrantRetrier />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGrantAddonCredits).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  test('retries pending addon grant on mount and shows success toast', async () => {
    const pending = {
      transactionId: 'txn-retry',
      productId: 'credits_20',
      platform: 'ios',
      credits: 20,
      userId: 'user-1',
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    mockGrantAddonCredits.mockResolvedValueOnce({
      success: true,
      data: { creditsGranted: 20, newBalance: 46 },
    });

    render(<PendingAddonGrantRetrier />);

    await waitFor(() => {
      expect(mockGrantAddonCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'txn-retry',
          productId: 'credits_20',
          platform: 'ios',
        })
      );
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('20'),
        'SUCCESS'
      );
    });

    // Pending grant cleared on success
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
    });

    expect(mockRefreshCredits).toHaveBeenCalledWith({ force: true });
  });

  test('keeps pending grant on failure (so next launch can retry)', async () => {
    const pending = {
      transactionId: 'txn-fail',
      productId: 'credits_10',
      platform: 'ios',
      credits: 10,
      userId: 'user-1',
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    mockGrantAddonCredits.mockResolvedValueOnce({
      success: false,
      error: 'Server error',
    });

    render(<PendingAddonGrantRetrier />);

    await waitFor(() => {
      expect(mockGrantAddonCredits).toHaveBeenCalled();
    });

    // Pending grant preserved for future retry
    const stored = await AsyncStorage.getItem(PENDING_KEY);
    expect(stored).toBeTruthy();
    // Success toast NOT shown on failure
    expect(mockShowToast).not.toHaveBeenCalledWith(
      expect.anything(),
      'SUCCESS'
    );
  });

  test('discards pending addon grant belonging to a different user', async () => {
    const pending = {
      transactionId: 'txn-other',
      productId: 'credits_10',
      platform: 'ios',
      credits: 10,
      userId: 'user-other',
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    render(<PendingAddonGrantRetrier />);

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
    });

    expect(mockGrantAddonCredits).not.toHaveBeenCalled();
  });

  test('discards expired pending addon grant (TTL > 24h)', async () => {
    const expired = {
      transactionId: 'txn-expired',
      productId: 'credits_10',
      platform: 'ios',
      credits: 10,
      userId: 'user-1',
      createdAt: Date.now() - 25 * 60 * 60 * 1000,
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(expired));

    render(<PendingAddonGrantRetrier />);

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
    });

    expect(mockGrantAddonCredits).not.toHaveBeenCalled();
  });

  test('discards pending grant with missing required fields', async () => {
    const invalid = {
      // No transactionId
      productId: 'credits_10',
      platform: 'ios',
      credits: 10,
      userId: 'user-1',
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(invalid));

    render(<PendingAddonGrantRetrier />);

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
    });

    expect(mockGrantAddonCredits).not.toHaveBeenCalled();
  });

  test('fires exactly once across multiple re-renders', async () => {
    const pending = {
      transactionId: 'txn-once',
      productId: 'credits_10',
      platform: 'ios',
      credits: 10,
      userId: 'user-1',
      createdAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    mockGrantAddonCredits.mockResolvedValue({
      success: true,
      data: { creditsGranted: 10, newBalance: 20 },
    });

    const { rerender } = render(<PendingAddonGrantRetrier />);

    await waitFor(() => {
      expect(mockGrantAddonCredits).toHaveBeenCalledTimes(1);
    });

    rerender(<PendingAddonGrantRetrier />);
    rerender(<PendingAddonGrantRetrier />);
    await new Promise((r) => setTimeout(r, 50));

    // Still exactly one call even after re-renders
    expect(mockGrantAddonCredits).toHaveBeenCalledTimes(1);
  });
});
