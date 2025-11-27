import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { PlaybackQueueProvider, usePlaybackQueue } from '../PlaybackQueueProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../services/authService', () => ({
  getCurrentUserId: jest.fn().mockResolvedValue('user-1')
}));

describe('PlaybackQueueProvider hydration scoping', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('ignores persisted queue for mismatched owner', async () => {
    await AsyncStorage.setItem('playback_queue_state', JSON.stringify({
      version: 1,
      queue: [{ id: 'a', voiceId: 'voice-123' }],
      activeIndex: 0,
      lockedStoryId: null,
      userId: 'user-other',
      voiceId: 'voice-123'
    }));
    await AsyncStorage.setItem('playback_loop_mode', 'NONE');
    await AsyncStorage.setItem('active_voice_id', 'voice-xyz');

    const wrapper = ({ children }) => (
      <PlaybackQueueProvider disableHydration>
        {children}
      </PlaybackQueueProvider>
    );

    const { result } = renderHook(() => usePlaybackQueue(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.queue).toEqual([]);
    expect(result.current.activeIndex).toBe(-1);
  });
});
