// Enhanced voiceService.js aligned with the API documentation
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from './authService';
import {
  API_BASE_URL,
  REQUEST_TIMEOUT,
  STORAGE_KEYS,
  CACHE_EXPIRATION,
  GENERATION_STATE_TTL
} from './config';

const MIN_VALID_AUDIO_SIZE_BYTES = 2048; // guard against empty/partial downloads
const AUDIO_DOWNLOAD_RETRY_DELAY_MS = 750;
const MAX_AUDIO_DOWNLOAD_ATTEMPTS = 6;
const PLAYBACK_PROGRESS_KEY = STORAGE_KEYS.PLAYBACK_PROGRESS;
const MAX_LOGGED_BODY_CHARS = 1024;

const getFileInfoSafe = async (uri) => {
  if (!uri) {
    return { exists: false, size: 0 };
  }
  try {
    return await FileSystem.getInfoAsync(uri);
  } catch (error) {
    console.warn('Failed to read file info', error);
    return { exists: false, size: 0, error };
  }
};

const isAudioFileValid = (info) => {
  if (!info?.exists) return false;
  if (typeof info.size === 'number') {
    return info.size > MIN_VALID_AUDIO_SIZE_BYTES;
  }
  return true;
};

const deleteFileQuietly = async (uri) => {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn('Failed to delete audio file', error);
  }
};

const headersToObject = (headers) => {
  if (!headers) {
    return {};
  }

  const snapshot = {};
  headers.forEach((value, key) => {
    snapshot[String(key).toLowerCase()] = value;
  });
  return snapshot;
};

const DEFAULT_GENERATION_SLOT_RETRY_DELAY_MS = 15000;
const DEFAULT_GENERATION_SLOT_MAX_ATTEMPTS = 8;
const DEFAULT_PROCESSING_POLL_INTERVAL_MS = 5000;
const DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS = 36;

let generationSlotRetryDelayMs = DEFAULT_GENERATION_SLOT_RETRY_DELAY_MS;
let generationSlotMaxAttempts = DEFAULT_GENERATION_SLOT_MAX_ATTEMPTS;
let processingPollIntervalMs = DEFAULT_PROCESSING_POLL_INTERVAL_MS;
let processingPollMaxAttempts = DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS;

let voiceGenerationTelemetryHandler = null;

export const setVoiceGenerationTelemetryHandler = (handler) => {
  voiceGenerationTelemetryHandler =
    typeof handler === 'function' ? handler : null;
};

const reportTelemetry = (event) => {
  if (
    !event ||
    typeof voiceGenerationTelemetryHandler !== 'function'
  ) {
    return;
  }
  try {
    voiceGenerationTelemetryHandler(event);
  } catch (error) {
    console.warn('voiceService telemetry handler threw', error);
  }
};

const applyTimingOverrides = (overrides = {}) => {
  if (typeof overrides.slotDelay === 'number') {
    generationSlotRetryDelayMs = overrides.slotDelay;
  }
  if (typeof overrides.slotAttempts === 'number') {
    generationSlotMaxAttempts = overrides.slotAttempts;
  }
  if (typeof overrides.pollInterval === 'number') {
    processingPollIntervalMs = overrides.pollInterval;
  }
  if (typeof overrides.pollAttempts === 'number') {
    processingPollMaxAttempts = overrides.pollAttempts;
  }
};

const resetTimingOverrides = () => {
  generationSlotRetryDelayMs = DEFAULT_GENERATION_SLOT_RETRY_DELAY_MS;
  generationSlotMaxAttempts = DEFAULT_GENERATION_SLOT_MAX_ATTEMPTS;
  processingPollIntervalMs = DEFAULT_PROCESSING_POLL_INTERVAL_MS;
  processingPollMaxAttempts = DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS;
};

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeDownloadRetryDelay = (attempt = 0) =>
  AUDIO_DOWNLOAD_RETRY_DELAY_MS * Math.max(1, attempt + 1);

const extractHttpStatus = (error) => {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (typeof error.httpStatus === 'number') {
    return error.httpStatus;
  }

  if (
    error.response &&
    typeof error.response === 'object' &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  if (typeof error.errorCode === 'number') {
    return error.errorCode;
  }

  return null;
};

const shouldRetryDownloadStatus = (status) => {
  if (status === null || status === undefined) {
    return true;
  }

  if (status === 401 || status === 403) {
    // Auth failure normally should not be retried without new token
    return false;
  }

  if (status === 404 || status === 409 || status === 423) {
    // API may still be finalising S3 upload; retry briefly
    return true;
  }

  if (status >= 500 && status < 600) {
    return true;
  }

  if (status === 425 || status === 429) {
    return true;
  }

  return false;
};

const canRetryDownload = (retryCount, status = null) => {
  if (retryCount >= MAX_AUDIO_DOWNLOAD_ATTEMPTS - 1) {
    return false;
  }

  return shouldRetryDownloadStatus(status);
};

const toStringOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
};

const parseQueueHeaders = (headerMap = {}) => {
  const queuePosition = toNumberOrNull(headerMap['x-voice-queue-position']);
  const queueLength = toNumberOrNull(headerMap['x-voice-queue-length']);
  const remoteVoiceIdRaw =
    headerMap['x-voice-remote-id'] !== undefined
      ? headerMap['x-voice-remote-id']
      : headerMap['x-voice-remote-id'.toLowerCase()];

  return {
    queuePosition,
    queueLength,
    remoteVoiceId: toStringOrNull(remoteVoiceIdRaw)
  };
};

const normaliseSynthesisStatus = (status) => {
  if (typeof status !== 'string') {
    return null;
  }
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized;
};

const computeStatusProgressHint = (status, fallback = null) => {
  switch (status) {
    case 'queued_for_slot':
      return 0.05;
    case 'allocating_voice':
      return 0.2;
    case 'processing':
      return fallback !== null ? fallback : 0.6;
    case 'ready':
      return 1;
    default:
      return fallback;
  }
};

const extractVoiceSlotMetadata = (voice = {}) => {
  if (!voice || typeof voice !== 'object') {
    return {};
  }
  const slot = {
    voiceId: toNumberOrNull(voice.voice_id) ?? toNumberOrNull(voice.id),
    allocationStatus: toStringOrNull(voice.allocation_status),
    serviceProvider: toStringOrNull(voice.service_provider),
    queuePosition:
      toNumberOrNull(voice.queue_position) ?? toNumberOrNull(voice.queuePosition),
    queueLength: toNumberOrNull(voice.queue_length) ?? toNumberOrNull(voice.queueLength),
    elevenlabsVoiceId: toStringOrNull(voice.elevenlabs_voice_id),
    queued:
      typeof voice.queued === 'boolean'
        ? voice.queued
        : voice.queued === 'true'
          ? true
          : voice.queued === 'false'
            ? false
            : null,
    allocatedAt: toStringOrNull(voice.allocated_at)
  };

  return slot;
};

const buildAudioRedirectUrl = (voiceId, storyId) =>
  `${API_BASE_URL}/voices/${voiceId}/stories/${storyId}/audio?redirect=true`;

const interpretAudioSynthesisResponse = (result) => {
  if (!result || !result.success) {
    return {
      success: false,
      error: result?.error || 'Unable to generate audio',
      code: result?.code || 'API_ERROR'
    };
  }

  const payload = result.data && typeof result.data === 'object' ? result.data : {};
  const queueHeaders = parseQueueHeaders(result.headers || {});
  const voiceSlotMetadata = extractVoiceSlotMetadata(payload.voice || {});

  const payloadStatus = normaliseSynthesisStatus(payload.status);
  const status =
    payloadStatus ||
    (result.status === 200 && payload.url ? 'ready' : payloadStatus) ||
    (result.status === 200 ? 'ready' : null);

  const audioIdRaw =
    payload.id !== undefined
      ? payload.id
      : payload.audio_id !== undefined
        ? payload.audio_id
        : null;

  const queuePosition =
    toNumberOrNull(payload.queue_position) ??
    toNumberOrNull(payload.queuePosition) ??
    voiceSlotMetadata.queuePosition ??
    queueHeaders.queuePosition;

  const queueLength =
    toNumberOrNull(payload.queue_length) ??
    toNumberOrNull(payload.queueLength) ??
    voiceSlotMetadata.queueLength ??
    queueHeaders.queueLength;

  const remoteVoiceId =
    toStringOrNull(payload.remote_voice_id) ??
    queueHeaders.remoteVoiceId ??
    voiceSlotMetadata.elevenlabsVoiceId;

  return {
    success: true,
    status,
    message: toStringOrNull(payload.message),
    url: toStringOrNull(payload.url),
    audioId:
      audioIdRaw !== null && audioIdRaw !== undefined ? String(audioIdRaw) : null,
    queuePosition,
    queueLength,
    remoteVoiceId,
    allocationStatus: voiceSlotMetadata.allocationStatus,
    serviceProvider: voiceSlotMetadata.serviceProvider,
    voiceSlotMetadata,
    queueHeaders,
    raw: payload
  };
};

// HELPER FUNCTIONS
/**
 * Creates FormData from an audio file with platform-specific handling
 * @param {string} audioUri - URI to the audio file
 * @param {string} fileName - Optional filename (default: 'audio.wav')
 * @returns {Promise<FormData>} FormData object ready for upload
 */
