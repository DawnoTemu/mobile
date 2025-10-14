import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../services/config';

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

  const queue = [...state.queue, ...items];
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
    case 'QUEUE_SET_LOOP_MODE':
      return queueSetLoopMode(state, action);
    case 'QUEUE_SET_LOCKED_STORY':
      return queueSetLockedStory(state, action);
    default:
      return state;
  }
};

export const serializeQueueState = (state) => {
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const activeIndex = clampActiveIndex(queue, state.activeIndex);

  return {
    queue,
    activeIndex,
    lockedStoryId: ensureLockedStory(queue, state.lockedStoryId)
  };
};

const PlaybackQueueStateContext = createContext(initialQueueState);
const PlaybackQueueDispatchContext = createContext(null);

export const PlaybackQueueProvider = ({ children }) => {
  const [state, dispatch] = useReducer(queueReducer, initialQueueState);
  const persistTimeoutRef = useRef(null);
  const hydrationRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!hydrationRef.current) {
        return;
      }

      dispatch({ type: 'HYDRATE_START' });

      try {
        const [queueString, loopModeString] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.PLAYBACK_QUEUE),
          AsyncStorage.getItem(STORAGE_KEYS.PLAYBACK_LOOP_MODE)
        ]);

        if (cancelled) {
          return;
        }

        let parsed = null;
        if (queueString) {
          try {
            parsed = JSON.parse(queueString);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('PlaybackQueueProvider: failed to parse persisted queue', error);
          }
        }

        dispatch({
          type: 'HYDRATE_SUCCESS',
          payload: {
            queue: Array.isArray(parsed?.queue) ? parsed.queue : [],
            activeIndex: parsed?.activeIndex,
            lockedStoryId: parsed?.lockedStoryId,
            loopMode: loopModeString && LOOP_MODE_VALUES.includes(loopModeString)
              ? loopModeString
              : LOOP_MODES.NONE
          }
        });
      } catch (error) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('PlaybackQueueProvider: hydration failed', error);
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
    if (!state.hydrated || state.initializing) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    const queueSnapshot = serializeQueueState(state);
    const loopMode = LOOP_MODE_VALUES.includes(state.loopMode) ? state.loopMode : LOOP_MODES.NONE;

    persistTimeoutRef.current = setTimeout(() => {
      AsyncStorage.multiSet([
        [STORAGE_KEYS.PLAYBACK_QUEUE, JSON.stringify(queueSnapshot)],
        [STORAGE_KEYS.PLAYBACK_LOOP_MODE, loopMode]
      ]).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('PlaybackQueueProvider: failed to persist queue state', error);
      }).finally(() => {
        persistTimeoutRef.current = null;
      });
    }, 150);
  }, [state.queue, state.activeIndex, state.lockedStoryId, state.loopMode, state.hydrated, state.initializing]);

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

  const helpers = useMemo(() => ({
    enqueue,
    enqueueNext,
    removeFromQueue,
    clearQueue,
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
    setActiveItem,
    advance,
    retreat,
    setLoopMode,
    setLockedStory
  ]);

  return (
    <PlaybackQueueStateContext.Provider value={state}>
      <PlaybackQueueDispatchContext.Provider value={helpers}>
        {state.initializing ? null : children}
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
