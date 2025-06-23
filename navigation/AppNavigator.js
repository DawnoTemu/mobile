import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/StatusToast';

// Auth Screens
import LoginScreen from '../screens/LoginScreen';
import RegistrationScreen from '../screens/RegistrationScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';

// App Screens
import SplashScreen from '../screens/SplashScreen';
import CloneScreen from '../screens/CloneScreen';
import SynthesisScreen from '../screens/SynthesisScreen';

// Services
import authService from '../services/authService';
import { COLORS } from '../styles/colors';

// Create a single stack navigator
const Stack = createStackNavigator();

// Slide animation for app screens
const slideAnimation = ({ current, layouts }) => {
  return {
    cardStyle: {
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.height, 0],
          }),
        },
      ],
    },
  };
};

// Single AppNavigator component that handles all navigation
export default function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking', 'authenticated', 'unauthenticated'

  useEffect(() => {
    const checkAuthWithTimeout = async () => {
      try {
        setAuthStatus('checking');
        
        // Start timing for minimum splash duration
        const startTime = Date.now();
        const minSplashTime = 2000; // Minimum 2 seconds for branding
        
        // Check tokens locally first (fast)
        const [accessToken, refreshToken] = await Promise.all([
          authService.getAccessToken(),
          authService.getRefreshToken()
        ]);
        
        if (!accessToken || !refreshToken) {
          setAuthStatus('unauthenticated');
          setIsAuthenticated(false);
        } else {
          setAuthStatus('authenticated');
          setIsAuthenticated(true);
          
          // Note: We'll validate tokens when user actually tries to use the app
          // This prevents hanging during startup while still providing good UX
        }
        
        // Ensure minimum splash time for branding
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < minSplashTime) {
          await new Promise(resolve => setTimeout(resolve, minSplashTime - elapsedTime));
        }
        
      } catch (error) {
        console.error('Auth check error:', error);
        setAuthStatus('unauthenticated');
        setIsAuthenticated(false);
        
        // Still ensure minimum splash time even on error
        const elapsedTime = Date.now() - (Date.now() - 2000);
        if (elapsedTime < 2000) {
          await new Promise(resolve => setTimeout(resolve, 2000 - elapsedTime));
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuthWithTimeout();
  }, []);

  // Common options for all screens
  const screenOptions = {
    headerShown: false,
    cardStyle: { backgroundColor: COLORS.background },
  };

  // Show splash screen while loading
  if (isLoading) {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  // Show main app after loading
  return (
    <Stack.Navigator 
      initialRouteName={isAuthenticated ? "Synthesis" : "Login"}
      screenOptions={screenOptions}
    >
      {/* Auth Screens */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegistrationScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
      
      {/* App Screens with slide animation */}
      <Stack.Screen 
        name="Synthesis" 
        component={SynthesisScreen} 
        options={{ cardStyleInterpolator: slideAnimation }}
      />
      <Stack.Screen 
        name="Clone" 
        component={CloneScreen} 
        options={{ cardStyleInterpolator: slideAnimation }}
      />
    </Stack.Navigator>
  );
}