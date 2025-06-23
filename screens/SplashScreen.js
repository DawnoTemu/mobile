import React from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../styles/colors';

export default function SplashScreen() {
  // This is now just a visual component
  // AppNavigator handles all the authentication and navigation logic
  
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
        
        <ActivityIndicator 
          size="small" 
          color="rgba(255, 255, 255, 0.8)" 
          style={styles.loader} 
        />
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
  loader: {
    marginTop: 32,
  },
});