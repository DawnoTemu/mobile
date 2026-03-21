import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
  useFocusEffect: jest.fn()
}));

const mockShowToast = jest.fn();
jest.mock('../../components/StatusToast', () => ({
  useToast: () => ({ showToast: mockShowToast })
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true })
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock-doc-dir/',
  cacheDirectory: '/mock-cache-dir/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }
}));

jest.mock('expo-image', () => ({
  Image: 'Image'
}));

jest.mock('../../services/voiceService', () => ({
  getCurrentVoice: jest.fn().mockResolvedValue({ success: true, voiceId: 'v1' }),
  getStories: jest.fn().mockResolvedValue({
    success: true,
    stories: [
      {
        id: 'story-1',
        title: 'Bajka testowa',
        author: 'Autor',
        hasAudio: false,
        hasLocalAudio: false,
        content: 'Treść bajki testowej',
        cover_url: null
      }
    ]
  }),
  getStoryCoverUrl: jest.fn(),
  checkAudioExists: jest.fn().mockResolvedValue({ success: true, localExists: false, remoteExists: false }),
  savePlaybackProgress: jest.fn().mockResolvedValue({ success: true }),
  getPlaybackProgress: jest.fn().mockResolvedValue({ success: false })
}));

jest.mock('../../services/authService', () => ({
  getCurrentUserId: jest.fn().mockResolvedValue('user-1'),
  subscribeAuthEvents: jest.fn(() => jest.fn())
}));

let mockSubscriptionState = {
  isSubscribed: false,
  loading: false,
  expirationDate: null,
  willRenew: false,
  error: null,
  trial: { active: false, expiresAt: null, daysRemaining: 0 },
  canGenerate: false,
  backendCanGenerate: false,
  showOnboarding: false,
  showLapseModal: false
};

jest.mock('../../hooks/useSubscription', () => ({
  useSubscription: () => mockSubscriptionState,
  useSubscriptionActions: () => ({
    refresh: jest.fn().mockResolvedValue({ success: true }),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ success: false }),
    dismissOnboarding: jest.fn(),
    dismissLapseModal: jest.fn()
  })
}));

jest.mock('../../hooks/useCredits', () => ({
  useCredits: () => ({
    balance: 100,
    loading: false,
    initializing: false,
    error: null,
    unitLabel: 'Punkty Magii'
  }),
  useCreditActions: () => ({
    refreshCredits: jest.fn().mockResolvedValue(undefined)
  })
}));

jest.mock('../../hooks/useAudioPlayer', () => () => ({
  sound: null,
  isPlaying: false,
  duration: 0,
  position: 0,
  isLoading: false,
  loadAudio: jest.fn(),
  togglePlayPause: jest.fn(),
  rewind: jest.fn(),
  forward: jest.fn(),
  seekTo: jest.fn(),
  formatTime: jest.fn(() => '0:00'),
  unloadAudio: jest.fn()
}));

jest.mock('../../context/PlaybackQueueProvider', () => ({
  usePlaybackQueue: () => ({ queue: [], activeIndex: null, loopMode: 'NONE' }),
  usePlaybackQueueDispatch: () => ({
    enqueue: jest.fn(),
    enqueueNext: jest.fn(),
    removeFromQueue: jest.fn(),
    setActiveItem: jest.fn(),
    clearQueue: jest.fn(),
    advance: jest.fn(),
    setLoopMode: jest.fn()
  }),
  LOOP_MODES: { NONE: 'NONE', REPEAT_ONE: 'REPEAT_ONE', REPEAT_ALL: 'REPEAT_ALL' }
}));

jest.mock('../../hooks/useQueueDerivedState', () => {
  const fn = () => ({
    queueIndexByStoryId: new Map(),
    storyProgress: {}
  });
  fn.resolveQueueStoryId = (s) => String(s.id);
  return { __esModule: true, default: fn, resolveQueueStoryId: fn.resolveQueueStoryId };
});

jest.mock('../../hooks/useActiveQueuePlayback', () => () => ({
  activeGenerationStoryId: null,
  generationStatusByStory: {}
}));

jest.mock('../../hooks/useQueueActions', () => () => ({
  handleAddStoryToQueue: jest.fn(),
  handlePlayNextStory: jest.fn()
}));

jest.mock('../../hooks/useQueuePlaybackControls', () => () => ({
  handleSkipToNextFromControls: jest.fn(),
  handleSkipToPreviousFromControls: jest.fn(),
  handleAutoAdvanceOnComplete: jest.fn()
}));

