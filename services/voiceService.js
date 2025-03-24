// Enhanced voiceService.js aligned with the API documentation
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from './authService';

// CONFIGURATION
// Environment-based URL selection
const ENV = {
  DEV: 'http://Szymons-MacBook-Pro-2:8000',
  STAGING: 'https://staging-story-voice.herokuapp.com',
  PROD: 'https://api.dawnotemu.app'
};

// Use environment variable or default to production
const API_BASE_URL = ENV.DEV;

// STORAGE KEYS
const STORAGE_KEYS = {
  VOICE_ID: 'voice_id',
  PENDING_OPERATIONS: 'voice_service_pending_ops',
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio',
  CACHED_STORIES: 'voice_service_cached_stories',
  LAST_STORIES_FETCH: 'voice_service_last_stories_fetch'
};

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

// Cache expiration time (24 hours in milliseconds)
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; 

// HELPER FUNCTIONS
/**
 * Creates FormData from an audio file with platform-specific handling
 * @param {string} audioUri - URI to the audio file
 * @param {string} fileName - Optional filename (default: 'audio.wav')
 * @returns {Promise<FormData>} FormData object ready for upload
 */
const createFormData = async (audioUri, fileName = 'audio.wav') => {
  const formData = new FormData();
  
  // Handle different URI formats between iOS and Android
  const fileUri = Platform.OS === 'android' 
    ? audioUri
    : audioUri.replace('file://', '');
  
  // Get file info to determine size
  const fileInfo = await FileSystem.getInfoAsync(audioUri);
  
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
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

/**
 * Performs an API request with timeout, cancellation support, and connection check
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @returns {Promise<Object>} Response data or error
 */
const apiRequest = async (endpoint, options = {}, signal = null) => {
  try {
    // Check for internet connection
    const online = await isOnline();
    if (!online) {
      throw new Error('NO_CONNECTION');
    }

    // Create AbortController if not provided
    const controller = signal ? null : new AbortController();
    const requestSignal = signal || controller?.signal;
    
    // Set timeout if controller exists
    const timeoutId = controller ? 
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

    // Clear timeout
    if (timeoutId) clearTimeout(timeoutId);
    
    // Handle different response statuses
    if (response.status === 204) {
      return { success: true };
    }
    
    // For 401 Unauthorized, try to refresh token
    if (response.status === 401) {
      const refreshed = await authService.refreshToken();
      if (refreshed) {
        // Retry the request with the new token
        return apiRequest(endpoint, options, signal);
      }
    }
    
    // For other responses, try to parse JSON
    const data = await response.json().catch(() => null);
    
    if (!response.ok) {
      throw new Error(
        data?.error || 
        data?.message || 
        `Request failed with status ${response.status}`
      );
    }
    
    return { success: true, data };
  } catch (error) {
    // Handle specific error cases
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        error: 'Request timed out or was cancelled',
        code: 'TIMEOUT'
      };
    }
    
    if (error.message === 'NO_CONNECTION') {
      // Queue operation for offline support if appropriate
      await queueOperationIfOffline(endpoint, options);
      
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

// VOICE MANAGEMENT

/**
 * Stores the current voice ID
 * @param {string} voiceId - Voice ID to store
 */
export const setCurrentVoice = async (voiceId) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, voiceId);
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

/**
 * Caches stories in AsyncStorage
 * @param {Array} stories - List of story objects
 */
const cacheStories = async (stories) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CACHED_STORIES, JSON.stringify(stories));
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
    return storiesString ? JSON.parse(storiesString) : [];
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
        // Cache the stories for offline use
        await cacheStories(result.data || []);
        
        return {
          success: true,
          stories: result.data || [],
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
export const checkAudioExists = async (voiceId, storyId) => {
  // First check local storage
  const audioInfo = await getStoredAudioInfo(voiceId, storyId);
  if (audioInfo && audioInfo.localUri) {
    // Verify file still exists
    const fileInfo = await FileSystem.getInfoAsync(audioInfo.localUri);
    if (fileInfo.exists) {
      return {
        success: true,
        exists: true,
        localUri: audioInfo.localUri,
        fromCache: true
      };
    }
  }

  // If we're online, check the server using the updated endpoint
  const online = await isOnline();
  if (online) {
    try {
      // Use HEAD request to check if audio exists
      const result = await apiRequest(`/voices/${voiceId}/stories/${storyId}/audio`, {
        method: 'HEAD'
      });
      
      // If we get a 200 response, the audio exists
      return {
        success: true,
        exists: result.success,
        fromCache: false
      };
    } catch (error) {
      console.error('Error checking audio exists on server:', error);
      // Fall through to return false
    }
  }
  
  // If we're here, we're either offline or the server check failed
  return {
    success: true,
    exists: false
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
  // Check if online
  const online = await isOnline();
  if (!online) {
    return {
      success: false,
      error: 'Cannot generate audio without internet connection',
      code: 'OFFLINE'
    };
  }

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
  
  try {
    // Start synthesis request using updated endpoint
    if (statusCallback) statusCallback('processing', 0.1);
    
    const result = await apiRequest(`/voices/${voiceId}/stories/${storyId}/audio`, {
      method: 'POST'
    });
    
    // Continue polling even if initial request timed out but likely started processing
    if (!result.success && result.code !== 'TIMEOUT') {
      return result;  // Only return for non-timeout errors
    }
    
    if (statusCallback) statusCallback('processing', 0.5);
        
    // Always attempt to poll, even after a timeout
    const isAvailable = await pollForAudioAvailability(voiceId, storyId, statusCallback);

    if (!isAvailable) {
      return {
        success: false,
        error: 'Audio generation timed out',
        code: 'GENERATION_TIMEOUT'
      };
    }
    
    if (statusCallback) statusCallback('complete', 1);
    
    // Return the URL for the generated audio
    return {
      success: true,
      audioUrl: `${API_BASE_URL}/voices/${voiceId}/stories/${storyId}/audio?redirect=true`,
    };
  } catch (error) {
    console.error('Error generating audio:', error);
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
const pollForAudioAvailability = async (voiceId, storyId, statusCallback = null) => {
  let attempts = 0;
  const maxAttempts = 24; // 2 minutes with 5-second intervals
  
  while (attempts < maxAttempts) {
    if (statusCallback) {
      const progress = 0.5 + (attempts / maxAttempts) * 0.3; // Progress from 50% to 80%
      statusCallback('processing', progress);
    }
    
    // Wait between polls
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const checkResult = await checkAudioExists(voiceId, storyId);
      if (checkResult.success && checkResult.exists) {
        return true;
      }
    } catch (error) {
      console.warn(`Poll attempt ${attempts + 1} failed:`, error.message);
    }
    
    attempts++;
  }
  
  return false;
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
const getStoredAudioInfo = async (voiceId, storyId) => {
  try {
    const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
    if (!infoString) return null;
    
    const audioInfo = JSON.parse(infoString);
    const storedInfo = audioInfo[voiceId]?.[storyId] || null;
    
    // Add file existence verification
    if (storedInfo && storedInfo.localUri) {
      // Verify the file still exists
      const fileInfo = await FileSystem.getInfoAsync(storedInfo.localUri);
      if (!fileInfo.exists) {
        // File no longer exists, remove reference from storage
        console.log(`File no longer exists: ${storedInfo.localUri}, removing reference`);
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
        const fileInfo = await FileSystem.getInfoAsync(info.localUri);
        if (fileInfo.exists) {
          validatedInfo[storyId] = info;
        } else {
          // Remove reference to non-existent file
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
        await FileSystem.deleteAsync(fileInfo.localUri, { idempotent: true });
      }
    }
    
    // Remove voice entry from audio info
    delete audioInfo[voiceId];
    
    // Save updated info
    await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_AUDIO, JSON.stringify(audioInfo));
    
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
export const downloadAudio = async (url, voiceId, storyId, progressCallback = null, signal = null, ) => {
  try {
    // Check if already downloaded
    const existingInfo = await getStoredAudioInfo(voiceId, storyId);
    if (existingInfo && existingInfo.localUri) {
      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(existingInfo.localUri);
      if (fileInfo.exists) {
        return {
          success: true,
          uri: existingInfo.localUri,
          fromCache: true
        };
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
    const options = token 
      ? { 
          headers: {
            'Authorization': `Bearer ${token}`
          }
        } 
      : {};

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      fileUri,
      options,
      (downloadProgress) => {
        if (progressCallback) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          progressCallback(progress);
        }
      }
    );
    
    // Add abort handler if signal provided
    if (signal) {
      signal.addEventListener('abort', () => {
        downloadResumable.cancelAsync();
      });
    }
    
    // Start download
    const { uri } = await downloadResumable.downloadAsync();
    
    // Store audio info for future reference
    await storeAudioInfo(voiceId, storyId, uri);
    
    return {
      success: true,
      uri,
      fromCache: false
    };
  } catch (error) {
    console.error('Download error:', error);
    
    // Handle AbortError specifically
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Download cancelled',
        code: 'DOWNLOAD_CANCELLED'
      };
    }
    
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
 * @returns {Promise<Object>} Result with local URI or error
 */
export const getAudio = async (voiceId, storyId, progressCallback = null, signal = null) => {
  // Check if audio exists locally first
  const audioInfo = await getStoredAudioInfo(voiceId, storyId);
  if (audioInfo && audioInfo.localUri) {
    // Verify file exists
    const fileInfo = await FileSystem.getInfoAsync(audioInfo.localUri);
    if (fileInfo.exists) {
      return {
        success: true,
        uri: audioInfo.localUri,
        fromCache: true
      };
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
    // Get authentication token
    const token = await authService.getAccessToken();
    
    // URL for downloading the audio with redirect
    const audioUrl = `${API_BASE_URL}/voices/${voiceId}/stories/${storyId}/audio?redirect=true`;
    
    // Create headers with authorization token
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    
    // Pass headers to downloadAudio function
    return downloadAudio(audioUrl, voiceId, storyId, progressCallback, signal, headers);
  }
  
  // If audio doesn't exist, try to generate it
  const generateResult = await generateStoryAudio(
    voiceId, 
    storyId, 
    progressCallback ? (status, progress) => {
      if (status === 'processing') {
        progressCallback(progress * 0.5); // First half is processing
      }
    } : null
  );
  
  if (!generateResult.success) {
    return generateResult;
  }
  
  // Download the generated audio
  return downloadAudio(
    generateResult.audioUrl, 
    voiceId, 
    storyId, 
    progressCallback ? (progress) => {
      progressCallback(0.5 + progress * 0.5); // Second half is downloading
    } : null,
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
// Modified cloneVoice function to include authentication token
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

    // Get authentication token - THIS IS THE IMPORTANT FIX
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
    
    // Set up upload with progress tracking
    const uploadOptions = {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/wav',
      parameters: {},
      headers: {
        'Authorization': `Bearer ${token}`  // Add authorization header
      }
    };
    
    if (progressCallback) {
      uploadOptions.progressInterval = 100;
      uploadOptions.progressCallback = ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesWritten / totalBytesExpectedToWrite;
        progressCallback(progress);
      };
    }
    
    // Upload file using Expo's FileSystem with updated endpoint
    const uploadResult = await FileSystem.uploadAsync(
      `${API_BASE_URL}/voices`,
      audioUri,
      uploadOptions
    );
    
    if (uploadResult.status !== 200) {
      throw new Error(uploadResult.body || 'Upload failed');
    }
    
    // Parse response
    const responseData = JSON.parse(uploadResult.body);
    
    // Store voice ID for later use
    if (responseData.voice_id) {
      await setCurrentVoice(responseData.voice_id);
    }
    
    return {
      success: true,
      voiceId: responseData.voice_id,
    };
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
      await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, firstVoiceId);
      
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
        await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ID, firstVoiceId);
        
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
  isOnline
};