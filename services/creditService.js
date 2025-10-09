import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './authService';
import { STORAGE_KEYS, CREDIT_CACHE_TTL, CREDIT_ESTIMATE_TTL } from './config';

const now = () => Date.now();

let creditsCache = null; // { data, timestamp }
let creditsCacheLoaded = false;

let storyEstimatesCache = {}; // { [storyId]: { data, timestamp } }
let storyCacheLoaded = false;

const isFresh = (timestamp, ttl) => {
  if (typeof timestamp !== 'number') return false;
  return now() - timestamp < ttl;
};

const normalizeLot = (lot = {}) => ({
  source: lot.source ?? 'unknown',
  amountGranted: Number.isFinite(lot.amount_granted) ? lot.amount_granted : 0,
  amountRemaining: Number.isFinite(lot.amount_remaining) ? lot.amount_remaining : 0,
  expiresAt: lot.expires_at || null,
  metadata: lot.metadata || null
});

const normalizeTransaction = (transaction = {}) => ({
  type: transaction.type ?? 'debit',
  amount: Number.isFinite(transaction.amount) ? transaction.amount : 0,
  status: transaction.status ?? 'applied',
  reason: transaction.reason ?? null,
  audioStoryId: transaction.audio_story_id ?? null,
  storyId: transaction.story_id ?? null,
  createdAt: transaction.created_at ?? null,
  metadata: transaction.metadata ?? null
});

const normalizeStoryCreditsPayload = (payload = {}) => {
  const raw = Number.isFinite(payload.required_credits) ? payload.required_credits : 1;
  return {
    requiredCredits: Math.max(1, raw),
    fetchedAt: now()
  };
};

const normalizeCreditsPayload = (payload = {}) => ({
  balance: Number.isFinite(payload.balance) ? payload.balance : 0,
  unitLabel: payload.unit_label ?? 'Story Points (Punkty Magii)',
  unitSize: Number.isFinite(payload.unit_size) ? payload.unit_size : 1000,
  lots: Array.isArray(payload.lots) ? payload.lots.map(normalizeLot) : [],
  recentTransactions: Array.isArray(payload.recent_transactions)
    ? payload.recent_transactions.map(normalizeTransaction)
    : [],
  fetchedAt: now()
});

const loadCreditsCache = async () => {
  if (creditsCacheLoaded) {
    return creditsCache;
  }

  const stored = await AsyncStorage.getItem(STORAGE_KEYS.CREDITS_CACHE);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && parsed.data) {
        creditsCache = parsed;
      }
    } catch (error) {
      console.warn('Failed to parse stored credits cache', error);
    }
  }

  creditsCacheLoaded = true;
  return creditsCache;
};

const saveCreditsCache = async (data) => {
  creditsCache = {
    data,
    timestamp: data.fetchedAt ?? now()
  };
  creditsCacheLoaded = true;
  await AsyncStorage.setItem(STORAGE_KEYS.CREDITS_CACHE, JSON.stringify(creditsCache));
};

const loadStoryCache = async () => {
  if (storyCacheLoaded) {
    return storyEstimatesCache;
  }

  const stored = await AsyncStorage.getItem(STORAGE_KEYS.CREDIT_ESTIMATES);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        storyEstimatesCache = parsed;
      }
    } catch (error) {
      console.warn('Failed to parse stored credit estimates', error);
    }
  }

  storyCacheLoaded = true;
  return storyEstimatesCache;
};

const saveStoryCache = async () => {
  storyCacheLoaded = true;
  await AsyncStorage.setItem(
    STORAGE_KEYS.CREDIT_ESTIMATES,
    JSON.stringify(storyEstimatesCache)
  );
};

const buildCacheFallbackResponse = (cacheEntry, apiError) => ({
  success: true,
  status: apiError?.status ?? null,
  data: cacheEntry.data,
  fromCache: true,
  stale: !isFresh(cacheEntry.timestamp, CREDIT_CACHE_TTL),
  cachedAt: cacheEntry.timestamp,
  error: apiError?.error,
  code: apiError?.code
});

export const getCredits = async ({ forceRefresh = false } = {}) => {
  const cache = await loadCreditsCache();
  const cacheIsFresh = cache && isFresh(cache.timestamp, CREDIT_CACHE_TTL);

  if (!forceRefresh && cacheIsFresh) {
    return {
      success: true,
      status: null,
      data: cache.data,
      fromCache: true,
      stale: false,
      cachedAt: cache.timestamp
    };
  }

  const response = await apiRequest('/me/credits');

  if (response.success && response.data) {
    const normalized = normalizeCreditsPayload(response.data);
    await saveCreditsCache(normalized);
    return {
      success: true,
      status: response.status,
      data: normalized,
      fromCache: false,
      stale: false,
      cachedAt: normalized.fetchedAt
    };
  }

  if (cache && cache.data) {
    return buildCacheFallbackResponse(cache, response);
  }

  return {
    success: false,
    status: response.status ?? null,
    error: response.error ?? 'Unable to fetch credits',
    code: response.code ?? 'API_ERROR'
  };
};

