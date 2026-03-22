import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate })
}));

const mockShowToast = jest.fn();
jest.mock('../../components/StatusToast', () => ({
  useToast: () => ({ showToast: mockShowToast })
}));

const mockSubscriptionState = {
  isSubscribed: false,
  loading: false,
  expirationDate: null,
  willRenew: false,
  error: null,
  trial: { active: false, expiresAt: null, daysRemaining: 0 },
  canGenerate: false,
  showOnboarding: false,
  showLapseModal: false
};

const mockPurchasePackage = jest.fn().mockResolvedValue({ success: true, data: { customerInfo: { entitlements: { active: {} } } } });
const mockRestorePurchases = jest.fn().mockResolvedValue({ success: true, isSubscribed: false });
const mockGetOfferings = jest.fn().mockResolvedValue({ success: true, data: { current: { availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }] } } });
const mockRefresh = jest.fn().mockResolvedValue(undefined);

let mockCurrentSubscriptionState = { ...mockSubscriptionState };

const mockPresentPaywall = jest.fn().mockResolvedValue({ success: true, data: 'CANCELLED' });
const mockPresentCustomerCenter = jest.fn().mockResolvedValue({ success: true, data: null });

jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => mockCurrentSubscriptionState,
  useSubscriptionActions: () => ({
    purchasePackage: mockPurchasePackage,
    restorePurchases: mockRestorePurchases,
    getOfferings: mockGetOfferings,
    presentPaywall: mockPresentPaywall,
    presentCustomerCenter: mockPresentCustomerCenter,
    refresh: mockRefresh,
    dismissOnboarding: jest.fn(),
    dismissLapseModal: jest.fn()
  })
}));

jest.mock('../../services/subscriptionService', () => ({
  PAYWALL_RESULT: {
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
    CANCELLED: 'CANCELLED',
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
  }
}));

const mockRefreshCredits = jest.fn().mockResolvedValue(undefined);
jest.mock('../../hooks/useCredits', () => ({
  useCreditActions: () => ({ refreshCredits: mockRefreshCredits })
}));

const mockGrantAddonCredits = jest.fn().mockResolvedValue({ success: true, data: { creditsGranted: 10, newBalance: 36 } });
jest.mock('../../services/subscriptionStatusService', () => ({
  grantAddonCredits: (...args) => mockGrantAddonCredits(...args)
}));

jest.mock('../../services/authService', () => ({
  getCurrentUserId: jest.fn().mockResolvedValue('user-1')
}));

jest.mock('../../styles/colors', () => ({
  COLORS: {
    lavender: '#7C6FE0',
    lavenderSoft: '#EDE9FF',
    white: '#FFFFFF',
    mint: '#4ECDC4',
    peach: '#FF6B6B',
    error: '#FF4757',
    text: { primary: '#2D2D3A', secondary: '#6E6E80', tertiary: '#A0A0B0' }
  }
}));

const mockOpenURL = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-linking', () => ({
  openURL: mockOpenURL
}));

jest.mock('../../utils/formatDate', () => ({
  formatDate: jest.fn((d) => d)
}));

jest.mock('../../utils/pluralize', () => ({
  pluralizeDays: jest.fn(() => 'dni')
}));

jest.mock('../../services/config', () => ({
  STORAGE_KEYS: {
    PENDING_ADDON_GRANT: 'subscription_pending_addon_grant',
    LAST_SUBSCRIPTION_STATE: 'subscription_last_known_state',
    ONBOARDING_SEEN: 'subscription_onboarding_seen'
  }
}));

// SubscriptionScreen imports styles from a relative path
jest.mock('../styles/subscriptionScreenStyles', () => ({
  styles: new Proxy({}, { get: () => ({}) })
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null
}));

let SubscriptionScreen;

beforeAll(() => {
  SubscriptionScreen = require('../SubscriptionScreen').default;
});

