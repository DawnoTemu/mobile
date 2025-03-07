import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../styles/colors';

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    // Auto-navigate to Clone screen after 2 seconds
    const timer = setTimeout(() => {
      navigation.replace('Clone');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <LinearGradient
      colors={COLORS.gradients.lavenderToMint}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>
        <Image 
          source={require('../assets/images/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>DawnoTemu</Text>
        <Text style={styles.subtitle}>
          Tu, baśnie nabierają{'\n'}czarodziejskiej mocy
        </Text>
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
    width: 64,
    height: 64,
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
    marginTop: 8,
    textAlign: 'center',
  },
});