export const refreshCredits = async () => getCredits({ forceRefresh: true });

const getStoryCacheEntry = async (storyId) => {
  const cache = await loadStoryCache();
  return cache[String(storyId)];
};

const updateStoryCacheEntry = async (storyId, data) => {
  storyEstimatesCache[String(storyId)] = data;
  await saveStoryCache();
};

const buildStoryCacheFallbackResponse = (cacheEntry, apiError) => ({
  success: true,
  status: apiError?.status ?? null,
  data: cacheEntry.data,
  fromCache: true,
  stale: !isFresh(cacheEntry.timestamp, CREDIT_ESTIMATE_TTL),
  cachedAt: cacheEntry.timestamp,
  error: apiError?.error,
  code: apiError?.code
});

export const getStoryCredits = async (storyId, { forceRefresh = false } = {}) => {
  if (storyId === null || storyId === undefined) {
    throw new Error('storyId is required for getStoryCredits');
  }

  const cacheEntry = await getStoryCacheEntry(storyId);
  const cacheIsFresh = cacheEntry && isFresh(cacheEntry.timestamp, CREDIT_ESTIMATE_TTL);

  if (!forceRefresh && cacheIsFresh) {
    return {
      success: true,
      status: null,
      data: cacheEntry.data,
      fromCache: true,
      stale: false,
      cachedAt: cacheEntry.timestamp
    };
  }

  const response = await apiRequest(`/stories/${storyId}/credits`);

  if (response.success && response.data) {
    const normalized = normalizeStoryCreditsPayload(response.data);
    const entry = {
      data: normalized,
      timestamp: normalized.fetchedAt
    };
    await updateStoryCacheEntry(storyId, entry);

    return {
      success: true,
      status: response.status,
      data: normalized,
      fromCache: false,
      stale: false,
      cachedAt: entry.timestamp
    };
  }

  if (cacheEntry && cacheEntry.data) {
    return buildStoryCacheFallbackResponse(cacheEntry, response);
  }

  return {
    success: false,
    status: response.status ?? null,
    error: response.error ?? 'Unable to fetch story credits',
    code: response.code ?? 'API_ERROR'
  };
};

export const primeStoryCredits = async (storyIds = [], options = {}) => {
  if (!Array.isArray(storyIds) || !storyIds.length) {
    return { requested: 0, fetched: 0 };
  }

  const uniqueIds = [...new Set(storyIds)].filter(
    (id) => id !== undefined && id !== null
  );

  let fetched = 0;

  for (const storyId of uniqueIds) {
    const cacheEntry = await getStoryCacheEntry(storyId);
    const cacheIsFresh = cacheEntry && isFresh(cacheEntry.timestamp, CREDIT_ESTIMATE_TTL);

    if (cacheIsFresh && !options.forceRefresh) {
      continue;
    }

    const result = await getStoryCredits(storyId, options);
    if (result.success) {
      fetched += 1;
    }
  }

  return { requested: uniqueIds.length, fetched };
};

export const invalidateCreditsCache = async () => {
  creditsCache = null;
  creditsCacheLoaded = false;
  await AsyncStorage.removeItem(STORAGE_KEYS.CREDITS_CACHE);
};

export const invalidateStoryCredits = async (storyId = null) => {
  await loadStoryCache();

  if (storyId === null || storyId === undefined) {
    storyEstimatesCache = {};
    storyCacheLoaded = false;
    await AsyncStorage.removeItem(STORAGE_KEYS.CREDIT_ESTIMATES);
    return;
  }

  delete storyEstimatesCache[String(storyId)];
  await saveStoryCache();
};

export const __TEST_ONLY__reset = async () => {
  creditsCache = null;
  creditsCacheLoaded = false;
  storyEstimatesCache = {};
  storyCacheLoaded = false;
  await AsyncStorage.removeItem(STORAGE_KEYS.CREDITS_CACHE);
  await AsyncStorage.removeItem(STORAGE_KEYS.CREDIT_ESTIMATES);
};

export default {
  getCredits,
  refreshCredits,
  getStoryCredits,
  primeStoryCredits,
  invalidateCreditsCache,
  invalidateStoryCredits
};
