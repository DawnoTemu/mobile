import React from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../styles/colors';

export default function SplashScreen({ route }) {
  // Extract any status passed from AppNavigator for more dynamic loading
  const status = route?.params?.status || 'loading';
  
  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'Sprawdzanie autoryzacji...';
      case 'loading':
        return 'Ładowanie aplikacji...';
      default:
        return 'Ładowanie...';
    }
  };

  return (
    <LinearGradient
      colors={COLORS.gradients.lavenderToMint}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>
        <Image 
          source={require('../assets/images/logo-stacked-white.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>
          Twój głos opowiada baśnie,
          {'\n'}zawsze gdy potrzebujesz
        </Text>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator 
            size="small" 
            color="rgba(255, 255, 255, 0.8)" 
            style={styles.loader} 
          />
          <Text style={styles.statusText}>
            {getStatusText()}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logo: {
    width: 192,
    height: 93,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
  },
  subtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  loader: {
    // Removed marginTop since it's now applied to the container
  },
  statusText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 12,
  },
});