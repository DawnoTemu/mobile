// utils/storageUtils.js
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stores a value in AsyncStorage, ensuring it's properly stringified
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be stringified if not a string)
 * @returns {Promise<void>}
 */
export const storeData = async (key, value) => {
  try {
    const stringValue = typeof value !== 'string' ? 
      (value !== null && value !== undefined ? String(value) : '') : value;
    
    await AsyncStorage.setItem(key, stringValue);
  } catch (error) {
    console.error('Error storing data:', error);
    throw error;
  }
};

/**
 * Stores an object in AsyncStorage by stringifying it to JSON
 * @param {string} key - Storage key
 * @param {Object} value - Object to store
 * @returns {Promise<void>}
 */
export const storeObjectData = async (key, value) => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (error) {
    console.error('Error storing object data:', error);
    throw error;
  }
};

/**
 * Retrieves a string value from AsyncStorage
 * @param {string} key - Storage key
 * @returns {Promise<string|null>} Retrieved value or null if not found
 */
export const getData = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error('Error getting data:', error);
    throw error;
  }
};

/**
 * Retrieves and parses an object from AsyncStorage
 * @param {string} key - Storage key
 * @returns {Promise<Object|null>} Retrieved object or null if not found
 */
export const getObjectData = async (key) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('Error getting object data:', error);
    throw error;
  }
};

/**
 * Removes a value from AsyncStorage
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
export const removeData = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing data:', error);
    throw error;
  }
};

export default {
  storeData,
  storeObjectData,
  getData,
  getObjectData,
  removeData
};