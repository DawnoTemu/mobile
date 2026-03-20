jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  wrap: jest.fn((component) => component),
  mobileReplayIntegration: jest.fn()
}));

jest.mock('react-native-purchases', () => ({
  configure: jest.fn().mockResolvedValue(undefined),
  logIn: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  logOut: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getOfferings: jest.fn().mockResolvedValue({ current: null }),
  purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
  restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  addCustomerInfoUpdateListener: jest.fn().mockReturnValue(() => {}),
}));