const createFormData = async (audioUri, fileName = null) => {
  const formData = new FormData();
  
  // Handle different URI formats between iOS and Android
  const fileUri = Platform.OS === 'android' 
    ? audioUri
    : audioUri.replace('file://', '');
  
  // Get file info to determine size
  const fileInfo = await getFileInfoSafe(audioUri);
  if (!fileInfo.exists) {
    throw new Error('Audio file not found for upload');
  }
  
  // Extract file name from URI if not provided
  if (!fileName) {
    fileName = audioUri.split('/').pop();
  }
  
  // Extract file extension
  const fileExtension = fileName.split('.').pop().toLowerCase();
  
  // Map file extensions to MIME types
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/x-m4a',
  };
  
  // Use the mapped MIME type or default to audio/wav
  const mimeType = mimeTypes[fileExtension] || 'audio/wav';
  
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: mimeType,
    size: fileInfo.size,
  });
  
  return formData;
};

/**
 * Checks network status
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

/**
 * Performs an API request with timeout, cancellation support, and connection check
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @param {boolean} isRetry - Whether this call is a retry after refreshing auth
 * @returns {Promise<Object>} Response data or error
 */
const apiRequest = async (endpoint, options = {}, signal = null, isRetry = false) => {
  let controller = null;
  let timeoutId = null;

  try {
    // Check for internet connection
    const online = await isOnline();
    if (!online) {
      await queueOperationIfOffline(endpoint, options);
      return {
        success: false,
        status: null,
        error: 'No internet connection',
        code: 'OFFLINE',
        headers: null
      };
    }

    // Create AbortController if not provided
    controller = signal ? null : new AbortController();
    const requestSignal = signal || controller?.signal;
    
    // Set timeout if controller exists
    timeoutId = controller ? 
      setTimeout(() => controller.abort(), REQUEST_TIMEOUT) : null;
    
    // Add authentication if available using authService
    const token = await authService.getAccessToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    
    // Perform request
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: requestSignal
    });

    const status = response.status;
    const headers = headersToObject(response.headers);
    let responseBody = null;

    if (status !== 204) {
      const rawText = await response.text().catch(() => '');
      if (rawText) {
        try {
          responseBody = JSON.parse(rawText);
        } catch (parseError) {
          responseBody = rawText;
        }
      }
    }

    if (timeoutId) clearTimeout(timeoutId);
    
    if (status === 204) {
      return { success: true, status, data: null, headers };
    }
    
    // For 401 Unauthorized, try to refresh token
    if (status === 401 && !isRetry) {
      const refreshed = await authService.refreshToken();
      if (refreshed) {
        // Retry the request with the new token
        return apiRequest(endpoint, options, signal, true);
      }
    }
    
    if (!response.ok) {
      const message =
        (responseBody && typeof responseBody === 'object'
          ? responseBody.error || responseBody.message
          : null) || `Request failed with status ${status}`;
      return {
        success: false,
        status,
        error: message,
        code: mapStatusToCode(status),
        data: responseBody,
        headers
      };
    }
    
    return { success: true, status, data: responseBody, headers };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    // Handle specific error cases
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        status: null,
        error: 'Request timed out or was cancelled',
        code: 'TIMEOUT',
        headers: null
      };
    }
    
    if (error.message === 'NO_CONNECTION') {
      // Queue operation for offline support if appropriate
      await queueOperationIfOffline(endpoint, options);
      
      return { 
        success: false, 
        error: 'No internet connection',
        status: null,
        code: 'OFFLINE',
        headers: null
      };
    }
    
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      status: null,
      code: 'API_ERROR',
      headers: null
    };
  }
};

/**
 * Queues operations for retry when connection is restored
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 */
const queueOperationIfOffline = async (endpoint, options) => {
  // Only queue certain operations
  const queueableOperations = ['/voices', '/voices/*/stories/*/audio'];
  
  const isQueueable = queueableOperations.some(op => {
    // Convert wildcard pattern to regex for matching
    const regex = new RegExp(op.replace(/\*/g, '[^/]+'));
    return regex.test(endpoint);
  });
  
  if (!isQueueable) return;
  
  try {
    // Get existing queue
    const queueString = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_OPERATIONS);
    const queue = queueString ? JSON.parse(queueString) : [];
    
    // Add operation to queue
    queue.push({
      endpoint,
      options,
      timestamp: Date.now()
    });
    
    // Save updated queue
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_OPERATIONS, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to queue operation:', error);
  }
};

/**
 * Processes queued operations when back online
 */
export const processOfflineQueue = async () => {
  try {
    const queueString = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_OPERATIONS);
    if (!queueString) return { processed: 0 };
    
    const queue = JSON.parse(queueString);
    if (!queue.length) return { processed: 0 };
    
    let successCount = 0;
    const newQueue = [];
    
    // Process each queued operation
    for (const operation of queue) {
      const { endpoint, options } = operation;
      
      // Skip operations older than 24 hours
      if (Date.now() - operation.timestamp > 86400000) continue;
      
      const result = await apiRequest(endpoint, options);
      
      if (result.success) {
        successCount++;
      } else {
        newQueue.push(operation);
      }
    }
    
    // Update queue with remaining operations
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_OPERATIONS, JSON.stringify(newQueue));
    
    return { 
      success: true,
      processed: successCount,
      remaining: newQueue.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: 'QUEUE_PROCESSING_ERROR'
    };
  }
};

/**
 * Generation state persistence helpers
 */
const ensureObject = (value) => (value && typeof value === 'object' ? value : {});

const normaliseId = (value) => {
  if (value === null || value === undefined) return null;
  const stringified = String(value).trim();
  return stringified.length ? stringified : null;
};

const isGenerationStateExpired = (entry, now, fallbackTtl) => {
  if (!entry || typeof entry !== 'object') return true;
  const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : null;
  if (expiresAt !== null) {
    return now > expiresAt;
  }
  const ttl = typeof entry.ttl === 'number' && entry.ttl > 0 ? entry.ttl : fallbackTtl;
  const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
  if (!updatedAt) {
    return true;
  }
  return now - updatedAt > ttl;
};

const readGenerationStateMap = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.GENERATION_STATE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return ensureObject(parsed);
  } catch (error) {
    console.error('Failed to read generation state snapshot:', error);
    return {};
  }
};

const writeGenerationStateMap = async (value) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.GENERATION_STATE, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Failed to persist generation state snapshot:', error);
    return false;
  }
};

const pruneGenerationStateMap = (map, now, ttl) => {
  let mutated = false;
  Object.keys(map).forEach((voiceKey) => {
    const stories = ensureObject(map[voiceKey]);
    if (stories !== map[voiceKey]) {
      map[voiceKey] = stories;
    }
    Object.keys(stories).forEach((storyKey) => {
      if (isGenerationStateExpired(stories[storyKey], now, ttl)) {
        delete stories[storyKey];
        mutated = true;
      }
    });
    if (!Object.keys(stories).length) {
      delete map[voiceKey];
      mutated = true;
    }
  });
  return mutated;
};

const sanitizeGenerationStateEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  return {
    ...entry,
    updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : null,
    expiresAt: typeof entry.expiresAt === 'number' ? entry.expiresAt : null
  };
};

export const saveGenerationStateSnapshot = async (voiceId, storyId, snapshot = {}, options = {}) => {
  const voiceKey = normaliseId(voiceId);
  const storyKey = normaliseId(storyId);
  if (!voiceKey || !storyKey) {
    return {
      success: false,
      error: 'voiceId and storyId are required to store generation state',
      code: 'INVALID_ARGUMENT'
    };
  }

  const ttl = typeof options.ttl === 'number' && options.ttl > 0
    ? options.ttl
    : GENERATION_STATE_TTL;

  const now = Date.now();
  const map = await readGenerationStateMap();
  pruneGenerationStateMap(map, now, ttl);

  if (!map[voiceKey]) {
    map[voiceKey] = {};
  }

  const entry = {
    ...snapshot,
    voiceId: voiceKey,
    storyId: storyKey,
    updatedAt: now,
    ttl,
    expiresAt: now + ttl
  };

  map[voiceKey][storyKey] = entry;
  await writeGenerationStateMap(map);

  return {
    success: true,
    state: sanitizeGenerationStateEntry(entry)
  };
};

export const loadGenerationStateSnapshot = async (voiceId, storyId) => {
  const voiceKey = normaliseId(voiceId);
  const storyKey = normaliseId(storyId);
  if (!voiceKey || !storyKey) {
    return {
      success: false,
      error: 'voiceId and storyId are required to load generation state',
      code: 'INVALID_ARGUMENT'
    };
  }

  const now = Date.now();
  const map = await readGenerationStateMap();
  const stories = ensureObject(map[voiceKey]);
  const entry = stories[storyKey];

  if (!entry || isGenerationStateExpired(entry, now, GENERATION_STATE_TTL)) {
    if (entry) {
      delete stories[storyKey];
      if (!Object.keys(stories).length) {
        delete map[voiceKey];
      }
      await writeGenerationStateMap(map);
    }
    return {
      success: true,
      state: null,
      expired: !!entry
    };
  }

  return {
    success: true,
    state: sanitizeGenerationStateEntry(entry)
  };
};

