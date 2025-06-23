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

export default function RegistrationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordConfirmVisible, setPasswordConfirmVisible] = useState(false);
  
  // Validate email format
  const isEmailValid = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Password requirements
  const isPasswordValid = (password) => {
    return password.length >= 8; // Minimum 8 characters
  };
  
  // Handle registration
  const handleRegister = async () => {
    // Validate inputs
    if (!email || !password || !passwordConfirm) {
      showToast('Wypełnij wszystkie pola', 'ERROR');
      return;
    }
    
    if (!isEmailValid(email)) {
      showToast('Podaj prawidłowy adres e-mail', 'ERROR');
      return;
    }
    
    if (!isPasswordValid(password)) {
      showToast('Hasło musi zawierać minimum 8 znaków', 'ERROR');
      return;
    }
    
    if (password !== passwordConfirm) {
      showToast('Hasła nie są identyczne', 'ERROR');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Call registration API
      const result = await authService.register(email, password, passwordConfirm);
      
      setIsLoading(false);
      
      if (result.success) {
        showToast('Rejestracja pomyślna. Sprawdź swój e-mail, aby potwierdzić konto.', 'SUCCESS');
        navigation.navigate('ConfirmEmail', { email });
      } else {
        let errorMessage = 'Błąd rejestracji. Spróbuj ponownie.';
        
        if (result.code === 'OFFLINE') {
          errorMessage = 'Brak połączenia z internetem. Połącz się z internetem i spróbuj ponownie.';
        } else if (result.error && result.error.includes('already registered')) {
          errorMessage = 'Ten adres e-mail jest już zarejestrowany.';
        } else if (result.error) {
          errorMessage = result.error;
        }
        
        showToast(errorMessage, 'ERROR');
      }
    } catch (error) {
      setIsLoading(false);
      showToast('Wystąpił problem podczas rejestracji. Spróbuj ponownie.', 'ERROR');
      console.error('Registration error:', error);
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
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logo-stacked.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        
        <View style={styles.formContainer}>
          <Text style={styles.title}>Zarejestruj się</Text>
          <Text style={styles.subtitle}>
            Stwórz konto aby korzystać z aplikacji
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
          
          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Feather name="lock" size={20} color={COLORS.text.secondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Hasło (min. 8 znaków)"
              placeholderTextColor={COLORS.text.tertiary}
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.visibilityIcon}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              <Feather
                name={passwordVisible ? 'eye-off' : 'eye'}
                size={20}
                color={COLORS.text.secondary}
              />
            </TouchableOpacity>
          </View>
          
          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <Feather name="lock" size={20} color={COLORS.text.secondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Powtórz hasło"
              placeholderTextColor={COLORS.text.tertiary}
              secureTextEntry={!passwordConfirmVisible}
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.visibilityIcon}
              onPress={() => setPasswordConfirmVisible(!passwordConfirmVisible)}
            >
              <Feather
                name={passwordConfirmVisible ? 'eye-off' : 'eye'}
                size={20}
                color={COLORS.text.secondary}
              />
            </TouchableOpacity>
          </View>
          
          {/* Register Button */}
          <TouchableOpacity
            style={[styles.registerButton, isLoading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.registerButtonText}>Zarejestruj się</Text>
            )}
          </TouchableOpacity>
          
          {/* Login Link */}
          <View style={styles.loginLinkContainer}>
            <Text style={styles.loginText}>Masz już konto? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Zaloguj się</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 48,
  },
  logo: {
    width: 150,
    height: 73,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
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
    marginBottom: 16,
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
  visibilityIcon: {
    padding: 8,
  },
  registerButton: {
    backgroundColor: COLORS.peach,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  disabledButton: {
    opacity: 0.7,
  },
  registerButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  loginLink: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.lavender,
  },
});