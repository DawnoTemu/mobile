import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// CONFIGURATION
// Environment-based URL selection
const ENV = {
  DEV: 'http://192.168.1.108:8000/api',
  STAGING: 'https://staging-story-voice.herokuapp.com/api',
  PROD: 'https://story-voice-47d650d68bd6.herokuapp.com/api'
};

// Use environment variable or default to development
const API_BASE_URL = ENV.DEV;

// STORAGE KEYS
const STORAGE_KEYS = {
  VOICE_ID: 'voice_id',
  PENDING_OPERATIONS: 'voice_service_pending_ops',
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio'
};

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

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
 * Performs an API request with timeout, cancellation support, and connection check
 * @param {string} endpoint - API endpoint to call
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @returns {Promise<Object>} Response data or error
 */
const apiRequest = async (endpoint, options = {}, signal = null) => {
  try {
    // Check for internet connection
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected) {
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

/**
 * Clones a voice from an audio sample
 * @param {string} audioUri - URI to the audio file
 * @param {Function} progressCallback - Optional callback for upload progress
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<Object>} Result with voice ID or error
 */
export const cloneVoice = async (audioUri, progressCallback = null, signal = null) => {
  try {
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
  
  const result = await apiRequest(`/voices/${voiceId}`, {
    method: 'DELETE'
  });
  
  if (result.success) {
    // Clear stored voice ID if it matches the deleted one
    const current = await getCurrentVoice();
    if (current.success && current.voiceId === voiceId) {
      await AsyncStorage.removeItem(STORAGE_KEYS.VOICE_ID);
    }
    
    // Also clear any downloaded audio for this voice
    await clearVoiceAudio(voiceId);
  }
  
  return result;
};

// STORY MANAGEMENT

/**
 * Gets available stories
 * @returns {Promise<Object>} List of stories or error
 */
export const getStories = async () => {
  const result = await apiRequest('/stories');
  
  if (result.success) {
    return {
      success: true,
      stories: result.data || [],
    };
  }
  
  return {
    success: false,
    error: result.error || 'Failed to get stories',
    code: result.code || 'API_ERROR',
    stories: [],
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
        localUri: audioInfo.localUri
      };
    }
  }
  
  // If not in local storage, check API
  const result = await apiRequest(`/audio/exists/${voiceId}/${storyId}`);
  
  if (result.success) {
    return {
      success: true,
      exists: result.data?.exists || false
    };
  }
  
  return {
    success: false,
    exists: false,
    error: result.error,
    code: result.code
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
export const downloadAudio = async (url, voiceId, storyId, progressCallback = null, signal = null) => {
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
  
    // Generate unique filename
    const fileName = `voice-${voiceId}-story-${storyId}-${Date.now()}.mp3`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    
    // Set up download with progress tracking
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
  // Check if audio exists
  const checkResult = await checkAudioExists(voiceId, storyId);
  
  // If local URI is available, return it
  if (checkResult.success && checkResult.exists && checkResult.localUri) {
    return {
      success: true,
      uri: checkResult.localUri,
      fromCache: true
    };
  }
  
  // If audio exists on server but not locally, download it
  if (checkResult.success && checkResult.exists) {
    const audioUrl = `${API_BASE_URL}/audio/${voiceId}/${storyId}.mp3?t=${Date.now()}`;
    return downloadAudio(audioUrl, voiceId, storyId, progressCallback, signal);
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

// Set up a listener for connectivity changes to process offline queue
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    processOfflineQueue().catch(err => 
      console.error('Failed to process offline queue:', err)
    );
  }
});

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
  processOfflineQueue
};