export const listGenerationStateSnapshots = async ({ voiceId } = {}) => {
  const filterVoiceKey = normaliseId(voiceId);
  const now = Date.now();
  const map = await readGenerationStateMap();
  const ttl = GENERATION_STATE_TTL;
  const result = {};
  const mutated = pruneGenerationStateMap(map, now, ttl);

  const voices = filterVoiceKey ? [filterVoiceKey] : Object.keys(map);
  voices.forEach((voiceKey) => {
    const stories = ensureObject(map[voiceKey]);
    const entries = {};
    Object.keys(stories).forEach((storyKey) => {
      const entry = stories[storyKey];
      if (!isGenerationStateExpired(entry, now, ttl)) {
        entries[storyKey] = sanitizeGenerationStateEntry(entry);
      }
    });
    if (Object.keys(entries).length) {
      result[voiceKey] = entries;
    }
  });

  if (mutated) {
    await writeGenerationStateMap(map);
  }

  return result;
};

export const clearGenerationStateSnapshot = async (voiceId, storyId = null) => {
  const voiceKey = normaliseId(voiceId);
  if (!voiceKey) {
    return {
      success: false,
      error: 'voiceId is required to clear generation state',
      code: 'INVALID_ARGUMENT'
    };
  }

  const map = await readGenerationStateMap();
  if (!map[voiceKey]) {
    return { success: true };
  }

  if (storyId === null || storyId === undefined) {
    delete map[voiceKey];
  } else {
    const storyKey = normaliseId(storyId);
    if (storyKey && map[voiceKey][storyKey]) {
      delete map[voiceKey][storyKey];
    }
    if (!Object.keys(map[voiceKey]).length) {
      delete map[voiceKey];
    }
  }

  await writeGenerationStateMap(map);
  return { success: true };
};

export const purgeExpiredGenerationStateSnapshots = async () => {
  const now = Date.now();
  const map = await readGenerationStateMap();
  const mutated = pruneGenerationStateMap(map, now, GENERATION_STATE_TTL);
  if (mutated) {
    await writeGenerationStateMap(map);
  }
  return { success: true, mutated };
};

export const __TEST_ONLY__ = {
  interpretAudioSynthesisResponse,
  parseQueueHeaders,
  normaliseSynthesisStatus,
  saveGenerationStateSnapshot,
  loadGenerationStateSnapshot,
  listGenerationStateSnapshots,
  clearGenerationStateSnapshot,
  purgeExpiredGenerationStateSnapshots,
  setTimingOverrides: applyTimingOverrides,
  resetTimingOverrides,
  setTelemetryHandler: setVoiceGenerationTelemetryHandler,
  reportTelemetryEvent: reportTelemetry
};

// VOICE MANAGEMENT

/**
 * Stores the current voice ID
 * @param {string} voiceId - Voice ID to store
 */
export const setCurrentVoice = async (voiceId) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, String(voiceId));
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      code: 'STORAGE_ERROR'
    };
  }
};

/**
 * Gets the current voice ID
 * @returns {Promise<Object>} Voice ID if available
 */
export const getCurrentVoice = async () => {
  try {
    const voiceId = await AsyncStorage.getItem(STORAGE_KEYS.VOICE_ID);
    return { 
      success: true, 
      voiceId
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      code: 'STORAGE_ERROR'
    };
  }
};

// STORY MANAGEMENT

const normalizeRequiredCredits = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
};

const normalizeStory = (story) => {
  if (!story || typeof story !== 'object') {
    return story;
  }

  const requiredCreditsCandidate =
    story.requiredCredits ??
    story.required_credits ??
    story.requiredCredit ??
    story.required_credit;

  const normalizedCredits = normalizeRequiredCredits(requiredCreditsCandidate);

  return {
    ...story,
    requiredCredits: normalizedCredits,
  };
};

const normalizeStories = (stories = []) => {
  if (!Array.isArray(stories)) {
    return [];
  }
  return stories.map((story) => normalizeStory(story));
};

/**
 * Caches stories in AsyncStorage
 * @param {Array} stories - List of story objects
 */
const cacheStories = async (stories) => {
  try {
    const normalized = normalizeStories(stories);
    await AsyncStorage.setItem(STORAGE_KEYS.CACHED_STORIES, JSON.stringify(normalized));
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_STORIES_FETCH, Date.now().toString());
    return { success: true };
  } catch (error) {
    console.error('Failed to cache stories:', error);
    return { 
      success: false, 
      error: error.message,
      code: 'STORAGE_ERROR'
    };
  }
};

/**
 * Gets cached stories from AsyncStorage
 * @returns {Promise<Array>} Cached stories or empty array
 */
const getCachedStories = async () => {
  try {
    const storiesString = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_STORIES);
    const parsed = storiesString ? JSON.parse(storiesString) : [];
    return normalizeStories(parsed);
  } catch (error) {
    console.error('Failed to get cached stories:', error);
    return [];
  }
};

/**
 * Checks if cached stories are still valid (not expired)
 * @returns {Promise<boolean>} Whether cache is valid
 */
const isCacheValid = async () => {
  try {
    const lastFetchString = await AsyncStorage.getItem(STORAGE_KEYS.LAST_STORIES_FETCH);
    if (!lastFetchString) return false;
    
    const lastFetch = parseInt(lastFetchString);
    const now = Date.now();
    
    // Cache is valid if less than CACHE_EXPIRATION old
    return now - lastFetch < CACHE_EXPIRATION;
  } catch (error) {
    console.error('Failed to check cache validity:', error);
    return false;
  }
};

/**
 * Gets available stories
 * @param {boolean} forceRefresh - Whether to force a network refresh
 * @returns {Promise<Object>} List of stories or error
 */
export const getStories = async (forceRefresh = false) => {
  // Check if online
  const online = await isOnline();
  
  // If online and either force refresh or cache is not valid, try to fetch from network
  if (online && (forceRefresh || !(await isCacheValid()))) {
    try {
      const result = await apiRequest('/stories');
      
      if (result.success) {
        const normalizedStories = normalizeStories(result.data || []);
        
        // Cache the stories for offline use
        await cacheStories(normalizedStories);
        
        return {
          success: true,
          stories: normalizedStories,
          fromCache: false
        };
      }
    } catch (error) {
      console.error('Error fetching stories from network:', error);
      // Fall through to use cache
    }
  }
  
  // If we're here, we're either offline or the network request failed
  // Get stories from cache
  const cachedStories = await getCachedStories();
  
  return {
    success: true,
    stories: cachedStories,
    fromCache: true
  };
};

/**
 * Checks if audio exists for a voice+story combination
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @returns {Promise<Object>} Result indicating if audio exists
 */
export const checkAudioExists = async (voiceId, storyId, options = {}) => {
  const { verifyRemote = false, cleanupOrphaned = false } =
    options && typeof options === 'object' ? options : {};

  // First check local storage
  const audioInfo = await getStoredAudioInfo(voiceId, storyId);
  let localExists = false;
  let localUri = null;

  if (audioInfo && audioInfo.localUri) {
    const fileInfo = await getFileInfoSafe(audioInfo.localUri);
    if (isAudioFileValid(fileInfo)) {
      localExists = true;
      localUri = audioInfo.localUri;
    }
  }

  const shouldCheckRemote = verifyRemote || !localExists;
  let remoteExists = null;
  let remoteCheckKnown = false;

  if (shouldCheckRemote) {
    const online = await isOnline();
    if (online) {
      try {
        const result = await apiRequest(`/voices/${voiceId}/stories/${storyId}/audio`, {
          method: 'HEAD'
        });
        if (result.success) {
          remoteExists = true;
          remoteCheckKnown = true;
        } else if (result.code === 'NOT_FOUND') {
          remoteExists = false;
          remoteCheckKnown = true;
        }
      } catch (error) {
        console.error('Error checking audio exists on server:', error);
      }
    }
  }

  if (remoteExists === false && cleanupOrphaned && localExists) {
    await deleteFileQuietly(localUri);
    await removeAudioReference(voiceId, storyId);
    localExists = false;
    localUri = null;
  }
  
  const exists = localExists || remoteExists === true;

  return {
    success: true,
    exists,
    localUri,
    localExists,
    remoteExists,
    fromCache: localExists && !shouldCheckRemote,
    remoteCheckPerformed: remoteCheckKnown
  };
};

/**
 * Generates audio for a story with a given voice
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @param {Function} statusCallback - Optional callback for status updates
 * @returns {Promise<Object>} Result with audio URL or error
 */
