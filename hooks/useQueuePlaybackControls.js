import { useCallback } from 'react';
import { LOOP_MODES } from '../context/PlaybackQueueProvider';
import { recordEvent } from '../utils/metrics';

const useQueuePlaybackControls = ({
  queueLength,
  activeQueueIndex,
  loopMode,
  setActiveQueueItem,
  seekTo,
  togglePlayPause,
  isPlaying,
  position,
  advanceQueue,
}) => {
  const handleSkipToNextFromControls = useCallback(() => {
    if (queueLength === 0) {
      return;
    }

    if (queueLength === 1) {
      if (loopMode === LOOP_MODES.NONE) {
        return;
      }
      seekTo(0).catch(() => {});
      if (!isPlaying) {
        togglePlayPause();
      }
      return;
    }

    let targetIndex = typeof activeQueueIndex === 'number' && activeQueueIndex >= 0
      ? activeQueueIndex + 1
      : 0;

    if (targetIndex >= queueLength) {
      if (loopMode === LOOP_MODES.REPEAT_ALL) {
        targetIndex = 0;
      } else {
        return;
      }
    }

    setActiveQueueItem({ index: targetIndex });
    recordEvent('queue_skip_next', { targetIndex, queueLength, loopMode });
  }, [queueLength, activeQueueIndex, loopMode, setActiveQueueItem, seekTo, isPlaying, togglePlayPause]);

  const handleSkipToPreviousFromControls = useCallback(() => {
    if (queueLength === 0) {
      return;
    }

    if (position > 5) {
      seekTo(0).catch(() => {});
      return;
    }

    if (queueLength === 1) {
      seekTo(0).catch(() => {});
      if (!isPlaying) {
        togglePlayPause();
      }
      return;
    }

    let targetIndex = typeof activeQueueIndex === 'number' && activeQueueIndex >= 0
      ? activeQueueIndex - 1
      : queueLength - 1;

    if (targetIndex < 0) {
      if (loopMode === LOOP_MODES.REPEAT_ALL) {
        targetIndex = queueLength - 1;
      } else {
        targetIndex = 0;
      }
    }

    setActiveQueueItem({ index: targetIndex });
    recordEvent('queue_skip_previous', { targetIndex, queueLength, loopMode });
  }, [queueLength, activeQueueIndex, loopMode, position, seekTo, isPlaying, togglePlayPause, setActiveQueueItem]);

  const handleAutoAdvanceOnComplete = useCallback((options) => {
    const { normalizedStoryId, repeatOneBehavior = () => {} } = options || {};

    if (loopMode === LOOP_MODES.REPEAT_ONE) {
      repeatOneBehavior();
      recordEvent('queue_repeat_one_restart', { storyId: normalizedStoryId });
      return;
    }

    advanceQueue();
    recordEvent('queue_auto_advance', { storyId: normalizedStoryId });
  }, [advanceQueue, loopMode]);

  return {
    handleSkipToNextFromControls,
    handleSkipToPreviousFromControls,
    handleAutoAdvanceOnComplete
  };
};

export default useQueuePlaybackControls;
