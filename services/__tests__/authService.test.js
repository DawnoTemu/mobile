jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn())
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn()
  }
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('../config', () => ({
  API_BASE_URL: 'https://api.test.com',
  REQUEST_TIMEOUT: 5000,
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'auth_access_token',
    REFRESH_TOKEN: 'auth_refresh_token',
    USER_DATA: 'auth_user_data',
    PLAYBACK_QUEUE: 'playback_queue_state',
    PLAYBACK_LOOP_MODE: 'playback_loop_mode'
  }
}));

const ACCESS_KEY = 'auth_access_token';
const REFRESH_KEY = 'auth_refresh_token';

const buildJsonResponse = ({ ok, status, body }) => ({
  ok,
  status,
  json: () => Promise.resolve(body)
});

describe('authService.apiRequest 401 disambiguation', () => {
  let SecureStore;
  let authService;
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    fetchMock = jest.fn();
    global.fetch = fetchMock;

    // Re-require after resetModules so mocks attach to fresh module instance
    SecureStore = require('expo-secure-store');
    authService = require('../authService');
  });

  afterEach(() => {
    delete global.fetch;
  });

  // Helper to set per-key SecureStore returns
  const setSecureStoreState = ({ accessToken = null, refreshToken = null }) => {
    SecureStore.getItemAsync.mockImplementation((key) => {
      if (key === ACCESS_KEY) return Promise.resolve(accessToken);
      if (key === REFRESH_KEY) return Promise.resolve(refreshToken);
      return Promise.resolve(null);
    });
    SecureStore.setItemAsync.mockResolvedValue(undefined);
    SecureStore.deleteItemAsync.mockResolvedValue(undefined);
  };

  test('401 with no access token AND no refresh token returns AUTH_REQUIRED without logout cascade', async () => {
    setSecureStoreState({ accessToken: null, refreshToken: null });

    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Token missing' } })
    );

    const result = await authService.apiRequest('/protected');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: 401,
        code: 'AUTH_REQUIRED',
        error: 'Token missing'
      })
    );
    expect(result).toHaveProperty('data');
    // refreshToken not invoked: only the original protected request hit fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/refresh')
    );
    expect(refreshCalls).toHaveLength(0);
    // logout would have called deleteItemAsync on stored keys; ensure not called
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  test('401 with no access token but refresh token present, refresh succeeds, retries the request', async () => {
    setSecureStoreState({ accessToken: null, refreshToken: 'refresh-xyz' });

    // 1) Original request -> 401
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Unauthorized' } })
    );
    // 2) /auth/refresh -> 200 with new access token
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: true, status: 200, body: { access_token: 'new-access' } })
    );
    // 3) Retry of original request -> 200 success
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: true, status: 200, body: { ok: true } })
    );

    // After refresh, the stored access token will be queried again on retry.
    // Switch SecureStore to return the new access token AFTER setItemAsync is called.
    SecureStore.setItemAsync.mockImplementation((key, value) => {
      if (key === ACCESS_KEY) {
        SecureStore.getItemAsync.mockImplementation((k) => {
          if (k === ACCESS_KEY) return Promise.resolve(value);
          if (k === REFRESH_KEY) return Promise.resolve('refresh-xyz');
          return Promise.resolve(null);
        });
      }
      return Promise.resolve(undefined);
    });

    const result = await authService.apiRequest('/protected');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ ok: true });

    // Exactly one refresh attempt
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/refresh')
    );
    expect(refreshCalls).toHaveLength(1);

    // The retry request used the new access token in its Authorization header
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[0]).toContain('/protected');
    expect(retryCall[1].headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer new-access' })
    );
  });

  test('401 with no access token but refresh token present, refresh fails, calls logout and returns AUTH_ERROR', async () => {
    setSecureStoreState({ accessToken: null, refreshToken: 'refresh-broken' });

    // 1) Original -> 401
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Unauthorized' } })
    );
    // 2) /auth/refresh -> 401 (refresh failed)
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Refresh denied' } })
    );

    const result = await authService.apiRequest('/protected');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: 401,
        code: 'AUTH_ERROR',
        error: 'Unauthorized'
      })
    );

    // logout cascade ran -> tokens deleted from SecureStore
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
  });

  test('401 with valid access token, refresh succeeds, retries the request', async () => {
    setSecureStoreState({ accessToken: 'old-access', refreshToken: 'refresh-xyz' });

    // 1) Original -> 401
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Expired' } })
    );
    // 2) /auth/refresh -> 200
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: true, status: 200, body: { access_token: 'new-access' } })
    );
    // 3) Retry -> 200
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: true, status: 200, body: { ok: true } })
    );

    SecureStore.setItemAsync.mockImplementation((key, value) => {
      if (key === ACCESS_KEY) {
        SecureStore.getItemAsync.mockImplementation((k) => {
          if (k === ACCESS_KEY) return Promise.resolve(value);
          if (k === REFRESH_KEY) return Promise.resolve('refresh-xyz');
          return Promise.resolve(null);
        });
      }
      return Promise.resolve(undefined);
    });

    const result = await authService.apiRequest('/protected');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/auth/refresh')
    );
    expect(refreshCalls).toHaveLength(1);

    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[1].headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer new-access' })
    );
  });

  test('401 with valid access token, refresh fails, calls logout and returns AUTH_ERROR', async () => {
    setSecureStoreState({ accessToken: 'old-access', refreshToken: 'refresh-xyz' });

    // 1) Original -> 401
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Token expired' } })
    );
    // 2) /auth/refresh -> 401
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Refresh denied' } })
    );

    const result = await authService.apiRequest('/protected');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        status: 401,
        code: 'AUTH_ERROR',
        error: 'Token expired'
      })
    );

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ACCESS_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
  });

  test('401 on retry (isRetry=true) does not loop and returns API_ERROR-style result', async () => {
    setSecureStoreState({ accessToken: 'some-access', refreshToken: 'refresh-xyz' });

    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: { error: 'Still unauthorized' } })
    );

    const result = await authService.apiRequest('/protected', {}, null, true);

    // Only one fetch — no refresh attempt, no further retries
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    // mapStatusToCode(401) returns 'AUTH_ERROR'; what matters is no logout cascade
    // and no further fetches
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  test('AUTH_REQUIRED response shape includes status, code, error, and data fields', async () => {
    setSecureStoreState({ accessToken: null, refreshToken: null });

    const responseBody = { error: 'You must log in', detail: 'no token' };
    fetchMock.mockResolvedValueOnce(
      buildJsonResponse({ ok: false, status: 401, body: responseBody })
    );

    const result = await authService.apiRequest('/protected');

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('status', 401);
    expect(result).toHaveProperty('code', 'AUTH_REQUIRED');
    expect(result).toHaveProperty('error', 'You must log in');
    expect(result).toHaveProperty('data', responseBody);
  });
});