export const generateStoryAudio = async (voiceId, storyId, statusCallback = null) => {
  const online = await isOnline();
  if (!online) {
    return {
      success: false,
      error: 'Cannot generate audio without internet connection',
      code: 'OFFLINE'
    };
  }

  let resolvedVoiceId = toStringOrNull(voiceId);
  if (!resolvedVoiceId) {
    const current = await getCurrentVoice();
    if (!current.success || !current.voiceId) {
      return {
        success: false,
        error: 'No voice ID specified or stored',
        code: 'MISSING_VOICE_ID'
      };
    }
    resolvedVoiceId = toStringOrNull(current.voiceId);
  }

  const resolvedStoryId = toStringOrNull(storyId) ?? String(storyId);

  let existingSnapshot = null;
  try {
    const snapshotResult = await loadGenerationStateSnapshot(
      resolvedVoiceId,
      resolvedStoryId
    );
    if (snapshotResult.success) {
      existingSnapshot = snapshotResult.state || null;
    }
  } catch (error) {
    console.warn('Failed to load generation snapshot before starting', error);
  }

  let audioStoryId = existingSnapshot?.audioId || null;
  let latestStatus = existingSnapshot?.status || null;
  let latestMetadata = existingSnapshot || {};
  let slotAttempts = 0;

  const emitStatusUpdate = (status, progressOverride = null, snapshot = null) => {
    if (!status) {
      return;
    }
    const metadata = snapshot || latestMetadata || {};
    const progressHintRaw =
      typeof progressOverride === 'number'
        ? progressOverride
        : computeStatusProgressHint(status, null);
    const progressHint =
      typeof progressHintRaw === 'number'
        ? Math.max(0, Math.min(progressHintRaw, 1))
        : undefined;

    const event = {
      category: 'voice_generation',
      phase: 'generation',
      status,
      progress: progressHint,
      queuePosition:
        metadata.queuePosition !== undefined ? metadata.queuePosition : null,
      queueLength:
        metadata.queueLength !== undefined ? metadata.queueLength : null,
      remoteVoiceId:
        metadata.remoteVoiceId !== undefined ? metadata.remoteVoiceId : null,
      allocationStatus:
        metadata.allocationStatus !== undefined ? metadata.allocationStatus : null,
      serviceProvider:
        metadata.serviceProvider !== undefined ? metadata.serviceProvider : null,
      message: metadata.message ?? null,
      metadata
    };

    statusCallback?.(event);
    reportTelemetry(event);
  };

  const persistSnapshot = async (status, details = {}) => {
    const result = await saveGenerationStateSnapshot(
      resolvedVoiceId,
      resolvedStoryId,
      {
        status,
        ...details
      }
    );
    if (result.success && result.state) {
      latestMetadata = result.state;
    }
    return result;
  };

  if (existingSnapshot?.status) {
    emitStatusUpdate(
      existingSnapshot.status,
      computeStatusProgressHint(existingSnapshot.status, null),
      existingSnapshot
    );
  }

  try {
    while (true) {
      const apiResult = await apiRequest(
        `/voices/${resolvedVoiceId}/stories/${resolvedStoryId}/audio`,
        { method: 'POST' }
      );

      if (!apiResult.success) {
        if (apiResult.code === 'TIMEOUT') {
          latestStatus = latestStatus || 'processing';
          emitStatusUpdate('processing', 0.6);
          break;
        }

        await persistSnapshot(latestStatus || 'error', {
          ...latestMetadata,
          statusCode: apiResult.status,
          error: apiResult.error
        });

        emitStatusUpdate('error', null, {
          ...latestMetadata,
          statusCode: apiResult.status,
          error: apiResult.error
        });

        return apiResult;
      }

      const interpretation = interpretAudioSynthesisResponse(apiResult);
      if (!interpretation.success) {
        await persistSnapshot('error', {
          ...latestMetadata,
          error: interpretation.error,
          code: interpretation.code || 'API_ERROR'
        });
        emitStatusUpdate('error', null, {
          ...latestMetadata,
          error: interpretation.error,
          code: interpretation.code || 'API_ERROR'
        });
        return {
          success: false,
          error: interpretation.error,
          code: interpretation.code || 'API_ERROR'
        };
      }

      latestStatus = interpretation.status || latestStatus || 'processing';
      audioStoryId = interpretation.audioId || audioStoryId;

      latestMetadata = {
        ...latestMetadata,
        audioId: audioStoryId,
        message: interpretation.message,
        queuePosition: interpretation.queuePosition,
        queueLength: interpretation.queueLength,
        remoteVoiceId: interpretation.remoteVoiceId,
        allocationStatus: interpretation.allocationStatus,
        serviceProvider: interpretation.serviceProvider,
        voiceSlotMetadata: interpretation.voiceSlotMetadata,
        queueHeaders: interpretation.queueHeaders,
        httpStatus: apiResult.status
      };

      const persistedState = await persistSnapshot(latestStatus, latestMetadata);

      emitStatusUpdate(
        latestStatus,
        computeStatusProgressHint(latestStatus, null),
        persistedState.success ? persistedState.state : latestMetadata
      );

      if (latestStatus === 'ready') {
        const audioUrl =
          interpretation.url ||
          latestMetadata.audioUrl ||
          buildAudioRedirectUrl(resolvedVoiceId, resolvedStoryId);

        emitStatusUpdate('ready', 1, {
          ...latestMetadata,
          status: 'ready',
          audioUrl
        });

        await clearGenerationStateSnapshot(resolvedVoiceId, resolvedStoryId);

        return {
          success: true,
          status: 'ready',
          audioUrl,
          metadata: {
            ...latestMetadata,
            status: 'ready',
            audioUrl
          }
        };
      }

      if (latestStatus === 'processing') {
        break;
      }

      if (latestStatus === 'queued_for_slot' || latestStatus === 'allocating_voice') {
        slotAttempts += 1;
        if (slotAttempts >= generationSlotMaxAttempts) {
          const timeoutError = {
            success: false,
            error: 'Voice slot allocation timed out. Please try again shortly.',
            code: 'ALLOCATION_TIMEOUT',
            status: latestStatus,
            queuePosition: latestMetadata.queuePosition,
            queueLength: latestMetadata.queueLength,
            remoteVoiceId: latestMetadata.remoteVoiceId
          };
          await persistSnapshot('error', {
            ...latestMetadata,
            status: latestStatus,
            error: timeoutError.error,
            code: timeoutError.code
          });
          emitStatusUpdate('error', null, timeoutError);
          return timeoutError;
        }

        await delay(generationSlotRetryDelayMs);
        continue;
      }

      // Unknown status: attempt to progress via polling
      break;
    }

    emitStatusUpdate('processing', 0.6);

    const pollOutcome = await pollForAudioAvailability(
      resolvedVoiceId,
      resolvedStoryId,
      statusCallback,
      {
        audioId: audioStoryId,
        intervalMs: processingPollIntervalMs,
        maxAttempts: processingPollMaxAttempts,
        metadata: latestMetadata
      }
    );

    if (pollOutcome.success && pollOutcome.ready) {
      const audioUrl =
        pollOutcome.audioUrl ||
        buildAudioRedirectUrl(resolvedVoiceId, resolvedStoryId);

      emitStatusUpdate('ready', 1, {
        ...latestMetadata,
        status: 'ready',
        audioUrl,
        audioId: audioStoryId || pollOutcome.audioId || null
      });

      await clearGenerationStateSnapshot(resolvedVoiceId, resolvedStoryId);

      return {
        success: true,
        status: 'ready',
        audioUrl,
        metadata: {
          ...latestMetadata,
          status: 'ready',
          audioUrl,
          audioId: audioStoryId || pollOutcome.audioId || null
        }
      };
    }

    if (!pollOutcome.success) {
      await persistSnapshot('error', {
        ...latestMetadata,
        status: latestStatus,
        error: pollOutcome.error,
        code: pollOutcome.code
      });
      emitStatusUpdate('error', null, {
        ...latestMetadata,
        status: latestStatus,
        error: pollOutcome.error,
        code: pollOutcome.code
      });
      return pollOutcome;
    }

    await persistSnapshot(latestStatus || 'processing', {
      ...latestMetadata,
      status: latestStatus || 'processing',
      error: 'Audio generation timed out'
    });

    emitStatusUpdate('error', null, {
      ...latestMetadata,
      status: latestStatus || 'processing',
      error: 'Audio generation timed out',
      code: 'GENERATION_TIMEOUT'
    });

    return {
      success: false,
      error: 'Audio generation timed out',
      code: 'GENERATION_TIMEOUT',
      status: latestStatus || 'processing',
      queuePosition: latestMetadata.queuePosition,
      queueLength: latestMetadata.queueLength,
      remoteVoiceId: latestMetadata.remoteVoiceId
    };
  } catch (error) {
    console.error('Error generating audio:', error);
    await persistSnapshot('error', {
      ...latestMetadata,
      status: latestStatus || 'error',
      error: error.message
    });

    emitStatusUpdate('error', null, {
      ...latestMetadata,
      status: latestStatus || 'error',
      error: error.message
    });

    return {
      success: false,
      error: error.message || 'Unknown error generating audio',
      code: 'GENERATION_ERROR'
    };
  }
};

/**
 * Polls for audio availability
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @param {Function} statusCallback - Optional callback for status updates
 * @returns {Promise<boolean>} Whether audio is available
 */