describe('SubscriptionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
    mockCurrentSubscriptionState = { ...mockSubscriptionState };
  });

  describe('purchase flow', () => {
    test('shows subscription purchase button when not subscribed', async () => {
      const { getByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getByText('Subskrybuj')).toBeTruthy();
      });
    });

    test('successful purchase shows success toast', async () => {
      mockPurchasePackage.mockResolvedValueOnce({
        success: true,
        data: { customerInfo: { entitlements: { active: { 'DawnoTemu Subscription': {} } } } }
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Subskrybuj')).toBeTruthy());

      fireEvent.press(getByText('Subskrybuj'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Subskrypcja aktywowana!', 'SUCCESS');
      });
    });

    test('user-cancelled purchase shows no toast', async () => {
      mockPurchasePackage.mockResolvedValueOnce({
        success: false,
        code: 'USER_CANCELLED',
        error: 'USER_CANCELLED'
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Subskrybuj')).toBeTruthy());

      fireEvent.press(getByText('Subskrybuj'));

      await waitFor(() => {
        expect(mockPurchasePackage).toHaveBeenCalled();
      });
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('failed purchase shows error toast', async () => {
      mockPurchasePackage.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
        code: 'NETWORK_ERROR'
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Subskrybuj')).toBeTruthy());

      fireEvent.press(getByText('Subskrybuj'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Nie udało się'),
          'ERROR'
        );
      });
    });
  });

  describe('double-tap prevention', () => {
    test('second subscribe press while first is in-flight does not call purchasePackage again', async () => {
      let resolveFirst;
      mockPurchasePackage.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; })
      );

      const { getByText, UNSAFE_root } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Subskrybuj')).toBeTruthy());

      const subscribeButton = getByText('Subskrybuj').parent;
      fireEvent.press(subscribeButton);

      // Button now shows spinner, press the same touchable again
      fireEvent.press(subscribeButton);

      resolveFirst({ success: true, data: { customerInfo: { entitlements: { active: {} } } } });

      await waitFor(() => {
        expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
      });
    });

    test('second paywall press while first is in-flight does not call presentPaywall again', async () => {
      let resolveFirst;
      mockPresentPaywall.mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; })
      );

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zobacz wszystkie oferty')).toBeTruthy());

      const paywallButton = getByText('Zobacz wszystkie oferty').parent;
      fireEvent.press(paywallButton);

      // Press again while first is in flight
      fireEvent.press(paywallButton);

      resolveFirst({ success: true, data: 'PURCHASED' });

      await waitFor(() => {
        expect(mockPresentPaywall).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('restore flow', () => {
    test('successful restore with active subscription shows success toast', async () => {
      mockRestorePurchases.mockResolvedValueOnce({
        success: true,
        isSubscribed: true
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Przywróć zakupy')).toBeTruthy());

      fireEvent.press(getByText('Przywróć zakupy'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Przywrócono subskrypcję!', 'SUCCESS');
      });
    });

    test('restore with no active subscription shows info toast', async () => {
      mockRestorePurchases.mockResolvedValueOnce({
        success: true,
        isSubscribed: false
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Przywróć zakupy')).toBeTruthy());

      fireEvent.press(getByText('Przywróć zakupy'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Nie znaleziono aktywnej subskrypcji.',
          'INFO'
        );
      });
    });

    test('failed restore shows error toast', async () => {
      mockRestorePurchases.mockResolvedValueOnce({
        success: false,
        error: 'Restore failed'
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Przywróć zakupy')).toBeTruthy());

      fireEvent.press(getByText('Przywróć zakupy'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Nie udało się'),
          'ERROR'
        );
      });
    });
  });

  describe('addon purchase flow', () => {
    test('addon purchase with matching transaction grants credits', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }]
          },
          all: {
            credit_packs: {
              availablePackages: [
                { product: { identifier: 'credits_10', priceString: '9,99 zł' } },
                { product: { identifier: 'credits_20', priceString: '17,99 zł' } },
                { product: { identifier: 'credits_30', priceString: '24,99 zł' } }
              ]
            }
          }
        }
      });

      mockPurchasePackage.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: { active: { 'DawnoTemu Subscription': {} } },
            nonSubscriptionTransactions: [
              { productIdentifier: 'credits_10', transactionIdentifier: 'txn-abc' }
            ]
          }
        }
      });

      mockGrantAddonCredits.mockResolvedValueOnce({
        success: true,
        data: { creditsGranted: 10, newBalance: 36 }
      });

      const { getAllByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getAllByText('10').length).toBeGreaterThan(0);
      });

      const creditButton = getAllByText('10')[0];
      fireEvent.press(creditButton);

      await waitFor(() => {
        expect(mockGrantAddonCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: 'txn-abc',
            productId: 'credits_10'
          })
        );
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Dodano'),
          'SUCCESS'
        );
      });
    });

    test('addon purchase persists pending grant for retry', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }]
          },
          all: {
            credit_packs: {
              availablePackages: [
                { product: { identifier: 'credits_10', priceString: '9,99 zł' } }
              ]
            }
          }
        }
      });

      mockPurchasePackage.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: { active: { 'DawnoTemu Subscription': {} } },
            nonSubscriptionTransactions: [
              { productIdentifier: 'credits_10', transactionIdentifier: 'txn-xyz' }
            ]
          }
        }
      });

      mockGrantAddonCredits.mockResolvedValueOnce({
        success: false,
        error: 'Server error'
      });

      const { getAllByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getAllByText('10').length).toBeGreaterThan(0);
      });

      fireEvent.press(getAllByText('10')[0]);

      await waitFor(() => {
        expect(mockGrantAddonCredits).toHaveBeenCalled();
      });

      await waitFor(async () => {
        const stored = await AsyncStorage.getItem('subscription_pending_addon_grant');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored);
        expect(parsed.transactionId).toBe('txn-xyz');
        expect(parsed.productId).toBe('credits_10');
      });
    });

    test('addon buttons are disabled for non-subscribers', async () => {
      mockCurrentSubscriptionState = { ...mockSubscriptionState, isSubscribed: false };

      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }]
          },
          all: {
            credit_packs: {
              availablePackages: [
                { product: { identifier: 'credits_10', priceString: '9,99 zł' } }
              ]
            }
          }
        }
      });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Dostępne tylko dla subskrybentów.')).toBeTruthy());

      expect(mockPurchasePackage).not.toHaveBeenCalled();
    });

    test('logs to Sentry when persist fails but still attempts grant', async () => {
      const Sentry = require('@sentry/react-native');
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }]
          },
          all: {
            credit_packs: {
              availablePackages: [
                { product: { identifier: 'credits_10', priceString: '9,99 zł' } }
              ]
            }
          }
        }
      });

      mockPurchasePackage.mockResolvedValueOnce({
        success: true,
        data: {
          customerInfo: {
            entitlements: { active: { 'DawnoTemu Subscription': {} } },
            nonSubscriptionTransactions: [
              { productIdentifier: 'credits_10', transactionIdentifier: 'txn-persist-fail' }
            ]
          }
        }
      });

      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Disk full'));

      mockGrantAddonCredits.mockResolvedValueOnce({
        success: true,
        data: { creditsGranted: 10, newBalance: 36 }
      });

      const { getAllByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getAllByText('10').length).toBeGreaterThan(0));

      fireEvent.press(getAllByText('10')[0]);

      await waitFor(() => {
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
          'Addon grant safety net compromised: AsyncStorage write failed',
          expect.objectContaining({ level: 'error' })
        );
      });

      await waitFor(() => {
        expect(mockGrantAddonCredits).toHaveBeenCalledWith(
          expect.objectContaining({ transactionId: 'txn-persist-fail' })
        );
      });
    });

    test('retries pending addon grant on mount when subscribed', async () => {
      const pendingGrant = {
        transactionId: 'txn-retry',
        productId: 'credits_20',
        platform: 'ios',
        credits: 20,
        userId: 'user-1',
        createdAt: Date.now()
      };
      await AsyncStorage.setItem(
        'subscription_pending_addon_grant',
        JSON.stringify(pendingGrant)
      );

      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      mockGrantAddonCredits.mockResolvedValueOnce({
        success: true,
        data: { creditsGranted: 20, newBalance: 46 }
      });

      render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(mockGrantAddonCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: 'txn-retry',
            productId: 'credits_20',
            platform: 'ios'
          })
        );
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('20'),
          'SUCCESS'
        );
      });
    });

    test('retries pending addon grant on mount and shows error toast on failure', async () => {
      const pendingGrant = {
        transactionId: 'txn-retry-fail',
        productId: 'credits_10',
        platform: 'ios',
        credits: 10,
        userId: 'user-1',
        createdAt: Date.now()
      };
      await AsyncStorage.setItem(
        'subscription_pending_addon_grant',
        JSON.stringify(pendingGrant)
      );

      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      mockGrantAddonCredits.mockResolvedValueOnce({
        success: false,
        error: 'Server error'
      });

      render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(mockGrantAddonCredits).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: 'txn-retry-fail',
            productId: 'credits_10',
            platform: 'ios'
          })
        );
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Ponowimy automatycznie'),
          'ERROR'
        );
      });

      // Pending grant should be preserved for future retry
      const stored = await AsyncStorage.getItem('subscription_pending_addon_grant');
      expect(stored).toBeTruthy();
    });

    test('discards pending addon grant belonging to a different user', async () => {
      const pendingGrant = {
        transactionId: 'txn-other-user',
        productId: 'credits_10',
        platform: 'ios',
        credits: 10,
        userId: 'user-other',
        createdAt: Date.now()
      };
      await AsyncStorage.setItem(
        'subscription_pending_addon_grant',
        JSON.stringify(pendingGrant)
      );

      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      render(<SubscriptionScreen />);

      await waitFor(async () => {
        const stored = await AsyncStorage.getItem('subscription_pending_addon_grant');
        expect(stored).toBeNull();
      });

      expect(mockGrantAddonCredits).not.toHaveBeenCalled();
    });

    test('discards expired pending addon grant (TTL > 24h)', async () => {
      const expiredGrant = {
        transactionId: 'txn-expired',
        productId: 'credits_10',
        platform: 'ios',
        credits: 10,
        createdAt: Date.now() - 25 * 60 * 60 * 1000
      };
      await AsyncStorage.setItem(
        'subscription_pending_addon_grant',
        JSON.stringify(expiredGrant)
      );

      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true
      };

      render(<SubscriptionScreen />);

      await waitFor(async () => {
        const stored = await AsyncStorage.getItem('subscription_pending_addon_grant');
        expect(stored).toBeNull();
      });

      expect(mockGrantAddonCredits).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    test('shows error banner with retry when error is set', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        error: 'Nie udało się pobrać danych subskrypcji.'
      };

      const { getByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getByText('Ponów')).toBeTruthy();
      });

      fireEvent.press(getByText('Ponów'));

      expect(mockRefresh).toHaveBeenCalled();
    });

    test('shows loading indicator when loading is true', () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        loading: true
      };

      const { queryByText } = render(<SubscriptionScreen />);
      expect(queryByText('Subskrybuj')).toBeNull();
    });
  });

  describe('paywall flow', () => {
    test('successful paywall purchase shows success toast', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'PURCHASED' });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zobacz wszystkie oferty')).toBeTruthy());

      fireEvent.press(getByText('Zobacz wszystkie oferty'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Subskrypcja aktywowana!', 'SUCCESS');
      });
    });

    test('successful paywall restore shows success toast', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'RESTORED' });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zobacz wszystkie oferty')).toBeTruthy());

      fireEvent.press(getByText('Zobacz wszystkie oferty'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Subskrypcja aktywowana!', 'SUCCESS');
      });
    });

    test('paywall cancelled shows no toast', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: true, data: 'CANCELLED' });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zobacz wszystkie oferty')).toBeTruthy());

      fireEvent.press(getByText('Zobacz wszystkie oferty'));

      await waitFor(() => {
        expect(mockPresentPaywall).toHaveBeenCalled();
      });
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('paywall failure shows error toast', async () => {
      mockPresentPaywall.mockResolvedValueOnce({ success: false, error: 'SDK error' });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zobacz wszystkie oferty')).toBeTruthy());

      fireEvent.press(getByText('Zobacz wszystkie oferty'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Nie udało się'),
          'ERROR'
        );
      });
    });
  });

  describe('manage subscription', () => {
    test('successful customer center does not show toast', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true,
        expirationDate: '2026-12-01'
      };
      mockPresentCustomerCenter.mockResolvedValueOnce({ success: true, data: null });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zarządzaj subskrypcją')).toBeTruthy());

      fireEvent.press(getByText('Zarządzaj subskrypcją'));

      await waitFor(() => {
        expect(mockPresentCustomerCenter).toHaveBeenCalled();
      });
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('customer center failure falls back to URL with info toast', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true,
        expirationDate: '2026-12-01'
      };
      mockPresentCustomerCenter.mockResolvedValueOnce({ success: false, error: 'CC failed' });

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zarządzaj subskrypcją')).toBeTruthy());

      fireEvent.press(getByText('Zarządzaj subskrypcją'));

      await waitFor(() => {
        expect(mockOpenURL).toHaveBeenCalledWith(
          expect.stringContaining('subscriptions')
        );
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('przeglądarce'),
        'INFO'
      );
    });
  });

  describe('manage subscription errors', () => {
    test('customer center throw shows error toast', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true,
        expirationDate: '2026-12-01'
      };
      mockPresentCustomerCenter.mockRejectedValueOnce(new Error('SDK crash'));

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zarządzaj subskrypcją')).toBeTruthy());

      fireEvent.press(getByText('Zarządzaj subskrypcją'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Nie udało się otworzyć'),
          'ERROR'
        );
      });
    });

    test('fallback URL failure shows error toast', async () => {
      mockCurrentSubscriptionState = {
        ...mockSubscriptionState,
        isSubscribed: true,
        expirationDate: '2026-12-01'
      };
      mockPresentCustomerCenter.mockResolvedValueOnce({ success: false, error: 'CC failed' });
      mockOpenURL.mockRejectedValueOnce(new Error('Cannot open URL'));

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Zarządzaj subskrypcją')).toBeTruthy());

      fireEvent.press(getByText('Zarządzaj subskrypcją'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Nie udało się otworzyć'),
          'ERROR'
        );
      });
    });
  });

  describe('plan selection', () => {
    test('renders yearly plan card when available', async () => {
      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [
              { packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } },
              { packageType: 'ANNUAL', product: { priceString: '249,99 zł', identifier: 'annual' } }
            ]
          }
        }
      });

      const { getByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getByText('29,99 zł')).toBeTruthy();
        expect(getByText('249,99 zł')).toBeTruthy();
      });
    });

    test('switching to yearly plan updates credits display', async () => {
      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [
              { packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } },
              { packageType: 'ANNUAL', product: { priceString: '249,99 zł', identifier: 'annual' } }
            ]
          }
        }
      });

      const { getByText } = render(<SubscriptionScreen />);

      await waitFor(() => expect(getByText('Roczny')).toBeTruthy());

      expect(getByText('26 Punktów Magii miesięcznie')).toBeTruthy();

      fireEvent.press(getByText('Roczny'));

      await waitFor(() => {
        expect(getByText('30 Punktów Magii miesięcznie')).toBeTruthy();
      });
    });
  });

  describe('monthly package selection', () => {
    test('selects MONTHLY packageType over first package', async () => {
      mockGetOfferings.mockResolvedValue({
        success: true,
        data: {
          current: {
            availablePackages: [
              { packageType: 'ANNUAL', product: { priceString: '199,99 zł', identifier: 'annual' } },
              { packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }
            ]
          }
        }
      });

      const { getByText } = render(<SubscriptionScreen />);

      await waitFor(() => {
        expect(getByText('29,99 zł')).toBeTruthy();
      });
    });
  });
});
