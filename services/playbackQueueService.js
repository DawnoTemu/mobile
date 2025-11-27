import { resolveQueueStoryId as resolveQueueStoryIdHelper } from '../hooks/useQueueDerivedState';

export const resolveQueueStoryId = resolveQueueStoryIdHelper;

export const collectQueueStoryIds = (queue) => {
  const ids = new Set();
  (queue || []).forEach((entry) => {
    const id = resolveQueueStoryId(entry);
    if (id) {
      ids.add(id);
    }
  });
  return ids;
};

export const normalizeStoryToQueueItem = (story, voiceId = null) => {
  if (!story || typeof story !== 'object' || story.id == null) {
    return null;
  }
  const storyKey = String(story.id);
  return {
    id: storyKey,
    storyId: storyKey,
    title: story.title ?? null,
    author: story.author ?? 'Anonim',
    duration: story.duration ?? null,
    hasAudio: Boolean(story.hasAudio || story.hasLocalAudio || story.localUri || story.localAudioUri),
    hasLocalAudio: Boolean(story.hasLocalAudio || story.localAudioUri),
    localUri: story.localUri ?? null,
    localAudioUri: story.localAudioUri ?? null,
    coverUrl: story.cover_url ?? story.coverUrl ?? null,
    cover_url: story.cover_url ?? story.coverUrl ?? null,
    voiceId: voiceId ?? null
  };
};

export const filterPlayableStories = (stories = []) => {
  return stories.filter((story) => {
    if (!story || typeof story !== 'object') {
      return false;
    }
    return Boolean(
      story.hasAudio ||
      story.hasLocalAudio ||
      story.localUri ||
      story.localAudioUri
    );
  });
};

export const buildAutoFillItems = ({ stories = [], existingIds = new Set(), voiceId = null }) => {
  const playable = filterPlayableStories(stories);
  const items = [];

  playable.forEach((story) => {
    const storyKey = String(story.id);
    if (existingIds.has(storyKey)) {
      return;
    }
    const normalized = normalizeStoryToQueueItem(story, voiceId);
    if (normalized) {
      items.push(normalized);
    }
  });

  return items;
};
