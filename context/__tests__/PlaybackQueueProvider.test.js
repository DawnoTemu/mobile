jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { queueReducer, initialQueueState, LOOP_MODES, serializeQueueState } from '../PlaybackQueueProvider';

describe('queueReducer', () => {
  it('reorders queue while preserving active item', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      activeIndex: 1,
      initializing: false,
      hydrated: true
    };

    const nextQueue = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    const result = queueReducer(baseState, {
      type: 'QUEUE_REORDER',
      payload: { queue: nextQueue }
    });

    expect(result.queue).toEqual(nextQueue);
    expect(result.activeIndex).toBe(1); // story b should stay active
  });

  it('shuffles queue and keeps the same active story', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      activeIndex: 2,
      initializing: false,
      hydrated: true
    };

    const result = queueReducer(baseState, { type: 'QUEUE_SHUFFLE' });
    const activeStoryId = result.queue[result.activeIndex]?.id;

    expect(result.queue).toHaveLength(4);
    expect(activeStoryId).toBe('c');
  });

  it('enqueues items without auto-activating when no active item exists', () => {
    const result = queueReducer(initialQueueState, {
      type: 'QUEUE_ENQUEUE',
      payload: { items: [{ id: 'story-1' }] }
    });

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]).toEqual({ id: 'story-1' });
    expect(result.activeIndex).toBe(-1);
    expect(result.initializing).toBe(false);
    expect(result.hydrated).toBe(true);
  });

  it('inserts the next items directly after the active index', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }],
      activeIndex: 0,
      initializing: false,
      hydrated: true
    };

    const result = queueReducer(baseState, {
      type: 'QUEUE_ENQUEUE_NEXT',
      payload: { items: [{ id: 'c' }] }
    });

    expect(result.queue.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(result.activeIndex).toBe(0);
  });

  it('removes an item and keeps the queue consistent', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      activeIndex: 1,
      initializing: false,
      hydrated: true,
      lockedStoryId: 'b'
    };

    const result = queueReducer(baseState, {
      type: 'QUEUE_REMOVE',
      payload: { storyId: 'b' }
    });

    expect(result.queue.map((item) => item.id)).toEqual(['a', 'c']);
    expect(result.activeIndex).toBe(1);
    expect(result.lockedStoryId).toBeNull();
  });

  it('advances according to loop modes', () => {
    const baseQueue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const noneState = {
      ...initialQueueState,
      queue: baseQueue,
      activeIndex: 2,
      loopMode: LOOP_MODES.NONE,
      initializing: false,
      hydrated: true
    };
    const noneAdvance = queueReducer(noneState, { type: 'QUEUE_ADVANCE' });
    expect(noneAdvance.activeIndex).toBe(-1);

    const repeatAllState = {
      ...noneState,
      loopMode: LOOP_MODES.REPEAT_ALL
    };
    const repeatAllAdvance = queueReducer(repeatAllState, { type: 'QUEUE_ADVANCE' });
    expect(repeatAllAdvance.activeIndex).toBe(0);

    const repeatOneState = {
      ...noneState,
      activeIndex: 1,
      loopMode: LOOP_MODES.REPEAT_ONE
    };
    const repeatOneAdvance = queueReducer(repeatOneState, { type: 'QUEUE_ADVANCE' });
    expect(repeatOneAdvance.activeIndex).toBe(1);
  });

  it('retreats with wrap-around when repeating all', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      activeIndex: 0,
      loopMode: LOOP_MODES.REPEAT_ALL,
      initializing: false,
      hydrated: true
    };

    const result = queueReducer(baseState, { type: 'QUEUE_RETREAT' });
    expect(result.activeIndex).toBe(2);
  });

  it('sets loop mode and locks the active story in repeat-one mode', () => {
    const baseState = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }],
      activeIndex: 1,
      initializing: false,
      hydrated: true
    };

    const repeatOne = queueReducer(baseState, {
      type: 'QUEUE_SET_LOOP_MODE',
      payload: { loopMode: LOOP_MODES.REPEAT_ONE }
    });

    expect(repeatOne.loopMode).toBe(LOOP_MODES.REPEAT_ONE);
    expect(repeatOne.lockedStoryId).toBe('b');

    const repeatNone = queueReducer(repeatOne, {
      type: 'QUEUE_SET_LOOP_MODE',
      payload: { loopMode: LOOP_MODES.NONE }
    });

    expect(repeatNone.loopMode).toBe(LOOP_MODES.NONE);
    expect(repeatNone.lockedStoryId).toBeNull();
  });
});

describe('serializeQueueState', () => {
  it('truncates oversized queues when serializing', () => {
    const oversizedQueue = Array.from({ length: 300 }).map((_, index) => ({ id: `item-${index}` }));
    const state = {
      ...initialQueueState,
      queue: oversizedQueue,
      activeIndex: 50,
      lockedStoryId: 'item-50',
      initializing: false,
      hydrated: true
    };

    const snapshot = serializeQueueState(state);

    expect(snapshot.queue.length).toBeLessThan(300);
    expect(snapshot.activeIndex).toBeLessThan(snapshot.queue.length);
    expect(snapshot.version).toBeDefined();
  });

  it('serializes queue with safe indices and locked story', () => {
    const state = {
      ...initialQueueState,
      queue: [{ id: 'a' }, { id: 'b' }],
      activeIndex: 10,
      lockedStoryId: 'missing',
      initializing: false,
      hydrated: true
    };

    const snapshot = serializeQueueState(state);

    expect(snapshot.queue).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(snapshot.activeIndex).toBe(1);
    expect(snapshot.lockedStoryId).toBeNull();
    expect(snapshot.version).toBeDefined();
  });
});
