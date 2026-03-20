jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

const mockPurchases = {
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  getCustomerInfo: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn()
};

jest.mock('react-native-purchases', () => mockPurchases);

describe('subscriptionService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_test_key';
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_test_key';
    service = require('../subscriptionService');
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  });

  describe('configure', () => {
    test('configures SDK with iOS key on iOS platform', async () => {
      mockPurchases.configure.mockResolvedValue(undefined);

      const result = await service.configure();

      expect(result.success).toBe(true);
      expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test_key' });
    });

    test('returns error when API key is missing', async () => {
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
      const freshService = require('../subscriptionService');

      const result = await freshService.configure();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(mockPurchases.configure).not.toHaveBeenCalled();
    });

    test('returns error when SDK throws', async () => {
      mockPurchases.configure.mockRejectedValue(new Error('Network error'));

      const result = await service.configure();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('loginUser', () => {
    test('returns customer info on success', async () => {
      const customerInfo = { entitlements: { active: {} } };
      mockPurchases.logIn.mockResolvedValue({ customerInfo });

      const result = await service.loginUser('user-123');

      expect(result.success).toBe(true);
      expect(result.data).toBe(customerInfo);
      expect(mockPurchases.logIn).toHaveBeenCalledWith('user-123');
    });

    test('returns error on failure', async () => {
      mockPurchases.logIn.mockRejectedValue(new Error('Invalid user'));

      const result = await service.loginUser('bad-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid user');
    });
  });

  describe('logoutUser', () => {
    test('returns customer info on success', async () => {
      const customerInfo = { entitlements: { active: {} } };
      mockPurchases.logOut.mockResolvedValue(customerInfo);

      const result = await service.logoutUser();

      expect(result.success).toBe(true);
      expect(result.data).toBe(customerInfo);
    });

    test('returns error on failure', async () => {
      mockPurchases.logOut.mockRejectedValue(new Error('Logout failed'));

      const result = await service.logoutUser();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout failed');
    });
  });

  describe('purchasePackage', () => {
    test('returns success with isActive when entitlement is present', async () => {
      const customerInfo = {
        entitlements: { active: { premium: { expirationDate: '2026-12-01' } } }
      };
      mockPurchases.purchasePackage.mockResolvedValue({ customerInfo });

      const result = await service.purchasePackage({ id: 'pkg1' });

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
      expect(result.data.customerInfo).toBe(customerInfo);
    });

    test('returns isActive false when entitlement is absent', async () => {
      const customerInfo = { entitlements: { active: {} } };
      mockPurchases.purchasePackage.mockResolvedValue({ customerInfo });

      const result = await service.purchasePackage({ id: 'pkg1' });

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
    });

    test('returns USER_CANCELLED code when user cancels', async () => {
      const error = new Error('cancelled');
      error.userCancelled = true;
      mockPurchases.purchasePackage.mockRejectedValue(error);

      const result = await service.purchasePackage({ id: 'pkg1' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('USER_CANCELLED');
    });

    test('returns error with code for non-cancellation failures', async () => {
      const error = new Error('Payment failed');
      error.code = 'STORE_PROBLEM';
      mockPurchases.purchasePackage.mockRejectedValue(error);

      const result = await service.purchasePackage({ id: 'pkg1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment failed');
      expect(result.code).toBe('STORE_PROBLEM');
    });
  });

  describe('restorePurchases', () => {
    test('returns isActive based on entitlements', async () => {
      const customerInfo = {
        entitlements: { active: { premium: {} } }
      };
      mockPurchases.restorePurchases.mockResolvedValue(customerInfo);

      const result = await service.restorePurchases();

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    test('returns error on failure', async () => {
      mockPurchases.restorePurchases.mockRejectedValue(new Error('Restore failed'));

      const result = await service.restorePurchases();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Restore failed');
    });
  });

  describe('getCustomerInfo', () => {
    test('returns customer info on success', async () => {
      const customerInfo = { entitlements: { active: {} } };
      mockPurchases.getCustomerInfo.mockResolvedValue(customerInfo);

      const result = await service.getCustomerInfo();

      expect(result.success).toBe(true);
      expect(result.data).toBe(customerInfo);
    });
  });

  describe('parseCustomerInfo', () => {
    test('returns unsubscribed defaults for null input', () => {
      const result = service.parseCustomerInfo(null);

      expect(result.isSubscribed).toBe(false);
      expect(result.expirationDate).toBeNull();
      expect(result.willRenew).toBe(false);
    });

    test('returns unsubscribed when no active entitlements', () => {
      const result = service.parseCustomerInfo({
        entitlements: { active: {} }
      });

      expect(result.isSubscribed).toBe(false);
      expect(result.expirationDate).toBeNull();
      expect(result.willRenew).toBe(false);
    });

    test('returns subscribed with expiration when premium entitlement active', () => {
      const result = service.parseCustomerInfo({
        entitlements: {
          active: {
            premium: {
              expirationDate: '2026-12-01T00:00:00Z',
              willRenew: true
            }
          }
        }
      });

      expect(result.isSubscribed).toBe(true);
      expect(result.expirationDate).toEqual(new Date('2026-12-01T00:00:00Z'));
      expect(result.willRenew).toBe(true);
    });

    test('handles missing willRenew by defaulting to false', () => {
      const result = service.parseCustomerInfo({
        entitlements: {
          active: {
            premium: {
              expirationDate: '2026-12-01T00:00:00Z'
            }
          }
        }
      });

      expect(result.isSubscribed).toBe(true);
      expect(result.willRenew).toBe(false);
    });

    test('handles missing expirationDate', () => {
      const result = service.parseCustomerInfo({
        entitlements: {
          active: {
            premium: { willRenew: true }
          }
        }
      });

      expect(result.isSubscribed).toBe(true);
      expect(result.expirationDate).toBeNull();
    });
  });

  describe('onCustomerInfoUpdate', () => {
    test('registers listener and returns success with listener data', () => {
      const callback = jest.fn();
      const remover = jest.fn();
      mockPurchases.addCustomerInfoUpdateListener.mockReturnValue(remover);

      const result = service.onCustomerInfoUpdate(callback);

      expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalledWith(callback);
      expect(result.success).toBe(true);
      expect(result.data).toBe(remover);
    });

    test('returns failure when SDK throws', () => {
      mockPurchases.addCustomerInfoUpdateListener.mockImplementation(() => {
        throw new Error('SDK not ready');
      });

      const result = service.onCustomerInfoUpdate(jest.fn());

      expect(result.success).toBe(false);
      expect(result.error).toBe('SDK not ready');
    });
  });

  describe('parseCustomerInfo', () => {
    test('returns unsubscribed defaults for malformed input without throwing', () => {
      const result = service.parseCustomerInfo('not-an-object');

      expect(result.isSubscribed).toBe(false);
      expect(result.expirationDate).toBeNull();
      expect(result.willRenew).toBe(false);
    });
  });
});
