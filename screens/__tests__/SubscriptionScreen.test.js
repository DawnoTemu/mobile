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
const mockRestorePurchases = jest.fn().mockResolvedValue({ success: true, data: { isActive: false } });
const mockGetOfferings = jest.fn().mockResolvedValue({ success: true, data: { current: { availablePackages: [{ packageType: 'MONTHLY', product: { priceString: '29,99 zł', identifier: 'monthly' } }] } } });
const mockRefresh = jest.fn().mockResolvedValue(undefined);

let mockCurrentSubscriptionState = { ...mockSubscriptionState };

jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => mockCurrentSubscriptionState,
  useSubscriptionActions: () => ({
    purchasePackage: mockPurchasePackage,
    restorePurchases: mockRestorePurchases,
    getOfferings: mockGetOfferings,
    refresh: mockRefresh,
    dismissOnboarding: jest.fn(),
    dismissLapseModal: jest.fn()
  })
}));

const mockRefreshCredits = jest.fn().mockResolvedValue(undefined);
jest.mock('../../hooks/useCredits', () => ({
  useCreditActions: () => ({ refreshCredits: mockRefreshCredits })
}));

const mockGrantAddonCredits = jest.fn().mockResolvedValue({ success: true, data: { creditsGranted: 10, newBalance: 36 } });
jest.mock('../../services/subscriptionStatusService', () => ({
  grantAddonCredits: (...args) => mockGrantAddonCredits(...args)
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

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined)
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
        data: { customerInfo: { entitlements: { active: { premium: {} } } } }
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

  describe('restore flow', () => {
    test('successful restore with active subscription shows success toast', async () => {
      mockRestorePurchases.mockResolvedValueOnce({
        success: true,
        data: { isActive: true, customerInfo: { entitlements: { active: { premium: {} } } } }
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
        data: { isActive: false }
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
            entitlements: { active: { premium: {} } },
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
            receiptToken: 'txn-abc',
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
            entitlements: { active: { premium: {} } },
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
        expect(parsed.receiptToken).toBe('txn-xyz');
        expect(parsed.productId).toBe('credits_10');
      });
    });

    test('addon purchase blocked for non-subscribers', async () => {
      mockCurrentSubscriptionState = { ...mockSubscriptionState, isSubscribed: false };

      const { getByText } = render(<SubscriptionScreen />);
      await waitFor(() => expect(getByText('Subskrybuj')).toBeTruthy());

      expect(mockPurchasePackage).not.toHaveBeenCalled();
    });

    test('retries pending addon grant on mount when subscribed', async () => {
      const pendingGrant = {
        receiptToken: 'txn-retry',
        productId: 'credits_20',
        platform: 'ios',
        credits: 20,
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
            receiptToken: 'txn-retry',
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
