import { useMemo } from 'react';
import { LOOP_MODES } from '../context/PlaybackQueueProvider';

export const useQueueDerivedState = (queue, activeIndex, loopMode) => {
  const queueIndexByStoryId = useMemo(() => {
    const map = new Map();
    (queue || []).forEach((entry, index) => {
      const storyId = resolveQueueStoryId(entry);
      if (storyId !== null) {
        map.set(storyId, index);
      }
    });
    return map;
  }, [queue]);

  const queueLength = queue ? queue.length : 0;
  const currentQueuePosition = typeof activeIndex === 'number' && activeIndex >= 0
    ? activeIndex + 1
    : null;
  const hasNext = queueLength > 0 && typeof activeIndex === 'number' && activeIndex < queueLength - 1;
  const canSkipNext = hasNext || (loopMode !== LOOP_MODES.NONE && queueLength > 0);
  const canSkipPrevious = queueLength > 0;

  return {
    queueIndexByStoryId,
    queueLength,
    currentQueuePosition,
    canSkipNext,
    canSkipPrevious
  };
};

export const resolveQueueStoryId = (item) => {
  if (item === null || item === undefined) {
    return null;
  }
  if (typeof item === 'string' || typeof item === 'number') {
    return String(item);
  }
  if (typeof item === 'object') {
    if (item.storyId !== null && item.storyId !== undefined) {
      return String(item.storyId);
    }
    if (item.id !== null && item.id !== undefined) {
      return String(item.id);
    }
  }
  return null;
};

export default useQueueDerivedState;
