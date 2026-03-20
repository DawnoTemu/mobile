import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSubscription, useSubscriptionActions } from '../hooks/useSubscription';
import { useToast } from '../components/StatusToast';
import { useCreditActions } from '../hooks/useCredits';
import { COLORS } from '../styles/colors';
import * as Linking from 'expo-linking';

const FEATURES = [
  { icon: 'mic', label: 'Klonowanie głosu rodzica' },
  { icon: 'book-open', label: 'Generowanie spersonalizowanych bajek' },
  { icon: 'headphones', label: 'Odtwarzanie offline' },
  { icon: 'star', label: '26 Punktów Magii miesięcznie' }
];

const ADDON_PACKS = [
  { id: 'credits_10', credits: 10, price: '15 zł' },
  { id: 'credits_20', credits: 20, price: '28 zł' },
  { id: 'credits_30', credits: 30, price: '37 zł' }
];

const formatDate = (date) => {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
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
  const { purchasePackage, restorePurchases, getOfferings } = useSubscriptionActions();
  const creditActions = useCreditActions();

  const [offerings, setOfferings] = useState(null);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [purchasingAddon, setPurchasingAddon] = useState(null);

  const loadOfferings = useCallback(async () => {
    setLoadingOfferings(true);
    const result = await getOfferings();
    if (result.success && result.data) {
      setOfferings(result.data);
    }
    setLoadingOfferings(false);
  }, [getOfferings]);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  const handlePurchase = async () => {
    const monthlyPackage = offerings?.current?.availablePackages?.[0];
    if (!monthlyPackage) {
      showToast('Brak dostępnych planów. Spróbuj ponownie później.', 'ERROR');
      return;
    }

    setPurchasing(true);
    const result = await purchasePackage(monthlyPackage);
    setPurchasing(false);

    if (result.success) {
      showToast('Subskrypcja aktywowana!', 'SUCCESS');
    } else if (result.code !== 'USER_CANCELLED') {
      showToast('Nie udało się dokonać zakupu. Spróbuj ponownie.', 'ERROR');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success && result.data?.isActive) {
      showToast('Przywrócono subskrypcję!', 'SUCCESS');
    } else if (result.success) {
      showToast('Nie znaleziono aktywnej subskrypcji.', 'INFO');
    } else {
      showToast('Nie udało się przywrócić zakupów. Spróbuj ponownie.', 'ERROR');
    }
  };

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
      const result = await purchasePackage(addonPackage);
      if (result.success) {
        showToast(`Dodano ${pack.credits} Punktów Magii!`, 'SUCCESS');
        if (creditActions?.refreshCredits) {
          creditActions.refreshCredits({ force: true }).catch(() => {});
        }
      } else if (result.code !== 'USER_CANCELLED') {
        showToast('Nie udało się dokonać zakupu. Spróbuj ponownie.', 'ERROR');
      }
    } finally {
      setPurchasingAddon(null);
    }
  };

  const handleManageSubscription = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

    Linking.openURL(url).catch(() => {
      showToast('Nie udało się otworzyć ustawień subskrypcji.', 'ERROR');
    });
  };

  const monthlyPackage = offerings?.current?.availablePackages?.[0];
  const priceLabel = monthlyPackage?.product?.priceString || '39,99 zł';

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

        {/* Trial Banner */}
        {trial.active && !isSubscribed && (
          <View style={styles.trialBanner}>
            <Feather name="clock" size={18} color={COLORS.lavender} />
            <View style={styles.trialBannerContent}>
              <Text style={styles.trialBannerTitle}>Okres próbny</Text>
              <Text style={styles.trialBannerText}>
                {trial.daysRemaining > 0
                  ? `Pozostało ${trial.daysRemaining} ${trial.daysRemaining === 1 ? 'dzień' : 'dni'}`
                  : 'Ostatni dzień'}
              </Text>
            </View>
          </View>
        )}

        {/* Trial Expired Banner */}
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

            {/* Add-on Credit Packs */}
            <View style={styles.addonSection}>
              <Text style={styles.addonSectionTitle}>Dokup Punkty Magii</Text>
              <View style={styles.addonGrid}>
                {ADDON_PACKS.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={styles.addonCard}
                    onPress={() => handleAddonPurchase(pack)}
                    disabled={purchasingAddon === pack.id}
                    activeOpacity={0.85}
                  >
                    {purchasingAddon === pack.id ? (
                      <ActivityIndicator color={COLORS.lavender} />
                    ) : (
                      <>
                        <Text style={styles.addonCredits}>{pack.credits}</Text>
                        <Text style={styles.addonUnit}>PM</Text>
                        <Text style={styles.addonPrice}>{pack.price}</Text>
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
              <Text style={styles.planPrice}>{priceLabel}</Text>
              <Text style={styles.planPeriod}>/ miesiąc</Text>
            </View>

            <TouchableOpacity
              style={[styles.purchaseButton, purchasing && styles.disabledButton]}
              onPress={handlePurchase}
              disabled={purchasing || loadingOfferings}
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

            {/* Grayed-out Add-on Packs for non-subscribers */}
            <View style={[styles.addonSection, styles.addonSectionDisabled]}>
              <Text style={styles.addonSectionTitle}>Dokup Punkty Magii</Text>
              <View style={styles.addonGrid}>
                {ADDON_PACKS.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={[styles.addonCard, styles.addonCardDisabled]}
                    onPress={() => handleAddonPurchase(pack)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.addonCredits, styles.addonTextDisabled]}>{pack.credits}</Text>
                    <Text style={[styles.addonUnit, styles.addonTextDisabled]}>PM</Text>
                    <Text style={[styles.addonPrice, styles.addonTextDisabled]}>{pack.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.addonDisabledHint}>
                Dostępne tylko dla subskrybentów.
              </Text>
            </View>
          </View>
        )}

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  container: {
    flex: 1
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 22,
    color: COLORS.text.primary
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lavenderSoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  trialBannerContent: {
    marginLeft: 12,
    flex: 1
  },
  trialBannerTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 14,
    color: COLORS.text.primary
  },
  trialBannerText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2
  },
  trialExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  trialExpiredTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 14,
    color: COLORS.text.primary
  },
  trialExpiredText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 18
  },
  subscribedContainer: {
    marginTop: 8
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F8F3',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16
  },
  activeBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.mint,
    marginLeft: 6
  },
  planTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  detailText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginLeft: 8
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: 16
  },
  manageHint: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: 12
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.lavenderSoft
  },
  manageButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.lavender,
    marginRight: 8
  },
  notSubscribedContainer: {
    alignItems: 'center',
    marginTop: 16
  },
  heroTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 26,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 8
  },
  heroSubtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 15,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 24
  },
  featuresCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.lavenderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  featureText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 15,
    color: COLORS.text.primary,
    flex: 1
  },
  planCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.lavender,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1
  },
  planCardTitle: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 4
  },
  planPrice: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 32,
    color: COLORS.text.primary
  },
  planPeriod: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.tertiary,
    marginTop: 2
  },
  purchaseButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  purchaseButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.white
  },
  disabledButton: {
    opacity: 0.7
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24
  },
  restoreButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
    textDecorationLine: 'underline'
  },
  addonSection: {
    marginTop: 24,
    width: '100%'
  },
  addonSectionDisabled: {
    opacity: 0.5
  },
  addonSectionTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 12
  },
  addonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  addonCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1
  },
  addonCardDisabled: {
    backgroundColor: COLORS.background
  },
  addonCredits: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 24,
    color: COLORS.text.primary
  },
  addonUnit: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.tertiary,
    marginBottom: 6
  },
  addonPrice: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.lavender
  },
  addonTextDisabled: {
    color: COLORS.text.tertiary
  },
  addonDisabledHint: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.tertiary,
    textAlign: 'center',
    marginTop: 10
  },
  errorText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 16
  }
});
