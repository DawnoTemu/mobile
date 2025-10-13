jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../authService', () => ({
  apiRequest: jest.fn()
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { apiRequest } = require('../authService');
const creditService = require('../creditService');
const configModule = require('../config');

const STORAGE_KEYS = configModule.STORAGE_KEYS || (configModule.default && configModule.default.STORAGE_KEYS);
const CREDITS_KEY = STORAGE_KEYS.CREDITS_CACHE;
const ESTIMATES_KEY = STORAGE_KEYS.CREDIT_ESTIMATES;

describe('creditService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await creditService.__TEST_ONLY__reset();
  });

  test('getCredits fetches from API and caches result', async () => {
    const apiPayload = {
      balance: 42,
      unit_label: 'Story Stars',
      unit_size: 1000,
      lots: [
        { source: 'monthly', amount_granted: 120, amount_remaining: 90, expires_at: '2025-09-01T00:00:00Z' }
      ],
      recent_transactions: [
        { type: 'debit', amount: -3, status: 'applied', reason: 'audio_generation', created_at: '2025-08-01T10:00:00Z' }
      ]
    };

    apiRequest.mockResolvedValue({
      success: true,
      status: 200,
      data: apiPayload
    });

    const result = await creditService.getCredits({ forceRefresh: true });

    expect(apiRequest).toHaveBeenCalledWith('/me/credits');
    expect(result.success).toBe(true);
    expect(result.fromCache).toBe(false);
    expect(result.data.balance).toBe(42);
    expect(result.data.lots).toHaveLength(1);
    expect(result.data.recentTransactions).toHaveLength(1);

    const stored = JSON.parse(await AsyncStorage.getItem(CREDITS_KEY));
    expect(stored.data.balance).toBe(42);
  });

  test('getCredits returns cached data when offline', async () => {
    const cachedData = {
      balance: 10,
      unitLabel: 'Punkty Magii',
      unitSize: 1000,
      lots: [],
      recentTransactions: [],
      fetchedAt: Date.now()
    };

    await AsyncStorage.setItem(
      CREDITS_KEY,
      JSON.stringify({ data: cachedData, timestamp: cachedData.fetchedAt })
    );

    apiRequest.mockResolvedValue({
      success: false,
      status: null,
      error: 'No internet connection',
      code: 'OFFLINE'
    });

    const result = await creditService.getCredits({ forceRefresh: true });

    expect(result.success).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(result.data.balance).toBe(10);
    expect(result.code).toBe('OFFLINE');
  });

  test('getStoryCredits caches per-story estimates', async () => {
    apiRequest.mockImplementation((endpoint) => {
      if (endpoint === '/stories/123/credits') {
        return Promise.resolve({
          success: true,
          status: 200,
          data: { required_credits: 3 }
        });
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
    });

    const first = await creditService.getStoryCredits(123, { forceRefresh: true });
    expect(first.success).toBe(true);
    expect(first.data.requiredCredits).toBe(3);
    expect(apiRequest).toHaveBeenCalledTimes(1);

    apiRequest.mockClear();

    const second = await creditService.getStoryCredits(123);
    expect(second.success).toBe(true);
    expect(second.fromCache).toBe(true);
    expect(second.data.requiredCredits).toBe(3);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  test('primeStoryCredits fetches only missing estimates', async () => {
    const responses = {
      '/stories/1/credits': { required_credits: 2 },
      '/stories/2/credits': { required_credits: 4 }
    };

    apiRequest.mockImplementation((endpoint) => {
      if (responses[endpoint]) {
        return Promise.resolve({
          success: true,
          status: 200,
          data: responses[endpoint]
        });
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
    });

    const result = await creditService.primeStoryCredits([1, 2, 2]);
    expect(result).toEqual({ requested: 2, fetched: 2 });

    // Repeat should use cache
    apiRequest.mockClear();
    const cachedResult = await creditService.primeStoryCredits([1, 2]);
    expect(cachedResult).toEqual({ requested: 2, fetched: 0 });
    expect(apiRequest).not.toHaveBeenCalled();

    const stored = JSON.parse(await AsyncStorage.getItem(ESTIMATES_KEY));
    expect(Object.keys(stored)).toHaveLength(2);
  });

  test('getStoryCredits allows zero-cost stories', async () => {
    apiRequest.mockImplementation((endpoint) => {
      if (endpoint === '/stories/77/credits') {
        return Promise.resolve({
          success: true,
          status: 200,
          data: { required_credits: 0 }
        });
      }
      return Promise.reject(new Error('Unexpected endpoint'));
    });

    const result = await creditService.getStoryCredits(77, { forceRefresh: true });

    expect(result.success).toBe(true);
    expect(result.data.requiredCredits).toBe(0);
  });
});