const pollForAudioAvailability = async (
  voiceId,
  storyId,
  statusCallback = null,
  options = {}
) => {
  const {
    audioId = null,
    intervalMs = processingPollIntervalMs,
    maxAttempts = processingPollMaxAttempts,
    metadata: initialMetadata = {}
  } = options || {};

  let attempts = 0;
  const metadataRef = { ...(initialMetadata || {}) };

  while (attempts < maxAttempts) {
    const pollProgress =
      0.6 + (attempts / Math.max(maxAttempts, 1)) * 0.35; // 60% -> 95%
    const pollingEvent = {
      category: 'voice_generation',
      phase: 'polling',
      status: 'processing',
      progress: Math.min(pollProgress, 0.95),
      metadata: metadataRef
    };
    statusCallback?.(pollingEvent);
    reportTelemetry(pollingEvent);

    try {
      if (audioId) {
        const statusResult = await apiRequest(`/audio/${audioId}/status`, {
          method: 'GET'
        });

        if (statusResult.success && statusResult.data) {
          const payload =
            typeof statusResult.data === 'object' ? statusResult.data : {};
          const state = normaliseSynthesisStatus(payload.status);
          const errored =
            state === 'error' ||
            (payload.ready === false && payload.successful === false);
          metadataRef.remoteVoiceId =
            metadataRef.remoteVoiceId ?? toStringOrNull(payload.voice_id);
          if (state === 'ready') {
            const readyEvent = {
              category: 'voice_generation',
              phase: 'polling',
              status: 'ready',
              progress: 1,
              audioUrl: toStringOrNull(payload.url),
              audioId: String(payload.id ?? audioId),
              metadata: {
                ...metadataRef,
                durationSeconds:
                  payload.duration_seconds ?? payload.durationSeconds ?? null,
                fileSizeBytes:
                  payload.file_size_bytes ?? payload.fileSizeBytes ?? null
              }
            };
            statusCallback?.(readyEvent);
            reportTelemetry(readyEvent);
            return {
              success: true,
              ready: true,
              audioUrl: toStringOrNull(payload.url),
              audioId: String(payload.id ?? audioId)
            };
          }

          if (errored) {
            const errorEvent = {
              category: 'voice_generation',
              phase: 'polling',
              status: state || 'error',
              progress: null,
              error:
                toStringOrNull(payload.error) ||
                'Audio synthesis failed on the server',
              metadata: {
                ...metadataRef,
                state
              }
            };
            statusCallback?.(errorEvent);
            reportTelemetry(errorEvent);
            return {
              success: false,
              error: errorEvent.error,
              code: 'GENERATION_FAILED',
              status: state || 'error'
            };
          }
        }
      }

      const checkResult = await checkAudioExists(voiceId, storyId);
      if (checkResult.success && checkResult.exists) {
        const headReadyEvent = {
          category: 'voice_generation',
          phase: 'polling',
          status: 'ready',
          progress: 1,
          audioUrl: buildAudioRedirectUrl(voiceId, storyId),
          metadata: metadataRef
        };
        statusCallback?.(headReadyEvent);
        reportTelemetry(headReadyEvent);
        return {
          success: true,
          ready: true,
          audioUrl: buildAudioRedirectUrl(voiceId, storyId),
          fromCache: checkResult.fromCache,
          localUri: checkResult.localUri || null
        };
      }
    } catch (error) {
      console.warn(`Audio polling attempt ${attempts + 1} failed:`, error);
    }

    await delay(intervalMs);
    attempts += 1;
  }

  return {
    success: true,
    ready: false
  };
};

// AUDIO FILE MANAGEMENT

/**
 * Stores information about downloaded audio
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @param {string} localUri - Local file URI
 */
