const mockApiRequest = jest.fn();

jest.mock('../authService', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
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
    service = require('../subscriptionStatusService');
  });

  describe('fetchSubscriptionStatus', () => {
    test('returns parsed subscription status on 200', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: {
          trial: { active: true, expires_at: '2026-04-01T00:00:00Z', days_remaining: 12 },
          subscription: { active: false, plan: null, expires_at: null, will_renew: false },
          can_generate: true,
          initial_credits: 10
        }
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(true);
      expect(result.data.trial.active).toBe(true);
      expect(result.data.trial.expiresAt).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(result.data.trial.daysRemaining).toBe(12);
      expect(result.data.subscription.active).toBe(false);
      expect(result.data.canGenerate).toBe(true);
      expect(mockApiRequest).toHaveBeenCalledWith('/api/user/subscription-status', { method: 'GET' });
    });

    test('forwards 401/AUTH_ERROR result without Sentry capture', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 401,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_ERROR');
      expect(result.status).toBe(401);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    test('captures Sentry warning on 404', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 404,
        error: 'Not found',
        code: 'NOT_FOUND'
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Subscription status endpoint returned 404',
        'warning'
      );
    });

    test('captures Sentry error on 5xx', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 500,
        error: 'Server error',
        code: 'SERVER_ERROR'
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Subscription status endpoint server error',
        expect.objectContaining({ level: 'error' })
      );
    });

    test('forwards TIMEOUT/OFFLINE without Sentry capture', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: null,
        error: 'No internet connection',
        code: 'OFFLINE'
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('OFFLINE');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    test('normalizes snake_case fields to camelCase', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: {
          trial: { active: false, expires_at: '2026-03-01T00:00:00Z', days_remaining: 0 },
          subscription: {
            active: true,
            plan: 'monthly',
            expires_at: '2026-05-01T00:00:00Z',
            will_renew: true
          },
          can_generate: true,
          initial_credits: 26
        }
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.data.subscription.willRenew).toBe(true);
      expect(result.data.subscription.expiresAt).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(result.data.canGenerate).toBe(true);
      expect(result.data.initialCredits).toBe(26);
    });

    test('returns null for invalid date strings instead of Invalid Date', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: {
          trial: { active: true, expires_at: 'not-a-date', days_remaining: 5 },
          subscription: { active: true, plan: 'monthly', expires_at: 'also-invalid', will_renew: true },
          can_generate: true,
          initial_credits: 10
        }
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(true);
      expect(result.data.trial.expiresAt).toBeNull();
      expect(result.data.subscription.expiresAt).toBeNull();
    });

    test('returns INVALID_RESPONSE_SHAPE for missing required fields', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: {}
      });

      const result = await service.fetchSubscriptionStatus();

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_RESPONSE_SHAPE');
    });
  });

  describe('grantAddonCredits', () => {
    test('sends correct request body and returns granted credits', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: { credits_granted: 10, new_balance: 36 }
      });

      const result = await service.grantAddonCredits({
        transactionId: 'receipt-abc',
        productId: 'credits_10',
        platform: 'ios'
      });

      expect(result.success).toBe(true);
      expect(result.data.creditsGranted).toBe(10);
      expect(result.data.newBalance).toBe(36);

      const [endpoint, options] = mockApiRequest.mock.calls[0];
      expect(endpoint).toBe('/api/credits/grant-addon');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.receipt_token).toBe('receipt-abc');
      expect(body.product_id).toBe('credits_10');
      expect(body.platform).toBe('ios');
    });

    test('forwards 4xx error without Sentry capture', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 400,
        error: 'Invalid receipt',
        code: 'BAD_REQUEST'
      });

      const result = await service.grantAddonCredits({
        transactionId: 'bad', productId: 'y', platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid receipt');
      expect(result.status).toBe(400);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    test('captures Sentry error on 5xx', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 502,
        error: 'Bad gateway',
        code: 'SERVER_ERROR'
      });

      const result = await service.grantAddonCredits({
        transactionId: 'txn-1', productId: 'credits_10', platform: 'ios'
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

    test('returns failure when success response is missing numeric fields', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: { credits_granted: null, new_balance: undefined }
      });

      const result = await service.grantAddonCredits({
        transactionId: 'txn-1', productId: 'credits_10', platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('niekompletne dane');
    });

    test('forwards OFFLINE without Sentry capture', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: null,
        error: 'No internet connection',
        code: 'OFFLINE'
      });

      const result = await service.grantAddonCredits({
        transactionId: 'x', productId: 'y', platform: 'ios'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('OFFLINE');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('linkRevenueCat', () => {
    test('sends POST with revenuecat_app_user_id and returns success', async () => {
      mockApiRequest.mockResolvedValue({
        success: true,
        status: 200,
        data: { status: 'linked', revenuecat_app_user_id: '42' }
      });

      const result = await service.linkRevenueCat('42');

      expect(result.success).toBe(true);
      const [endpoint, options] = mockApiRequest.mock.calls[0];
      expect(endpoint).toBe('/api/user/link-revenuecat');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ revenuecat_app_user_id: '42' });
    });

    test('returns error without Sentry on 409 conflict', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 409,
        error: 'RevenueCat ID already linked to another account',
        code: 'API_ERROR'
      });

      const result = await service.linkRevenueCat('42');

      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    test('returns error without Sentry on 401 (handled by apiRequest)', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 401,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });

      const result = await service.linkRevenueCat('42');

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    test('captures Sentry warning on non-401/409 failure', async () => {
      const Sentry = require('@sentry/react-native');
      mockApiRequest.mockResolvedValue({
        success: false,
        status: 500,
        error: 'Failed to link account',
        code: 'SERVER_ERROR'
      });

      const result = await service.linkRevenueCat('42');

      expect(result.success).toBe(false);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'linkRevenueCat failed',
        expect.objectContaining({ level: 'warning' })
      );
    });
  });
});
