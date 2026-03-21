const mockGetAccessToken = jest.fn();

jest.mock('../authService', () => ({
  getAccessToken: (...args) => mockGetAccessToken(...args)
}));

jest.mock('../config', () => ({
  API_BASE_URL: 'https://api.test.com',
  REQUEST_TIMEOUT: 5000,
  DEFAULT_INITIAL_CREDITS: 10
}));

describe('subscriptionStatusService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    global.fetch = jest.fn();
    global.AbortController = jest.fn().mockImplementation(() => ({
      signal: 'test-signal',
      abort: jest.fn()
    }));
    service = require('../subscriptionStatusService');
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('fetchSubscriptionStatus', () => {
    test('returns parsed subscription status on 200', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          trial: {
            active: true,
            expires_at: '2026-04-01T00:00:00Z',
            days_remaining: 12
          },
          subscription: {
            active: false,
            plan: null,
            expires_at: null,
            will_renew: false
          },
          can_generate: true,
          initial_credits: 10
        })
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(true);
      expect(result.data.trial.active).toBe(true);
      expect(result.data.trial.expiresAt).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(result.data.trial.daysRemaining).toBe(12);
      expect(result.data.subscription.active).toBe(false);
      expect(result.data.canGenerate).toBe(true);
    });

    test('returns AUTH_REQUIRED when no token', async () => {
      mockGetAccessToken.mockResolvedValue(null);

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_REQUIRED');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns error on 404 with null data', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.data).toBeNull();
    });

    test('returns error on non-ok response', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error')
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500');
    });

    test('returns timeout error on AbortError', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
    });

    test('returns error on network failure', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('normalizes snake_case fields to camelCase', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          trial: {
            active: false,
            expires_at: '2026-03-01T00:00:00Z',
            days_remaining: 0
          },
          subscription: {
            active: true,
            plan: 'monthly',
            expires_at: '2026-05-01T00:00:00Z',
            will_renew: true
          },
          can_generate: true,
          initial_credits: 26
        })
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.data.subscription.willRenew).toBe(true);
      expect(result.data.subscription.expiresAt).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(result.data.canGenerate).toBe(true);
      expect(result.data.initialCredits).toBe(26);
    });

    test('returns error when 200 response has invalid JSON', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toContain('nieprawidłowe dane');
    });

    test('returns null for invalid date strings instead of Invalid Date', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          trial: {
            active: true,
            expires_at: 'not-a-date',
            days_remaining: 5
          },
          subscription: {
            active: true,
            plan: 'monthly',
            expires_at: 'also-invalid',
            will_renew: true
          },
          can_generate: true,
          initial_credits: 10
        })
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(true);
      expect(result.data.trial.expiresAt).toBeNull();
      expect(result.data.subscription.expiresAt).toBeNull();
    });

    test('returns failure for missing required fields', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({})
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_RESPONSE_SHAPE');
    });
  });

  describe('grantAddonCredits', () => {
    test('sends correct request body and returns granted credits', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          credits_granted: 10,
          new_balance: 36
        })
      });

      const result = await service.grantAddonCredits({
        receiptToken: 'receipt-abc',
        productId: 'credits_10',
        platform: 'ios'
      });

      expect(result.success).toBe(true);
      expect(result.data.creditsGranted).toBe(10);
      expect(result.data.newBalance).toBe(36);

      const fetchCall = global.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.receipt_token).toBe('receipt-abc');
      expect(body.product_id).toBe('credits_10');
      expect(body.platform).toBe('ios');
    });

    test('returns AUTH_REQUIRED when no token', async () => {
      mockGetAccessToken.mockResolvedValue(null);

      const result = await service.grantAddonCredits({
        receiptToken: 'x',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required');
      expect(result.code).toBe('AUTH_REQUIRED');
    });

    test('returns error on non-ok response', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Invalid receipt' }))
      });

      const result = await service.grantAddonCredits({
        receiptToken: 'bad',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid receipt');
      expect(result.status).toBe(400);
    });

    test('handles non-JSON error response', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('<html>Server Error</html>')
      });

      const result = await service.grantAddonCredits({
        receiptToken: 'x',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500');
    });

    test('returns error when 200 response has invalid JSON', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      });

      const result = await service.grantAddonCredits({
        receiptToken: 'x',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('nieprawidłowe dane');
    });

    test('returns timeout error on AbortError', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      const result = await service.grantAddonCredits({
        receiptToken: 'x',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
      expect(result.code).toBe('TIMEOUT');
    });

    test('returns error on network failure', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await service.grantAddonCredits({
        receiptToken: 'x',
        productId: 'y',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('returns failure when success response is missing numeric fields', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          credits_granted: null,
          new_balance: undefined
        })
      });

      const result = await service.grantAddonCredits({
        transactionId: 'txn-1',
        productId: 'credits_10',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('niekompletne dane');
    });

    test('reports server error responses with JSON bodies to Sentry', async () => {
      const Sentry = require('@sentry/react-native');
      mockGetAccessToken.mockResolvedValue('test-token');
      global.fetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Bad gateway' }))
      });

      const result = await service.grantAddonCredits({
        transactionId: 'txn-1',
        productId: 'credits_10',
        platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'grantAddonCredits server error',
        expect.objectContaining({
          level: 'error',
          extra: expect.objectContaining({ status: 502 })
        })
      );
    });
  });
});
