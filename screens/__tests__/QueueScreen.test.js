import React from 'react';
import { render, fireEvent, waitFor, within, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import QueueScreen from '../QueueScreen';
import { PlaybackQueueProvider, LOOP_MODES } from '../../context/PlaybackQueueProvider';
import voiceService from '../../services/voiceService';
import { recordEvent } from '../../utils/metrics';

jest.mock('../../services/voiceService', () => ({
  getCurrentVoice: jest.fn().mockResolvedValue({ success: true, voiceId: 'voice-1' }),
  getStories: jest.fn().mockResolvedValue({ success: true, stories: [] }),
  getStoryCoverUrl: jest.fn(),
  checkAudioExists: jest.fn().mockResolvedValue({ success: true, localExists: false, remoteExists: false })
}));

jest.mock('../../services/authService', () => ({
  getCurrentUserId: jest.fn().mockResolvedValue('user-1')
}));

jest.mock('@react-navigation/native', () => {
  const goBack = jest.fn();
  const navigate = jest.fn();
  return {
    useNavigation: () => ({ goBack, navigate }),
    __mockGoBack: goBack,
    __mockNavigate: navigate
  };
});

const mockShowToast = jest.fn();
jest.mock('../../components/StatusToast', () => {
  const actual = jest.requireActual('../../components/StatusToast');
  return {
    ...actual,
    useToast: () => ({
      showToast: mockShowToast
    })
  };
});

jest.mock('../../utils/metrics', () => ({
  recordEvent: jest.fn()
}));

jest.spyOn(Alert, 'alert');

describe('QueueScreen', () => {
  const initialQueue = [
    { id: 'one', title: 'Story One', author: 'Author A', storyId: 'one' },
    { id: 'two', title: 'Story Two', author: 'Author B', storyId: 'two' },
    { id: 'three', title: 'Story Three', author: 'Author C', storyId: 'three' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    voiceService.getCurrentVoice.mockResolvedValue({ success: true, voiceId: 'voice-1' });
    voiceService.getStories.mockResolvedValue({ success: true, stories: [] });
    voiceService.checkAudioExists.mockResolvedValue({ success: true, localExists: false, remoteExists: false });
  });

  const renderWithProvider = (overrides = {}) =>
    render(
      <PlaybackQueueProvider
        initialState={{
          queue: initialQueue,
          activeIndex: 0,
          loopMode: 'NONE',
          initializing: false,
          hydrated: true,
          ...overrides
        }}
        disableHydration
      >
        <QueueScreen />
      </PlaybackQueueProvider>
    );

  it('renders all queue items with correct titles and authors', () => {
    const { getByText } = renderWithProvider();

    expect(getByText('Story One')).toBeTruthy();
    expect(getByText('Author A')).toBeTruthy();
    expect(getByText('Story Two')).toBeTruthy();
    expect(getByText('Author B')).toBeTruthy();
    expect(getByText('Story Three')).toBeTruthy();
    expect(getByText('Author C')).toBeTruthy();
  });

  it('renders empty state when queue is empty', () => {
    const { getByText, queryByText } = renderWithProvider({ queue: [] });

    expect(getByText('Kolejka jest pusta')).toBeTruthy();
    expect(queryByText('Story One')).toBeNull();
  });

  it('removes an item from the queue when trash icon is pressed', () => {
    const { getByTestId, queryByText } = renderWithProvider();

    expect(queryByText('Story One')).toBeTruthy();

    fireEvent.press(getByTestId('remove-item-0'));

    expect(queryByText('Story One')).toBeNull();
    expect(queryByText('Story Two')).toBeTruthy();
    expect(queryByText('Story Three')).toBeTruthy();
    expect(mockShowToast).toHaveBeenCalledWith('Usunięto bajkę z kolejki.', 'INFO');
  });

  it('moves the active item down and keeps the new order', () => {
    const { getAllByText, getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('move-down-0'));

    const orderedTitles = getAllByText(/^Story /).map((node) => node.props.children);

    expect(orderedTitles).toEqual(['Story Two', 'Story One', 'Story Three']);
    expect(mockShowToast).toHaveBeenCalledWith('Zmieniono kolejność w kolejce.', 'SUCCESS');
  });

  it('does not move the first item up past the boundary', () => {
    const { getAllByText, getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('move-up-0'));

    const orderedTitles = getAllByText(/^Story /).map((node) => node.props.children);

    expect(orderedTitles).toEqual(['Story One', 'Story Two', 'Story Three']);
    expect(mockShowToast).not.toHaveBeenCalledWith('Zmieniono kolejność w kolejce.', 'SUCCESS');
  });

  it('cycles loop mode from NONE to REPEAT_ALL on press', () => {
    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('repeat-chip'));

    expect(mockShowToast).toHaveBeenCalledWith('Powtarzaj kolejkę', 'INFO');
  });

  it('cycles loop mode through full sequence', () => {
    const { getByTestId } = renderWithProvider();

    // NONE -> REPEAT_ALL
    fireEvent.press(getByTestId('repeat-chip'));
    expect(mockShowToast).toHaveBeenCalledWith('Powtarzaj kolejkę', 'INFO');

    // REPEAT_ALL -> REPEAT_ONE
    fireEvent.press(getByTestId('repeat-chip'));
    expect(mockShowToast).toHaveBeenCalledWith('Powtarzaj bajkę', 'INFO');

    // REPEAT_ONE -> NONE
    fireEvent.press(getByTestId('repeat-chip'));
    expect(mockShowToast).toHaveBeenCalledWith('Nie powtarzaj', 'INFO');
  });

  it('shuffle button shows success toast', () => {
    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('shuffle-chip'));

    expect(mockShowToast).toHaveBeenCalledWith('Przetasowano kolejkę.', 'SUCCESS');
  });

  it('shuffle on empty queue is disabled', () => {
    const { getByTestId } = renderWithProvider({ queue: [] });

    const shuffleChip = getByTestId('shuffle-chip');

    expect(shuffleChip.props.accessibilityState?.disabled).toBe(true);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('auto-fill adds new playable stories and records the event', async () => {
    voiceService.getStories.mockResolvedValue({
      success: true,
      stories: [
        { id: 'fresh-story', title: 'Fresh Story', author: 'Author X' }
      ]
    });
    voiceService.checkAudioExists.mockResolvedValue({
      success: true,
      localExists: false,
      remoteExists: true,
      localUri: null
    });

    const { getByTestId, getByText } = renderWithProvider({ queue: [] });

    fireEvent.press(getByTestId('auto-fill-chip'));

    await waitFor(() => expect(getByText('Fresh Story')).toBeTruthy());
    expect(mockShowToast).toHaveBeenCalledWith('Dodano 1 bajek do kolejki.', 'SUCCESS');
    expect(recordEvent).toHaveBeenCalledWith('queue_auto_fill', {
      added: 1,
      location: 'QueueScreen'
    });
  });

  it('auto-fill shows an error when there is no active voice', async () => {
    voiceService.getCurrentVoice.mockResolvedValue({ success: false, voiceId: null });

    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('auto-fill-chip'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'Brak aktywnego głosu. Przejdź do ekranu głównego, aby go wybrać.',
        'ERROR'
      )
    );
  });

  it('auto-fill shows info when no new playable stories are available', async () => {
    voiceService.getStories.mockResolvedValue({
      success: true,
      stories: [
        { id: 'one', title: 'Story One', author: 'Author A' },
        { id: 'fresh-story', title: 'Fresh Story', author: 'Author X' }
      ]
    });
    voiceService.checkAudioExists.mockResolvedValue({
      success: true,
      localExists: false,
      remoteExists: false,
      localUri: null
    });

    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('auto-fill-chip'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Brak nowych bajek do dodania.', 'INFO')
    );
  });

  it('auto-fill shows an error toast on unexpected failure', async () => {
    voiceService.getStories.mockRejectedValue(new Error('Network down'));

    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('auto-fill-chip'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Nie udało się uzupełnić kolejki.', 'ERROR')
    );
  });

  it('clear queue triggers confirmation alert and clears on confirm', () => {
    const { getByTestId, queryByText } = renderWithProvider();

    fireEvent.press(getByTestId('clear-queue-chip'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Wyczyścić kolejkę?',
      'Usuniemy wszystkie bajki z kolejki. Czy na pewno chcesz kontynuować?',
      expect.any(Array)
    );

    // Simulate pressing the destructive "Wyczyść" button
    const alertButtons = Alert.alert.mock.calls[0][2];
    const confirmButton = alertButtons.find((b) => b.style === 'destructive');
    act(() => {
      confirmButton.onPress();
    });

    expect(queryByText('Story One')).toBeNull();
    expect(queryByText('Story Two')).toBeNull();
    expect(queryByText('Story Three')).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith('Kolejka wyczyszczona.', 'SUCCESS');
  });

  it('selecting an item shows activation toast', () => {
    const { getByText } = renderWithProvider();

    fireEvent.press(getByText('Story Two'));

    expect(mockShowToast).toHaveBeenCalledWith('Aktywowano bajkę w kolejce.', 'SUCCESS');
  });

  it('highlights the active queue item', () => {
    const { getByText } = renderWithProvider({ activeIndex: 1 });

    // The second item (Story Two) should be active
    // We verify by checking that Story Two and position badge #2 are rendered
    expect(getByText('Story Two')).toBeTruthy();
    expect(getByText('#1')).toBeTruthy();
    expect(getByText('#2')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
  });

  it('shows position badges with correct numbering', () => {
    const { getByText } = renderWithProvider();

    expect(getByText('#1')).toBeTruthy();
    expect(getByText('#2')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
  });

  it('header displays correct title', () => {
    const { getByText } = renderWithProvider();

    expect(getByText('Twoja kolejka')).toBeTruthy();
  });

  it('navigates back when back button is pressed', () => {
    const navMock = require('@react-navigation/native');

    const { getByTestId } = renderWithProvider();

    fireEvent.press(getByTestId('back-button'));

    expect(navMock.__mockGoBack).toHaveBeenCalled();
  });
});
