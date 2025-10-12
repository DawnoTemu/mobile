import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import StoryItem from '../components/StoryItem';
import AudioControls from '../components/AudioControls';
import ConfirmModal from '../components/Modals/ConfirmModal';
import ProgressModal from '../components/Modals/ProgressModal';
import { useToast } from '../components/StatusToast';
import useAudioPlayer from '../hooks/useAudioPlayer';
import { useCredits, useCreditActions } from '../hooks/useCredits';
import voiceService from '../services/voiceService';
import { COLORS } from '../styles/colors';
import AppMenu from '../components/AppMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const STORAGE_KEYS = {
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio'
};

const STATUS_COPY = {
  queued_for_slot: 'Twoja prośba jest w kolejce. Przydzielimy slot głosowy w ciągu kilku chwil.',
  allocating_voice: 'Twój głos jest aktywowany w ElevenLabs… odtwarzanie rozpocznie się automatycznie.',
  processing: 'Generujemy opowieść w Twoim głosie. To zwykle trwa ok. 30–90 sekund.',
  downloading: 'Pobieranie nagrania...',
  ready: 'Nagranie jest gotowe – możesz teraz odtworzyć historię.',
  error: 'Wystąpił problem podczas generowania bajki.'
};

const STATUS_PROGRESS_MAP = {
  queued_for_slot: 8,
  allocating_voice: 20,
  processing: 60,
  downloading: 85,
  ready: 100
};

