import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from '../navigation/AppNavigator';
import { ToastProvider } from '../components/StatusToast';
import { useFonts } from 'expo-font';
import { COLORS } from '../styles/colors';

// Ignore specific warnings (if necessary)
LogBox.ignoreLogs(['Remote debugger']);

export default function App() {
  // Load custom fonts
  const [fontsLoaded] = useFonts({
    'Comfortaa-Regular': require('../assets/fonts/Comfortaa.ttf'),
    'Quicksand-Regular': require('../assets/fonts/Quicksand.ttf'),
    'Quicksand-Medium': require('../assets/fonts/Quicksand-Medium.ttf'),
    'Quicksand-Bold': require('../assets/fonts/Quicksand-Bold.ttf'),
  });

  if (!fontsLoaded) {
    return null; // Don't render anything until fonts are loaded
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastProvider>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
            <AppNavigator />
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}