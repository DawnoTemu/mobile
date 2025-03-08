import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { Image } from 'react-native';
import { Platform } from 'react-native';

/**
 * Format time in seconds to MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (MM:SS)
 */
export const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

/**
 * Get file info (size, type, etc.)
 * @param {string} uri - File URI
 * @returns {Promise<Object>} File info object
 */
export const getFileInfo = async (uri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    
    // Get file extension to determine mime type
    const fileExtension = uri.split('.').pop().toLowerCase();
    
    // Map common audio extensions to MIME types
    const mimeTypes = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
    };
    
    const mimeType = mimeTypes[fileExtension] || 'audio/mpeg'; // Default to audio/mpeg
    
    return {
      ...fileInfo,
      mimeType,
      fileName: uri.split('/').pop(),
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    throw error;
  }
};

/**
 * Configure audio session for recording
 * @returns {Promise<void>}
 */
export const configureAudioSessionForRecording = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      staysActiveInBackground: false,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('Error configuring audio session:', error);
    throw error;
  }
};

/**
 * Configure audio session for playback
 * @returns {Promise<void>}
 */
export const configureAudioSessionForPlayback = async () => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: true,
    });
  } catch (error) {
    console.error('Error configuring audio session:', error);
    throw error;
  }
};

/**
 * Generate a unique file name for audio recordings
 * @param {string} prefix - Prefix for the file name
 * @param {string} extension - File extension (default: 'wav')
 * @returns {string} Unique file name
 */
export const generateUniqueFileName = (prefix = 'recording', extension = 'wav') => {
  const timestamp = new Date().getTime();
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * Get temporary directory path for saving audio files
 * @returns {string} Directory path
 */
export const getAudioTempDirectory = () => {
  return `${FileSystem.cacheDirectory}audio/`;
};

/**
 * Create temporary directory for audio files if it doesn't exist
 * @returns {Promise<string>} Directory path
 */
export const ensureAudioTempDirectory = async () => {
  const dirPath = getAudioTempDirectory();
  
  try {
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }
    
    return dirPath;
  } catch (error) {
    console.error('Error ensuring temp directory:', error);
    throw error;
  }
};

/**
 * Normalize file URI based on platform
 * iOS file:// URIs need to be modified for certain operations
 * @param {string} uri - File URI
 * @returns {string} Normalized URI
 */
export const normalizeFileUri = (uri) => {
  if (Platform.OS === 'ios' && uri.startsWith('file://')) {
    return uri.replace('file://', '');
  }
  return uri;
};

/**
 * Delete a file from the filesystem
 * @param {string} uri - File URI
 * @returns {Promise<boolean>} Success status
 */
export const deleteFile = async (uri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri);
      return true;
    }
    
    return false; // File didn't exist
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

/**
 * Clean up old temporary audio files
 * Deletes files older than the specified age (default: 24 hours)
 * @param {number} maxAgeHours - Maximum age in hours
 * @returns {Promise<number>} Number of files deleted
 */
export const cleanupTempAudioFiles = async (maxAgeHours = 24) => {
  try {
    const dirPath = getAudioTempDirectory();
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    
    if (!dirInfo.exists) {
      return 0;
    }
    
    // Get list of files in directory
    const fileList = await FileSystem.readDirectoryAsync(dirPath);
    
    // Current time minus max age in milliseconds
    const cutoffTime = new Date().getTime() - (maxAgeHours * 60 * 60 * 1000);
    
    let deletedCount = 0;
    
    // Check each file
    for (const fileName of fileList) {
      const filePath = `${dirPath}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      // Extract timestamp from file name (assuming format like recording_1627843200000.wav)
      const timestampMatch = fileName.match(/\d+/);
      
      if (timestampMatch && parseInt(timestampMatch[0]) < cutoffTime) {
        await FileSystem.deleteAsync(filePath);
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
    return 0;
  }
};

/**
 * Pre-loads an image to check if it's available
 * @param {string} imageUrl - URL of the image to check
 * @returns {Promise<boolean>} True if image is available
 */
export const checkImageAvailability = async (imageUrl) => {
  if (!imageUrl) return false;
  
  try {
    // For React Native, we can use Image.prefetch
    const result = await Image.prefetch(imageUrl);
    return true;
  } catch (error) {
    console.log(`Image not available: ${imageUrl}`, error);
    return false;
  }
};