const storeAudioInfo = async (voiceId, storyId, localUri) => {
  try {
    const fileInfo = await getFileInfoSafe(localUri);
    if (!isAudioFileValid(fileInfo)) {
      await deleteFileQuietly(localUri);
      await removeAudioReference(voiceId, storyId);
      return {
        success: false,
        error: 'Invalid audio file detected while storing metadata'
      };
    }

    // Get existing audio info
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    const audioInfo = infoString ? JSON.parse(infoString) : {};
    
    // Update with new info
    if (!audioInfo[voiceId]) audioInfo[voiceId] = {};
    
    audioInfo[voiceId][storyId] = {
      localUri,
      timestamp: Date.now()
    };
    
    // Save updated info
    await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_AUDIO, JSON.stringify(audioInfo));
    
    return { success: true };
  } catch (error) {
    console.error('Failed to store audio info:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Gets information about stored audio
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @returns {Promise<Object|null>} Audio info or null if not found
 */
const getPlaybackProgressStore = async () => {
  try {
    const raw = await AsyncStorage.getItem(PLAYBACK_PROGRESS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Failed to read playback progress store', error);
    return {};
  }
};

const writePlaybackProgressStore = async (store) => {
  try {
    await AsyncStorage.setItem(PLAYBACK_PROGRESS_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.warn('Failed to persist playback progress store', error);
    return false;
  }
};

export const getPlaybackProgress = async (voiceId, storyId) => {
  if (!voiceId || storyId === undefined || storyId === null) {
    return null;
  }

  const store = await getPlaybackProgressStore();
  const voiceBucket = store?.[voiceId];
  if (!voiceBucket) {
    return null;
  }
  const entry = voiceBucket?.[storyId];
  return entry && typeof entry === 'object' ? entry : null;
};

export const savePlaybackProgress = async (voiceId, storyId, progress = {}) => {
  if (!voiceId || storyId === undefined || storyId === null) {
    return { success: false, error: 'voiceId and storyId are required' };
  }

  const position = Number(progress.position);
  if (!Number.isFinite(position) || position < 0) {
    return { success: false, error: 'Invalid playback position' };
  }

  const duration = progress.duration !== undefined ? Number(progress.duration) : null;
  const entry = {
    position,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    updatedAt: progress.updatedAt || Date.now(),
    sourceUri: typeof progress.sourceUri === 'string' ? progress.sourceUri : null
  };

  const store = await getPlaybackProgressStore();
  if (!store[voiceId]) {
    store[voiceId] = {};
  }
  store[voiceId][storyId] = entry;

  const success = await writePlaybackProgressStore(store);
  return { success };
};

export const clearPlaybackProgress = async (voiceId, storyId) => {
  if (!voiceId) {
    return { success: false, error: 'voiceId is required' };
  }

  const store = await getPlaybackProgressStore();
  const voiceBucket = store?.[voiceId];
  if (!voiceBucket) {
    return { success: true };
  }

  if (storyId !== undefined && storyId !== null) {
    delete voiceBucket[storyId];
  } else {
    delete store[voiceId];
  }

  if (Object.keys(voiceBucket).length === 0 || storyId === undefined || storyId === null) {
    delete store[voiceId];
  }

  const success = await writePlaybackProgressStore(store);
  return { success };
};

const clearPlaybackProgressForVoice = async (voiceId) => {
  if (!voiceId) {
    return;
  }

  await clearPlaybackProgress(voiceId);
};

const getStoredAudioInfo = async (voiceId, storyId) => {
  try {
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    if (!infoString) return null;
    
    const audioInfo = JSON.parse(infoString);
    const storedInfo = audioInfo[voiceId]?.[storyId] || null;
    
    // Add file existence verification
    if (storedInfo && storedInfo.localUri) {
      // Verify the file still exists
      const fileInfo = await getFileInfoSafe(storedInfo.localUri);
      if (!isAudioFileValid(fileInfo)) {
        console.log(
          `Invalid cached audio detected for story ${storyId}. Removing reference.`
        );
        await deleteFileQuietly(storedInfo.localUri);
        await removeAudioReference(voiceId, storyId);
        return null;
      }
    }
    
    return storedInfo;
  } catch (error) {
    console.error('Failed to get audio info:', error);
    return null;
  }
};

/**
 * Removes reference to an audio file
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 */
const removeAudioReference = async (voiceId, storyId) => {
  try {
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    if (!infoString) return;
    
    const audioInfo = JSON.parse(infoString);
    if (!audioInfo[voiceId]) return;
    
    // Remove reference to the deleted file
    if (audioInfo[voiceId][storyId]) {
      delete audioInfo[voiceId][storyId];
    }
    
    // Clean up empty objects if needed
    if (Object.keys(audioInfo[voiceId]).length === 0) {
      delete audioInfo[voiceId];
    }
    
    // Save updated info
    await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_AUDIO, JSON.stringify(audioInfo));
  } catch (error) {
    console.error('Failed to remove audio reference:', error);
  }
};

/**
 * Gets all stored audio info for a voice
 * @param {string} voiceId - Voice ID 
 * @returns {Promise<Object>} Map of story IDs to audio info
 */
export const getStoredAudioForVoice = async (voiceId) => {
  try {
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    if (!infoString) return {};
    
    const audioInfo = JSON.parse(infoString);
    const voiceAudioInfo = audioInfo[voiceId] || {};
    
    // Validate that all files still exist
    const validatedInfo = {};
    for (const storyId in voiceAudioInfo) {
      const info = voiceAudioInfo[storyId];
      if (info && info.localUri) {
        // Check if file exists
        const fileInfo = await getFileInfoSafe(info.localUri);
        if (isAudioFileValid(fileInfo)) {
          validatedInfo[storyId] = info;
        } else {
          await deleteFileQuietly(info.localUri);
          await removeAudioReference(voiceId, storyId);
        }
      }
    }
    
    return validatedInfo;
  } catch (error) {
    console.error('Failed to get stored audio for voice:', error);
    return {};
  }
};

/**
 * Marks stories with local audio availability
 * @param {string} voiceId - Voice ID
 * @param {Array} stories - Stories array
 * @returns {Promise<Array>} Stories with hasLocalAudio flag
 */
export const markStoriesWithLocalAudio = async (voiceId, stories) => {
  try {
    const voiceAudio = await getStoredAudioForVoice(voiceId);
    
    return stories.map(story => {
      const storyId = story.id;
      const audioInfo = voiceAudio[storyId];
      
      return {
        ...story,
        hasLocalAudio: !!audioInfo,
        localAudioUri: audioInfo?.localUri
      };
    });
  } catch (error) {
    console.error('Failed to mark stories with local audio:', error);
    return stories;
  }
};

/**
 * Clears stored audio for a specific voice
 * @param {string} voiceId - Voice ID
 */
const clearVoiceAudio = async (voiceId) => {
  try {
    // Get existing audio info
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    if (!infoString) return { success: true };
    
    const audioInfo = JSON.parse(infoString);
    
    // If no audio for this voice, nothing to do
    if (!audioInfo[voiceId]) return { success: true };
    
    // Delete each audio file
    for (const storyId in audioInfo[voiceId]) {
      const fileInfo = audioInfo[voiceId][storyId];
      if (fileInfo && fileInfo.localUri) {
        await deleteFileQuietly(fileInfo.localUri);
      }
    }
    
    // Remove voice entry from audio info
    delete audioInfo[voiceId];
    
    // Save updated info
    await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_AUDIO, JSON.stringify(audioInfo));

    await clearPlaybackProgressForVoice(voiceId);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to clear voice audio:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Downloads an audio file with progress tracking
 * @param {string} url - URL to download from
 * @param {string} voiceId - Voice ID (for storage)
 * @param {string} storyId - Story ID (for storage)
 * @param {Function} progressCallback - Optional callback for download progress
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Object>} Result with local URI or error
 */
export const downloadAudio = async (
  url,
  voiceId,
  storyId,
  progressCallback = null,
  signal = null,
  retryCount = 0
) => {
  let downloadResumable;
  const attemptNumber = retryCount + 1;
  const describeUrl = () => {
    try {
      const parsed = new URL(url);
      return {
        full: parsed.href,
        origin: parsed.origin,
        path: parsed.pathname
      };
    } catch (error) {
      return {
        full: url,
        origin: null,
        path: null
      };
    }
  };
  const isApiOrigin = () => {
    try {
      const parsedUrl = new URL(url);
      const apiOrigin = new URL(API_BASE_URL);
      return parsedUrl.origin === apiOrigin.origin;
    } catch (error) {
      return false;
    }
  };
  try {
    // Check if already downloaded
    const existingInfo = await getStoredAudioInfo(voiceId, storyId);
    if (existingInfo && existingInfo.localUri) {
      const fileInfo = await getFileInfoSafe(existingInfo.localUri);
      if (isAudioFileValid(fileInfo)) {
        try {
          await clearGenerationStateSnapshot(voiceId, storyId);
        } catch (clearError) {
          console.warn(
            'Failed to clear generation snapshot after returning cached audio',
            clearError
          );
        }
        const cacheEvent = {
          category: 'voice_generation',
          phase: 'cache',
          status: 'ready',
          progress: 1,
          fromCache: true,
          metadata: { voiceId, storyId }
        };
        progressCallback?.(cacheEvent);
        reportTelemetry(cacheEvent);
        return {
          success: true,
          uri: existingInfo.localUri,
          fromCache: true
        };
      } else {
        await deleteFileQuietly(existingInfo.localUri);
        await removeAudioReference(voiceId, storyId);
      }
    }
  
    // Check if online
    const online = await isOnline();
    if (!online) {
      return {
        success: false,
        error: 'Cannot download audio without internet connection',
        code: 'OFFLINE'
      };
    }

    // Generate unique filename
    const fileName = `voice-${voiceId}-story-${storyId}-${Date.now()}.mp3`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    
    // Get authentication token if available
    const token = await authService.getAccessToken();
    const includeAuthHeader = token && isApiOrigin();
    const options = includeAuthHeader
      ? {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      : {};

    downloadResumable = FileSystem.createDownloadResumable(
      url,
      fileUri,
      options,
      (downloadProgress) => {
        if (!progressCallback && !voiceGenerationTelemetryHandler) {
          return;
        }
        const ratio =
          downloadProgress.totalBytesExpectedToWrite > 0
            ? downloadProgress.totalBytesWritten /
              downloadProgress.totalBytesExpectedToWrite
            : 0;
        const normalised = 0.5 + ratio * 0.5;
        const downloadEvent = {
          category: 'voice_generation',
          phase: 'download',
          status: 'downloading',
          progress: Math.min(normalised, 0.99),
          downloadProgress: ratio,
          bytesWritten: downloadProgress.totalBytesWritten,
          bytesTotal: downloadProgress.totalBytesExpectedToWrite,
          metadata: { voiceId, storyId }
        };
        progressCallback?.(downloadEvent);
        reportTelemetry(downloadEvent);
      }
    );
    
    // Add abort handler if signal provided
    if (signal) {
      signal.addEventListener('abort', () => {
        downloadResumable.cancelAsync();
      });
    }
    
    // Start download
    const { uri, status, headers } = await downloadResumable.downloadAsync();
    const headerSnapshot =
      headers && typeof headers.forEach === 'function'
        ? headersToObject(headers)
        : Object.keys(headers || {}).reduce((acc, key) => {
            acc[String(key).toLowerCase()] = headers[key];
            return acc;
          }, {});
    const contentType = (headerSnapshot['content-type'] || '').toLowerCase();
    const contentLengthHeader = headerSnapshot['content-length'];
    const expectedSize = contentLengthHeader ? Number(contentLengthHeader) : null;

    const downloadedFileInfo = await getFileInfoSafe(uri);
    const hasValidSize = isAudioFileValid(downloadedFileInfo);
    const fileSize = typeof downloadedFileInfo.size === 'number' ? downloadedFileInfo.size : 0;
    const isAudioMime = contentType.startsWith('audio/');
    const looksLikePlaceholder =
      !isAudioMime &&
      fileSize <= MIN_VALID_AUDIO_SIZE_BYTES &&
      (expectedSize === null || expectedSize <= MIN_VALID_AUDIO_SIZE_BYTES);

    if (!hasValidSize || looksLikePlaceholder) {
      let nonAudioPreview = null;
      if (fileSize > 0 && fileSize <= MAX_LOGGED_BODY_CHARS * 2) {
        try {
          nonAudioPreview = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.UTF8
          });
          if (nonAudioPreview && nonAudioPreview.length > MAX_LOGGED_BODY_CHARS) {
            nonAudioPreview = `${nonAudioPreview.slice(0, MAX_LOGGED_BODY_CHARS)}…`;
          }
        } catch (previewError) {
          nonAudioPreview = `<<failed to read response body: ${previewError?.message || 'unknown'}>>`;
        }
      }

      await deleteFileQuietly(uri);
      await removeAudioReference(voiceId, storyId);
      console.warn('[downloadAudio] received non-audio payload', {
        attempt: attemptNumber,
        voiceId,
        storyId,
        status,
        headers: headerSnapshot,
        fileSize,
        looksLikePlaceholder,
        preview: nonAudioPreview
      });
      if (retryCount < MAX_AUDIO_DOWNLOAD_ATTEMPTS - 1) {
        const waitMs = computeDownloadRetryDelay(retryCount);
        console.warn(
          `Audio download not ready yet (status: ${status || 'unknown'}, type: ${contentType || 'unknown'}, size: ${fileSize}). Retrying in ${waitMs}ms (attempt ${retryCount + 2}/${MAX_AUDIO_DOWNLOAD_ATTEMPTS}).`
        );
        await delay(waitMs);
        return downloadAudio(
          url,
          voiceId,
          storyId,
          progressCallback,
          signal,
          retryCount + 1
        );
      }

      return {
        success: false,
        error: 'Pobrany plik audio jest uszkodzony. Spróbuj ponownie.',
        code: 'INVALID_AUDIO'
      };
    }
    
    // Store audio info for future reference
    await storeAudioInfo(voiceId, storyId, uri);

    try {
      await clearGenerationStateSnapshot(voiceId, storyId);
    } catch (clearError) {
      console.warn(
        'Failed to clear generation snapshot after successful download',
        clearError
      );
    }

    const downloadCompleteEvent = {
      category: 'voice_generation',
      phase: 'download',
      status: 'ready',
      progress: 1,
      metadata: {
        voiceId,
        storyId,
        fileSize: downloadedFileInfo.size ?? null
      }
    };
    progressCallback?.(downloadCompleteEvent);
    reportTelemetry(downloadCompleteEvent);

    return {
      success: true,
      uri,
      fromCache: false
    };
  } catch (error) {
    console.error('Download error:', error);
    if (downloadResumable?.fileUri) {
      await deleteFileQuietly(downloadResumable.fileUri);
    }

    // Handle AbortError specifically
    if (error.name === 'AbortError') {
      const cancelEvent = {
        category: 'voice_generation',
        phase: 'download',
        status: 'error',
        progress: null,
        error: 'Download cancelled',
        code: 'DOWNLOAD_CANCELLED',
        metadata: { voiceId, storyId }
      };
      progressCallback?.(cancelEvent);
      reportTelemetry(cancelEvent);
      return {
        success: false,
        error: 'Download cancelled',
        code: 'DOWNLOAD_CANCELLED'
      };
    }

    const status = extractHttpStatus(error);
    if (canRetryDownload(retryCount, status)) {
      const waitMs = computeDownloadRetryDelay(retryCount);
      console.warn('[downloadAudio] retrying after failure', {
        attempt: attemptNumber,
        voiceId,
        storyId,
        status,
        waitMs
      });
      await delay(waitMs);
      return downloadAudio(
        url,
        voiceId,
        storyId,
        progressCallback,
        signal,
        retryCount + 1
      );
    }

    const downloadErrorEvent = {
      category: 'voice_generation',
      phase: 'download',
      status: 'error',
      progress: null,
      error: error.message || 'Unknown error during download',
      code: 'DOWNLOAD_ERROR',
      metadata: {
        voiceId,
        storyId,
        statusCode: status ?? null
      }
    };
    progressCallback?.(downloadErrorEvent);
    reportTelemetry(downloadErrorEvent);

    return {
      success: false,
      error: error.message || 'Unknown error during download',
      code: 'DOWNLOAD_ERROR'
    };
  }
};

/**
 * Gets an audio file, downloading if necessary
 * @param {string} voiceId - Voice ID
 * @param {string} storyId - Story ID
 * @param {Function} progressCallback - Optional callback for download progress
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @param {boolean} forceDownload - Whether to force a fresh download
 * @returns {Promise<Object>} Result with local URI or error
 */
export const getAudio = async (
  voiceId, 
  storyId, 
  progressCallback = null, 
  signal = null,
  forceDownload = false  // Add forceDownload parameter
) => {
  // Skip the local check if force download is requested
  if (!forceDownload) {
    // Check if audio exists locally first
    const audioInfo = await getStoredAudioInfo(voiceId, storyId);
    if (audioInfo && audioInfo.localUri) {
      const fileInfo = await getFileInfoSafe(audioInfo.localUri);
      if (isAudioFileValid(fileInfo)) {
        const cacheEvent = {
          category: 'voice_generation',
          phase: 'cache',
          status: 'ready',
          progress: 1,
          storyId,
          voiceId,
          metadata: {
            localUri: audioInfo.localUri
          }
        };
        progressCallback?.(cacheEvent);
        reportTelemetry(cacheEvent);
        return {
          success: true,
          uri: audioInfo.localUri,
          fromCache: true
        };
      } else {
        await deleteFileQuietly(audioInfo.localUri);
        await removeAudioReference(voiceId, storyId);
      }
    }
  }

  // Check if online
  const online = await isOnline();
  if (!online) {
    return {
      success: false,
      error: 'Cannot retrieve audio without internet connection',
      code: 'OFFLINE'
    };
  }
  
  // Check if audio exists on server
  const checkResult = await checkAudioExists(voiceId, storyId);
  
  // If audio exists on server, download it
  if (checkResult.success && checkResult.exists) {
    // URL for downloading the audio with redirect
    const audioUrl = `${API_BASE_URL}/voices/${voiceId}/stories/${storyId}/audio?redirect=true`;
    
    // Download existing audio from server
    return downloadAudio(
      audioUrl,
      voiceId,
      storyId,
      progressCallback
        ? (event) =>
            progressCallback({
              ...event,
              storyId,
              voiceId
            })
        : null,
      signal
    );
  }
  
  // If audio doesn't exist, try to generate it
  const generateResult = await generateStoryAudio(
    voiceId, 
    storyId, 
    progressCallback
      ? (event) =>
          progressCallback({
            ...event,
            storyId,
            voiceId
          })
      : null
  );
  
  if (!generateResult.success) {
    const generationErrorEvent = {
      category: 'voice_generation',
      phase: 'generation',
      status: 'error',
      progress: null,
      error: generateResult.error,
      code: generateResult.code,
      storyId,
      voiceId
    };
    progressCallback?.(generationErrorEvent);
    reportTelemetry(generationErrorEvent);
    return generateResult;
  }
  
  // Download the generated audio
  return downloadAudio(
    generateResult.audioUrl, 
    voiceId, 
    storyId, 
    progressCallback
      ? (event) =>
          progressCallback({
            ...event,
            storyId,
            voiceId
          })
      : null,
    signal
  );
};

/**
 * Gets the URL for a story cover image
 * @param {string|number} storyId - Story ID
 * @returns {string} Cover image URL
 */
export const getStoryCoverUrl = (storyId) => {
  return `${API_BASE_URL}/stories/${storyId}/cover`;
};

/**
 * Clones a voice from an audio sample
 * @param {string} audioUri - URI to the audio file
 * @param {Function} progressCallback - Optional callback for upload progress
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Object>} Result with voice ID or error
 */
export const cloneVoice = async (audioUri, progressCallback = null, signal = null) => {
  try {
    // First, check if we have an internet connection
    const online = await isOnline();
    if (!online) {
      return {
        success: false,
        error: 'Nie można sklonować głosu bez połączenia z internetem. Połącz się z internetem i spróbuj ponownie.',
        code: 'OFFLINE'
      };
    }

    // Get authentication token
    const token = await authService.getAccessToken();
    if (!token) {
      return {
        success: false,
        error: 'Brak autoryzacji. Zaloguj się ponownie.',
        code: 'AUTH_ERROR'
      };
    }

    const formData = await createFormData(audioUri);
    
    // Create a unique identifier for this upload
    const uploadId = `voice_upload_${Date.now()}`;
    const uploadUrl = `${API_BASE_URL}/voices`;
    
    // Set up upload with progress tracking
    const emitProgressEvent = (event) => {
      if (!progressCallback) {
        return;
      }
      const payload = {
        phase: 'voice_allocation',
        ...event
      };
      progressCallback(payload);
      reportTelemetry({ category: 'voice_cloning', ...payload });
    };

    const uploadOptions = {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/wav',
      parameters: {},
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    if (progressCallback) {
      uploadOptions.progressInterval = 100;
      uploadOptions.progressCallback = ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const ratio =
          totalBytesExpectedToWrite > 0
            ? totalBytesWritten / totalBytesExpectedToWrite
            : 0;
        const progress = Math.min(ratio * 0.2, 0.2); // cap upload portion at 20%
        emitProgressEvent({
          phase: 'voice_upload',
          statusKey: 'uploading',
          message: 'Wysyłanie nagrania...',
          progress
        });
      };
    }
    
    // Upload file using Expo's FileSystem
    const performUpload = async () => FileSystem.uploadAsync(
      uploadUrl,
      audioUri,
      uploadOptions
    );

    let uploadResult = await performUpload();

    if (uploadResult.status === 401) {
      console.warn('Voice upload unauthorized, attempting token refresh');
      const refreshed = await authService.refreshToken();
      if (!refreshed) {
        await authService.logout();
        return {
          success: false,
          error: 'Twoja sesja wygasła. Zaloguj się ponownie.',
          code: 'AUTH_EXPIRED'
        };
      }
      const refreshedToken = await authService.getAccessToken();
      uploadOptions.headers.Authorization = `Bearer ${refreshedToken}`;
      uploadResult = await performUpload();
      if (uploadResult.status === 401) {
        await authService.logout();
        return {
          success: false,
          error: 'Twoja sesja wygasła. Zaloguj się ponownie.',
          code: 'AUTH_EXPIRED'
        };
      }
    }
    
    if (uploadResult.status !== 200 && uploadResult.status !== 201 && uploadResult.status !== 202) {
      throw new Error(uploadResult.body || 'Upload failed');
    }
    
    // Parse response
    let responseData = {};
    try {
      responseData = uploadResult.body ? JSON.parse(uploadResult.body) : {};
    } catch (parseError) {
      console.warn('Failed to parse voice upload response', parseError);
      return {
        success: false,
        error: 'Invalid response from server during voice upload',
        code: 'INVALID_RESPONSE'
      };
    }

    if (responseData?.success === false) {
      return {
        success: false,
        error:
          responseData.error ||
          responseData.message ||
          'Voice upload failed',
        code: 'CLONE_ERROR'
      };
    }
    
    // Check if we received a voice ID (database ID) - needed for polling
    if (!responseData.id) {
      return {
        success: false,
        error: 'No voice ID received from server',
        code: 'INVALID_RESPONSE'
      };
    }

    emitProgressEvent({
      statusKey: responseData.allocation_status || responseData.status || 'recorded',
      message:
        responseData.message ||
        'Nagranie odebrane. Przygotowujemy Twój głos...',
      progress: 0.25,
      queuePosition: responseData.queue_position ?? null,
      queueLength: responseData.queue_length ?? null
    });
    
    // Start polling for voice completion
    const pollResult = await pollForVoiceCompletion(
      responseData.id,
      {
        taskId: responseData.task_id || null,
        statusCallback: emitProgressEvent
      }
    );
    
    // If polling was successful, store the voice ID
    if (pollResult.success && pollResult.voiceId) {
      await setCurrentVoice(pollResult.voiceId);
      emitProgressEvent({
        statusKey: 'ready',
        message: 'Twój głos jest gotowy!',
        progress: 1
      });
      return {
        success: true,
        voiceId: pollResult.voiceId,
        name: pollResult.name || responseData.name || null
      };
    }

    if (pollResult.success && !pollResult.voiceId) {
      return {
        success: false,
        error: 'Voice allocation completed without remote identifier',
        code: 'INVALID_RESPONSE'
      };
    }

    // If polling failed, return the error
    return pollResult;
  } catch (error) {
    console.error('Voice cloning error:', error);
    
    // Check if it's a network error
    if (!await isOnline()) {
      return {
        success: false,
        error: 'Utracono połączenie internetowe podczas klonowania głosu. Połącz się z internetem i spróbuj ponownie.',
        code: 'OFFLINE'
      };
    }
    
    return {
      success: false,
      error: error.message || 'Unknown error during voice cloning',
      code: 'CLONE_ERROR'
    };
  }
};

/**
 * Verifies if the user has a valid voice on the server
 * @returns {Promise<Object>} Result with voice ID if available and valid
 */
export const verifyVoiceExists = async () => {
  try {
    // First check if we have a voice ID stored locally
    const voiceId = await AsyncStorage.getItem(STORAGE_KEYS.VOICE_ID);
    
    // Check if we're online
    const online = await isOnline();
    if (!online) {
      // If offline, rely on local storage
      return { 
        success: true, 
        exists: !!voiceId,
        voiceId,
        verified: false, // Flag indicating we couldn't verify with server
        message: 'Offline - using cached voice ID'
      };
    }
    
    // If online, verify voice with server by fetching user's voices
    const result = await apiRequest('/voices');
    
    if (!result.success) {
      console.log('Failed to verify voice with server:', result.error);
      // If API call failed but we have a local voice ID, return it with a warning
      return {
        success: true,
        exists: !!voiceId,
        voiceId,
        verified: false,
        message: 'Failed to verify with server, using cached voice ID'
      };
    }
    
    // Check the voices from server
    const voices = result.data || [];
    
    // If we have no voices on server
    if (voices.length === 0) {
      // Clear any existing voice ID in storage
      if (voiceId) {
        await AsyncStorage.removeItem(STORAGE_KEYS.VOICE_ID);
      }
      
      return {
        success: true,
        exists: false,
        message: 'No voices found on server'
      };
    }
    
    // If we have voices on server but no local voice ID, 
    // store the first voice ID
    if (!voiceId && voices.length > 0) {
      // Get the first voice ID (either direct ID or elevenlabs_voice_id)
      const firstVoiceId = voices[0].elevenlabs_voice_id || voices[0].id;
      
      // Store it locally
      await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, String(firstVoiceId));
      
      return {
        success: true,
        exists: true,
        voiceId: firstVoiceId,
        verified: true,
        message: 'Found voice on server, stored in local storage'
      };
    }
    
    // If we have both local ID and server voices, check if local ID exists on server
    if (voiceId) {
      const voiceExists = voices.some(voice => 
        voice.id === voiceId || voice.elevenlabs_voice_id === voiceId
      );
      
      if (voiceExists) {
        return {
          success: true,
          exists: true,
          voiceId,
          verified: true,
          message: 'Voice verified with server'
        };
      } else {
        // Voice doesn't exist on server, replace with first server voice
        const firstVoiceId = voices[0].elevenlabs_voice_id || voices[0].id;
        
        // Update local storage
        await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, String(firstVoiceId));
        
        return {
          success: true,
          exists: true,
          voiceId: firstVoiceId,
          verified: true,
          message: 'Local voice ID not found on server, updated with server voice'
        };
      }
    }
    
    // This shouldn't be reached, but handle just in case
    return {
      success: true,
      exists: voices.length > 0,
      voiceId: voices.length > 0 ? (voices[0].elevenlabs_voice_id || voices[0].id) : null,
      verified: true,
      message: 'Voice verification completed'
    };
  } catch (error) {
    console.error('Error verifying voice:', error);
    
    // Get local voice ID as fallback
    try {
      const voiceId = await AsyncStorage.getItem(STORAGE_KEYS.VOICE_ID);
      
      return {
        success: false,
        exists: !!voiceId,
        voiceId,
        error: error.message,
        code: 'VERIFICATION_ERROR',
        message: 'Error verifying voice, using cached data as fallback'
      };
    } catch (storageError) {
      return {
        success: false,
        exists: false,
        error: error.message,
        code: 'VERIFICATION_ERROR',
        message: 'Error verifying voice and accessing local storage'
      };
    }
  }
};

