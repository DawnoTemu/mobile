jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
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
  setLogLevel: jest.fn(),
  LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}));

jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: {
    presentPaywall: jest.fn().mockResolvedValue('CANCELLED'),
    presentPaywallIfNeeded: jest.fn().mockResolvedValue('NOT_PRESENTED'),
    presentCustomerCenter: jest.fn().mockResolvedValue(undefined),
    Paywall: jest.fn(() => null),
    CustomerCenterView: jest.fn(() => null),
  },
  PAYWALL_RESULT: {
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
    CANCELLED: 'CANCELLED',
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
  },
}));
