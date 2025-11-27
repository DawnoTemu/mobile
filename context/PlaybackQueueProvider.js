import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../services/config';
import authService from '../services/authService';
import { createLogger } from '../utils/logger';
import { recordEvent, recordError } from '../utils/metrics';

const QUEUE_STATE_VERSION = 1;
const MAX_QUEUE_ITEMS = 200;
const log = createLogger('PlaybackQueue');

export const LOOP_MODES = {
  NONE: 'NONE',
  REPEAT_ONE: 'REPEAT_ONE',
  REPEAT_ALL: 'REPEAT_ALL'
};

const LOOP_MODE_VALUES = Object.values(LOOP_MODES);

const getStoryId = (item) => {
  if (item == null) {
    return null;
  }

  if (typeof item === 'string' || typeof item === 'number') {
    return item;
  }

  if (typeof item === 'object') {
    if (item.id != null) {
      return item.id;
    }

    if (item.storyId != null) {
      return item.storyId;
    }
  }

  return null;
};

const clampActiveIndex = (queue, index) => {
  if (!Array.isArray(queue) || queue.length === 0) {
    return -1;
  }

  if (typeof index !== 'number' || Number.isNaN(index)) {
    return 0;
  }

  if (index <= -1) {
    return -1;
  }

  if (index >= queue.length) {
    return queue.length - 1;
  }

  return index;
};

const ensureLockedStory = (queue, lockedStoryId) => {
  if (!lockedStoryId) {
    return null;
  }

  return queue.some((item) => getStoryId(item) === lockedStoryId) ? lockedStoryId : null;
};

const ensureArray = (value) => {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value.filter((item) => item != null) : [value];
};

const clampQueueSize = (queue) => {
  if (!Array.isArray(queue)) {
    return [];
  }
  if (queue.length <= MAX_QUEUE_ITEMS) {
    return queue;
  }
  return queue.slice(0, MAX_QUEUE_ITEMS);
};

export const initialQueueState = {
  queue: [],
  activeIndex: -1,
  loopMode: LOOP_MODES.NONE,
  lockedStoryId: null,
  initializing: true,
  hydrated: false,
  hydrationError: null
};

const computeAdvanceIndex = (state) => {
  const { queue, loopMode } = state;
  const activeIndex = clampActiveIndex(queue, state.activeIndex);

  if (!queue.length) {
    return -1;
  }

  if (loopMode === LOOP_MODES.REPEAT_ONE) {
    return activeIndex;
  }

  if (activeIndex === -1) {
    return queue.length ? 0 : -1;
  }

  if (loopMode === LOOP_MODES.REPEAT_ALL) {
    return (activeIndex + 1) % queue.length;
  }

  if (activeIndex < queue.length - 1) {
    return activeIndex + 1;
  }

  return -1;
};

const computeRetreatIndex = (state) => {
  const { queue, loopMode } = state;
  const activeIndex = clampActiveIndex(queue, state.activeIndex);

  if (!queue.length) {
    return -1;
  }

  if (loopMode === LOOP_MODES.REPEAT_ONE) {
    return activeIndex;
  }

  if (activeIndex === -1) {
    return queue.length - 1;
  }

  if (activeIndex > 0) {
    return activeIndex - 1;
  }

  if (loopMode === LOOP_MODES.REPEAT_ALL) {
    return queue.length - 1;
  }

  return 0;
};

