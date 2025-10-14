jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { queueReducer, initialQueueState, LOOP_MODES, serializeQueueState } from '../PlaybackQueueProvider';

describe('queueReducer', () => {
  it('enqueues items and activates the first entry when the queue was empty', () => {
    const result = queueReducer(initialQueueState, {
      type: 'QUEUE_ENQUEUE',
      payload: { items: [{ id: 'story-1' }] }
    });

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]).toEqual({ id: 'story-1' });
    expect(result.activeIndex).toBe(0);
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
  });
});
