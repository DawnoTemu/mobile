import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
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
import { usePlaybackQueue, usePlaybackQueueDispatch, LOOP_MODES } from '../context/PlaybackQueueProvider';

const STORAGE_KEYS = {
  DOWNLOADED_AUDIO: 'voice_service_downloaded_audio'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROGRESS_SAVE_INTERVAL_MS = 3000;
const PROGRESS_FINISH_THRESHOLD_SECONDS = 5;

const STATUS_COPY = {
  queued_for_slot: 'Twoja prośba jest w kolejce. Przydzielimy slot głosowy w ciągu kilku chwil.',
  allocating_voice: 'Twój głos jest aktywowany w ElevenLabs… odtwarzanie rozpocznie się automatycznie.',
  processing: 'Poczekaj cierpliwie, to może potrwać do 90 sekund.',
  downloading: 'Pobieranie nagrania...',
  ready: 'Nagranie jest gotowe – możesz teraz odtworzyć historię.',
  error: 'Wystąpił problem podczas generowania bajki.'
};

const STATUS_PROGRESS_MAP = {
  queued_for_slot: 8,
  allocating_voice: 20,
  processing: 30,
  downloading: 85,
  ready: 100
};

const LOOP_MODE_LABELS = {
  [LOOP_MODES.NONE]: 'Bez powtarzania',
  [LOOP_MODES.REPEAT_ALL]: 'Powtarzanie kolejki',
  [LOOP_MODES.REPEAT_ONE]: 'Powtarzanie jednej bajki'
};

export default function SynthesisScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const creditState = useCredits();
  const creditActions = useCreditActions();
  const {
    balance = 0,
    unitLabel = 'Punkty Magii',
    loading: creditsLoading = false,
    error: creditsError = null,
    initializing: creditsInitializing = false
  } = creditState || {};
  const {
    refreshCredits
  } = creditActions || {};
  
  // Audio player hook
  const {
    sound: audioPlayer,
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
  
  const playbackQueueState = usePlaybackQueue();
  const {
    queue: playbackQueue,
    activeIndex: activeQueueIndex,
    loopMode
  } = playbackQueueState;
  const {
    enqueue,
    enqueueNext,
    removeFromQueue: removeFromPlaybackQueue,
    setActiveItem: setActiveQueueItem,
    clearQueue: clearPlaybackQueue,
    advance: advanceQueue,
    setLoopMode: updateLoopMode
  } = usePlaybackQueueDispatch();
  
  // State
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState(null);
  const [processingStories, setProcessingStories] = useState({});
  const [audioControlsVisible, setAudioControlsVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [voiceId, setVoiceId] = useState(null);
  const [isProgressModalVisible, setIsProgressModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progressData, setProgressData] = useState({
    progress: 0,
    status: '',
    statusKey: null,
    queuePosition: null,
    queueLength: null,
    phase: null,
    remoteVoiceId: null,
    serviceProvider: null,
    storyId: null
  });
  const [isOnline, setIsOnline] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [isGenerationConfirmVisible, setIsGenerationConfirmVisible] = useState(false);
  const [generationStatusByStory, setGenerationStatusByStory] = useState({});
  const [activeGenerationStoryId, setActiveGenerationStoryId] = useState(null);
  const currentAudioUriRef = useRef(null);
  const activeAudioStoryIdRef = useRef(null);
  const lastProgressSaveRef = useRef(0);
  const completedPlaybackRef = useRef(false);
  const pendingResumeRef = useRef(null);
  const suppressQueueAutoRef = useRef(false);
  const queueAdvanceRef = useRef(null);

  const resolveQueueStoryId = useCallback((item) => {
    if (item === null || item === undefined) {
      return null;
    }
    if (typeof item === 'string' || typeof item === 'number') {
      return String(item);
    }
    if (typeof item === 'object') {
      if (item.storyId !== null && item.storyId !== undefined) {
        return String(item.storyId);
      }
      if (item.id !== null && item.id !== undefined) {
        return String(item.id);
      }
    }
    return null;
  }, []);

  const queueIndexByStoryId = useMemo(() => {
    const map = new Map();
    (playbackQueue || []).forEach((entry, index) => {
      const storyId = resolveQueueStoryId(entry);
      if (storyId !== null) {
        map.set(storyId, index);
      }
    });
    return map;
  }, [playbackQueue, resolveQueueStoryId]);

  const queueLength = playbackQueue ? playbackQueue.length : 0;

  const storyHasPlayableAudio = useCallback((story) => {
    if (!story || typeof story !== 'object') {
      return false;
    }

    return Boolean(
      story.hasAudio ||
      story.hasLocalAudio ||
      story.localUri ||
      story.localAudioUri
    );
  }, []);

  const findStoryById = useCallback(
    (storyId) => {
      if (storyId === null || storyId === undefined) {
        return null;
      }

      const normalized = String(storyId);
      return (
        stories.find((item) => String(item.id) === normalized) || null
      );
    },
    [stories]
  );

  const buildQueuePayload = useCallback(
    (story) => {
      if (!story || typeof story !== 'object') {
        return null;
      }

      return {
        id: story.id,
        storyId: story.id,
        title: story.title ?? null,
        author: story.author ?? null,
        coverUrl: story.cover_url ?? story.coverUrl ?? null,
        cover_url: story.cover_url ?? story.coverUrl ?? null,
        duration: story.duration ?? null,
        hasAudio: Boolean(story.hasAudio),
        hasLocalAudio: Boolean(story.hasLocalAudio),
        localUri: story.localUri ?? null,
        localAudioUri: story.localAudioUri ?? null,
        voiceId: voiceId ?? null
      };
    },
    [voiceId]
  );

  const handleAddStoryToQueue = useCallback(
    (story) => {
      if (!story) {
        return;
      }

      if (!storyHasPlayableAudio(story)) {
        showToast('Ta bajka nie ma jeszcze nagrania. Wygeneruj ją przed dodaniem do kolejki.', 'INFO');
        return;
      }

      const payload = buildQueuePayload(story);
      if (!payload) {
        return;
      }

      const storyKey = String(story.id);
      const existingIndex = queueIndexByStoryId.get(storyKey);
      if (typeof existingIndex === 'number' && existingIndex >= 0) {
        removeFromPlaybackQueue({ index: existingIndex });
      }

      enqueue(payload);
      showToast('Dodano bajkę do kolejki.', 'SUCCESS');
    },
    [
      storyHasPlayableAudio,
      buildQueuePayload,
      queueIndexByStoryId,
      removeFromPlaybackQueue,
      enqueue,
      showToast
    ]
  );

  const handlePlayNextStory = useCallback(
    (story) => {
      if (!story) {
        return;
      }

      if (!storyHasPlayableAudio(story)) {
        showToast('Ta bajka nie ma jeszcze nagrania. Wygeneruj ją przed dodaniem do kolejki.', 'INFO');
        return;
      }

      const payload = buildQueuePayload(story);
      if (!payload) {
        return;
      }

      const storyKey = String(story.id);
      const existingIndex = queueIndexByStoryId.get(storyKey);
      if (typeof existingIndex === 'number' && existingIndex >= 0) {
        removeFromPlaybackQueue({ index: existingIndex });
      }

      enqueueNext(payload);
      showToast('Ta bajka będzie odtworzona jako następna.', 'SUCCESS');
    },
    [
      storyHasPlayableAudio,
      buildQueuePayload,
      queueIndexByStoryId,
      removeFromPlaybackQueue,
      enqueueNext,
      showToast
    ]
  );

  useEffect(() => {
    if (!playbackQueue || queueLength === 0) {
      return;
    }

    if (
      typeof activeQueueIndex !== 'number' ||
      activeQueueIndex < 0 ||
      activeQueueIndex >= playbackQueue.length
    ) {
      return;
    }

    if (suppressQueueAutoRef.current) {
      suppressQueueAutoRef.current = false;
      return;
    }

    const entry = playbackQueue[activeQueueIndex];
    const storyId = resolveQueueStoryId(entry);
    if (!storyId) {
      return;
    }

    const resolvedStory =
      findStoryById(storyId) ||
      {
        id: storyId,
        title: entry?.title ?? `Bajka ${storyId}`,
        author: entry?.author ?? 'Anonim',
        hasAudio: entry?.hasAudio ?? true,
        hasLocalAudio: entry?.hasLocalAudio ?? false,
        localUri: entry?.localUri ?? null,
        localAudioUri: entry?.localAudioUri ?? null,
        cover_url: entry?.coverUrl ?? entry?.cover_url ?? null
      };

    const currentStoryId = selectedStory?.id != null ? String(selectedStory.id) : null;
    if (currentStoryId === String(storyId) && activeAudioStoryIdRef.current === currentStoryId) {
      return;
    }

    const maybePromise = handleStorySelectRef.current?.(resolvedStory, { skipQueueSync: true });
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch((error) => {
        console.warn('Queue playback failed to start', error);
      });
    }
  }, [
    activeQueueIndex,
    playbackQueue,
    queueLength,
    resolveQueueStoryId,
    findStoryById,
    selectedStory
  ]);

  const handleAutoFillQueue = useCallback(() => {
    if (!stories || !stories.length) {
      showToast('Brak bajek do dodania do kolejki.', 'INFO');
      return;
    }

    const candidates = stories.filter((story) => storyHasPlayableAudio(story));
    if (!candidates.length) {
      showToast('Brak bajek z gotowym nagraniem do dodania.', 'INFO');
      return;
    }

    const itemsToAdd = [];
    candidates.forEach((story) => {
      const storyKey = String(story.id);
      const existingIndex = queueIndexByStoryId.get(storyKey);
      if (typeof existingIndex === 'number' && existingIndex >= 0) {
        return;
      }

      const payload = buildQueuePayload(story);
      if (payload) {
        itemsToAdd.push(payload);
      }
    });

    if (!itemsToAdd.length) {
      showToast('Wszystkie gotowe bajki są już w kolejce.', 'INFO');
      return;
    }

    enqueue(itemsToAdd);
    const addedCount = itemsToAdd.length;
    const label =
      addedCount === 1 ? 'bajkę' : addedCount >= 5 ? 'bajek' : 'bajki';
    showToast(`Dodano ${addedCount} ${label} do kolejki.`, 'SUCCESS');
  }, [
    stories,
    storyHasPlayableAudio,
    queueIndexByStoryId,
    buildQueuePayload,
    enqueue,
    showToast
  ]);

  const handleClearQueue = useCallback(() => {
    if (!playbackQueue || playbackQueue.length === 0) {
      showToast('Kolejka jest już pusta.', 'INFO');
      return;
    }

    clearPlaybackQueue();
    showToast('Wyczyszczono kolejkę.', 'SUCCESS');
  }, [playbackQueue, clearPlaybackQueue, showToast]);

  const handleCycleLoopMode = useCallback(() => {
    const order = [LOOP_MODES.NONE, LOOP_MODES.REPEAT_ALL, LOOP_MODES.REPEAT_ONE];
    const currentIndex = order.indexOf(loopMode);
    const nextMode = order[(currentIndex + 1) % order.length];
    updateLoopMode(nextMode);
    showToast(LOOP_MODE_LABELS[nextMode] || 'Zmieniono tryb powtarzania', 'INFO');
  }, [loopMode, updateLoopMode, showToast]);

  const handleSkipToNextFromControls = useCallback(() => {
    if (queueLength === 0) {
      return;
    }

    queueAdvanceRef.current = null;

    if (queueLength === 1) {
      seekTo(0).catch(() => {});
      if (!isPlaying) {
        togglePlayPause();
      }
      return;
    }

    let targetIndex = typeof activeQueueIndex === 'number' && activeQueueIndex >= 0
      ? activeQueueIndex + 1
      : 0;

    if (targetIndex >= queueLength) {
      if (loopMode === LOOP_MODES.REPEAT_ALL) {
        targetIndex = 0;
      } else {
        return;
      }
    }

    setActiveQueueItem({ index: targetIndex });
  }, [queueLength, activeQueueIndex, loopMode, setActiveQueueItem, seekTo, isPlaying, togglePlayPause]);

  const handleSkipToPreviousFromControls = useCallback(() => {
    if (queueLength === 0) {
      return;
    }

    queueAdvanceRef.current = null;

    if (position > 5) {
      seekTo(0).catch(() => {});
      return;
    }

    if (queueLength === 1) {
      seekTo(0).catch(() => {});
      if (!isPlaying) {
        togglePlayPause();
      }
      return;
    }

    let targetIndex = typeof activeQueueIndex === 'number' && activeQueueIndex >= 0
      ? activeQueueIndex - 1
      : queueLength - 1;

    if (targetIndex < 0) {
      if (loopMode === LOOP_MODES.REPEAT_ALL) {
        targetIndex = queueLength - 1;
      } else {
        targetIndex = 0;
      }
    }

    setActiveQueueItem({ index: targetIndex });
  }, [queueLength, activeQueueIndex, loopMode, position, seekTo, isPlaying, togglePlayPause, setActiveQueueItem]);

  const MIN_PROGRESS_STEP_DURATION_MS = 5000;
  const progressStepQueueRef = useRef({});

  useEffect(() => {
    return () => {
      Object.values(progressStepQueueRef.current || {}).forEach((entry) => {
        if (entry?.timeoutId) {
          clearTimeout(entry.timeoutId);
        }
      });
      progressStepQueueRef.current = {};
    };
  }, []);

  const processQueuedProgressUpdate = useCallback(
    (storyId) => {
      const entry = progressStepQueueRef.current[storyId];
      if (!entry) {
        return;
      }

      entry.timeoutId = null;
      if (!entry.queue.length) {
        return;
      }

      const next = entry.queue.shift();
      if (!next || typeof next.apply !== 'function') {
        if (entry.queue.length) {
          entry.timeoutId = setTimeout(
            () => processQueuedProgressUpdate(storyId),
            MIN_PROGRESS_STEP_DURATION_MS
          );
        }
        return;
      }

      next.apply();

      if (next.statusKey && entry.lastStatusKey !== next.statusKey) {
        entry.lastStatusKey = next.statusKey;
        entry.lastUpdateAt = Date.now();
      } else if (!entry.lastStatusKey && next.statusKey) {
        entry.lastStatusKey = next.statusKey;
        entry.lastUpdateAt = Date.now();
      }

      if (next.statusKey === 'ready' || next.statusKey === 'error') {
        entry.queue = [];
      }

      if (entry.queue.length) {
        entry.timeoutId = setTimeout(
          () => processQueuedProgressUpdate(storyId),
          MIN_PROGRESS_STEP_DURATION_MS
        );
      }
    },
    []
  );

  const scheduleProgressUpdate = useCallback(
    (storyId, statusKey, apply) => {
      if (typeof apply !== 'function') {
        return;
      }

      const now = Date.now();
      const entry =
        progressStepQueueRef.current[storyId] || {
          lastStatusKey: null,
          lastUpdateAt: 0,
          timeoutId: null,
          queue: []
        };

      progressStepQueueRef.current[storyId] = entry;

      const statusChanged =
        statusKey && entry.lastStatusKey && statusKey !== entry.lastStatusKey;
      const hasLastTimestamp =
        entry.lastStatusKey && typeof entry.lastUpdateAt === 'number';
      const elapsed = hasLastTimestamp ? now - entry.lastUpdateAt : Infinity;
      const shouldDelay =
        statusChanged &&
        hasLastTimestamp &&
        elapsed < MIN_PROGRESS_STEP_DURATION_MS;

      if (!shouldDelay) {
        apply();

        if (statusKey && entry.lastStatusKey !== statusKey) {
          entry.lastStatusKey = statusKey;
          entry.lastUpdateAt = Date.now();
        } else if (!entry.lastStatusKey && statusKey) {
          entry.lastStatusKey = statusKey;
          entry.lastUpdateAt = Date.now();
        }

        if (statusKey === 'ready' || statusKey === 'error') {
          if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
            entry.timeoutId = null;
          }
          entry.queue = [];
        } else if (entry.queue.length && !entry.timeoutId) {
          entry.timeoutId = setTimeout(
            () => processQueuedProgressUpdate(storyId),
            MIN_PROGRESS_STEP_DURATION_MS
          );
        }

        return;
      }

      const queue = entry.queue;
      const queuedItem = { statusKey, apply };
      if (queue.length && queue[queue.length - 1].statusKey === statusKey) {
        queue[queue.length - 1] = queuedItem;
      } else {
        queue.push(queuedItem);
      }

      const remaining = Math.max(
        MIN_PROGRESS_STEP_DURATION_MS - elapsed,
        0
      );

      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }

      entry.timeoutId = setTimeout(
        () => processQueuedProgressUpdate(storyId),
        remaining
      );
    },
    [processQueuedProgressUpdate]
  );

  const resetProgressTiming = useCallback((storyId) => {
    const entry = progressStepQueueRef.current[storyId];
    if (!entry) {
      return;
    }
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    delete progressStepQueueRef.current[storyId];
  }, []);

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
          const message =
            selectedSnapshot.message ||
            STATUS_COPY[selectedSnapshot.status] ||
            STATUS_COPY.processing;
          const progress =
            statusToProgress(selectedSnapshot.status) ?? progressData.progress;
          setProgressData((prev) => ({
            ...prev,
            progress,
            status: message,
            statusKey: selectedSnapshot.status,
            queuePosition: selectedSnapshot.queuePosition ?? null,
            queueLength: selectedSnapshot.queueLength ?? null,
            phase:
              (typeof selectedSnapshot.phase === 'string'
                ? selectedSnapshot.phase
                : null) ?? prev.phase ?? null,
            remoteVoiceId:
              selectedSnapshot.remoteVoiceId ??
              selectedSnapshot.voiceSlotMetadata?.elevenlabsVoiceId ??
              null,
            serviceProvider:
              selectedSnapshot.serviceProvider ??
              selectedSnapshot.voiceSlotMetadata?.serviceProvider ??
              null,
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
            phase: null,
            remoteVoiceId: null,
            serviceProvider: null,
            storyId: null
          });
        }
      } catch (error) {
        console.error('Failed to hydrate generation state:', error);
      }
    },
    [activeGenerationStoryId, progressData.progress, selectedStory, statusToProgress]
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
      const message =
        event.message ||
        (normalizedStatus && STATUS_COPY[normalizedStatus]) ||
        STATUS_COPY.processing;
      const resolvedRemoteVoiceId =
        event.remoteVoiceId ??
        event.metadata?.remoteVoiceId ??
        generationStatusByStory?.[storyId]?.remoteVoiceId ??
        null;
      const resolvedServiceProvider =
        event.serviceProvider ??
        event.metadata?.serviceProvider ??
        generationStatusByStory?.[storyId]?.serviceProvider ??
        null;
      const rawPhase =
        event.phase ??
        event.metadata?.phase ??
        generationStatusByStory?.[storyId]?.phase ??
        null;
      const normalizedPhase =
        typeof rawPhase === 'string' ? rawPhase.trim().toLowerCase() : null;
      const isGenerationReady =
        normalizedStatus === 'ready' && normalizedPhase === 'generation';

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
            remoteVoiceId: resolvedRemoteVoiceId,
            allocationStatus:
              event.allocationStatus ??
              prev[storyId]?.allocationStatus ??
              null,
            serviceProvider:
              resolvedServiceProvider ?? prev[storyId]?.serviceProvider ?? null,
            message,
            phase: normalizedPhase ?? prev[storyId]?.phase ?? null,
            updatedAt: Date.now(),
            metadata: event.metadata || prev[storyId]?.metadata || null
          }
        }));
      }

      if (normalizedStatus) {
        setProcessingStories((prev) => {
          const next = { ...prev };
          const shouldMarkProcessing =
            normalizedStatus === 'queued_for_slot' ||
            normalizedStatus === 'allocating_voice' ||
            normalizedStatus === 'processing' ||
            normalizedStatus === 'downloading' ||
            isGenerationReady;

          if (shouldMarkProcessing) {
            next[storyId] = true;
          } else {
            delete next[storyId];
          }
          return next;
        });
      }

      const shouldCloseModal =
        normalizedStatus === 'error' ||
        (normalizedStatus === 'ready' && !isGenerationReady);

      if (shouldCloseModal) {
        setIsProgressModalVisible(false);
      } else if (normalizedStatus) {
        setIsProgressModalVisible(true);
      }

      const applyProgressUpdate = () => {
        setProgressData((prev) => {
          const incomingProgress =
            typeof event.progress === 'number'
              ? Math.max(0, Math.min(event.progress, 1))
              : null;
          const progressFromStatus =
            statusToProgress(normalizedStatus) ?? prev.progress ?? 0;
          const shouldUseEventProgress =
            incomingProgress !== null &&
            !(
              normalizedStatus === 'processing' &&
              (!normalizedPhase || normalizedPhase === 'generation')
            );
          const computedProgress = shouldUseEventProgress
            ? Math.round(incomingProgress * 100)
            : progressFromStatus;

          return {
            progress: Number.isFinite(computedProgress)
              ? computedProgress
              : prev.progress,
            status: message,
            statusKey: normalizedStatus || prev.statusKey,
            queuePosition: safeQueuePosition,
            queueLength: safeQueueLength,
            phase: normalizedPhase ?? prev.phase ?? null,
            remoteVoiceId: resolvedRemoteVoiceId,
            serviceProvider: resolvedServiceProvider ?? prev.serviceProvider,
            storyId
          };
        });
      };

      scheduleProgressUpdate(storyId, normalizedStatus, applyProgressUpdate);
    },
    [statusToProgress, generationStatusByStory, scheduleProgressUpdate]
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

  const playableStoriesCount = useMemo(() => {
    if (!stories || !stories.length) {
      return 0;
    }
    return stories.reduce(
      (count, story) => (storyHasPlayableAudio(story) ? count + 1 : count),
      0
    );
  }, [stories, storyHasPlayableAudio]);

  const autoFillDisabled = playableStoriesCount === 0;
  const clearQueueDisabled = queueLength === 0;
  const currentQueuePosition = typeof activeQueueIndex === 'number' && activeQueueIndex >= 0
    ? activeQueueIndex + 1
    : null;
  const canSkipNext = queueLength > 0 && (queueLength > 1 || loopMode !== LOOP_MODES.NONE);
  const canSkipPrevious = queueLength > 0;

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
            // Check if audio exists, verifying server state to avoid stale cache
            const audioExists = await voiceService.checkAudioExists(
              currentVoiceId,
              story.id,
              {
                verifyRemote: true,
                cleanupOrphaned: true
              }
            );

            const hasAudio =
              audioExists.success &&
              (audioExists.localExists || audioExists.remoteExists === true);
            
            return {
              ...story,
              hasAudio,
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
      showToast('Brak wystarczających Punktów Magii. Odwiedź ekran kredytów.', 'ERROR');
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

  const resolveResumePosition = useCallback(
    async (audioUri, storyId) => {
      if (!voiceId || !storyId) {
        return 0;
      }
    try {
      const progress = await voiceService.getPlaybackProgress(voiceId, storyId);
      if (!progress || typeof progress.position !== 'number') {
        return 0;
      }

      const normalizedPosition = Math.max(0, progress.position);
      if (normalizedPosition <= 0) {
        return 0;
      }

      const storedDuration = Number.isFinite(progress.duration)
        ? progress.duration
        : null;
      if (
        storedDuration &&
        storedDuration > 0 &&
        storedDuration - normalizedPosition <= PROGRESS_FINISH_THRESHOLD_SECONDS
      ) {
        return 0;
      }

      if (typeof progress.sourceUri === 'string' && progress.sourceUri) {
        const stored = progress.sourceUri;
        const incoming = typeof audioUri === 'string' ? audioUri : null;
        const storedIsLocal = stored.startsWith('file://');
        const incomingIsLocal = incoming?.startsWith('file://');
        if (storedIsLocal && incomingIsLocal && stored !== incoming) {
          return 0;
        }
      }

      return normalizedPosition;
    } catch (error) {
      console.warn('Failed to resolve playback progress', error);
      return 0;
    }
    },
    [voiceId]
  );

  // Handle story selection
  const handleStorySelect = async (story, { skipQueueSync = false } = {}) => {
    if (!story || story.id === null || story.id === undefined) {
      return;
    }

    const storyKey = String(story.id);
    queueAdvanceRef.current = null;

    if (processingStories[story.id]) {
      if (selectedStory?.id !== story.id) {
        setSelectedStory(story);
      }

      if (activeGenerationStoryId === story.id) {
        setIsProgressModalVisible(true);
        return;
      }

      if (generationStatusByStory?.[story.id]) {
        setIsProgressModalVisible(true);
        await getStoryAudio(story);
      }
      return;
    }

    if (!skipQueueSync && storyHasPlayableAudio(story)) {
      const existingIndex = queueIndexByStoryId.get(storyKey);
      if (typeof existingIndex === 'number' && existingIndex >= 0) {
        if (existingIndex !== activeQueueIndex) {
          suppressQueueAutoRef.current = true;
          setActiveQueueItem({ index: existingIndex });
        }
      } else {
        const payload = buildQueuePayload(story);
        if (payload) {
          suppressQueueAutoRef.current = true;
          enqueue(payload);
          setActiveQueueItem({ storyId: storyKey });
        }
      }
    }

    if (selectedStory?.id !== story.id) {
      if (
        voiceId &&
        selectedStory?.id &&
        position > 0 &&
        duration > 0 &&
        currentAudioUriRef.current
      ) {
        voiceService
          .savePlaybackProgress(voiceId, selectedStory.id, {
            position,
            duration,
            sourceUri: currentAudioUriRef.current,
            updatedAt: Date.now()
          })
          .catch(() => {});
      }
      try {
        await audioPlayer?.stop?.();
        await audioPlayer?.seekTo?.(0);
      } catch (stopError) {
        console.warn('Failed to pause audio before switching story', stopError);
      }
      await sleep(60);
      setAudioControlsVisible(false);
    }

    const hasLocalUri = !!story.localAudioUri;
    const hasServerUri = !!story.localUri;
    const hasServerAudio = !!story.hasAudio;
    const requiresGeneration = !hasLocalUri && !story.hasLocalAudio && !hasServerAudio;

    const creditStateReady = !creditsLoading && !creditsInitializing && !creditsError;

    const requiredCredits = getStoryRequiredCredits(story);

    if (requiresGeneration && creditStateReady && typeof requiredCredits === 'number') {
      if (balance < requiredCredits) {
        showToast('Brakuje Punktów Magii, aby wygenerować tę bajkę.', 'INFO');
        return;
      }
    }

    // Set as selected story
    setSelectedStory(story);

    // Check if already has locally saved audio
    if (hasLocalUri) {
      // Load local audio with auto-play
      const resumePosition = await resolveResumePosition(story.localAudioUri, story.id);
      await loadStoryAudio(story, story.localAudioUri, {
        autoPlay: true,
        startPosition: resumePosition
      });
      return;
    }

    // Check if already has audio on server
    if (hasServerUri) {
      // Load server audio with auto-play
      const resumePosition = await resolveResumePosition(story.localUri, story.id);
      await loadStoryAudio(story, story.localUri, {
        autoPlay: true,
        startPosition: resumePosition
      });
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

  const handleStorySelectRef = useRef(handleStorySelect);
  useEffect(() => {
    handleStorySelectRef.current = handleStorySelect;
  }, [handleStorySelect]);

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

      handleGenerationEvent(story.id, {
        status: 'processing',
        progress: 0,
        phase: 'generation'
      });
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
        const resumePosition = await resolveResumePosition(result.uri, story.id);
        await loadStoryAudio(story, result.uri, {
          autoPlay: true,
          startPosition: resumePosition
        });
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
        showToast('Brakuje Punktów Magii, aby wygenerować tę bajkę.', 'ERROR');
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
        phase: null,
        remoteVoiceId: null,
        serviceProvider: null,
        storyId: null
      });
      resetProgressTiming(story.id);
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
      if (activeGenerationStoryId) {
        resetProgressTiming(activeGenerationStoryId);
      }
      setActiveGenerationStoryId(null);
      setProgressData({
        progress: 0,
        status: '',
        statusKey: null,
        queuePosition: null,
        queueLength: null,
        phase: null,
        remoteVoiceId: null,
        serviceProvider: null,
        storyId: null
      });
      
      showToast('Operacja została anulowana.', 'INFO');
    }
  };
  
  // Load story audio
  const loadStoryAudio = async (
    storyContext,
    audioUri,
    { autoPlay = true, startPosition = null } = {}
  ) => {
    try {
      if (!audioUri) {
        return;
      }

      const storyId = storyContext?.id ?? selectedStory?.id ?? null;
      const previousStoryId = activeAudioStoryIdRef.current;
      const previousUri = currentAudioUriRef.current;
      activeAudioStoryIdRef.current = storyId;
      currentAudioUriRef.current = audioUri;
      completedPlaybackRef.current = false;
      lastProgressSaveRef.current = 0;

      let effectiveStart = startPosition;
      if (
        effectiveStart === null &&
        voiceId &&
        storyId
      ) {
        effectiveStart = await resolveResumePosition(audioUri, storyId);
      }
      if (effectiveStart && effectiveStart > 0) {
        pendingResumeRef.current = {
          storyId,
          position: effectiveStart
        };
      } else {
        pendingResumeRef.current = null;
      }

      // First make sure audioControlsVisible is set to true before loading audio
      setAudioControlsVisible(true);
      
      // Pass a callback to handle corrupted files
      const success = await loadAudio(
        audioUri,
        autoPlay,
        handleCorruptedAudio,
        0
      );
      
      if (!success) {
        showToast('Nie udało się załadować audio. Spróbuj ponownie.', 'ERROR');
        // If loading failed, hide the controls
        setAudioControlsVisible(false);
        if (currentAudioUriRef.current === audioUri) {
          currentAudioUriRef.current = null;
        }
        if (activeAudioStoryIdRef.current === storyId) {
          activeAudioStoryIdRef.current = previousStoryId ?? null;
        }
        if (previousUri) {
          currentAudioUriRef.current = previousUri;
        }
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      showToast('Wystąpił problem podczas ładowania audio.', 'ERROR');
      setAudioControlsVisible(false);
      if (currentAudioUriRef.current === audioUri) {
        currentAudioUriRef.current = null;
      }
    }
  };

  useEffect(() => {
    const storyId = activeAudioStoryIdRef.current || selectedStory?.id;
    if (!voiceId || !storyId || !currentAudioUriRef.current || isAudioLoading) {
      return;
    }

    if (!duration || duration <= 0) {
      return;
    }

    const now = Date.now();
    const remaining = duration - position;

    if (remaining <= PROGRESS_FINISH_THRESHOLD_SECONDS) {
      if (!completedPlaybackRef.current) {
        voiceService.clearPlaybackProgress(voiceId, storyId).catch(() => {});
        completedPlaybackRef.current = true;
      }

      const normalizedStoryId = String(storyId);
      if (
        !isPlaying &&
        queueLength > 0 &&
        queueIndexByStoryId.has(normalizedStoryId) &&
        queueAdvanceRef.current !== normalizedStoryId
      ) {
        queueAdvanceRef.current = normalizedStoryId;

        if (loopMode === LOOP_MODES.REPEAT_ONE) {
          togglePlayPause();
        } else {
          advanceQueue();
        }
      }

      return;
    }

    queueAdvanceRef.current = null;
    completedPlaybackRef.current = false;

    if (position <= 0) {
      return;
    }

    const shouldSaveNow =
      !isPlaying || now - lastProgressSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS;

    if (!shouldSaveNow) {
      return;
    }

    lastProgressSaveRef.current = now;

    voiceService.savePlaybackProgress(voiceId, storyId, {
      position,
      duration,
      sourceUri: currentAudioUriRef.current,
      updatedAt: now
    }).catch(() => {});
  }, [
    position,
    duration,
    isPlaying,
    selectedStory,
    voiceId,
    isAudioLoading,
    queueLength,
    queueIndexByStoryId,
    loopMode,
    advanceQueue,
    togglePlayPause
  ]);

  useEffect(() => {
    const resume = pendingResumeRef.current;
    const storyId = activeAudioStoryIdRef.current;
    if (!resume || !storyId || resume.storyId !== storyId) {
      return;
    }
    if (!duration || duration <= 0) {
      return;
    }

    const safePosition = Math.min(
      Math.max(0, resume.position),
      Math.max(0, duration - 0.5)
    );

    seekTo(safePosition)
      .then(() => {
        if (!isPlaying) {
          togglePlayPause();
        }
      })
      .catch((error) => {
        console.warn('Failed to apply resume position', error);
      });
    pendingResumeRef.current = null;
  }, [duration, seekTo, togglePlayPause, isPlaying]);

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
        const resumePosition = await resolveResumePosition(result.uri, matchingStory.id);
        await loadStoryAudio(matchingStory, result.uri, {
          autoPlay: true,
          startPosition: resumePosition
        });
        
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
        phase: null,
        remoteVoiceId: null,
        serviceProvider: null,
        storyId: null
      });
    }
  };

  const handleResetAudio = async () => {
    try {
      if (
        voiceId &&
        selectedStory?.id &&
        position > 0 &&
        duration > 0 &&
        currentAudioUriRef.current
      ) {
        voiceService
          .savePlaybackProgress(voiceId, selectedStory.id, {
            position,
            duration,
            sourceUri: currentAudioUriRef.current,
            updatedAt: Date.now()
          })
          .catch(() => {});
      }
      await unloadAudio();
      setAudioControlsVisible(false);
      setSelectedStory(null);
      currentAudioUriRef.current = null;
      activeAudioStoryIdRef.current = null;
      completedPlaybackRef.current = false;
      lastProgressSaveRef.current = 0;
      pendingResumeRef.current = null;
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
  const handleRefresh = useCallback(async () => {
    if (!isOnline) {
      showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
      return;
    }

    setIsRefreshing(true);
    try {
      await fetchStoriesAndVoiceId(true, true);
      if (refreshCredits) {
        await refreshCredits({ force: true }).catch(() => {});
      }
    } catch (error) {
      console.error('Error refreshing stories:', error);
      showToast('Nie udało się odświeżyć listy bajek.', 'ERROR');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchStoriesAndVoiceId, isOnline, refreshCredits, showToast]);
  
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
    const storyKey = String(story.id);
    const queueIndex = queueIndexByStoryId.get(storyKey);
    const hasQueueEntry = typeof queueIndex === 'number' && queueIndex >= 0;
    const queuePosition = hasQueueEntry ? queueIndex + 1 : null;
    const isActiveQueueItem = hasQueueEntry && queueIndex === activeQueueIndex;
    const affordable =
      typeof requiredCredits === 'number' ? balance >= requiredCredits : true;
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
        onPress={() => handleStorySelect(story)}
        onAddToQueue={() => handleAddStoryToQueue(story)}
        onPlayNext={() => handlePlayNextStory(story)}
        queuePosition={queuePosition}
        isActiveQueueItem={isActiveQueueItem}
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
          <>
            <View style={styles.queueControlsContainer}>
              <View style={styles.queueSummary}>
                <Feather name="list" size={16} color={COLORS.text.secondary} />
                <Text style={styles.queueSummaryText}>W kolejce: {queueLength}</Text>
              </View>
              <View style={styles.queueActions}>
                <TouchableOpacity
                  style={[
                    styles.queueButton,
                    styles.queueButtonFirst,
                    styles.queueButtonPrimary,
                    autoFillDisabled && styles.queueButtonDisabled
                  ]}
                  onPress={handleAutoFillQueue}
                  disabled={autoFillDisabled}
                  activeOpacity={0.85}
                >
                  <Feather name="plus-circle" size={16} color={COLORS.white} />
                  <Text
                    style={[
                      styles.queueButtonText,
                      styles.queueButtonTextPrimary
                    ]}
                  >
                    Uzupełnij kolejkę
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.queueButton,
                    styles.queueButtonSecondary,
                    clearQueueDisabled && styles.queueButtonDisabled
                  ]}
                  onPress={handleClearQueue}
                  disabled={clearQueueDisabled}
                  activeOpacity={0.85}
                >
                  <Feather
                    name="trash-2"
                    size={16}
                    color={clearQueueDisabled ? COLORS.text.tertiary : COLORS.lavender}
                  />
                  <Text
                    style={[
                      styles.queueButtonText,
                      styles.queueButtonTextSecondary,
                      clearQueueDisabled && styles.queueButtonTextDisabled
                    ]}
                  >
                    Wyczyść kolejkę
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <FlatList
              data={displayStories}
              renderItem={renderStoryItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.storiesList,
                { paddingBottom: audioControlsVisible ? 140 : 16 },
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={(
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={COLORS.peach}
                  colors={[COLORS.peach]}
                />
              )}
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
                      (!isOnline || isRefreshing) && styles.disabledButton
                    ]}
                    onPress={handleRefresh}
                    disabled={!isOnline || isRefreshing}
                  >
                    <Text style={styles.refreshButtonText}>Odśwież</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </>
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
        onNext={handleSkipToNextFromControls}
        onPrevious={handleSkipToPreviousFromControls}
        canSkipNext={canSkipNext}
        canSkipPrevious={canSkipPrevious}
        loopMode={loopMode}
        onToggleLoop={handleCycleLoopMode}
        queuePosition={currentQueuePosition}
        queueLength={queueLength}
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
        remoteVoiceId={progressData.remoteVoiceId}
        serviceProvider={progressData.serviceProvider}
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
  queueControlsContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueSummaryText: {
    marginLeft: 6,
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  queueActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 10,
  },
  queueButtonFirst: {
    marginLeft: 0,
  },
  queueButtonPrimary: {
    backgroundColor: COLORS.peach,
    borderColor: COLORS.peach,
  },
  queueButtonSecondary: {
    backgroundColor: 'rgba(218, 143, 255, 0.12)',
    borderColor: 'rgba(218, 143, 255, 0.35)',
  },
  queueButtonDisabled: {
    opacity: 0.6,
  },
  queueButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    marginLeft: 8,
  },
  queueButtonTextPrimary: {
    color: COLORS.white,
  },
  queueButtonTextSecondary: {
    color: COLORS.lavender,
  },
  queueButtonTextDisabled: {
    color: COLORS.text.tertiary,
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
