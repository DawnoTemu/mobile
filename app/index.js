import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from '../navigation/AppNavigator';
import { ToastProvider } from '../components/StatusToast';
import { useFonts } from 'expo-font';
import { COLORS } from '../styles/colors';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://e7e78ea6d09a608d3400dc3703d0d2d0@o4509547724603392.ingest.de.sentry.io/4509549213974608',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Ignore specific warnings (if necessary)
LogBox.ignoreLogs(['Remote debugger']);

function App() {
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

export default Sentry.wrap(App);