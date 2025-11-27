import React, { useRef } from 'react';
import renderer, { act } from 'react-test-renderer';
import useActiveQueuePlayback from '../useActiveQueuePlayback';

const queueEntry = { id: 'story-1', title: 'One', hasAudio: true };

const Harness = ({
  playbackQueue,
  activeQueueIndex,
  selectedStory,
  handleStorySelect,
  findStoryById
}) => {
  const handleStorySelectRef = useRef(handleStorySelect);
  handleStorySelectRef.current = handleStorySelect;
  const suppressQueueAutoRef = useRef(false);

  useActiveQueuePlayback({
    playbackQueue,
    activeQueueIndex,
    queueLength: playbackQueue?.length || 0,
    findStoryById,
    selectedStory,
    handleStorySelectRef,
    suppressQueueAutoRef
  });

  return null;
};

describe('useActiveQueuePlayback', () => {
  it('calls story select handler when active queue item changes', () => {
    const handleStorySelect = jest.fn();
    const findStoryById = jest.fn(() => ({ ...queueEntry, resolved: true }));

    let testRenderer;
    act(() => {
      testRenderer = renderer.create(
        <Harness
          playbackQueue={[queueEntry]}
          activeQueueIndex={-1}
          selectedStory={null}
          handleStorySelect={handleStorySelect}
          findStoryById={findStoryById}
        />
      );
    });

    act(() => {
      testRenderer.update(
        <Harness
          playbackQueue={[queueEntry]}
          activeQueueIndex={0}
          selectedStory={null}
          handleStorySelect={handleStorySelect}
          findStoryById={findStoryById}
        />
      );
    });

    expect(handleStorySelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'story-1' }),
      expect.objectContaining({ skipQueueSync: true })
    );
  });
});
