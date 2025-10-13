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
import { router } from 'expo-router'; 
import { useCredits, useCreditActions } from '../hooks/useCredits';
import * as Linking from 'expo-linking';

const { width, height } = Dimensions.get('window');

export default function AppMenu({ navigation, isVisible, onClose }) {
  const { showToast } = useToast();
  const creditState = useCredits() || {};
  const creditActions = useCreditActions();
  const {
    balance = 0,
    unitLabel = 'Punkty Magii',
    loading: creditsLoading = false,
    initializing: creditsInitializing = false,
    error: creditsError = null,
    stale: creditsStale = false
  } = creditState;
  const showCreditsLoading = creditsLoading || creditsInitializing;
  const displayUnitLabel =
    typeof unitLabel === 'string' && unitLabel.toLowerCase().includes('punkty')
      ? 'Punkty Magii'
      : 'Punkty Magii';
  const handleOpenCredits = () => {
    Linking.openURL('https://www.dawnotemu.app/cennik').catch(() => {
      showToast('Nie udało się otworzyć strony. Spróbuj ponownie.', 'ERROR');
    });
  };
  
  const [user, setUser] = useState(null);
  const [isConfirmLogoutVisible, setIsConfirmLogoutVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Animation values
  const slideAnim = useRef(new Animated.Value(-width)).current; // Use useRef for animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Get user info & refresh credits when menu opens
  useEffect(() => {
    const fetchUserInfo = async () => {
      const userData = await authService.getCurrentUser();
      setUser(userData);
    };
    
    if (isVisible) {
      fetchUserInfo();
      creditActions?.refreshCredits?.({ force: true }).catch(() => {});
    }
  }, [isVisible, creditActions]);
  
  // Handle animations when visibility changes
  useEffect(() => {
    // Ensure animation value is reset before animating
    if (!isVisible) {
      // Reset to starting position when menu is not visible
      slideAnim.setValue(-width);
      fadeAnim.setValue(0);
    } else {
      // Make sure we start from the left
      slideAnim.setValue(-width);
      fadeAnim.setValue(0);
      
      // Slide in from left (with a slight delay to ensure reset happens)
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0, // Slide to visible position (0)
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
  }, [isVisible, slideAnim, fadeAnim, width]);
  
  // Handle logout
  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      
      const success = await authService.logout();
      
      setIsLoggingOut(false);
      setIsConfirmLogoutVisible(false);
      
      if (success) {
        showToast('Wylogowano pomyślnie', 'SUCCESS');
        
        // Close menu
        onClose();
        
        // // Navigate to login screen
        // setTimeout(() => {
        //   router.replace('/')
        // }, 500);
      } else {
        showToast('Wystąpił błąd podczas wylogowywania. Spróbuj ponownie.', 'ERROR');
      }
    } catch (error) {
      setIsLoggingOut(false);
      setIsConfirmLogoutVisible(false);
      showToast('Wystąpił problem podczas wylogowywania. Spróbuj ponownie.', 'ERROR');
      console.error('Logout error:', error);
    }
  };

  // Handle close animation with callback
  const handleClose = () => {
    // Run the close animation before actually closing
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
      // Call the parent's onClose after animation completes
      onClose();
    });
  };

  // If not visible and not animating out, don't render
  if (!isVisible) return null;
  
  // Rendered component
  return (
    <Modal
      transparent
      visible={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Background overlay with blur */}
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
        
        {/* Menu panel sliding from left */}
        <Animated.View 
          style={[
            styles.menuPanel,
            {
              transform: [{ translateX: slideAnim }],
            }
          ]}
        >
          <SafeAreaView style={styles.safeArea}>
            {/* Close button */}
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={handleClose}
            >
              <Feather name="x" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
            
            <View style={styles.topContent}>
              {/* User info */}
              <View style={styles.userInfoContainer}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user?.email ? user.email.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <Text style={styles.userEmail}>{user?.email || 'Użytkownik'}</Text>
              </View>
              
              <View style={styles.separator} />

              {/* Menu items */}
              <View style={styles.menuItems}>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    // navigation.navigate('AccountSettings');
                  }}
                >
                  <Feather name="user" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Moje konto</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    // navigation.navigate('VoiceLibrary');
                  }}
                >
                  <Feather name="mic" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Moje głosy</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    handleClose();
                    // navigation.navigate('Settings');
                  }}
                >
                  <Feather name="settings" size={20} color={COLORS.text.secondary} />
                  <Text style={styles.menuItemText}>Ustawienia</Text>
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
              </View>

              <View style={styles.separator} />
              
              {/* Logout button */}
              <TouchableOpacity 
                style={styles.logoutButton}
                onPress={() => setIsConfirmLogoutVisible(true)}
              >
                <Feather name="log-out" size={20} color={COLORS.text.secondary} />
                <Text style={styles.logoutText}>Wyloguj się</Text>
              </TouchableOpacity>
              
              {/* App version */}
              <Text style={styles.versionText}>Wersja 1.0.0</Text>
              
              {/* Logo */}
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
        
        {/* Confirm Logout Modal */}
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
