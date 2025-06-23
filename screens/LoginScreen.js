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
import voiceService from '../services/voiceService'; 
import { COLORS } from '../styles/colors';
export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  
  // Handle login
  const handleLogin = async () => {
    // Validate inputs
    if (!email || !password) {
      showToast('Wypełnij wszystkie pola', 'ERROR');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Call login API
      const result = await authService.login(email, password);
      
      if (result.success) {
        showToast('Zalogowano pomyślnie', 'SUCCESS');
        
        // Verify if user has a valid voice on the server
        const voiceResult = await voiceService.verifyVoiceExists();
        
        // Navigate to appropriate screen based on voice existence
        if (voiceResult.exists) {
          // User has a valid voice, go to Synthesis screen
          navigation.replace('Synthesis');
        } else {
          // User doesn't have a voice, go to Clone screen
          navigation.replace('Clone');
        }
      } else {
        let errorMessage = 'Błąd logowania. Spróbuj ponownie.';
        
        if (result.code === 'OFFLINE') {
          errorMessage = 'Brak połączenia z internetem. Połącz się z internetem i spróbuj ponownie.';
        } else if (result.error && result.error.includes('credentials')) {
          errorMessage = 'Nieprawidłowy email lub hasło.';
        } else if (result.error && result.error.includes('confirmed')) {
          errorMessage = 'Konto nie zostało potwierdzone. Sprawdź swój email.';
          // Optionally navigate to confirm email screen
          navigation.navigate('ConfirmEmail', { email });
        } else if (result.error) {
          errorMessage = result.error;
        }
        
        showToast(errorMessage, 'ERROR');
        setIsLoading(false);
      }
    } catch (error) {
      setIsLoading(false);
      showToast('Wystąpił problem podczas logowania. Spróbuj ponownie.', 'ERROR');
      console.error('Login error:', error);
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
          <Text style={styles.title}>Zaloguj się</Text>
          <Text style={styles.subtitle}>
            Witaj ponownie, jesteśmy za Tobą stęsknieni!
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
              placeholder="Hasło"
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
          
          {/* Forgot Password Link */}
          <TouchableOpacity 
            style={styles.forgotPasswordContainer}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotPasswordText}>Zapomniałeś hasła?</Text>
          </TouchableOpacity>
          
          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.loginButtonText}>Zaloguj się</Text>
            )}
          </TouchableOpacity>
          
          {/* Register Link */}
          <View style={styles.registerLinkContainer}>
            <Text style={styles.registerText}>Nie masz jeszcze konta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Zarejestruj się</Text>
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
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  loginButton: {
    backgroundColor: COLORS.lavender,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  registerLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  registerLink: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.peach,
  },
});