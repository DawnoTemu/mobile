import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../components/StatusToast';
import authService from '../services/authService';
import { COLORS } from '../styles/colors';
import ConfirmModal from '../components/Modals/ConfirmModal';
import { useCredits, useCreditActions } from '../hooks/useCredits';
import { useSubscription } from '../hooks/useSubscription';
import { pluralizeDays } from '../utils/pluralize';
import * as Sentry from '@sentry/react-native';
import * as Linking from 'expo-linking';
let _nativeAppVersion = '—';
try { _nativeAppVersion = require('expo-application').nativeApplicationVersion || '—'; } catch {}

const { width } = Dimensions.get('window');

export default function AppMenu({ navigation, isVisible, onClose }) {
  const { showToast } = useToast();
  const { isSubscribed, trial } = useSubscription();
  const creditState = useCredits() || {};
  const creditActions = useCreditActions();
  const refreshCreditsAction = creditActions?.refreshCredits;
  const {
    balance = 0,
    loading: creditsLoading = false,
    initializing: creditsInitializing = false,
    error: creditsError = null,
    stale: creditsStale = false
  } = creditState;
  const showCreditsLoading = creditsLoading || creditsInitializing;
  const displayUnitLabel = 'Punkty Magii';
  const handleOpenCredits = () => {
    Linking.openURL('https://www.dawnotemu.app/cennik').catch((err) => {
      Sentry.captureException(err, { extra: { context: 'open_credits_link' } });
      showToast('Nie udało się otworzyć strony. Spróbuj ponownie.', 'ERROR');
    });
  };
  
  const [user, setUser] = useState(null);
  const [isConfirmLogoutVisible, setIsConfirmLogoutVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasHydratedSessionRef = useRef(false);
  
  const slideAnim = useRef(new Animated.Value(-width)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Get user info & refresh credits when menu opens
  useEffect(() => {
    let cancelled = false;

    const hydrateMenuSession = async () => {
      try {
        const userData = await authService.getCurrentUser();
        if (!cancelled) {
          setUser(userData);
        }
      } catch (error) {
        Sentry.captureException(error, { extra: { context: 'load_user_info_menu' } });
      }

      if (typeof refreshCreditsAction === 'function') {
        try {
          await refreshCreditsAction({ force: true });
        } catch (error) {
          Sentry.captureException(error, { extra: { context: 'refresh_credits_menu' } });
        }
      }
    };

    if (isVisible && !hasHydratedSessionRef.current) {
      hasHydratedSessionRef.current = true;
      hydrateMenuSession();
    }

    if (!isVisible) {
      hasHydratedSessionRef.current = false;
    }

    return () => {
      cancelled = true;
    };
  }, [isVisible, refreshCreditsAction]);
  
  useEffect(() => {
    if (!isVisible) {
      slideAnim.setValue(-width);
      fadeAnim.setValue(0);
    } else {
      slideAnim.setValue(-width);
      fadeAnim.setValue(0);

      // setTimeout defers animation to the next tick so the component renders at reset position first
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }, 10);
    }
  }, [isVisible, slideAnim, fadeAnim]);
  
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      const success = await authService.logout();

      if (success) {
        showToast('Wylogowano pomyślnie', 'SUCCESS');
        onClose();
      } else {
        showToast('Wystąpił błąd podczas wylogowywania. Spróbuj ponownie.', 'ERROR');
      }
    } catch (error) {
      showToast('Wystąpił problem podczas wylogowywania. Spróbuj ponownie.', 'ERROR');
      Sentry.captureException(error, { extra: { context: 'logout' } });
    } finally {
      setIsLoggingOut(false);
      setIsConfirmLogoutVisible(false);
    }
  };

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -width,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  if (!isVisible) return null;

  return (
    <Modal
      transparent
      visible={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>

        <Animated.View 
          style={[
            styles.overlay,
            { opacity: fadeAnim }
          ]}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={handleClose}
          >
            <BlurView intensity={20} style={StyleSheet.absoluteFill} />
          </TouchableOpacity>
        </Animated.View>
        

        <Animated.View 
          style={[
            styles.menuPanel,
            {
              transform: [{ translateX: slideAnim }],
            }
          ]}
        >
          <SafeAreaView style={styles.safeArea}>

            <TouchableOpacity 
              style={styles.closeButton}
              onPress={handleClose}
            >
              <Feather name="x" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
            
            <View style={styles.topContent}>

              <View style={styles.userInfoContainer}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user?.email ? user.email.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <Text style={styles.userEmail}>{user?.email || 'Użytkownik'}</Text>
              </View>
              
              <View style={styles.separator} />


              <View style={styles.menuItems}>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    navigation.navigate('AccountSettings');
                  }}
                >
                  <Feather name="user" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Moje konto</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    navigation.navigate('Subscription');
                  }}
                >
                  <Feather name="credit-card" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Subskrypcja</Text>
                  {!isSubscribed && (
                    <View style={styles.menuItemIndicator} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    navigation.navigate('Queue');
                  }}
                >
                  <Feather name="list" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Kolejka odtwarzania</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bottomContent}>
              <View style={styles.creditsContainer}>
                <View style={styles.creditsHeader}>
                  <Feather name="star" size={20} color={COLORS.lavender} />
                  {showCreditsLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.lavender}
                      style={styles.creditsLoader}
                    />
                  ) : (
                    <Text style={styles.creditsBalance}>{balance}</Text>
                  )}
                  <Text style={styles.creditsUnitInline}>{displayUnitLabel}</Text>
                </View>
                {creditsStale && (
                  <Text style={styles.creditsStatus}>
                    Dane mogą być nieaktualne. Odświeżymy je wkrótce.
                  </Text>
                )}
                {creditsError?.message && (
                  <Text style={[styles.creditsStatus, styles.creditsError]}>
                    {creditsError.message}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.creditsDetailButton}
                  onPress={handleOpenCredits}
                  activeOpacity={0.8}
                >
                  <Text style={styles.creditsDetailText}>Szczegóły kredytów</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.lavender} />
                </TouchableOpacity>

                {trial?.active && !isSubscribed && (
                  <View style={styles.trialBadge}>
                    <Feather name="clock" size={14} color={COLORS.lavender} />
                    <Text style={styles.trialBadgeText}>
                      Okres próbny: {trial.daysRemaining > 0 ? `${trial.daysRemaining} ${pluralizeDays(trial.daysRemaining)}` : 'ostatni dzień'}
                    </Text>
                  </View>
                )}
                {!trial?.active && !isSubscribed && (
                  <TouchableOpacity
                    style={styles.subscribeNudge}
                    onPress={() => {
                      handleClose();
                      navigation.navigate('Subscription');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.subscribeNudgeText}>Subskrybuj teraz</Text>
                    <Feather name="chevron-right" size={14} color={COLORS.lavender} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.separator} />
              

              <TouchableOpacity 
                style={styles.logoutButton}
                onPress={() => setIsConfirmLogoutVisible(true)}
              >
                <Feather name="log-out" size={20} color={COLORS.text.secondary} />
                <Text style={styles.logoutText}>Wyloguj się</Text>
              </TouchableOpacity>
              

              <Text style={styles.versionText}>Wersja {_nativeAppVersion}</Text>
              

              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/images/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
        

        <ConfirmModal
          visible={isConfirmLogoutVisible}
          title="Potwierdzenie wylogowania"
          message="Czy na pewno chcesz się wylogować?"
          confirmText="Wyloguj"
          cancelText="Anuluj"
          onConfirm={handleLogout}
          onCancel={() => setIsConfirmLogoutVisible(false)}
          isLoading={isLoggingOut}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingBottom: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 0.8,
    maxWidth: 320,
    height: '100%',
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  topContent: {
    flex: 1,
    paddingTop: 16,
  },
  bottomContent: {
    marginTop: 16,
    paddingBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 50, // Increased to account for safe area
    right: 8,
    padding: 8,
    zIndex: 10,
  },
  userInfoContainer: {
    alignItems: 'center',
    marginTop: 64, // Space below close button
    marginBottom: 32,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 28,
    color: COLORS.white,
  },
  userEmail: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginVertical: 16,
  },
  creditsContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  creditsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditsLoader: {
    marginLeft: 10,
  },
  creditsBalance: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 22,
    color: COLORS.text.primary,
    marginLeft: 10,
  },
  creditsUnitInline: {
    marginLeft: 8,
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  creditsStatus: {
    marginTop: 8,
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.tertiary,
  },
  creditsError: {
    color: COLORS.error,
  },
  creditsDetailButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: COLORS.lavenderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  trialBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.lavender,
    marginLeft: 6,
  },
  subscribeNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  subscribeNudgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.lavender,
    marginRight: 4,
  },
  creditsDetailText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.lavender,
    marginRight: 4,
  },
  menuItems: {
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  menuItemText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.primary,
    marginLeft: 16,
  },
  menuItemIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.peach,
    marginLeft: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginLeft: 16,
  },
  versionText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.tertiary,
    textAlign: 'center',
    marginBottom: 16,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 40,
    height: 40,
  },
});
