// services/config.js
// Shared configuration for all services
//
// TO SWITCH ENVIRONMENTS:
// Simply change the CURRENT_ENV value below:
// - 'DEV' for local development (localhost)
// - 'STAGING' for staging server  
// - 'PROD' for production server
//
// This will automatically update ALL services (auth, voice, etc.)

// Environment configuration
export const ENV = {
  DEV: 'http://Szymons-MacBook-Pro-2:8000',
  STAGING: 'https://staging-story-voice.herokuapp.com',
  PROD: 'https://api.dawnotemu.app'
};

// 🔧 CHANGE THIS TO SWITCH ENVIRONMENTS FOR THE ENTIRE APP
export const CURRENT_ENV = 'PROD'; // 'DEV' | 'STAGING' | 'PROD'

// Get the current API base URL
export const API_BASE_URL = ENV[CURRENT_ENV];

// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;

// Storage keys
export const STORAGE_KEYS = {
  // Auth related
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER_DATA: 'auth_user_data',
  
  // Voice related
  VOICE_ID: 'voice_id',
  PENDING_OPERATIONS: 'voice_service_pending_ops',
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio',
  CACHED_STORIES: 'voice_service_cached_stories',
  LAST_STORIES_FETCH: 'voice_service_last_stories_fetch'
};

// Cache expiration time (24 hours in milliseconds)
export const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

export default {
  ENV,
  CURRENT_ENV,
  API_BASE_URL,
  REQUEST_TIMEOUT,
  STORAGE_KEYS,
  CACHE_EXPIRATION
}; 