/**
 * Deletes a cloned voice
 * @param {string} voiceId - ID of the voice to delete
 * @returns {Promise<Object>} Success or error result
 */
export const deleteVoice = async (voiceId) => {
  // If no voiceId provided, try to get current one
  if (!voiceId) {
    const current = await getCurrentVoice();
    if (!current.success || !current.voiceId) {
      return {
        success: false,
        error: 'No voice ID specified or stored',
        code: 'MISSING_VOICE_ID'
      };
    }
    voiceId = current.voiceId;
  }
  
  // Check if we're online
  const online = await isOnline();
  
  // Regardless of online status, always clean up local files
  try {
    // Clean up locally downloaded audio files for this voice
    await clearVoiceAudio(voiceId);
  } catch (error) {
    console.error('Error clearing local voice audio:', error);
    // Continue with other operations - this is not critical
  }
  
  // Clear the voice ID from storage
  await AsyncStorage.removeItem(STORAGE_KEYS.VOICE_ID);
  
  // If offline, queue the delete operation for later
  if (!online) {
    try {
      // Queue the delete operation with updated endpoint
      await queueOperationIfOffline(`/voices/${voiceId}`, {
        method: 'DELETE'
      });
      
      return {
        success: true,
        message: 'Voice deleted locally. Server deletion will be performed when back online.',
        code: 'OFFLINE_QUEUED'
      };
    } catch (queueError) {
      console.error('Error queueing voice deletion:', queueError);
      // Still return success since local cleanup was done
      return {
        success: true,
        message: 'Voice deleted locally. Server deletion may fail.',
        code: 'OFFLINE_PARTIAL'
      };
    }
  }
  
  // If online, delete from server using updated endpoint
  try {
    const result = await apiRequest(`/voices/${voiceId}`, {
      method: 'DELETE'
    });
    
    return result.success ? 
      { 
        success: true, 
        message: 'Voice deleted successfully' 
      } : 
      {
        success: false,
        error: result.error || 'Failed to delete voice from server',
        code: result.code || 'DELETE_ERROR'
      };
  } catch (error) {
    console.error('Error deleting voice from server:', error);
    
    // We've already done local cleanup, so this is a partial success
    return {
      success: true,
      message: 'Voice deleted locally but server deletion failed',
      error: error.message,
      code: 'SERVER_DELETE_FAILED'
    };
  }
};

