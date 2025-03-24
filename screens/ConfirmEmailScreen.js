import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../components/StatusToast';
import authService from '../services/authService';
import { COLORS } from '../styles/colors';

export default function ConfirmEmailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  // Get email from route params if available
  const { email = '' } = route.params || {};
  
  const [isResending, setIsResending] = useState(false);
  
  // Handle resend confirmation email
  const handleResendEmail = async () => {
    if (!email) {
      showToast('Brak adresu e-mail do ponownego wysłania', 'ERROR');
      return;
    }
    
    try {
      setIsResending(true);
      
      // Call resend confirmation API
      const result = await authService.resendConfirmationEmail(email);
      
      setIsResending(false);
      
      if (result.success) {
        showToast('Link do potwierdzenia konta został wysłany ponownie', 'SUCCESS');
      } else {
        let errorMessage = 'Wystąpił błąd podczas wysyłania maila potwierdzającego. Spróbuj ponownie.';
        
        if (result.code === 'OFFLINE') {
          errorMessage = 'Brak połączenia z internetem. Połącz się z internetem i spróbuj ponownie.';
        } else if (result.error) {
          errorMessage = result.error;
        }
        
        showToast(errorMessage, 'ERROR');
      }
    } catch (error) {
      setIsResending(false);
      showToast('Wystąpił problem. Spróbuj ponownie.', 'ERROR');
      console.error('Resend confirmation email error:', error);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
    >
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => navigation.navigate('Login')}
      >
        <Feather name="arrow-left" size={24} color={COLORS.text.secondary} />
      </TouchableOpacity>
      
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/images/logo-stacked.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.iconContainer}>
          <Feather name="mail" size={64} color={COLORS.lavender} />
        </View>
        
        <Text style={styles.title}>Potwierdź swój adres email</Text>
        
        <Text style={styles.description}>
          Wysłaliśmy link aktywacyjny na adres:
        </Text>
        
        <Text style={styles.emailText}>{email}</Text>
        
        <Text style={styles.instructionsText}>
          Kliknij w link znajdujący się w wiadomości email, aby aktywować swoje konto.
          Jeśli nie otrzymałeś wiadomości, sprawdź folder SPAM lub kliknij poniżej, aby wysłać ją ponownie.
        </Text>
        
        {/* Resend Button */}
        <TouchableOpacity
          style={[styles.resendButton, isResending && styles.disabledButton]}
          onPress={handleResendEmail}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.resendButtonText}>Wyślij link ponownie</Text>
          )}
        </TouchableOpacity>
        
        {/* Back to Login Button */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.loginButtonText}>Wróć do logowania</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 58,
  },
  contentContainer: {
    marginHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(218, 143, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emailText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  instructionsText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  resendButton: {
    backgroundColor: COLORS.peach,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  resendButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  loginButton: {
    backgroundColor: 'transparent',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.lavender,
  },
  loginButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.lavender,
  },
});