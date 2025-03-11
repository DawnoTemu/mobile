import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import voiceService from '../services/voiceService';
import { COLORS } from '../styles/colors';

export default function SynthesisScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
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
    fetchStoriesAndVoiceId();
    setupNetworkListener();
    
    // Clean up on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
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
        
        // If we just came back online, try to process the queue
        if (newIsOnline) {
          // Don't show a toast for reconnection - keep it seamless
          processOfflineQueue();
        }
      }
    });
    
    return unsubscribe;
  };
  
  // Process offline queue
  const processOfflineQueue = async () => {
    if (!isOnline) return;
    
    try {
      const result = await voiceService.processOfflineQueue();
      if (result.success && result.processed > 0) {
        // Refresh stories silently after processing queue
        fetchStoriesAndVoiceId(true);
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  };
  
  // Handle back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        setIsConfirmModalVisible(true);
        return true; // Prevent default behavior
      };
      
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );
  
  // Fetch stories and voice ID
  const fetchStoriesAndVoiceId = async (silent = false) => {
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
      const storiesResult = await voiceService.getStories();
      
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
    // Check if story is already selected or is processing
    if (selectedStory?.id === story.id || processingStories[story.id]) {
      return;
    }
    
    // If audio is currently playing, stop it first
    if (isPlaying) {
      await unloadAudio();
    }
    
    // Set as selected story
    setSelectedStory(story);

    // Check if already has locally saved audio
    if (story.localAudioUri) {
      // Load local audio with auto-play
      loadStoryAudio(story.localAudioUri, true);
      return;
    }
    
    // Check if already has audio on server
    if (story.hasAudio && story.localUri) {
      // Load server audio with auto-play
      loadStoryAudio(story.localUri, true);
      return;
    }
    
    // If no audio available, try to generate/download it
    await getStoryAudio(story);
  };
  
  // Get story audio with progress tracking
  const getStoryAudio = async (story) => {
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
      
      // Use the combined getAudio function that handles both generation and download
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
        signal
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
      
      const success = await loadAudio(audioUri, autoPlay);
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
    
    fetchStoriesAndVoiceId();
  };
  
  // Render story item
  const renderStoryItem = ({ item }) => (
    <StoryItem
      title={item.title}
      author={item.author}
      duration={item.duration}
      imageSource={item.cover_url}
      isSelected={selectedStory?.id === item.id}
      isGenerating={!!processingStories[item.id]}
      hasAudio={item.hasAudio}
      onPress={() => handleStorySelect(item)}
    />
  );
  
  // Filter stories based on connection status
  const getFilteredStories = () => {
    // If online, show all stories
    if (isOnline) {
      return stories;
    }
    
    // If offline, only show stories that have local audio
    return stories.filter(story => story.hasLocalAudio);
  };
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {isOnline ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setIsConfirmModalVisible(true)}
          >
            <Feather name="chevron-left" size={24} color={COLORS.peach} />
            <Text style={styles.backButtonText}>Reset</Text>
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
            data={getFilteredStories()}
            renderItem={renderStoryItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.storiesList}
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
    borderRadius: 16,
    backgroundColor: COLORS.lavender,
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
    paddingBottom: 100, // Extra space for audio controls
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