jest.mock('../../hooks/useSynthesisData', () => ({
  __esModule: true,
  default: (params) => ({
    fetchStoriesAndVoiceId: async () => {
      params.setVoiceId('v1');
      params.setStories([
        {
          id: 'story-1',
          title: 'Bajka testowa',
          author: 'Autor',
          hasAudio: false,
          hasLocalAudio: false,
          content: 'Treść bajki testowej',
          cover_url: null
        }
      ]);
      params.setIsLoading(false);
      return { success: true };
    },
    handleApiError: jest.fn()
  })
}));

jest.mock('../../services/playbackQueueService', () => ({
  filterPlayableStories: jest.fn(() => [])
}));

jest.mock('../../utils/metrics', () => ({
  recordEvent: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../components/StoryItem', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ title, onPress }) => (
    <TouchableOpacity onPress={onPress} testID="story-item">
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock('../../components/AppMenu', () => 'AppMenu');
jest.mock('../../components/AudioControls', () => 'AudioControls');
jest.mock('../../components/Modals/ConfirmModal', () => 'ConfirmModal');
jest.mock('../../components/Modals/ProgressModal', () => 'ProgressModal');
jest.mock('../../components/Modals/OnboardingModal', () => 'OnboardingModal');
jest.mock('../../components/Modals/SubscriptionLapseModal', () => 'SubscriptionLapseModal');
jest.mock('../../components/synthesis/SynthesisHeader', () => 'SynthesisHeader');

import SynthesisScreen from '../SynthesisScreen';

describe('SynthesisScreen canGenerate gating', () => {
  const navigation = { navigate: mockNavigate, replace: mockReplace };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionState = {
      isSubscribed: false,
      loading: false,
      expirationDate: null,
      willRenew: false,
      error: null,
      trial: { active: false, expiresAt: null, daysRemaining: 0 },
      canGenerate: false,
      backendCanGenerate: false,
      showOnboarding: false,
      showLapseModal: false
    };
  });

  it('shows trial-expired message when trial is inactive and user is not subscribed', async () => {
    const { findByText } = render(
      <SynthesisScreen navigation={navigation} />
    );

    const storyTitle = await findByText('Bajka testowa');
    fireEvent.press(storyTitle);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Okres próbny się zakończył. Subskrybuj, aby generować nowe bajki.',
        'INFO'
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('Subscription');
  });

  it('allows generation flow to proceed when canGenerate is true', async () => {
    mockSubscriptionState = {
      ...mockSubscriptionState,
      isSubscribed: true,
      canGenerate: true,
      backendCanGenerate: true
    };

    const { findByText } = render(
      <SynthesisScreen navigation={navigation} />
    );

    const storyTitle = await findByText('Bajka testowa');
    fireEvent.press(storyTitle);

    // Should NOT show a gating toast or navigate to Subscription
    await waitFor(() => {
      expect(mockShowToast).not.toHaveBeenCalledWith(
        expect.stringContaining('Subskrybuj'),
        expect.any(String)
      );
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('Subscription');
  });

  it('allows generation when backendCanGenerate is null but user is subscribed (fallback path)', async () => {
    mockSubscriptionState = {
      ...mockSubscriptionState,
      isSubscribed: true,
      canGenerate: true,
      backendCanGenerate: null
    };

    const { findByText } = render(
      <SynthesisScreen navigation={navigation} />
    );

    const storyTitle = await findByText('Bajka testowa');
    fireEvent.press(storyTitle);

    await waitFor(() => {
      expect(mockShowToast).not.toHaveBeenCalledWith(
        expect.stringContaining('Subskrybuj'),
        expect.any(String)
      );
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('Subscription');
  });

  it('shows credits message without navigating when subscribed but canGenerate is false', async () => {
    mockSubscriptionState = {
      ...mockSubscriptionState,
      isSubscribed: true,
      canGenerate: false,
      backendCanGenerate: false
    };

    const { findByText } = render(
      <SynthesisScreen navigation={navigation} />
    );

    const storyTitle = await findByText('Bajka testowa');
    fireEvent.press(storyTitle);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Brakuje Punktów Magii, aby wygenerować tę bajkę.',
        'INFO'
      );
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('Subscription');
  });

  it('shows trial-limit-exhausted message when trial is active but canGenerate is false', async () => {
    mockSubscriptionState = {
      ...mockSubscriptionState,
      trial: { active: true, expiresAt: null, daysRemaining: 5 },
      canGenerate: false
    };

    const { findByText } = render(
      <SynthesisScreen navigation={navigation} />
    );

    const storyTitle = await findByText('Bajka testowa');
    fireEvent.press(storyTitle);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Twój limit w okresie próbnym został wyczerpany. Subskrybuj, aby generować więcej bajek.',
        'INFO'
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('Subscription');
  });
});
