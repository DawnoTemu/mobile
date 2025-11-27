import { renderHook, act } from '@testing-library/react-native';
import useQueuePlaybackControls from '../useQueuePlaybackControls';
import { LOOP_MODES } from '../../context/PlaybackQueueProvider';

const noop = () => {};

describe('useQueuePlaybackControls', () => {
  it('skips to next respecting repeat-all wrap', () => {
    const setActiveQueueItem = jest.fn();
    const { result } = renderHook(() =>
      useQueuePlaybackControls({
        queueLength: 2,
        activeQueueIndex: 1,
        loopMode: LOOP_MODES.REPEAT_ALL,
        setActiveQueueItem,
        seekTo: jest.fn(),
        togglePlayPause: jest.fn(),
        isPlaying: true,
        position: 0,
        advanceQueue: noop
      })
    );

    act(() => {
      result.current.handleSkipToNextFromControls();
    });

    expect(setActiveQueueItem).toHaveBeenCalledWith({ index: 0 });
  });

  it('skips to previous with wrap respecting loop mode', () => {
    const setActiveQueueItem = jest.fn();
    const { result } = renderHook(() =>
      useQueuePlaybackControls({
        queueLength: 3,
        activeQueueIndex: 0,
        loopMode: LOOP_MODES.REPEAT_ALL,
        setActiveQueueItem,
        seekTo: jest.fn(),
        togglePlayPause: jest.fn(),
        isPlaying: true,
        position: 0,
        advanceQueue: noop
      })
    );

    act(() => {
      result.current.handleSkipToPreviousFromControls();
    });

    expect(setActiveQueueItem).toHaveBeenCalledWith({ index: 2 });
  });

  it('auto-advance delegates repeat-one', () => {
    const repeatOneSpy = jest.fn();
    const advanceSpy = jest.fn();
    const { result: repeatHook } = renderHook(() =>
      useQueuePlaybackControls({
        queueLength: 1,
        activeQueueIndex: 0,
        loopMode: LOOP_MODES.REPEAT_ONE,
        setActiveQueueItem: jest.fn(),
        seekTo: jest.fn(),
        togglePlayPause: jest.fn(),
        isPlaying: false,
        position: 0,
        advanceQueue: advanceSpy
      })
    );

    repeatHook.current.handleAutoAdvanceOnComplete({
      normalizedStoryId: 'story-1',
      repeatOneBehavior: repeatOneSpy
    });

    expect(repeatOneSpy).toHaveBeenCalled();
    expect(advanceSpy).not.toHaveBeenCalled();
  });
});
