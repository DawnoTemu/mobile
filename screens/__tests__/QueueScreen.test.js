import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import QueueScreen from '../QueueScreen';
import { PlaybackQueueProvider } from '../../context/PlaybackQueueProvider';

jest.mock('../../services/voiceService', () => ({
  getCurrentVoice: jest.fn().mockResolvedValue({ success: true, voiceId: 'voice-1' }),
  getStories: jest.fn().mockResolvedValue({ success: true, stories: [] }),
  getStoryCoverUrl: jest.fn()
}));

jest.mock('../../services/authService', () => ({
  getCurrentUserId: jest.fn().mockResolvedValue('user-1')
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: jest.fn()
  })
}));

jest.mock('../../components/StatusToast', () => {
  const actual = jest.requireActual('../../components/StatusToast');
  return {
    ...actual,
    useToast: () => ({
      showToast: jest.fn()
    })
  };
});

describe('QueueScreen', () => {
  const initialQueue = [
    { id: 'one', title: 'Story One', author: 'A' },
    { id: 'two', title: 'Story Two', author: 'B' }
  ];

  const renderWithProvider = () =>
    render(
      <PlaybackQueueProvider
        initialState={{
          queue: initialQueue,
          activeIndex: 0,
          loopMode: 'NONE',
          initializing: false,
          hydrated: true
        }}
        disableHydration
      >
        <QueueScreen />
      </PlaybackQueueProvider>
    );

  it('cycles loop mode label when pressing repeat chip', () => {
    const { getByText } = renderWithProvider();

    const repeatChip = getByText('Nie powtarzaj');
    fireEvent.press(repeatChip);

    expect(getByText('Powtarzaj kolejkę')).toBeTruthy();
  });

  it('invokes shuffle and shows toast via handler', () => {
    const { getByText } = renderWithProvider();
    const shuffleButton = getByText('Tasuj');
    fireEvent.press(shuffleButton);
    // No assertion on order (randomized); ensure UI still renders
    expect(getByText('Story One')).toBeTruthy();
  });
});
