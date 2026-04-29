// services/authService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router'; // For Expo Router navigation
import { API_BASE_URL, REQUEST_TIMEOUT, STORAGE_KEYS } from './config';

// Default request timeout
const REQUEST_TIMEOUT_LOCAL = REQUEST_TIMEOUT;

const authListeners = new Set();

const notifyAuthEvent = (event, payload) => {
  authListeners.forEach((listener) => {
    try {
      listener(event, payload);
    } catch (error) {
      console.error('Auth listener error:', error);
    }
  });
};

export const subscribeAuthEvents = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};

/**
 * Check if device is online
 * @returns {Promise<boolean>} Whether device is online
 */
const isOnline = async () => {
  const networkState = await NetInfo.fetch();
  return networkState.isConnected === true;
};

const mapStatusToCode = (status) => {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'AUTH_ERROR';
  if (status === 402) return 'PAYMENT_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'API_ERROR';
};

const maskEmail = (email) => {
  if (!email) return 'unknown';
  const [user, domain = ''] = email.split('@');
  const visible = user.slice(0, 3);
  return `${visible}***@${domain}`;
};

/**
 * Make an API request with timeout
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional abort signal
 * @param {boolean} isRetry - Whether this is a retry attempt
 * @returns {Promise<Object>} Response or error
 */
const apiRequest = async (endpoint, options = {}, signal = null, isRetry = false) => {
  let controller = null;
  let timeoutId = null;

  try {
    // Check if online
    const online = await isOnline();
    if (!online) {
      return {
        success: false,
        status: null,
        error: 'No internet connection',
        code: 'OFFLINE'
      };
    }

    // Setup controller for timeout
    controller = signal ? null : new AbortController();
    const requestSignal = signal || controller?.signal;
    
    // Set timeout if controller exists
    timeoutId = controller ? 
      setTimeout(() => controller.abort(), REQUEST_TIMEOUT_LOCAL) : null;
    
    // Add authentication if available
    const token = await getAccessToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    console.log('[api] request', {
      endpoint,
      method: options.method || 'GET',
      baseUrl: API_BASE_URL,
      withAuth: !!token
    });
    // Make request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: requestSignal
    });

    const status = response.status;
    const data = await response.json().catch(() => null);

    if (timeoutId) clearTimeout(timeoutId);

    if (status === 204) {
      return { success: true, status, data: null };
    }

    if (!response.ok) {
      // Special case for 401 Unauthorized - only try refresh once
      if (status === 401 && !isRetry) {
        if (!token) {
          // No access token in storage — there is no active session to refresh
          // or log out from. Surface as AUTH_REQUIRED so callers can handle
          // "endpoint needs auth" without triggering a spurious LOGOUT cascade
          // on cold start (Google Play test bot, fresh installs).
          const message = data?.error || data?.message || 'Authentication required';
          return {
            success: false,
            status,
            error: message,
            code: 'AUTH_REQUIRED',
            data
          };
        }
        // Try token refresh if unauthorized and this is not already a retry
        const refreshed = await refreshToken();
        if (refreshed) {
          // Retry the original request with new token
          return apiRequest(endpoint, options, signal, true);
        } else {
          // Refresh failed, logout and return error
          await logout();
          const message = data?.error || data?.message || 'Authentication failed';
          return {
            success: false,
            status,
            error: message,
            code: 'AUTH_ERROR',
            data
          };
        }
      }

      const message = data?.error || data?.message || `Request failed with status ${status}`;
      return {
        success: false,
        status,
        error: message,
        code: mapStatusToCode(status),
        data
      };
    }

    return { success: true, status, data };
  } catch (error) {
    console.error('[api] error', {
      endpoint,
      message: error?.message,
      isAbort: error?.name === 'AbortError'
    });
    if (timeoutId) clearTimeout(timeoutId);

    // Handle errors
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        status: null,
        error: 'Request timed out or was cancelled',
        code: 'TIMEOUT'
      };
    }

    return { 
      success: false, 
      error: error.message || 'Unknown error',
      status: null,
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
  const maskedEmail = maskEmail(email);
  console.log('[auth] login attempt', { email: maskedEmail, baseUrl: API_BASE_URL });
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
      SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, result.data.access_token),
      SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, result.data.refresh_token),
      AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(result.data.user))
    ]);

    notifyAuthEvent('LOGIN', { user: result.data.user });
    console.log('[auth] login success', { email: maskedEmail });
  } else {
    console.error('[auth] login failed', {
      email: maskedEmail,
      status: result.status,
      code: result.code,
      error: result.error
    });
  }
  
  return result;
};