const queueEnqueue = (state, action) => {
  const items = ensureArray(action.payload?.items);
  if (!items.length) {
    return state.initializing ? { ...state, initializing: false } : state;
  }

  const queue = clampQueueSize([...state.queue, ...items]);
  const nextActiveIndex = state.activeIndex === -1 ? 0 : state.activeIndex;

  return {
    ...state,
    queue,
    activeIndex: clampActiveIndex(queue, nextActiveIndex),
    lockedStoryId: ensureLockedStory(queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueEnqueueNext = (state, action) => {
  const items = ensureArray(action.payload?.items);
  if (!items.length) {
    return state.initializing ? { ...state, initializing: false } : state;
  }

  const hasActive = state.activeIndex >= 0 && state.activeIndex < state.queue.length;
  let queue;

  if (hasActive) {
    const insertIndex = state.activeIndex + 1;
    queue = [
      ...state.queue.slice(0, insertIndex),
      ...items,
      ...state.queue.slice(insertIndex)
    ];
  } else {
    queue = [...state.queue, ...items];
  }
  queue = clampQueueSize(queue);

  const nextActiveIndex = hasActive
    ? state.activeIndex
    : clampActiveIndex(queue, state.activeIndex === -1 ? 0 : state.activeIndex);

  return {
    ...state,
    queue,
    activeIndex: nextActiveIndex,
    lockedStoryId: ensureLockedStory(queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueRemove = (state, action) => {
  const { index, storyId } = action.payload || {};
  let targetIndex = typeof index === 'number' ? index : -1;

  if (targetIndex < 0 && (typeof storyId === 'string' || typeof storyId === 'number')) {
    targetIndex = state.queue.findIndex((item) => getStoryId(item) === storyId);
  }

  if (targetIndex < 0 || targetIndex >= state.queue.length) {
    return state.initializing ? { ...state, initializing: false } : state;
  }

  const queue = state.queue.filter((_, itemIndex) => itemIndex !== targetIndex);

  let nextActiveIndex = state.activeIndex;
  if (targetIndex < state.activeIndex) {
    nextActiveIndex -= 1;
  } else if (targetIndex === state.activeIndex) {
    if (!queue.length) {
      nextActiveIndex = -1;
    } else if (nextActiveIndex >= queue.length) {
      nextActiveIndex = queue.length - 1;
    }
  }

  return {
    ...state,
    queue,
    activeIndex: clampActiveIndex(queue, nextActiveIndex),
    lockedStoryId: ensureLockedStory(queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueClear = (state) => ({
  ...state,
  queue: [],
  activeIndex: -1,
  lockedStoryId: null,
  initializing: false,
  hydrated: true,
  hydrationError: null
});

const queueReorder = (state, action) => {
  const incomingQueue = clampQueueSize(ensureArray(action.payload?.queue));
  if (!incomingQueue.length) {
    return queueClear(state);
  }

  const requestedActiveIndex = typeof action.payload?.activeIndex === 'number'
    ? action.payload.activeIndex
    : null;

  const activeStoryId = getStoryId(state.queue[state.activeIndex]);
  let nextActiveIndex = requestedActiveIndex != null
    ? clampActiveIndex(incomingQueue, requestedActiveIndex)
    : -1;

  if (nextActiveIndex === -1 && activeStoryId != null) {
    nextActiveIndex = incomingQueue.findIndex((item) => getStoryId(item) === activeStoryId);
  }

  if (nextActiveIndex === -1) {
    nextActiveIndex = clampActiveIndex(incomingQueue, state.activeIndex);
  }

  if (nextActiveIndex === -1 && incomingQueue.length) {
    nextActiveIndex = 0;
  }

  return {
    ...state,
    queue: incomingQueue,
    activeIndex: clampActiveIndex(incomingQueue, nextActiveIndex),
    lockedStoryId: ensureLockedStory(incomingQueue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const shuffleQueueItems = (queue) => {
  const shuffled = [...queue];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const queueShuffle = (state) => {
  if (!Array.isArray(state.queue) || state.queue.length <= 1) {
    return state.initializing ? { ...state, initializing: false } : state;
  }

  const shuffled = clampQueueSize(shuffleQueueItems(state.queue));
  const activeStoryId = getStoryId(state.queue[state.activeIndex]);
  let activeIndex = clampActiveIndex(shuffled, state.activeIndex);

  if (activeStoryId != null) {
    const located = shuffled.findIndex((item) => getStoryId(item) === activeStoryId);
    if (located >= 0) {
      activeIndex = located;
    }
  }

  return {
    ...state,
    queue: shuffled,
    activeIndex,
    lockedStoryId: ensureLockedStory(shuffled, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueSetActiveIndex = (state, action) => {
  const { index, storyId } = action.payload || {};
  let targetIndex = typeof index === 'number' ? index : null;

  if ((targetIndex == null || targetIndex < 0) && (typeof storyId === 'string' || typeof storyId === 'number')) {
    targetIndex = state.queue.findIndex((item) => getStoryId(item) === storyId);
  }

  const activeIndex = clampActiveIndex(state.queue, targetIndex == null ? state.activeIndex : targetIndex);

  return {
    ...state,
    activeIndex,
    lockedStoryId: ensureLockedStory(state.queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueAdvance = (state) => {
  const activeIndex = computeAdvanceIndex(state);

  return {
    ...state,
    activeIndex,
    lockedStoryId: activeIndex === -1
      ? null
      : ensureLockedStory(state.queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueRetreat = (state) => {
  const activeIndex = computeRetreatIndex(state);

  return {
    ...state,
    activeIndex,
    lockedStoryId: ensureLockedStory(state.queue, state.lockedStoryId),
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueSetLoopMode = (state, action) => {
  const requested = action.payload?.loopMode;
  const loopMode = LOOP_MODE_VALUES.includes(requested) ? requested : LOOP_MODES.NONE;
  const nextLockedStoryId = loopMode === LOOP_MODES.REPEAT_ONE
    ? ensureLockedStory(
        state.queue,
        getStoryId(state.queue[clampActiveIndex(state.queue, state.activeIndex)]) || state.lockedStoryId
      )
    : null;

  return {
    ...state,
    loopMode,
    lockedStoryId: nextLockedStoryId,
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

const queueSetLockedStory = (state, action) => {
  const storyId = action.payload?.storyId ?? null;
  const lockedStoryId = ensureLockedStory(state.queue, storyId);

  return {
    ...state,
    lockedStoryId,
    initializing: false,
    hydrated: true,
    hydrationError: null
  };
};

export const queueReducer = (state, action) => {
  switch (action.type) {
    case 'HYDRATE_START':
      return {
        ...state,
        initializing: true,
        hydrated: false,
        hydrationError: null
      };
    case 'HYDRATE_SUCCESS': {
      const incomingQueue = Array.isArray(action.payload?.queue) ? action.payload.queue : [];
      const loopMode = LOOP_MODE_VALUES.includes(action.payload?.loopMode)
        ? action.payload.loopMode
        : LOOP_MODES.NONE;

      return {
        ...state,
        queue: incomingQueue,
        activeIndex: clampActiveIndex(incomingQueue, action.payload?.activeIndex),
        loopMode,
        lockedStoryId: ensureLockedStory(incomingQueue, action.payload?.lockedStoryId ?? null),
        initializing: false,
        hydrated: true,
        hydrationError: null
      };
    }
    case 'HYDRATE_ERROR':
      return {
        ...state,
        queue: Array.isArray(state.queue) ? state.queue : [],
        activeIndex: clampActiveIndex(state.queue, state.activeIndex),
        loopMode: LOOP_MODE_VALUES.includes(state.loopMode) ? state.loopMode : LOOP_MODES.NONE,
        lockedStoryId: ensureLockedStory(state.queue, state.lockedStoryId),
        initializing: false,
        hydrated: true,
        hydrationError: action.payload?.error || null
      };
    case 'QUEUE_ENQUEUE':
      return queueEnqueue(state, action);
    case 'QUEUE_ENQUEUE_NEXT':
      return queueEnqueueNext(state, action);
    case 'QUEUE_REMOVE':
      return queueRemove(state, action);
    case 'QUEUE_CLEAR':
      return queueClear(state);
    case 'QUEUE_SET_ACTIVE_INDEX':
      return queueSetActiveIndex(state, action);
    case 'QUEUE_ADVANCE':
      return queueAdvance(state);
    case 'QUEUE_RETREAT':
      return queueRetreat(state);
    case 'QUEUE_REORDER':
      return queueReorder(state, action);
    case 'QUEUE_SHUFFLE':
      return queueShuffle(state);
    case 'QUEUE_SET_LOOP_MODE':
      return queueSetLoopMode(state, action);
    case 'QUEUE_SET_LOCKED_STORY':
      return queueSetLockedStory(state, action);
    default:
      return state;
  }
};

export const serializeQueueState = (state, owner = {}) => {
  const queue = Array.isArray(state.queue) ? clampQueueSize(state.queue) : [];
  const activeIndex = clampActiveIndex(queue, state.activeIndex);

  return {
    version: QUEUE_STATE_VERSION,
    queue,
    activeIndex,
    lockedStoryId: ensureLockedStory(queue, state.lockedStoryId),
    userId: owner.userId || null,
    voiceId: owner.voiceId || null
  };
};

const PlaybackQueueStateContext = createContext(initialQueueState);
const PlaybackQueueDispatchContext = createContext(null);

export const PlaybackQueueProvider = ({ children, initialState = null, disableHydration = false }) => {
  const [state, dispatch] = useReducer(
    queueReducer,
    initialQueueState,
    (base) => {
      if (!initialState) {
        return base;
      }
      const seededQueue = clampQueueSize(ensureArray(initialState.queue));
      const activeIndex = clampActiveIndex(seededQueue, initialState.activeIndex);
      const loopMode = LOOP_MODE_VALUES.includes(initialState.loopMode)
        ? initialState.loopMode
        : LOOP_MODES.NONE;

      return {
        ...base,
        ...initialState,
        queue: seededQueue,
        activeIndex,
        loopMode,
        initializing: false,
        hydrated: true,
        hydrationError: null
      };
    }
  );
  const persistTimeoutRef = useRef(null);
  const hydrationRef = useRef(true);
  const [queueOwner, setQueueOwner] = useState({ userId: null, voiceId: null });

  useEffect(() => {
    if (disableHydration) {
      hydrationRef.current = false;
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      if (!hydrationRef.current) {
        return;
      }

      dispatch({ type: 'HYDRATE_START' });
      recordEvent('playback_queue_hydrate_start');

      try {
        const [queueString, loopModeString, currentVoiceId, currentUserId] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.PLAYBACK_QUEUE),
          AsyncStorage.getItem(STORAGE_KEYS.PLAYBACK_LOOP_MODE),
          AsyncStorage.getItem(STORAGE_KEYS.VOICE_ID),
          authService.getCurrentUserId?.()
        ]);
        setQueueOwner({ userId: currentUserId || null, voiceId: currentVoiceId || null });

        if (cancelled) {
          return;
        }

        let parsed = null;
        if (queueString) {
          try {
            parsed = JSON.parse(queueString);
          } catch (error) {
            log.warn('Failed to parse persisted queue', error);
          }
        }

        if (parsed && parsed.version && parsed.version !== QUEUE_STATE_VERSION) {
          log.info('Discarding outdated queue state', { version: parsed.version });
        }

        const persistedState = parsed && parsed.version === QUEUE_STATE_VERSION ? parsed : null;
        const ownerMatches = persistedState
          ? (!persistedState.userId || persistedState.userId === currentUserId) &&
            (!persistedState.voiceId || persistedState.voiceId === currentVoiceId)
          : false;

        dispatch({
          type: 'HYDRATE_SUCCESS',
          payload: {
            queue: ownerMatches && Array.isArray(persistedState?.queue) ? clampQueueSize(persistedState.queue) : [],
            activeIndex: ownerMatches ? persistedState?.activeIndex : -1,
            lockedStoryId: ownerMatches ? persistedState?.lockedStoryId : null,
            loopMode: loopModeString && LOOP_MODE_VALUES.includes(loopModeString)
              ? loopModeString
              : LOOP_MODES.NONE
          }
        });
        recordEvent('playback_queue_hydrate_success', {
          queueLength: persistedState?.queue?.length || 0,
          loopMode: loopModeString || LOOP_MODES.NONE
        });
      } catch (error) {
        if (!cancelled) {
          log.warn('Hydration failed', error);
          recordError('playback_queue_hydrate_error', error);
          dispatch({ type: 'HYDRATE_ERROR', payload: { error } });
        }
      } finally {
        hydrationRef.current = false;
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.hydrated || state.initializing || disableHydration) {
      return;
    }

    let cancelled = false;

    const syncOwner = async () => {
      const [currentVoiceId, currentUserId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.VOICE_ID),
        authService.getCurrentUserId?.()
      ]);
      const voiceId = currentVoiceId || null;
      const userId = currentUserId || null;
      if (cancelled) {
        return queueOwner;
      }
      if (queueOwner.voiceId !== voiceId || queueOwner.userId !== userId) {
        setQueueOwner({ voiceId, userId });
      }
      return { voiceId, userId };
    };

    const persistQueue = async () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }

      const owner = await syncOwner();

      if (cancelled) {
        return;
      }

      const queueSnapshot = serializeQueueState(state, owner || queueOwner);
      const loopMode = LOOP_MODE_VALUES.includes(state.loopMode) ? state.loopMode : LOOP_MODES.NONE;

      persistTimeoutRef.current = setTimeout(() => {
        AsyncStorage.multiSet([
          [STORAGE_KEYS.PLAYBACK_QUEUE, JSON.stringify(queueSnapshot)],
          [STORAGE_KEYS.PLAYBACK_LOOP_MODE, loopMode]
        ]).catch((error) => {
          log.warn('Failed to persist queue state', error);
          recordError('playback_queue_persist_error', error, { queueLength: queueSnapshot.queue.length });
        }).finally(() => {
          persistTimeoutRef.current = null;
        });
      }, 150);
    };

    persistQueue();

    return () => {
      cancelled = true;
    };
  }, [
    state.queue,
    state.activeIndex,
    state.lockedStoryId,
    state.loopMode,
    state.hydrated,
    state.initializing,
    queueOwner.voiceId,
    queueOwner.userId,
    disableHydration
  ]);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, []);

  const enqueue = useCallback((items, options = {}) => {
    dispatch({ type: 'QUEUE_ENQUEUE', payload: { items, options } });
  }, [dispatch]);

  const enqueueNext = useCallback((items, options = {}) => {
    dispatch({ type: 'QUEUE_ENQUEUE_NEXT', payload: { items, options } });
  }, [dispatch]);

  const removeFromQueue = useCallback((identifier) => {
    if (identifier == null) {
      return;
    }

    if (typeof identifier === 'number') {
      dispatch({ type: 'QUEUE_REMOVE', payload: { index: identifier } });
      return;
    }

    if (typeof identifier === 'string') {
      dispatch({ type: 'QUEUE_REMOVE', payload: { storyId: identifier } });
      return;
    }

    if (typeof identifier === 'object') {
      const payload = {};
      if (typeof identifier.index === 'number') {
        payload.index = identifier.index;
      }
      if (identifier.storyId != null) {
        payload.storyId = identifier.storyId;
      }
      if (payload.index != null || payload.storyId != null) {
        dispatch({ type: 'QUEUE_REMOVE', payload });
      }
    }
  }, [dispatch]);

  const clearQueue = useCallback(() => {
    dispatch({ type: 'QUEUE_CLEAR' });
  }, [dispatch]);

  const setActiveItem = useCallback((target) => {
    if (target == null) {
      dispatch({ type: 'QUEUE_SET_ACTIVE_INDEX', payload: { index: -1 } });
      return;
    }

    if (typeof target === 'number') {
      dispatch({ type: 'QUEUE_SET_ACTIVE_INDEX', payload: { index: target } });
      return;
    }

    if (typeof target === 'string') {
      dispatch({ type: 'QUEUE_SET_ACTIVE_INDEX', payload: { storyId: target } });
      return;
    }

    if (typeof target === 'object') {
      const payload = {};
      if (typeof target.index === 'number') {
        payload.index = target.index;
      }
      if (target.storyId != null) {
        payload.storyId = target.storyId;
      }
      dispatch({ type: 'QUEUE_SET_ACTIVE_INDEX', payload });
    }
  }, [dispatch]);

  const advance = useCallback(() => {
    dispatch({ type: 'QUEUE_ADVANCE' });
  }, [dispatch]);

  const retreat = useCallback(() => {
    dispatch({ type: 'QUEUE_RETREAT' });
  }, [dispatch]);

  const setLoopMode = useCallback((mode) => {
    dispatch({ type: 'QUEUE_SET_LOOP_MODE', payload: { loopMode: mode } });
  }, [dispatch]);

  const setLockedStory = useCallback((storyId) => {
    dispatch({ type: 'QUEUE_SET_LOCKED_STORY', payload: { storyId } });
  }, [dispatch]);

  const reorderQueue = useCallback((queue, options = {}) => {
    dispatch({ type: 'QUEUE_REORDER', payload: { queue, ...options } });
  }, [dispatch]);

  const shuffleQueue = useCallback(() => {
    dispatch({ type: 'QUEUE_SHUFFLE' });
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = authService.subscribeAuthEvents?.((event) => {
      if (event === 'LOGOUT') {
        clearQueue();
        AsyncStorage.multiRemove([
          STORAGE_KEYS.PLAYBACK_QUEUE,
          STORAGE_KEYS.PLAYBACK_LOOP_MODE
        ]).catch((error) => {
          log.warn('Failed to clear queue on logout', error);
        });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [clearQueue]);

  const helpers = useMemo(() => ({
    enqueue,
    enqueueNext,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    shuffleQueue,
    setActiveItem,
    advance,
    retreat,
    setLoopMode,
    setLockedStory
  }), [
    enqueue,
    enqueueNext,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    shuffleQueue,
    setActiveItem,
    advance,
    retreat,
    setLoopMode,
    setLockedStory
  ]);

  return (
    <PlaybackQueueStateContext.Provider value={state}>
      <PlaybackQueueDispatchContext.Provider value={helpers}>
        {children}
      </PlaybackQueueDispatchContext.Provider>
    </PlaybackQueueStateContext.Provider>
  );
};

export const usePlaybackQueue = () => {
  const context = useContext(PlaybackQueueStateContext);
  if (context === undefined || context === null) {
    throw new Error('usePlaybackQueue must be used within a PlaybackQueueProvider');
  }
  return context;
};

export const usePlaybackQueueDispatch = () => {
  const context = useContext(PlaybackQueueDispatchContext);
  if (!context) {
    throw new Error('usePlaybackQueueDispatch must be used within a PlaybackQueueProvider');
  }
  return context;
};