/**
 * Polls for voice cloning completion
 * @param {string} voiceId - Database ID of the voice
 * @param {Function} statusCallback - Optional callback for status updates
 * @returns {Promise<boolean>} Whether voice cloning completed successfully
 */
const VOICE_ALLOCATION_STATUS_COPY = {
  recorded: 'Nagranie odebrane. Przygotowujemy Twój głos... ',
  processing: 'Analizujemy próbkę głosu...',
  allocating: 'Aktywujemy Twój głos w tle...',
  ready: 'Twój głos jest gotowy!',
  error: 'Nie udało się przygotować głosu.'
};

const VOICE_ALLOCATION_PROGRESS = {
  recorded: 0.25,
  processing: 0.45,
  allocating: 0.65,
  ready: 1,
  error: 1
};

const pollForVoiceCompletion = async (
  voiceId,
  { taskId = null, statusCallback = null } = {}
) => {
  let attempts = 0;
  const maxAttempts = 36;
  const poll = async () => {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : '';
    return apiRequest(`/voices/${voiceId}/status${query}`, {
      method: 'GET'
    });
  };

  while (attempts < maxAttempts) {
    if (attempts > 0) {
      await delay(processingPollIntervalMs);
    }

    try {
      const result = await poll();

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Voice status polling failed',
          code: result.code || 'STATUS_POLL_FAILED'
        };
      }

      const payload = result.data || {};
      const statusKey =
        normaliseSynthesisStatus(payload.allocation_status) ||
        normaliseSynthesisStatus(payload.status) ||
        'recorded';
      const message =
        payload.message || VOICE_ALLOCATION_STATUS_COPY[statusKey] ||
        'Przygotowujemy Twój głos...';
      const queuePosition =
        payload.queue_position !== undefined ? payload.queue_position : null;
      const queueLength =
        payload.queue_length !== undefined ? payload.queue_length : null;
      const progress = VOICE_ALLOCATION_PROGRESS[statusKey] ?? 0.5;

      const event = {
        phase: 'voice_allocation',
        statusKey,
        message,
        progress,
        queuePosition,
        queueLength
      };
      statusCallback?.(event);
      reportTelemetry({ category: 'voice_cloning', ...event });

      if (payload.success === false || statusKey === 'error') {
        return {
          success: false,
          error:
            payload.error ||
            payload.message ||
            'Voice allocation failed. Spróbuj ponownie.',
          code: 'CLONE_ERROR'
        };
      }

      if (statusKey === 'ready') {
        return {
          success: true,
          voiceId: payload.elevenlabs_voice_id || payload.voice_id || null,
          name: payload.name || null
        };
      }
    } catch (error) {
      console.warn(`Voice status poll attempt ${attempts + 1} failed:`, error);
    }

    attempts++;
  }

  return {
    success: false,
    error: 'Voice allocation timed out. Spróbuj ponownie.',
    code: 'CLONE_TIMEOUT'
  };
};

// Export default object with all functions
export default {
  cloneVoice,
  verifyVoiceExists,
  deleteVoice,
  getStories,
  generateStoryAudio,
  downloadAudio,
  getCurrentVoice,
  setCurrentVoice,
  checkAudioExists,
  getAudio,
  processOfflineQueue,
  getStoryCoverUrl,
  getStoredAudioForVoice,
  markStoriesWithLocalAudio,
  saveGenerationStateSnapshot,
  loadGenerationStateSnapshot,
  listGenerationStateSnapshots,
  clearGenerationStateSnapshot,
  purgeExpiredGenerationStateSnapshots,
  setVoiceGenerationTelemetryHandler,
  getPlaybackProgress,
  savePlaybackProgress,
  clearPlaybackProgress,
  isOnline
};
