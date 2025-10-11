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
  const [progressData, setProgressData] = useState({ progress: 0, status: '' });
  const [isOnline, setIsOnline] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [isGenerationConfirmVisible, setIsGenerationConfirmVisible] = useState(false);
  
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
      
      // Only update if the status changed
      if (newIsOnline !== isOnline) {
        setIsOnline(newIsOnline);
        
        // If we just came back online, process queue and refresh stories
        if (newIsOnline) {
          processOfflineQueue();
        }
      }
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
      // Check if online - if offline and no local audio, show message
      if (!isOnline) {
        showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
        return;
      }
      
      // Mark story as processing      
      setProcessingStories((prev) => ({ ...prev, [story.id]: true }));
      
      // Show progress modal
      setProgressData({ progress: 0, status: 'Generowanie audio...' });
      setIsProgressModalVisible(true);
      
      // Create abort signal for cancellation
      const signal = createAbortController();
      
      // Get current audio (with forceDownload parameter)
      const result = await voiceService.getAudio(
        voiceId,
        story.id,
        (progress) => {
          // Update progress
          let statusText = 'Generowanie audio...';
          if (progress > 0.5) {
            statusText = 'Pobieranie audio...';
          }
          
          setProgressData({
            progress: progress * 100,
            status: statusText
          });
        },
        signal,
        forceDownload  // Pass the forceDownload parameter
      );
      
      // Hide progress modal
      setIsProgressModalVisible(false);
      
      // Remove from processing stories
      setProcessingStories((prev) => {
        const updated = { ...prev };
        delete updated[story.id];
        return updated;
      });
      
      if (result.success) {
        // Load the audio with auto-play set to true
        await loadStoryAudio(result.uri, true);
        
        // Update story in the list to show it has audio and local availability
        setStories(currentStories =>
          currentStories.map(s => 
            s.id === story.id ? { 
              ...s, 
              hasAudio: true, 
              localUri: result.uri,
              hasLocalAudio: true,
              localAudioUri: result.uri
            } : s
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
      
      // If the error is due to offline, show a specific message
      if (!isOnline) {
        showToast('Brak połączenia z internetem. Dostępne są tylko zapisane bajki.', 'WARNING');
      } else {
        showToast('Wystąpił problem podczas generowania bajki.', 'ERROR');
      }
    } finally {
      // Hide progress modal if still visible
      setIsProgressModalVisible(false);
      
      // Remove from processing stories
      setProcessingStories((prev) => {
        const updated = { ...prev };
        delete updated[story.id];
        return updated;
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
      
      // Show progress modal
      setProgressData({ progress: 0, status: 'Ponowne pobieranie audio...' });
      setIsProgressModalVisible(true);
      
      // Get a fresh copy of the audio
      const signal = createAbortController();
      
      const result = await voiceService.getAudio(
        voiceId,
        matchingStory.id,
        (progress) => {
          setProgressData({
            progress: progress * 100,
            status: 'Ponowne pobieranie audio...'
          });
        },
        signal,
        true // Force fresh download
      );
      
      // Hide progress modal
      setIsProgressModalVisible(false);
      
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