export default function SynthesisScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const creditState = useCredits();
  const creditActions = useCreditActions();
  const {
    balance = 0,
    unitLabel = 'Story Points (Punkty Magii)',
    loading: creditsLoading = false,
    error: creditsError = null,
    initializing: creditsInitializing = false
  } = creditState || {};
  const {
    refreshCredits
  } = creditActions || {};
  
  // Audio player hook
  const {
    isPlaying,
    duration,
    position,
    isLoading: isAudioLoading,
    loadAudio,
    togglePlayPause,
    rewind,
    forward,
    seekTo,
    formatTime,
    unloadAudio,
  } = useAudioPlayer();
  
  // State
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState(null);
  const [processingStories, setProcessingStories] = useState({});
  const [audioControlsVisible, setAudioControlsVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [voiceId, setVoiceId] = useState(null);
  const [isProgressModalVisible, setIsProgressModalVisible] = useState(false);
  const [progressData, setProgressData] = useState({
    progress: 0,
    status: '',
    statusKey: null,
    queuePosition: null,
    queueLength: null,
    storyId: null
  });
  const [isOnline, setIsOnline] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [isGenerationConfirmVisible, setIsGenerationConfirmVisible] = useState(false);
  const [generationStatusByStory, setGenerationStatusByStory] = useState({});
  const [activeGenerationStoryId, setActiveGenerationStoryId] = useState(null);

  const formatQueueMessage = useCallback((position, length) => {
    if (position === null || position === undefined) {
      return null;
    }
    const numericPosition = Number(position);
    if (!Number.isFinite(numericPosition) || numericPosition < 0) {
      return null;
    }
    const displayPosition = Math.floor(numericPosition) + 1;
    if (length === null || length === undefined) {
      return `Miejsce w kolejce: ${displayPosition}`;
    }
    const numericLength = Number(length);
    if (!Number.isFinite(numericLength) || numericLength < 0) {
      return `Miejsce w kolejce: ${displayPosition}`;
    }
    return `Miejsce w kolejce: ${displayPosition}/${Math.max(
      1,
      Math.floor(numericLength)
    )}`;
  }, []);

  const statusToProgress = useCallback((status) => {
    if (typeof status !== 'string') {
      return null;
    }
    const normalized = status.trim().toLowerCase();
    const mapped = STATUS_PROGRESS_MAP[normalized];
    return typeof mapped === 'number' ? mapped : null;
  }, []);

  const hydrateGenerationState = useCallback(
    async (currentVoiceId) => {
      if (!currentVoiceId) {
        return;
      }
      try {
        const snapshotMap = await voiceService.listGenerationStateSnapshots({
          voiceId: currentVoiceId
        });
        const voiceKey = String(currentVoiceId);
        const voiceSnapshots = snapshotMap?.[voiceKey] || {};

        setGenerationStatusByStory(() => {
          const next = {};
          Object.entries(voiceSnapshots).forEach(([storyKey, snapshot]) => {
            if (
              snapshot &&
              typeof snapshot === 'object' &&
              snapshot.status &&
              snapshot.status !== 'ready'
            ) {
              next[storyKey] = snapshot;
            }
          });
          return next;
        });

        setProcessingStories(() => {
          const next = {};
          Object.entries(voiceSnapshots).forEach(([storyKey, snapshot]) => {
            if (
              snapshot &&
              typeof snapshot === 'object' &&
              snapshot.status &&
              snapshot.status !== 'ready'
            ) {
              next[storyKey] = true;
            }
          });
          return next;
        });

        const selectedSnapshot =
          selectedStory && voiceSnapshots?.[String(selectedStory.id)];
        if (selectedSnapshot && selectedSnapshot.status !== 'ready') {
          const queueText = formatQueueMessage(
            selectedSnapshot.queuePosition,
            selectedSnapshot.queueLength
          );
          const message =
            selectedSnapshot.message ||
            STATUS_COPY[selectedSnapshot.status] ||
            STATUS_COPY.processing;
          const statusLine = queueText ? `${message}\n${queueText}` : message;
          const progress =
            statusToProgress(selectedSnapshot.status) ?? progressData.progress;
          setProgressData((prev) => ({
            ...prev,
            progress,
            status: statusLine,
            statusKey: selectedSnapshot.status,
            queuePosition: selectedSnapshot.queuePosition ?? null,
            queueLength: selectedSnapshot.queueLength ?? null,
            storyId: selectedStory.id
          }));
          setIsProgressModalVisible(true);
        } else if (
          activeGenerationStoryId &&
          !voiceSnapshots?.[String(activeGenerationStoryId)]
        ) {
          setIsProgressModalVisible(false);
          setProgressData({
            progress: 0,
            status: '',
            statusKey: null,
            queuePosition: null,
            queueLength: null,
            storyId: null
          });
        }
      } catch (error) {
        console.error('Failed to hydrate generation state:', error);
      }
    },
    [
      activeGenerationStoryId,
      formatQueueMessage,
      progressData.progress,
      selectedStory,
      statusToProgress
    ]
  );

  const handleGenerationEvent = useCallback(
    (storyId, event = {}) => {
      if (!storyId || !event || typeof event !== 'object') {
        return;
      }

      const statusValue = typeof event.status === 'string' ? event.status : null;
      const normalizedStatus = statusValue ? statusValue.trim().toLowerCase() : null;
      const rawQueuePosition =
        event.queuePosition !== undefined ? event.queuePosition : null;
      const rawQueueLength =
        event.queueLength !== undefined ? event.queueLength : null;
      const queuePosition = Number(rawQueuePosition);
      const queueLength = Number(rawQueueLength);
      const safeQueuePosition =
        Number.isFinite(queuePosition) && queuePosition >= 0
          ? Math.floor(queuePosition)
          : null;
      const safeQueueLength =
        Number.isFinite(queueLength) && queueLength >= 0
          ? Math.floor(queueLength)
          : null;
      const queueText = formatQueueMessage(safeQueuePosition, safeQueueLength);

      const message =
        event.message ||
        (normalizedStatus && STATUS_COPY[normalizedStatus]) ||
        STATUS_COPY.processing;
      const statusLine = queueText ? `${message}\n${queueText}` : message;

      if (normalizedStatus === 'ready') {
        setGenerationStatusByStory((prev) => {
          if (!prev[storyId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      } else if (normalizedStatus) {
        setGenerationStatusByStory((prev) => ({
          ...prev,
          [storyId]: {
            ...(prev[storyId] || {}),
            status: normalizedStatus,
            queuePosition: safeQueuePosition,
            queueLength: safeQueueLength,
            remoteVoiceId:
              event.remoteVoiceId ??
              prev[storyId]?.remoteVoiceId ??
              event.metadata?.remoteVoiceId ??
              null,
            allocationStatus:
              event.allocationStatus ??
              prev[storyId]?.allocationStatus ??
              null,
            serviceProvider:
              event.serviceProvider ?? prev[storyId]?.serviceProvider ?? null,
            message,
            phase: event.phase || prev[storyId]?.phase || null,
            updatedAt: Date.now(),
            metadata: event.metadata || prev[storyId]?.metadata || null
          }
        }));
      }

      if (normalizedStatus) {
        setProcessingStories((prev) => {
          const next = { ...prev };
          if (
            normalizedStatus === 'queued_for_slot' ||
            normalizedStatus === 'allocating_voice' ||
            normalizedStatus === 'processing' ||
            normalizedStatus === 'downloading'
          ) {
            next[storyId] = true;
          } else {
            delete next[storyId];
          }
          return next;
        });
      }

      if (normalizedStatus === 'ready' || normalizedStatus === 'error') {
        setIsProgressModalVisible(false);
      } else if (normalizedStatus) {
        setIsProgressModalVisible(true);
      }

      setProgressData((prev) => {
        const incomingProgress =
          typeof event.progress === 'number'
            ? Math.max(0, Math.min(event.progress, 1))
            : null;
        const progressFromStatus =
          statusToProgress(normalizedStatus) ?? prev.progress ?? 0;
        const computedProgress =
          incomingProgress !== null
            ? Math.round(incomingProgress * 100)
            : progressFromStatus;

        return {
          progress: Number.isFinite(computedProgress)
            ? computedProgress
            : prev.progress,
          status: statusLine,
          statusKey: normalizedStatus || prev.statusKey,
          queuePosition: safeQueuePosition,
          queueLength: safeQueueLength,
          storyId
        };
      });
    },
    [formatQueueMessage, statusToProgress]
  );

  const createGenerationEventHandler = useCallback(
    (storyId) => (event) => handleGenerationEvent(storyId, event),
    [handleGenerationEvent]
  );
  
  const getLocalizedUnitLabel = useCallback((label) => {
    if (typeof label !== 'string') {
      return 'Punkty Magii';
    }

    const trimmed = label.trim();
    if (!trimmed) {
      return 'Punkty Magii';
    }

    const segments = trimmed
      .split(/[\(\)\/\-\|]/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    const localizedSegment = segments.find((segment) =>
      segment.toLowerCase().includes('punkty')
    );

    if (localizedSegment) {
      return localizedSegment;
    }

    if (trimmed.toLowerCase().includes('punkty')) {
      return trimmed;
    }

    return 'Punkty Magii';
  }, []);

  const localizedUnitLabel = useMemo(
    () => getLocalizedUnitLabel(unitLabel),
    [unitLabel, getLocalizedUnitLabel]
  );
  
  const isStoryPurchased = useCallback(
    (story) =>
      !!(
        story?.hasLocalAudio ||
        story?.hasAudio ||
        story?.localAudioUri ||
        story?.localUri
      ),
    []
  );

  const displayStories = useMemo(() => {
    const baseStories = isOnline
      ? stories
      : stories.filter((story) => story.hasLocalAudio);

    if (!baseStories.length) {
      return [];
    }

    const purchased = [];
    const purchasable = [];

    baseStories.forEach((story) => {
      if (isStoryPurchased(story)) {
        purchased.push(story);
      } else {
        purchasable.push(story);
      }
    });

    const items = [];
    purchased.forEach((story) => {
      items.push({ type: 'story', story, id: `story-${story.id}` });
    });

    if (purchased.length && purchasable.length) {
      items.push({
        type: 'divider',
        id: 'divider-purchasable',
        label: 'Bajki do wygenerowania'
      });
    }

    purchasable.forEach((story) => {
      items.push({ type: 'story', story, id: `story-${story.id}` });
    });

    return items;
  }, [stories, isOnline, isStoryPurchased]);

  const getStoryRequiredCredits = useCallback((story) => {
    if (!story || typeof story !== 'object') {
      return null;
    }

    const candidate =
      story.requiredCredits ??
      story.required_credits ??
      story.requiredCredit ??
      story.required_credit;

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }

    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }

    return null;
  }, []);
  
  
  // Abort controller ref for cancellable operations
  const abortControllerRef = useRef(null);
  
  // Initialize abort controller
  const createAbortController = () => {
    // Cancel any existing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Create new controller
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  };
  
  // Load stories and voice ID on mount
  useEffect(() => {
    fetchStoriesAndVoiceId(false, true);
    const unsubscribe = setupNetworkListener();
    
    // Clean up on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clean up network listener
      unsubscribe();
    };
  }, []);
  
  // Set up network status listener
  const setupNetworkListener = () => {
    // Check initial status
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected === true);
    });
    
    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const newIsOnline = state.isConnected === true;
      setIsOnline((previousIsOnline) => {
        if (previousIsOnline === newIsOnline) {
          return previousIsOnline;
        }

        if (previousIsOnline === false && newIsOnline === true) {
          processOfflineQueue();
        }

        return newIsOnline;
      });
    });
    
    return unsubscribe;
  };
  
  // Process offline queue
  const processOfflineQueue = async () => {
    
    try {
      // Process any queued operations first
      const result = await voiceService.processOfflineQueue();
      
      // Always refresh stories when coming back online, regardless of queue processing
      fetchStoriesAndVoiceId(true);
    } catch (error) {
      console.error('Error processing offline queue:', error);
      // Still try to fetch stories even if queue processing fails
      fetchStoriesAndVoiceId(true);
    }
  };
  
  // Handle back button
  const onBackPress = useCallback(() => {
    setIsConfirmModalVisible(true);
    return true; // Prevent default behavior
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      
      return () => {
        if (typeof subscription?.remove === 'function') {
          subscription.remove();
        }
      };
    }, [onBackPress])
  );
  
  // Fetch stories and voice ID
  const fetchStoriesAndVoiceId = async (silent = false, forceRefresh = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      
      // Get voice ID using the service
      const voiceResult = await voiceService.getCurrentVoice();
      if (!voiceResult.success || !voiceResult.voiceId) {
        // No voice ID found, navigate back to clone screen
        navigation.replace('Clone');
        return;
      }
      
      const currentVoiceId = voiceResult.voiceId;
      setVoiceId(currentVoiceId);
      setGenerationStatusByStory({});
      setProcessingStories({});
      
      // Fetch available stories
      const storiesResult = await voiceService.getStories(forceRefresh);
      
      if (storiesResult.success) {
        let storiesData = storiesResult.stories;
        
        // Update stories with audio existence status and cover URLs
        let storiesWithStatus = await Promise.all(
          storiesData.map(async (story) => {
            // Check if audio exists
            const audioExists = await voiceService.checkAudioExists(currentVoiceId, story.id);
            
            return {
              ...story,
              hasAudio: audioExists.success && audioExists.exists,
              localUri: audioExists.localUri || null,
              cover_url: voiceService.getStoryCoverUrl(story.id),
            };
          })
        );
        
        // Mark stories that have local audio
        storiesWithStatus = await voiceService.markStoriesWithLocalAudio(
          currentVoiceId, 
          storiesWithStatus
        );
        
        setStories(storiesWithStatus);
        await hydrateGenerationState(currentVoiceId);
      } else {
        handleApiError(storiesResult, 'Nie udało się pobrać bajek.');
      }
    } catch (error) {
      console.error('Error fetching stories and voice ID:', error);
      if (!silent) {
        showToast('Wystąpił problem podczas ładowania danych.', 'ERROR');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };
  
  // Handle API errors with appropriate messages
  const handleApiError = (result, defaultMessage) => {
    // Handle authentication errors - redirect to login
    if (result.code === 'AUTH_ERROR') {
      showToast('Sesja wygasła. Zaloguj się ponownie.', 'ERROR');
      // Clear any local auth data and redirect to login
      navigation.replace('Login');
      return;
    }
    
    if (result.code === 'PAYMENT_REQUIRED') {
      showToast('Brak wystarczających Story Points. Odwiedź ekran kredytów.', 'ERROR');
      if (refreshCredits) {
        refreshCredits({ force: true }).catch(() => {});
      }
      return;
    }
    
    // If the app is offline, don't show errors for network operations
    if (!isOnline && result.code === 'OFFLINE') {
      return;
    }
    
    let message = defaultMessage;
    
    if (result.code === 'TIMEOUT') {
      message = 'Upłynął limit czasu operacji. Spróbuj ponownie.';
    } else if (result.code === 'STORAGE_ERROR') {
      message = 'Problem z pamięcią urządzenia. Spróbuj ponownie.';
    } else if (result.code === 'GENERATION_TIMEOUT') {
      message = 'Generowanie bajki trwało zbyt długo. Spróbuj ponownie.';
    } else if (result.code === 'DOWNLOAD_ERROR') {
      message = 'Błąd podczas pobierania pliku audio. Spróbuj ponownie.';
    } else if (result.error) {
      message = `${defaultMessage} ${result.error}`;
    }
    
    showToast(message, 'ERROR');
  };

  // Handle story selection
  const handleStorySelect = async (story) => {
    // Prevent duplicate handling while processing
    if (processingStories[story.id]) {
      return;
    }

    // If audio is currently playing, stop it first
    if (isPlaying && selectedStory?.id !== story.id) {
      await unloadAudio();
    }

    const hasLocalUri = !!story.localAudioUri;
    const hasServerUri = !!story.localUri;
    const hasServerAudio = !!story.hasAudio;
    const requiresGeneration = !hasLocalUri && !story.hasLocalAudio && !hasServerAudio;

    const creditStateReady = !creditsLoading && !creditsInitializing && !creditsError;

    const requiredCredits = getStoryRequiredCredits(story);

    if (requiresGeneration && creditStateReady && typeof requiredCredits === 'number') {
      if (balance < requiredCredits) {
        showToast('Masz za mało Story Points, aby wygenerować tę bajkę.', 'INFO');
        return;
      }
    }

    // Set as selected story
    setSelectedStory(story);

    // Check if already has locally saved audio
    if (hasLocalUri) {
      // Load local audio with auto-play
      loadStoryAudio(story.localAudioUri, true);
      return;
    }

    // Check if already has audio on server
    if (hasServerUri) {
      // Load server audio with auto-play
      loadStoryAudio(story.localUri, true);
      return;
    }

    if (hasServerAudio) {
      await getStoryAudio(story);
      return;
    }

    // If no audio available, confirm before generating
    if (requiresGeneration) {
      setPendingGeneration({
        story,
        requiredCredits
      });
      setIsGenerationConfirmVisible(true);
      return;
    }
  };

  const handleConfirmGeneration = async () => {
    const storyToGenerate = pendingGeneration?.story;

    setIsGenerationConfirmVisible(false);
    setPendingGeneration(null);

    if (!storyToGenerate) {
      return;
    }

    await getStoryAudio(storyToGenerate);
  };

  const handleCancelGeneration = () => {
    if (pendingGeneration?.story && selectedStory?.id === pendingGeneration.story.id) {
      setSelectedStory(null);
    }

    setPendingGeneration(null);
    setIsGenerationConfirmVisible(false);
  };

  const generationConfirmCopy = useMemo(() => {
    if (!pendingGeneration?.story) {
      return {
        title: 'Potwierdź wygenerowanie bajki',
        message: '',
      };
    }

    const storyTitle = pendingGeneration.story.title || 'tę bajkę';
    const sanitizedTitle = storyTitle.trim() ? storyTitle : 'tę bajkę';
    const cost = pendingGeneration.requiredCredits;

    if (typeof cost === 'number') {
      return {
        title: 'Potwierdź wykorzystanie punktów',
        message: `Wygenerowanie bajki "${sanitizedTitle}" zużyje ${cost} ${localizedUnitLabel}. Czy chcesz kontynuować?`,
      };
    }

    return {
      title: 'Potwierdź wygenerowanie bajki',
      message: `Wygenerowanie bajki "${sanitizedTitle}" może wymagać wykorzystania ${localizedUnitLabel}. Czy chcesz kontynuować?`,
    };
  }, [pendingGeneration, localizedUnitLabel]);
  
  // Get story audio with progress tracking
  const getStoryAudio = async (story, forceDownload = false) => {
    try {
      if (!isOnline) {
        showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
        return;
      }

      if (!voiceId) {
        showToast('Brak aktywnego głosu. Spróbuj ponownie.', 'ERROR');
        return;
      }

      setActiveGenerationStoryId(story.id);
      setProcessingStories((prev) => ({ ...prev, [story.id]: true }));

      handleGenerationEvent(story.id, { status: 'processing', progress: 0 });
      setIsProgressModalVisible(true);

      const signal = createAbortController();
      const statusObserver = createGenerationEventHandler(story.id);

      const result = await voiceService.getAudio(
        voiceId,
        story.id,
        statusObserver,
        signal,
        forceDownload
      );

      setProcessingStories((prev) => {
        const next = { ...prev };
        delete next[story.id];
        return next;
      });
      setGenerationStatusByStory((prev) => {
        const next = { ...prev };
        delete next[story.id];
        return next;
      });

      if (result.success) {
        await loadStoryAudio(result.uri, true);
        setStories((currentStories) =>
          currentStories.map((s) =>
            s.id === story.id
              ? {
                  ...s,
                  hasAudio: true,
                  localUri: result.uri,
                  hasLocalAudio: true,
                  localAudioUri: result.uri
                }
              : s
          )
        );

        if (refreshCredits) {
          refreshCredits({ force: true }).catch(() => {});
        }
      } else if (result.code === 'PAYMENT_REQUIRED') {
        showToast('Masz za mało Story Points, aby wygenerować tę bajkę.', 'ERROR');
        if (refreshCredits) {
          refreshCredits({ force: true }).catch(() => {});
        }
      } else {
        handleApiError(result, 'Nie udało się wygenerować bajki:');
      }
    } catch (error) {
      console.error('Error getting story audio:', error);
      handleGenerationEvent(story.id, {
        status: 'error',
        progress: null,
        message: STATUS_COPY.error,
        error: error.message
      });

      if (!isOnline) {
        showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
      } else {
        showToast('Wystąpił problem podczas generowania bajki.', 'ERROR');
      }
    } finally {
      setIsProgressModalVisible(false);
      setProcessingStories((prev) => {
        const next = { ...prev };
        delete next[story.id];
        return next;
      });
      setActiveGenerationStoryId(null);
      setProgressData({
        progress: 0,
        status: '',
        statusKey: null,
        queuePosition: null,
        queueLength: null,
        storyId: null
      });
    }
  };
  
  // Cancel current operation
  const handleCancelOperation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      
      // Hide progress modal
      setIsProgressModalVisible(false);
      
      // Clear processing states
      setProcessingStories({});
      if (activeGenerationStoryId && voiceId) {
        setGenerationStatusByStory((prev) => {
          const next = { ...prev };
          delete next[activeGenerationStoryId];
          return next;
        });
        voiceService.clearGenerationStateSnapshot(voiceId, activeGenerationStoryId).catch(
          () => {}
        );
      }
      setActiveGenerationStoryId(null);
      setProgressData({
        progress: 0,
        status: '',
        statusKey: null,
        queuePosition: null,
        queueLength: null,
        storyId: null
      });
      
      showToast('Operacja została anulowana.', 'INFO');
    }
  };
  
  // Load story audio
  const loadStoryAudio = async (audioUri, autoPlay = true) => {
    try {
      // First make sure audioControlsVisible is set to true before loading audio
      setAudioControlsVisible(true);
      
      // Pass a callback to handle corrupted files
      const success = await loadAudio(audioUri, autoPlay, handleCorruptedAudio);
      
      if (!success) {
        showToast('Nie udało się załadować audio. Spróbuj ponownie.', 'ERROR');
        // If loading failed, hide the controls
        setAudioControlsVisible(false);
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      showToast('Wystąpił problem podczas ładowania audio.', 'ERROR');
      setAudioControlsVisible(false);
    }
  };

  // This function handles corrupted audio files
  const handleCorruptedAudio = async (corruptedUri) => {
    console.log('Handling corrupted audio file:', corruptedUri);
    
    // First hide audio controls and reset audio state
    await handleResetAudio();
    
    // Check which story this corrupted audio belongs to
    const matchingStory = stories.find(story => 
      story.localAudioUri === corruptedUri || story.localUri === corruptedUri
    );
    
    if (!matchingStory) {
      showToast('Plik audio jest uszkodzony. Spróbuj pobrać historię ponownie.', 'ERROR');
      return;
    }
    
    // Show toast to inform user
    showToast('Plik audio uszkodzony. Ponowne pobieranie...', 'INFO');
    
    try {
      // Remove the audio reference from storage
      const infoString = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADED_AUDIO);
      const audioInfo = infoString ? JSON.parse(infoString) : {};
      
      // Clean up the reference
      if (audioInfo[voiceId]) {
        for (const storyId in audioInfo[voiceId]) {
          if (audioInfo[voiceId][storyId]?.localUri === corruptedUri) {
            delete audioInfo[voiceId][storyId];
          }
        }
        
        await AsyncStorage.setItem(STORAGE_KEYS.DOWNLOADED_AUDIO, JSON.stringify(audioInfo));
      }
      
      // Try to delete the corrupted file
      try {
        await FileSystem.deleteAsync(corruptedUri, { idempotent: true });
      } catch (deleteError) {
        console.error('Error deleting corrupted file:', deleteError);
        // Continue even if deletion fails
      }
      
      setActiveGenerationStoryId(matchingStory.id);
      handleGenerationEvent(matchingStory.id, {
        status: 'downloading',
        progress: 0.5,
        message: 'Ponowne pobieranie audio...',
        phase: 'download'
      });
      setIsProgressModalVisible(true);

      const signal = createAbortController();

      const statusObserver = (event) =>
        handleGenerationEvent(matchingStory.id, {
          ...event,
          message: event.message || 'Ponowne pobieranie audio...'
        });

      const result = await voiceService.getAudio(
        voiceId,
        matchingStory.id,
        statusObserver,
        signal,
        true // Force fresh download
      );

      // Hide progress modal
      setIsProgressModalVisible(false);
      setActiveGenerationStoryId(null);
      setGenerationStatusByStory((prev) => {
        const next = { ...prev };
        delete next[matchingStory.id];
        return next;
      });
      
      if (result.success) {
        // Load the audio with auto-play
        setSelectedStory(matchingStory); // Re-set selected story
        await loadStoryAudio(result.uri, true);
        
        // Update story in the list
        setStories(currentStories =>
          currentStories.map(s => 
            s.id === matchingStory.id ? { 
              ...s, 
              hasAudio: true, 
              localUri: result.uri,
              hasLocalAudio: true,
              localAudioUri: result.uri
            } : s
          )
        );
        
        showToast('Audio ponownie pobrane pomyślnie', 'SUCCESS');
      } else {
        handleApiError(result, 'Nie udało się ponownie pobrać audio:');
      }
    } catch (error) {
      console.error('Error recovering from corrupted audio:', error);
      showToast('Nie udało się ponownie pobrać audio. Spróbuj ponownie.', 'ERROR');
      setIsProgressModalVisible(false);
      setGenerationStatusByStory((prev) => {
        const next = { ...prev };
        delete next[matchingStory.id];
        return next;
      });
      setActiveGenerationStoryId(null);
    } finally {
      setProgressData({
        progress: 0,
        status: '',
        statusKey: null,
        queuePosition: null,
        queueLength: null,
        storyId: null
      });
    }
  };

  const handleResetAudio = async () => {
    try {
      await unloadAudio();
      setAudioControlsVisible(false);
      setSelectedStory(null);
    } catch (error) {
      console.error('Error resetting audio:', error);
    }
  };

  const performVoiceReset = async () => {
    try {
      setIsLoading(true);
      
      // Unload any playing audio
      await unloadAudio();
      
      // Delete voice from server using the voice service
      if (voiceId) {
        const deleteResult = await voiceService.deleteVoice(voiceId);
        if (!deleteResult.success) {
          handleApiError(deleteResult, 'Błąd usuwania głosu:');
          setIsLoading(false);
          return;
        }
      }
      
      setIsConfirmModalVisible(false);
      
      // Navigate back to clone screen
      navigation.replace('Clone');
    } catch (error) {
      console.error('Error deleting voice:', error);
      showToast('Wystąpił problem podczas usuwania głosu. Spróbuj ponownie.', 'ERROR');
      setIsLoading(false);
    }
  };
  
  // Reset voice and go back to clone screen
  const handleResetVoice = () => {
    setIsConfirmModalVisible(true);
  };
  
  // Refresh stories
  const handleRefresh = () => {
    // Only refresh if online
    if (!isOnline) {
      showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
      return;
    }
    
    fetchStoriesAndVoiceId(false, true);
  };
  
  // Render story item
  const renderStoryItem = ({ item }) => {
    if (item.type === 'divider') {
      return (
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>{item.label}</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }

    const story = item.story;
    const requiredCredits = getStoryRequiredCredits(story);
    const isReady = isStoryPurchased(story);
    const affordable =
      typeof requiredCredits === 'number' ? balance >= requiredCredits : true;
    const generationState = generationStatusByStory?.[story.id];
    const queueLabel = generationState
      ? formatQueueMessage(
          generationState.queuePosition,
          generationState.queueLength
        )
      : null;
    const statusCopy =
      generationState && generationState.status !== 'ready'
        ? [generationState.message, queueLabel]
            .filter(Boolean)
            .join('\n')
        : '';

    return (
      <StoryItem
        title={story.title}
        author={story.author}
        duration={story.duration}
        imageSource={story.cover_url}
        isSelected={selectedStory?.id === story.id}
        isGenerating={!!processingStories[story.id]}
        requiredCredits={requiredCredits}
        isAffordable={affordable}
        isCreditLoading={false}
        creditUnitLabel={unitLabel}
        isReady={isReady}
        statusMessage={statusCopy}
        onPress={() => handleStorySelect(story)}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {isOnline ? (
          // <TouchableOpacity
          //   style={styles.backButton}
          //   onPress={() => setIsConfirmModalVisible(true)}
          // >
          //   <Feather name="chevron-left" size={24} color={COLORS.peach} />
          //   <Text style={styles.backButtonText}>Reset</Text>
          // </TouchableOpacity>
          <TouchableOpacity 
            // style={{ position: 'absolute', top: 40, right: 20, zIndex: 100 }}
            style={styles.backButton}
            onPress={() => setIsMenuVisible(true)}
          >
            <Feather name="menu" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
        
        ) : (
          <View style={styles.backButton} />
        )}
        
        <Text style={styles.headerTitle}>DawnoTemu</Text>
        
        <View style={styles.avatarContainer}>
          <Image 
            source={require('../assets/images/logo.png')} 
            style={styles.avatar}
            resizeMode="contain"
          />
        </View>
              </View>
        
        {/* Content */}
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.peach} />
            <Text style={styles.loadingText}>Ładowanie...</Text>
          </View>
        ) : (
          <FlatList
            data={displayStories}
            renderItem={renderStoryItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.storiesList,
              { paddingBottom: audioControlsVisible ? 140 : 16 },
            ]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {!isOnline 
                    ? 'Brak dostępnych bajek offline. Połącz się z internetem, aby pobrać bajki.'
                    : 'Nie znaleziono bajek. Spróbuj odświeżyć.'}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.refreshButton,
                    !isOnline && styles.disabledButton
                  ]}
                  onPress={handleRefresh}
                  disabled={!isOnline}
                >
                  <Text style={styles.refreshButtonText}>Odśwież</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
      
      {/* Audio Controls */}
      <AudioControls
        isVisible={audioControlsVisible}
        isPlaying={isPlaying}
        duration={duration}
        position={position}
        onPlayPause={togglePlayPause}
        onRewind={rewind}
        onForward={forward}
        onSeek={seekTo}
        onClose={() => setAudioControlsVisible(false)}
        formatTime={formatTime}
        audioTitle={selectedStory?.title}
        story={selectedStory}
      />
      
      {/* Generation Confirmation */}
      <ConfirmModal
        visible={isGenerationConfirmVisible}
        title={generationConfirmCopy.title}
        message={generationConfirmCopy.message}
        confirmText="Wygeneruj"
        cancelText="Anuluj"
        onConfirm={handleConfirmGeneration}
        onCancel={handleCancelGeneration}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        visible={isConfirmModalVisible}
        title="Na pewno zaczynamy od nowa?"
        message="Usuniemy Twój obecny model głosu i wszystkie dotychczas powstałe bajki. Czy na pewno chcesz kontynuować?"
        confirmText="Usuń i nagraj ponownie"
        cancelText="Anuluj"
        onConfirm={performVoiceReset}
        onCancel={() => setIsConfirmModalVisible(false)}
      />
      
      {/* Progress Modal */}
      <ProgressModal
        visible={isProgressModalVisible}
        progress={progressData.progress}
        status={progressData.status}
        statusKey={progressData.statusKey}
        queuePosition={progressData.queuePosition}
        queueLength={progressData.queueLength}
        onCancel={handleCancelOperation}
      />
      <AppMenu 
          navigation={navigation}
          isVisible={isMenuVisible}
          onClose={() => setIsMenuVisible(false)}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.peach,
    marginLeft: 4,
  },
  headerTitle: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  avatarContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16
  },
  content: {
    flex: 1,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginTop: 12,
  },
  storiesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.text.tertiary,
    opacity: 0.4,
  },
  dividerLabel: {
    marginHorizontal: 12,
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  disabledButton: {
    backgroundColor: COLORS.text.tertiary,
    opacity: 0.7,
  },
  refreshButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.white,
  },
});
