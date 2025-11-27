import { useCallback } from 'react';
import {
  buildAutoFillItems,
  normalizeStoryToQueueItem,
  collectQueueStoryIds,
  filterPlayableStories
} from '../services/playbackQueueService';
import { recordEvent } from '../utils/metrics';

const useQueueActions = ({
  playbackQueue,
  queueIndexByStoryId,
  activeQueueIndex,
  enqueue,
  enqueueNext,
  removeFromPlaybackQueue,
  clearPlaybackQueue,
  setActiveQueueItem,
  showToast,
  voiceId,
  stories,
  storyHasPlayableAudio
}) => {
  const existingQueueIds = collectQueueStoryIds(playbackQueue);

  const handleAddStoryToQueue = useCallback(
    (story) => {
    if (!story) {
      return;
    }

    if (!storyHasPlayableAudio(story)) {
      showToast('Ta bajka nie ma jeszcze nagrania. Wygeneruj ją przed dodaniem do kolejki.', 'INFO');
      return;
    }

    const payload = normalizeStoryToQueueItem(story, voiceId);
    if (!payload) {
      return;
    }

    const storyKey = String(story.id);
    const existingIndex = queueIndexByStoryId.get(storyKey);
    const isActive = typeof existingIndex === 'number' && existingIndex === activeQueueIndex;
    if (typeof existingIndex === 'number' && existingIndex >= 0 && !isActive) {
      removeFromPlaybackQueue({ index: existingIndex });
    }

    if (isActive) {
      setActiveQueueItem({ index: existingIndex });
      return;
    }

    enqueue(payload);
    recordEvent('queue_add_story', { storyId: storyKey });
    showToast('Dodano bajkę do kolejki.', 'SUCCESS');
  },
  [
    storyHasPlayableAudio,
    queueIndexByStoryId,
    activeQueueIndex,
    removeFromPlaybackQueue,
    enqueue,
    setActiveQueueItem,
    showToast,
    voiceId
  ]
);

  const handlePlayNextStory = useCallback(
    (story) => {
      if (!story) {
        return;
      }

      if (!storyHasPlayableAudio(story)) {
        showToast('Ta bajka nie ma jeszcze nagrania. Wygeneruj ją przed dodaniem do kolejki.', 'INFO');
        return;
      }

      const payload = normalizeStoryToQueueItem(story, voiceId);
    if (!payload) {
      return;
    }

    const storyKey = String(story.id);
    const existingIndex = queueIndexByStoryId.get(storyKey);
    const isActive = typeof existingIndex === 'number' && existingIndex === activeQueueIndex;
    if (typeof existingIndex === 'number' && existingIndex >= 0 && !isActive) {
      removeFromPlaybackQueue({ index: existingIndex });
    }

    if (isActive) {
      setActiveQueueItem({ index: existingIndex });
      return;
    }

    enqueueNext(payload);
    recordEvent('queue_play_next', { storyId: storyKey });
    showToast('Ta bajka będzie odtworzona jako następna.', 'SUCCESS');
  },
  [
    storyHasPlayableAudio,
    queueIndexByStoryId,
    activeQueueIndex,
    removeFromPlaybackQueue,
    enqueueNext,
    setActiveQueueItem,
    showToast,
    voiceId
  ]
);

  const handleAutoFillQueue = useCallback(() => {
    if (!stories || !stories.length) {
      showToast('Brak bajek do dodania do kolejki.', 'INFO');
      return;
    }

    const candidates = filterPlayableStories(stories);
    if (!candidates.length) {
      showToast('Brak bajek z gotowym nagraniem do dodania.', 'INFO');
      return;
    }

    const itemsToAdd = buildAutoFillItems({
      stories: candidates,
      existingIds: existingQueueIds,
      voiceId
    });

    if (!itemsToAdd.length) {
      showToast('Wszystkie gotowe bajki są już w kolejce.', 'INFO');
      return;
    }

    enqueue(itemsToAdd);
    const addedCount = itemsToAdd.length;
    const label = addedCount === 1 ? 'bajkę' : addedCount >= 5 ? 'bajek' : 'bajki';
    recordEvent('queue_auto_fill', { added: addedCount });
    showToast(`Dodano ${addedCount} ${label} do kolejki.`, 'SUCCESS');
  }, [stories, existingQueueIds, voiceId, enqueue, showToast]);

  const handleClearQueue = useCallback(() => {
    clearPlaybackQueue();
    recordEvent('queue_clear', { reason: 'user_action' });
    showToast('Wyczyszczono kolejkę.', 'SUCCESS');
  }, [clearPlaybackQueue, showToast]);

  const handleSyncStoryToQueue = useCallback((story) => {
    if (!story || !storyHasPlayableAudio(story)) {
      return;
    }
    const storyKey = String(story.id);
    const existingIndex = queueIndexByStoryId.get(storyKey);
    if (typeof existingIndex === 'number' && existingIndex >= 0) {
      setActiveQueueItem({ index: existingIndex });
      return;
    }
    const payload = normalizeStoryToQueueItem(story, voiceId);
    if (!payload) {
      return;
    }
    enqueue(payload);
    setActiveQueueItem({ storyId: storyKey });
  }, [enqueue, queueIndexByStoryId, setActiveQueueItem, storyHasPlayableAudio, voiceId]);

  return {
    handleAddStoryToQueue,
    handlePlayNextStory,
    handleAutoFillQueue,
    handleClearQueue,
    handleSyncStoryToQueue
  };
};

export default useQueueActions;
