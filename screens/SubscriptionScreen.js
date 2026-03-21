import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { useSubscription, useSubscriptionActions } from '../hooks/useSubscription';
import { useToast } from '../components/StatusToast';
import { useCreditActions } from '../hooks/useCredits';
import { grantAddonCredits } from '../services/subscriptionStatusService';
import { COLORS } from '../styles/colors';
import { STORAGE_KEYS } from '../services/config';
import * as Linking from 'expo-linking';
import { formatDate } from '../utils/formatDate';
import { pluralizeDays } from '../utils/pluralize';
import { styles } from './styles/subscriptionScreenStyles';

const FEATURES = [
  { icon: 'mic', label: 'Klonowanie głosu rodzica' },
  { icon: 'book-open', label: 'Generowanie spersonalizowanych bajek' },
  { icon: 'headphones', label: 'Odtwarzanie offline' },
  { icon: 'star', label: '26 Punktów Magii miesięcznie' }
];

const ADDON_PACKS_CONFIG = [
  { id: 'credits_10', credits: 10 },
  { id: 'credits_20', credits: 20 },
  { id: 'credits_30', credits: 30 }
];

const getAddonPrice = (packId, offerings) => {
  const pkg = offerings?.all?.credit_packs?.availablePackages?.find(
    (p) => p.product?.identifier === packId
  );
  return pkg?.product?.priceString || null;
};

const findTransactionForProduct = (customerInfo, productId) => {
  const transactions = customerInfo?.nonSubscriptionTransactions;
  if (!Array.isArray(transactions) || transactions.length === 0) return null;

  for (let i = transactions.length - 1; i >= 0; i--) {
    if (transactions[i].productIdentifier === productId && transactions[i].transactionIdentifier) {
      return transactions[i];
    }
  }
  return null;
};

// The pending-grant retry flow persists grantData to AsyncStorage and retries
// on next mount. The backend grantAddonCredits endpoint must be idempotent
// (keyed on the transactionId sent as receipt_token) so duplicate retry calls are safe.
const persistPendingAddonGrant = async (grantData) => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PENDING_ADDON_GRANT,
      JSON.stringify({ ...grantData, createdAt: Date.now() })
    );
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'persist_pending_addon_grant' } });
  }
};

const clearPendingAddonGrant = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_ADDON_GRANT);
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'clear_pending_addon_grant' } });
  }
};

const loadPendingAddonGrant = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_ADDON_GRANT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.createdAt > ONE_DAY_MS) {
      await clearPendingAddonGrant();
      return null;
    }
    return parsed;
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'load_pending_addon_grant' } });
    return null;
  }
};