/**
 * Get the stored access token
 * @returns {Promise<string|null>} Access token or null
 */
export const getAccessToken = async () => {
  return SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
};

/**
 * Get the stored refresh token
 * @returns {Promise<string|null>} Refresh token or null
 */
export const getRefreshToken = async () => {
  return SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
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
      // If refresh fails, clear tokens but don't call logout() to avoid infinite loop
      await Promise.all([
        SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
        SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
        AsyncStorage.removeItem('voice_id')
      ]);
      return false;
    }
    
    const data = await response.json();
    
    if (data.access_token) {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Clear tokens on error
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
      AsyncStorage.removeItem('voice_id')
    ]);
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
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA),
      AsyncStorage.removeItem('voice_id'), // Also remove voice_id
      AsyncStorage.removeItem(STORAGE_KEYS.PLAYBACK_QUEUE),
      AsyncStorage.removeItem(STORAGE_KEYS.PLAYBACK_LOOP_MODE)
    ]);
    
    // Use Expo Router navigation if available, otherwise return true and handle navigation in components
    if (typeof router !== 'undefined' && router.replace) {
      // Navigate to login screen using Expo Router
      router.replace('/');
    }
    
    notifyAuthEvent('LOGOUT');
    
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

export const getCurrentUserId = async () => {
  const user = await getCurrentUser();
  if (user && typeof user === 'object') {
    return user.id || user.userId || null;
  }
  return null;
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
 * Fetch latest user profile
 * @returns {Promise<Object>} Profile result with user payload
 */
export const fetchProfile = async () => {
  const result = await apiRequest('/auth/me');
  const user = result?.data?.user || result?.data;

  if (result.success && user && typeof user === 'object') {
    await updateUserData(user);
    notifyAuthEvent('PROFILE_UPDATED', { user });
  }

  return { ...result, user };
};

/**
 * Update user profile (email/password)
 * @param {Object} params
 * @param {string} params.currentPassword - Required current password
 * @param {string} [params.email] - New email
 * @param {string} [params.newPassword] - New password
 * @param {string} [params.newPasswordConfirm] - Confirm new password
 * @returns {Promise<Object>} Update result with user payload
 */
export const updateProfile = async ({
  currentPassword,
  email,
  newPassword,
  newPasswordConfirm
}) => {
  if (!currentPassword) {
    return {
      success: false,
      status: null,
      error: 'Current password is required',
      code: 'VALIDATION_ERROR'
    };
  }

  const payload = {
    current_password: currentPassword
  };

  if (email) {
    payload.email = email;
  }

  if (newPassword) {
    payload.new_password = newPassword;
    payload.new_password_confirm = newPasswordConfirm || newPassword;
  } else if (newPasswordConfirm) {
    // Prevent sending confirm without the main password field
    payload.new_password_confirm = newPasswordConfirm;
  }

  const result = await apiRequest('/auth/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const user = result?.data?.user || result?.data;

  if (result.success && user && typeof user === 'object') {
    await updateUserData(user);
    notifyAuthEvent('PROFILE_UPDATED', { user });
  }

  return { ...result, user };
};

/**
 * Schedule account deletion and logout locally on success
 * @param {Object} params
 * @param {string} params.currentPassword - Required current password
 * @param {string} [params.reason] - Optional reason
 * @returns {Promise<Object>} Deletion result
 */
export const deleteAccount = async ({ currentPassword, reason } = {}) => {
  if (!currentPassword) {
    return {
      success: false,
      status: null,
      error: 'Current password is required',
      code: 'VALIDATION_ERROR'
    };
  }

  const result = await apiRequest('/auth/me', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      current_password: currentPassword,
      reason
    })
  });

  if (result.success) {
    await logout();
  }

  return result;
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
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth check timeout')), 3000)
    );
    
    // Verify token validity by making a request to /auth/me
    // Using existing apiRequest which already handles token refresh on 401
    const authCheckPromise = apiRequest('/auth/me');
    
    const result = await Promise.race([authCheckPromise, timeoutPromise]);
    
    // If the request was successful, the token is valid
    // If token was expired, apiRequest would have tried to refresh it
    return result.success;
  } catch (error) {
    console.error('Error checking login status:', error);
    // On any error (timeout, network, etc.), assume not logged in
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
  getRefreshToken,
  refreshToken,
  getCurrentUser,
  getCurrentUserId,
  updateUserData,
  fetchProfile,
  updateProfile,
  deleteAccount,
  isLoggedIn,
  resetPasswordRequest,
  resetPassword,
  resendConfirmationEmail,
  subscribeAuthEvents
};

export { apiRequest };
