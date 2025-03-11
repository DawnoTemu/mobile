// Enhanced voiceService.js with seamless offline capabilities
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// CONFIGURATION
// Environment-based URL selection
const ENV = {
  DEV: 'http://192.168.1.108:8000',
  STAGING: 'https://staging-story-voice.herokuapp.com',
  PROD: 'https://api.dawnotemu.app'
};

// Use environment variable or default to development
const API_BASE_URL = ENV.DEV;

// STORAGE KEYS
const STORAGE_KEYS = {
  VOICE_ID: 'voice_id',
  PENDING_OPERATIONS: 'voice_service_pending_ops',
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio',
  CACHED_STORIES: 'voice_service_cached_stories', // For story caching
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
    
    // Add authentication if available
    const token = await AsyncStorage.getItem('auth_token');
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
  const queueableOperations = ['clone', 'synthesize'];
  
  const isQueueable = queueableOperations.some(op => endpoint.includes(op));
  
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
  
  // If we're online, check the server
  const online = await isOnline();
  if (online) {
    try {
      const result = await apiRequest(`/audio/exists/${voiceId}/${storyId}`);
      
      if (result.success) {
        return {
          success: true,
          exists: result.data?.exists || false,
          fromCache: false
        };
      }
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
    // Start synthesis request
    const result = await apiRequest('/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voice_id: voiceId,
        story_id: storyId,
      }),
    });
    
    if (!result.success) {
      console.warn('Synthesis request failed. Proceeding to poll for audio availability anyway.');
      // Continue polling even if synthesis request fails - matches web app behavior
    }
  } catch (error) {
    console.warn('Synthesis request error:', error.message);
    // Continue to polling even if synthesis request throws an error
  }
  
  // Start polling for audio availability
  if (statusCallback) statusCallback('processing', 0);
  
  const audioUrl = `${API_BASE_URL}/audio/${voiceId}/${storyId}.mp3`;
  let audioReady = false;
  let attempts = 0;
  const maxAttempts = 24; // 2 minutes with 5 second intervals
  
  while (!audioReady && attempts < maxAttempts) {
    if (statusCallback) {
      statusCallback('processing', attempts / maxAttempts);
    }
    
    // Wait between polling attempts
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      // Check if audio is ready with more robust error handling
      const checkResult = await checkAudioExists(voiceId, storyId);
      audioReady = checkResult.success && checkResult.exists;
    } catch (error) {
      console.warn(`Poll attempt ${attempts + 1} failed:`, error.message);
      // Continue polling even if a check fails
    }
    
    attempts++;
  }
  
  if (!audioReady) {
    return {
      success: false,
      error: 'Audio generation timed out',
      code: 'GENERATION_TIMEOUT'
    };
  }
  
  if (statusCallback) statusCallback('complete', 1);
  
  return {
    success: true,
    audioUrl,
  };
}

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
    return audioInfo[voiceId]?.[storyId] || null;
  } catch (error) {
    console.error('Failed to get audio info:', error);
    return null;
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
    return audioInfo[voiceId] || {};
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
 * @param {string} url - URL to download from (now will be a presigned S3 URL)
 * @param {string} voiceId - Voice ID (for storage)
 * @param {string} storyId - Story ID (for storage)
 * @param {Function} progressCallback - Optional callback for download progress
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Object>} Result with local URI or error
 */
export const downloadAudio = async (url, voiceId, storyId, progressCallback = null, signal = null) => {
  try {
    // Check if already downloaded (no changes here)
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
  
    // Check if online (no changes here)
    const online = await isOnline();
    if (!online) {
      return {
        success: false,
        error: 'Cannot download audio without internet connection',
        code: 'OFFLINE'
      };
    }

    // Generate unique filename (no changes here)
    const fileName = `voice-${voiceId}-story-${storyId}-${Date.now()}.mp3`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    
    // Set up download with progress tracking 
    // No changes here - Expo's FileSystem.createDownloadResumable works with both
    // presigned URLs and regular URLs without any changes
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      fileUri,
      {},
      (downloadProgress) => {
        if (progressCallback) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          progressCallback(progress);
        }
      }
    );
    
    // Add abort handler if signal provided (no changes here)
    if (signal) {
      signal.addEventListener('abort', () => {
        downloadResumable.cancelAsync();
      });
    }
    
    // Start download (no changes here)
    const { uri } = await downloadResumable.downloadAsync();
    
    // Store audio info for future reference (no changes here)
    await storeAudioInfo(voiceId, storyId, uri);
    
    return {
      success: true,
      uri,
      fromCache: false
    };
  } catch (error) {
    console.error('Download error:', error);
    
    // Handle AbortError specifically (no changes here)
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
  // Check if audio exists locally first (no changes here)
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

  // Check if online (no changes here)
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
  
  // If audio exists on server, get a presigned URL and download directly from S3
  if (checkResult.success && checkResult.exists) {
    try {
      // Get a presigned URL from our new endpoint
      const presignedResponse = await fetch(`${API_BASE_URL}/audio/url/${voiceId}/${storyId}`);
      const presignedData = await presignedResponse.json();
      
      if (presignedResponse.ok && presignedData.url) {
        // Use the presigned URL to download directly from S3
        return downloadAudio(presignedData.url, voiceId, storyId, progressCallback, signal);
      }
    } catch (error) {
      console.error('Error getting presigned URL:', error);
    }
  }
  
  // If audio doesn't exist, try to generate it (this part won't change much)
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
  
  // The generateStoryAudio should now return a presigned URL directly
  // Download the generated audio using the presigned URL
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

    const formData = await createFormData(audioUri);
    
    // Create a unique identifier for this upload
    const uploadId = `voice_upload_${Date.now()}`;
    
    // Set up upload with progress tracking
    const uploadOptions = {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/wav',
      parameters: {},
    };
    
    if (progressCallback) {
      uploadOptions.progressInterval = 100;
      uploadOptions.progressCallback = ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesWritten / totalBytesExpectedToWrite;
        progressCallback(progress);
      };
    }
    
    // Upload file using Expo's FileSystem
    const uploadResult = await FileSystem.uploadAsync(
      `${API_BASE_URL}/clone`,
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
      // Queue the delete operation
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
  
  // If online, delete from server
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