export default function SubscriptionScreen() {
  const navigation = useNavigation();
  const { showToast } = useToast();
  const {
    isSubscribed,
    loading,
    expirationDate,
    willRenew,
    error,
    trial,
    canGenerate
  } = useSubscription();
  const { purchasePackage, restorePurchases, getOfferings, refresh } = useSubscriptionActions();
  const creditActions = useCreditActions();

  const [offerings, setOfferings] = useState(null);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [offeringsError, setOfferingsError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [purchasingAddon, setPurchasingAddon] = useState(null);

  const loadOfferings = useCallback(async () => {
    setLoadingOfferings(true);
    setOfferingsError(null);
    try {
      const result = await getOfferings();
      if (result.success && result.data) {
        setOfferings(result.data);
      } else {
        setOfferingsError(result.error || 'Nie udało się załadować planów.');
      }
    } catch (err) {
      Sentry.captureException(err);
      setOfferingsError('Nie udało się załadować planów.');
    } finally {
      setLoadingOfferings(false);
    }
  }, [getOfferings]);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  const handlePurchase = async () => {
    const monthlyPackage = offerings?.current?.availablePackages?.find(
      (p) => p.packageType === 'MONTHLY'
    ) || offerings?.current?.availablePackages?.[0];
    if (!monthlyPackage) {
      showToast('Brak dostępnych planów. Spróbuj ponownie później.', 'ERROR');
      return;
    }

    setPurchasing(true);
    try {
      const result = await purchasePackage(monthlyPackage);
      if (result.success) {
        showToast('Subskrypcja aktywowana!', 'SUCCESS');
      } else if (result.code !== 'USER_CANCELLED' && result.error !== 'USER_CANCELLED') {
        showToast('Nie udało się dokonać zakupu. Spróbuj ponownie.', 'ERROR');
      }
    } catch (err) {
      Sentry.captureException(err);
      showToast('Wystąpił nieoczekiwany błąd. Spróbuj ponownie.', 'ERROR');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success && result.data?.isActive) {
        showToast('Przywrócono subskrypcję!', 'SUCCESS');
      } else if (result.success) {
        showToast('Nie znaleziono aktywnej subskrypcji.', 'INFO');
      } else {
        showToast('Nie udało się przywrócić zakupów. Spróbuj ponownie.', 'ERROR');
      }
    } catch (err) {
      Sentry.captureException(err);
      showToast('Wystąpił nieoczekiwany błąd. Spróbuj ponownie.', 'ERROR');
    } finally {
      setRestoring(false);
    }
  };

  const attemptGrantAddonCredits = useCallback(async (grantData) => {
    const grantResult = await grantAddonCredits({
      transactionId: grantData.transactionId,
      productId: grantData.productId,
      platform: grantData.platform
    });

    if (grantResult.success) {
      await clearPendingAddonGrant();
      showToast(`Dodano ${grantData.credits} Punktów Magii!`, 'SUCCESS');
    } else {
      Sentry.captureMessage('grantAddonCredits failed after purchase', {
        level: 'error',
        extra: {
          error: grantResult.error,
          productId: grantData.productId
        }
      });
      showToast('Zakup udany, ale nie udało się dodać punktów. Spróbuj ponownie lub skontaktuj się z nami.', 'ERROR');
    }

    if (creditActions?.refreshCredits) {
      creditActions.refreshCredits({ force: true }).catch((err) => {
        Sentry.captureException(err, { extra: { context: 'refresh_credits_after_addon' } });
      });
    }

    return grantResult;
  }, [creditActions, showToast]);

  const hasRetriedPendingGrantRef = useRef(false);

  useEffect(() => {
    if (loading || hasRetriedPendingGrantRef.current) return;
    hasRetriedPendingGrantRef.current = true;

    const retry = async () => {
      const pending = await loadPendingAddonGrant();
      if (pending) {
        await attemptGrantAddonCredits(pending);
      }
    };
    retry().catch((err) => {
      Sentry.captureException(err, { extra: { context: 'pending_addon_grant_retry' } });
    });
  }, [loading, attemptGrantAddonCredits]);

  const handleAddonPurchase = async (pack) => {
    if (!isSubscribed) {
      showToast('Dokup punkty po aktywowaniu subskrypcji.', 'INFO');
      return;
    }

    const creditPackOffering = offerings?.all?.credit_packs;
    const addonPackage = creditPackOffering?.availablePackages?.find(
      (pkg) => pkg.product?.identifier === pack.id
    );

    if (!addonPackage) {
      showToast('Pakiet chwilowo niedostępny. Spróbuj ponownie później.', 'ERROR');
      return;
    }

    setPurchasingAddon(pack.id);
    try {
      const result = await purchasePackage(addonPackage, { isAddon: true });
      if (result.success) {
        const matchedTransaction = findTransactionForProduct(
          result.data?.customerInfo,
          pack.id
        );

        if (!matchedTransaction) {
          Sentry.captureMessage('Missing transaction for product after addon purchase', {
            level: 'error',
            extra: {
              productId: pack.id,
              hasCustomerInfo: !!result.data?.customerInfo,
              transactionCount: result.data?.customerInfo?.nonSubscriptionTransactions?.length,
              productIds: result.data?.customerInfo?.nonSubscriptionTransactions
                ?.map((t) => t.productIdentifier)
            }
          });
          showToast('Zakup udany, ale brak potwierdzenia transakcji. Skontaktuj się z nami.', 'ERROR');
          return;
        }

        // transactionIdentifier is a RevenueCat-assigned ID, not an App Store/Play Store receipt.
        // The backend receives it as receipt_token and uses it as an idempotency key.
        const grantData = {
          transactionId: matchedTransaction.transactionIdentifier,
          productId: pack.id,
          platform: Platform.OS,
          credits: pack.credits
        };

        await persistPendingAddonGrant(grantData);
        await attemptGrantAddonCredits(grantData);
      } else if (result.code !== 'USER_CANCELLED' && result.error !== 'USER_CANCELLED') {
        showToast('Nie udało się dokonać zakupu. Spróbuj ponownie.', 'ERROR');
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'addon_purchase', productId: pack.id } });
      showToast('Zakup mógł się udać, ale wystąpił błąd przy naliczaniu punktów. Skontaktuj się z nami.', 'ERROR');
    } finally {
      setPurchasingAddon(null);
    }
  };

  const handleManageSubscription = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

    Linking.openURL(url).catch((err) => {
      Sentry.captureException(err, { extra: { context: 'manage_subscription_link' } });
      showToast('Nie udało się otworzyć ustawień subskrypcji.', 'ERROR');
    });
  };

  const monthlyPackage = offerings?.current?.availablePackages?.find(
    (p) => p.packageType === 'MONTHLY'
  ) || offerings?.current?.availablePackages?.[0];
  const priceLabel = monthlyPackage?.product?.priceString || null;
  const priceLoading = loadingOfferings || (!priceLabel && !offeringsError);

  const addonPacks = ADDON_PACKS_CONFIG.map((pack) => ({
    ...pack,
    price: getAddonPrice(pack.id, offerings)
  }));

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.lavender} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Subskrypcja</Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-triangle" size={16} color={COLORS.error} />
            <Text style={styles.errorBannerText}>
              {error}
            </Text>
            <TouchableOpacity onPress={() => { refresh(); loadOfferings(); }} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Ponów</Text>
            </TouchableOpacity>
          </View>
        )}

        {offeringsError && !error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-triangle" size={16} color={COLORS.error} />
            <Text style={styles.errorBannerText}>
              Nie udało się załadować planów.
            </Text>
            <TouchableOpacity onPress={() => loadOfferings()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Ponów</Text>
            </TouchableOpacity>
          </View>
        )}

        {trial.active && !isSubscribed && (
          <View style={styles.trialBanner}>
            <Feather name="clock" size={18} color={COLORS.lavender} />
            <View style={styles.trialBannerContent}>
              <Text style={styles.trialBannerTitle}>Okres próbny</Text>
              <Text style={styles.trialBannerText}>
                {trial.daysRemaining > 0
                  ? `Pozostało ${trial.daysRemaining} ${pluralizeDays(trial.daysRemaining)}`
                  : 'Ostatni dzień'}
              </Text>
            </View>
          </View>
        )}

        {!trial.active && !isSubscribed && !canGenerate && (
          <View style={styles.trialExpiredBanner}>
            <Feather name="alert-circle" size={18} color={COLORS.peach} />
            <View style={styles.trialBannerContent}>
              <Text style={styles.trialExpiredTitle}>Okres próbny zakończony</Text>
              <Text style={styles.trialExpiredText}>
                Subskrybuj, aby generować nowe bajki. Istniejące bajki pozostają dostępne.
              </Text>
            </View>
          </View>
        )}

        {isSubscribed ? (
          <View style={styles.subscribedContainer}>
            <View style={styles.statusCard}>
              <View style={styles.activeBadge}>
                <Feather name="check-circle" size={16} color={COLORS.mint} />
                <Text style={styles.activeBadgeText}>Aktywna</Text>
              </View>

              <Text style={styles.planTitle}>Plan Miesięczny</Text>

              {expirationDate && (
                <View style={styles.detailRow}>
                  <Feather name="calendar" size={16} color={COLORS.text.tertiary} />
                  <Text style={styles.detailText}>
                    {willRenew ? 'Odnowienie' : 'Wygasa'}: {formatDate(expirationDate)}
                  </Text>
                </View>
              )}

              <View style={styles.separator} />

              <Text style={styles.manageHint}>
                Aby anulować lub zmienić plan, przejdź do ustawień subskrypcji w{' '}
                {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}.
              </Text>

              <TouchableOpacity
                style={styles.manageButton}
                onPress={handleManageSubscription}
              >
                <Text style={styles.manageButtonText}>Zarządzaj subskrypcją</Text>
                <Feather name="external-link" size={16} color={COLORS.lavender} />
              </TouchableOpacity>
            </View>

            <View style={styles.addonSection}>
              <Text style={styles.addonSectionTitle}>Dokup Punkty Magii</Text>
              <View style={styles.addonGrid}>
                {addonPacks.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={styles.addonCard}
                    onPress={() => handleAddonPurchase(pack)}
                    disabled={purchasingAddon === pack.id || !pack.price}
                    activeOpacity={0.85}
                  >
                    {purchasingAddon === pack.id ? (
                      <ActivityIndicator color={COLORS.lavender} />
                    ) : (
                      <>
                        <Text style={styles.addonCredits}>{pack.credits}</Text>
                        <Text style={styles.addonUnit}>PM</Text>
                        {pack.price ? (
                          <Text style={styles.addonPrice}>{pack.price}</Text>
                        ) : (
                          <ActivityIndicator size="small" color={COLORS.lavender} />
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.notSubscribedContainer}>
            <Text style={styles.heroTitle}>DawnoTemu Premium</Text>
            <Text style={styles.heroSubtitle}>
              Odblokuj pełne możliwości personalizowanych bajek
            </Text>

            <View style={styles.featuresCard}>
              {FEATURES.map((feature) => (
                <View key={feature.label} style={styles.featureRow}>
                  <View style={styles.featureIconContainer}>
                    <Feather name={feature.icon} size={18} color={COLORS.lavender} />
                  </View>
                  <Text style={styles.featureText}>{feature.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.planCard}>
              <Text style={styles.planCardTitle}>Plan Miesięczny</Text>
              {priceLoading ? (
                <ActivityIndicator size="small" color={COLORS.lavender} style={styles.priceLoader} />
              ) : priceLabel ? (
                <>
                  <Text style={styles.planPrice}>{priceLabel}</Text>
                  <Text style={styles.planPeriod}>/ miesiąc</Text>
                </>
              ) : (
                <Text style={styles.planPriceUnavailable}>Cena niedostępna</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.purchaseButton, (purchasing || !priceLabel) && styles.disabledButton]}
              onPress={handlePurchase}
              disabled={purchasing || loadingOfferings || !priceLabel}
              activeOpacity={0.9}
            >
              {purchasing ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.purchaseButtonText}>Subskrybuj</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={COLORS.text.secondary} />
              ) : (
                <Text style={styles.restoreButtonText}>Przywróć zakupy</Text>
              )}
            </TouchableOpacity>

            <View style={[styles.addonSection, styles.addonSectionDisabled]}>
              <Text style={styles.addonSectionTitle}>Dokup Punkty Magii</Text>
              <View style={styles.addonGrid}>
                {addonPacks.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={[styles.addonCard, styles.addonCardDisabled]}
                    onPress={() => handleAddonPurchase(pack)}
                    disabled
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.addonCredits, styles.addonTextDisabled]}>{pack.credits}</Text>
                    <Text style={[styles.addonUnit, styles.addonTextDisabled]}>PM</Text>
                    <Text style={[styles.addonPrice, styles.addonTextDisabled]}>
                      {pack.price || '\u2014'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.addonDisabledHint}>
                Dostępne tylko dla subskrybentów.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
