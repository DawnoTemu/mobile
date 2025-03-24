import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../components/StatusToast';
import authService from '../services/authService';
import { COLORS } from '../styles/colors';

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Validate email format
  const isEmailValid = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Handle password reset request
  const handleResetRequest = async () => {
    // Validate email
    if (!email || !isEmailValid(email)) {
      showToast('Wprowadź prawidłowy adres e-mail', 'ERROR');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Call password reset API
      const result = await authService.resetPasswordRequest(email);
      
      setIsLoading(false);
      
      if (result.success) {
        setIsSubmitted(true);
        showToast('Link do resetowania hasła został wysłany na Twój adres e-mail', 'SUCCESS');
      } else {
        let errorMessage = 'Wystąpił błąd podczas wysyłania linku do resetowania hasła. Spróbuj ponownie.';
        
        if (result.code === 'OFFLINE') {
          errorMessage = 'Brak połączenia z internetem. Połącz się z internetem i spróbuj ponownie.';
        } else if (result.error) {
          errorMessage = result.error;
        }
        
        showToast(errorMessage, 'ERROR');
      }
    } catch (error) {
      setIsLoading(false);
      showToast('Wystąpił problem. Spróbuj ponownie.', 'ERROR');
      console.error('Password reset request error:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
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
        
        {isSubmitted ? (
          <View style={styles.successContainer}>
            <View style={styles.successIconContainer}>
              <Feather name="check-circle" size={64} color={COLORS.mint} />
            </View>
            <Text style={styles.title}>Sprawdź swoją skrzynkę</Text>
            <Text style={styles.successText}>
              Wysłaliśmy link do resetowania hasła na adres:
            </Text>
            <Text style={styles.emailText}>{email}</Text>
            <Text style={styles.instructionText}>
              Kliknij link w wiadomości, aby zresetować hasło.
              Jeśli nie otrzymałeś e-maila, sprawdź folder SPAM.
            </Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginButtonText}>Wróć do logowania</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={styles.title}>Zapomniałeś hasła?</Text>
            <Text style={styles.subtitle}>
              Podaj swój adres e-mail, a wyślemy Ci link do zresetowania hasła
            </Text>
            
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Feather name="mail" size={20} color={COLORS.text.secondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Adres e-mail"
                placeholderTextColor={COLORS.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                editable={!isLoading}
              />
            </View>
            
            {/* Reset Button */}
            <TouchableOpacity
              style={[styles.resetButton, isLoading && styles.disabledButton]}
              onPress={handleResetRequest}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.resetButtonText}>Wyślij link do resetowania</Text>
              )}
            </TouchableOpacity>
            
            {/* Back to Login Link */}
            <TouchableOpacity
              style={styles.loginLinkContainer}
              onPress={() => navigation.navigate('Login')}
            >
              <Feather name="arrow-left" size={16} color={COLORS.text.secondary} style={styles.loginIcon} />
              <Text style={styles.loginLinkText}>Wróć do logowania</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: 48,
  },
  logo: {
    width: 120,
    height: 58,
  },
  formContainer: {
    marginHorizontal: 24,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 24,
    height: 56,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.primary,
  },
  resetButton: {
    backgroundColor: COLORS.peach,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  disabledButton: {
    opacity: 0.7,
  },
  resetButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginIcon: {
    marginRight: 8,
  },
  loginLinkText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  // Success state styles
  successContainer: {
    marginHorizontal: 24,
    alignItems: 'center',
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginTop: 16,
    textAlign: 'center',
  },
  emailText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary,
    marginVertical: 8,
    textAlign: 'center',
  },
  instructionText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: COLORS.lavender,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  loginButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
});