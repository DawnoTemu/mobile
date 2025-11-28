import { useEffect } from 'react';
import { recordEvent, recordError } from '../utils/metrics';
import { resolveQueueStoryId as resolveQueueStoryIdHelper } from './useQueueDerivedState';

const useActiveQueuePlayback = ({
  playbackQueue,
  activeQueueIndex,
  queueLength,
  findStoryById,
  selectedStory,
  handleStorySelectRef,
  suppressQueueAutoRef,
  resolveAutoPlay
}) => {
  useEffect(() => {
    if (!playbackQueue || queueLength === 0) {
      return;
    }

    if (
      typeof activeQueueIndex !== 'number' ||
      activeQueueIndex < 0 ||
      activeQueueIndex >= playbackQueue.length
    ) {
      return;
    }

    if (suppressQueueAutoRef?.current) {
      suppressQueueAutoRef.current = false;
      return;
    }

    const entry = playbackQueue[activeQueueIndex];
    const storyId = resolveQueueStoryIdHelper(entry);
    if (!storyId) {
      return;
    }

    const resolvedStory =
      findStoryById(storyId) ||
      {
        id: storyId,
        title: entry?.title ?? `Bajka ${storyId}`,
        author: entry?.author ?? 'Anonim',
        hasAudio: entry?.hasAudio ?? true,
        hasLocalAudio: entry?.hasLocalAudio ?? false,
        localUri: entry?.localUri ?? null,
        localAudioUri: entry?.localAudioUri ?? null,
        cover_url: entry?.coverUrl ?? entry?.cover_url ?? null
      };

    const currentStoryId = selectedStory?.id != null ? String(selectedStory.id) : null;
    if (currentStoryId === String(storyId)) {
      return;
    }

    const shouldAutoPlay = resolveAutoPlay
      ? resolveAutoPlay({ activeIndex: activeQueueIndex, entry })
      : true;

    const maybePromise = handleStorySelectRef.current?.(resolvedStory, {
      skipQueueSync: true,
      autoPlay: shouldAutoPlay
    });
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch((error) => {
        recordError('queue_playback_start_error', error);
      });
    }

    recordEvent('queue_active_story_changed', { storyId, index: activeQueueIndex });
  }, [
    activeQueueIndex,
    playbackQueue,
    queueLength,
    findStoryById,
    selectedStory,
    handleStorySelectRef,
    suppressQueueAutoRef,
    resolveAutoPlay
  ]);
};

export default useActiveQueuePlayback;
