import {
  normalizeStoryToQueueItem,
  filterPlayableStories,
  buildAutoFillItems,
  collectQueueStoryIds
} from '../playbackQueueService';

describe('playbackQueueService', () => {
  it('normalizes story into queue item with voiceId', () => {
    const story = { id: '1', title: 'Story', author: 'Author', hasAudio: true };
    const item = normalizeStoryToQueueItem(story, 'voice-123');

    expect(item).toMatchObject({
      id: '1',
      storyId: '1',
      title: 'Story',
      author: 'Author',
      hasAudio: true,
      voiceId: 'voice-123'
    });
  });

  it('filters playable stories', () => {
    const stories = [
      { id: 'a', hasAudio: true },
      { id: 'b', hasLocalAudio: true },
      { id: 'c' }
    ];

    const playable = filterPlayableStories(stories);
    expect(playable.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('builds auto-fill items skipping existing ids', () => {
    const stories = [
      { id: 'a', hasAudio: true },
      { id: 'b', hasAudio: true }
    ];
    const existing = new Set(['b']);
    const items = buildAutoFillItems({ stories, existingIds: existing, voiceId: 'voice-1' });

    expect(items).toHaveLength(1);
    expect(items[0].storyId).toBe('a');
    expect(items[0].voiceId).toBe('voice-1');
  });

  it('collects queue story ids', () => {
    const queue = [{ id: 'a' }, { storyId: 'b' }, 'c'];
    const ids = collectQueueStoryIds(queue);
    expect(Array.from(ids)).toEqual(['a', 'b', 'c']);
  });
});
