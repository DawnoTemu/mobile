import { StyleSheet } from 'react-native';
import { COLORS } from '../../styles/colors';

export const styles = StyleSheet.create({
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  errorBannerText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.error,
    flex: 1,
    marginLeft: 10
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.white
  },
  retryButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.error
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
  planPriceUnavailable: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.tertiary,
    marginTop: 8
  },
  priceLoader: {
    marginTop: 8
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
  }
});
