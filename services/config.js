// services/config.js
// Shared configuration for all services
//
// To switch environments, set `EXPO_PUBLIC_API_ENV` (or `API_ENV`) in a `.env` file:
// - DEV      -> local development (defaults to http://localhost:8000)
// - STAGING  -> shared staging API
// - PROD     -> production API (default)
// Optional overrides:
// - EXPO_PUBLIC_API_BASE_URL / API_BASE_URL to point at a custom host.

const DEFAULT_ENV = 'PROD';

export const ENV = {
  DEV: 'http://localhost:8000',
  STAGING: 'https://staging-story-voice.herokuapp.com',
  PROD: 'https://api.dawnotemu.app'
};

const envFromVariables = (process.env.EXPO_PUBLIC_API_ENV || process.env.API_ENV || '').toUpperCase();
const resolvedEnv = ENV[envFromVariables] ? envFromVariables : DEFAULT_ENV;
const explicitBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || null;

export const CURRENT_ENV = resolvedEnv;

// Get the current API base URL
export const API_BASE_URL = explicitBaseUrl || ENV[CURRENT_ENV];

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
  LAST_STORIES_FETCH: 'voice_service_last_stories_fetch',
  GENERATION_STATE: 'voice_service_generation_state',
  PLAYBACK_PROGRESS: 'voice_service_playback_progress',

  // Credits
  CREDITS_CACHE: 'credit_service_cache',
  CREDIT_ESTIMATES: 'credit_service_story_estimates'
};

// Cache expiration time (24 hours in milliseconds)
export const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

// Credit cache TTLs (in milliseconds)
export const CREDIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export const CREDIT_ESTIMATE_TTL = 10 * 60 * 1000; // 10 minutes

// Voice generation persistence TTL (in milliseconds)
export const GENERATION_STATE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export default {
  ENV,
  CURRENT_ENV,
  API_BASE_URL,
  REQUEST_TIMEOUT,
  STORAGE_KEYS,
  CACHE_EXPIRATION,
  CREDIT_CACHE_TTL,
  CREDIT_ESTIMATE_TTL,
  GENERATION_STATE_TTL
}; 
