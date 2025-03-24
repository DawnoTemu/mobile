// services/authService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router'; // For Expo Router navigation

// CONFIGURATION
// Environment-based URL selection
const ENV = {
    DEV: 'http:/Szymons-MacBook-Pro-2:8000',
    STAGING: 'https://staging-story-voice.herokuapp.com',
    PROD: 'https://api.dawnotemu.app'
  };
  
  // Use environment variable or default to production
  const API_BASE_URL = ENV.DEV;
  
// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER_DATA: 'auth_user_data'
};

// Default request timeout
const REQUEST_TIMEOUT = 30000;

/**
 * Check if device is online
 * @returns {Promise<boolean>} Whether device is online
 */
const isOnline = async () => {
  const networkState = await NetInfo.fetch();
  return networkState.isConnected === true;
};

/**
 * Make an API request with timeout
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object>} Response or error
 */
const apiRequest = async (endpoint, options = {}, signal = null) => {
  try {
    // Check if online
    const online = await isOnline();
    if (!online) {
      throw new Error('NO_CONNECTION');
    }

    // Setup controller for timeout
    const controller = signal ? null : new AbortController();
    const requestSignal = signal || controller?.signal;
    
    // Set timeout if controller exists
    const timeoutId = controller ? 
      setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    
    // Add authentication if available
    const token = await getAccessToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }

    // Make request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: requestSignal
    });

    // Clear timeout
    if (timeoutId) clearTimeout(timeoutId);
    
    // Parse response based on status
    if (response.status === 204) {
      return { success: true };
    }
    
    // For other responses, try to parse JSON
    const data = await response.json().catch(() => null);
    
    if (!response.ok) {
      // Special case for 401 Unauthorized
      if (response.status === 401) {
        // Try token refresh if unauthorized
        const refreshed = await refreshToken();
        if (refreshed) {
          // Retry the original request with new token
          return apiRequest(endpoint, options);
        }
      }
      
      throw new Error(
        data?.error || 
        data?.message || 
        `Request failed with status ${response.status}`
      );
    }
    
    return { success: true, data };
  } catch (error) {
    // Handle errors
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        error: 'Request timed out or was cancelled',
        code: 'TIMEOUT'
      };
    }
    
    if (error.message === 'NO_CONNECTION') {
      return { 
        success: false, 
        error: 'No internet connection',
        code: 'OFFLINE'
      };
    }
    
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      code: 'API_ERROR'
    };
  }
};

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} passwordConfirm - Password confirmation
 * @returns {Promise<Object>} Registration result
 */
export const register = async (email, password, passwordConfirm) => {
  return apiRequest('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password,
      password_confirm: passwordConfirm
    })
  });
};

/**
 * Log in a user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Login result
 */
export const login = async (email, password) => {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password
    })
  });
  
  if (result.success && result.data) {
    // Store tokens and user data
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, result.data.access_token),
      AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, result.data.refresh_token),
      AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.data.user))
    ]);
  }
  
  return result;
};

/**
 * Get the stored access token
 * @returns {Promise<string|null>} Access token or null
 */
export const getAccessToken = async () => {
  return AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
};

/**
 * Get the stored refresh token
 * @returns {Promise<string|null>} Refresh token or null
 */
export const getRefreshToken = async () => {
  return AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Refresh the access token
 * @returns {Promise<boolean>} Success status
 */
export const refreshToken = async () => {
  const refreshToken = await getRefreshToken();
  
  if (!refreshToken) {
    return false;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });
    
    if (!response.ok) {
      // If refresh fails, logout
      await logout();
      return false;
    }
    
    const data = await response.json();
    
    if (data.access_token) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
};

/**
 * Log out the current user
 * @returns {Promise<boolean>} Success status
 */
export const logout = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
      AsyncStorage.removeItem('voice_id') // Also remove voice_id
    ]);
    
    // Use Expo Router navigation if available, otherwise return true and handle navigation in components
    if (typeof router !== 'undefined' && router.replace) {
      // Navigate to login screen using Expo Router
      router.replace('/');
    }
    
    return true;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
};

/**
 * Get the current user data
 * @returns {Promise<Object|null>} User data or null
 */
export const getCurrentUser = async () => {
  try {
    const userDataString = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return userDataString ? JSON.parse(userDataString) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

/**
 * Update the stored user data
 * @param {Object} userData - User data to store
 * @returns {Promise<boolean>} Success status
 */
export const updateUserData = async (userData) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Error updating user data:', error);
    return false;
  }
};

/**
 * Check if user is logged in
 * @returns {Promise<boolean>} Whether user is logged in
 */
export const isLoggedIn = async () => {
  try {
    // First check if we have a token
    const token = await getAccessToken();
    if (!token) {
      return false;
    }
    
    // If offline, assume logged in if we have a token stored
    const online = await isOnline();
    if (!online) {
      return true;
    }
    
    // Verify token validity by making a request to /auth/me
    // Using existing apiRequest which already handles token refresh on 401
    const result = await apiRequest('/auth/me');
    
    // If the request was successful, the token is valid
    // If token was expired, apiRequest would have tried to refresh it
    return result.success;
  } catch (error) {
    console.error('Error checking login status:', error);
    return false;
  }
};

/**
 * Request a password reset email
 * @param {string} email - User's email address
 * @returns {Promise<Object>} Result of the operation
 */
export const resetPasswordRequest = async (email) => {
  return apiRequest('/auth/reset-password-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
};

/**
 * Reset password with token and new password
 * @param {string} token - Reset password token
 * @param {string} newPassword - New password
 * @param {string} newPasswordConfirm - Confirm new password
 * @returns {Promise<Object>} Result of the operation
 */
export const resetPassword = async (token, newPassword, newPasswordConfirm) => {
  return apiRequest(`/auth/reset-password/${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm
    })
  });
};

/**
 * Resend confirmation email
 * @param {string} email - User's email address
 * @returns {Promise<Object>} Result of the operation
 */
export const resendConfirmationEmail = async (email) => {
  return apiRequest('/auth/resend-confirmation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
};

// Export default object with all functions
export default {
  register,
  login,
  logout,
  getAccessToken,
  refreshToken,
  getCurrentUser,
  updateUserData,
  isLoggedIn,
  resetPasswordRequest,
  resetPassword,
  resendConfirmationEmail
};