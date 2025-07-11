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
  // Common options for all screens
  const screenOptions = {
    headerShown: false,
    cardStyle: { backgroundColor: COLORS.background },
  };

  return (
    <Stack.Navigator 
      initialRouteName="Splash"
      screenOptions={screenOptions}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
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