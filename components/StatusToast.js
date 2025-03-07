import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  TouchableWithoutFeedback 
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../styles/colors';

// Create context
const ToastContext = createContext(null);

// Toast types and their respective colors
const TOAST_TYPES = {
  INFO: {
    borderColor: COLORS.lavender,
    icon: 'info',
    iconColor: COLORS.lavender,
  },
  SUCCESS: {
    borderColor: COLORS.mint,
    icon: 'check-circle',
    iconColor: COLORS.mint,
  },
  ERROR: {
    borderColor: COLORS.peach,
    icon: 'alert-circle',
    iconColor: COLORS.peach,
  },
};

// Provider component
export const ToastProvider = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [toastType, setToastType] = useState(TOAST_TYPES.INFO);
  const [duration, setDuration] = useState(3000);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;
  const timeout = useRef(null);
  
  const showToast = (msg, type = 'INFO', toastDuration = 3000) => {
    // Clear any existing timeout
    if (timeout.current) {
      clearTimeout(timeout.current);
    }
    
    // Update toast details
    setMessage(msg);
    setToastType(TOAST_TYPES[type] || TOAST_TYPES.INFO);
    setDuration(toastDuration);
    setVisible(true);
    
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Set timeout to hide
    timeout.current = setTimeout(hideToast, toastDuration);
  };
  
  const hideToast = () => {
    // Animate out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -20,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });
  };
  
  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {visible && <Toast 
        message={message} 
        type={toastType} 
        fadeAnim={fadeAnim}
        slideAnim={slideAnim}
        onPress={hideToast}
      />}
    </ToastContext.Provider>
  );
};

// Hook to use the toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Toast component
const Toast = ({ message, type, fadeAnim, slideAnim, onPress }) => {
  const insets = useSafeAreaInsets();
  
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <Animated.View 
        style={[
          styles.container, 
          { 
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            top: insets.top + 16,
            borderLeftColor: type.borderColor,
          }
        ]}
      >
        <View style={styles.iconContainer}>
          <Feather name={type.icon} size={20} color={type.iconColor} />
        </View>
        <Text style={styles.message}>{message}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  message: {
    flex: 1,
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});