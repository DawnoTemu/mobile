import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import authService from '../services/authService';
import { COLORS } from '../styles/colors';

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    // Check authentication and voice state
    const checkInitialState = async () => {
      try {
        // Check if user is logged in
        const isLoggedIn = await authService.isLoggedIn();
        
        if (!isLoggedIn) {
          // Navigate to Login screen after a delay
          setTimeout(() => {
            navigation.replace('Login');
          }, 2000);
          return;
        }
        
        // User is logged in, check for voice ID
        const voiceId = await AsyncStorage.getItem('voice_id');
        
        // Navigate to appropriate screen based on voice ID existence
        setTimeout(() => {
          
          navigation.replace(voiceId ? 'Synthesis' : 'Clone');
        }, 2000);
      } catch (error) {
        console.error('Error in initialization:', error);
        
        // Navigate to Login if there was an error
        setTimeout(() => {
          navigation.replace('Login');
        }, 2000);
      }
    };
    
    checkInitialState();
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