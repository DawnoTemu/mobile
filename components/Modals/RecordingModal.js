import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../styles/colors';
import { Audio } from 'expo-av';

export default function RecordingModal({
  visible,
  isRecording,
  isProcessing,
  progress,
  recordingDuration,
  statusText,
  onCancel,
  formatDuration,
  onStartRecording,
  audioUri,
  onSubmitRecording,
  onReRecord,
}) {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  // Track recording preparation state
  // Add 'review' state to the possible states
  const [recordingState, setRecordingState] = useState('instructions'); // 'instructions', 'countdown', 'recording', 'review'
  
  // State for countdown
  const [countdownNumber, setCountdownNumber] = useState(3);
  
  // Audio playback states
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  
  // Reset state when modal is opened/closed
  useEffect(() => {
    if (visible) {
      setRecordingState('instructions');
      setCountdownNumber(3);
    } else {
      // Cleanup audio when modal closes
      if (sound) {
        sound.unloadAsync();
        setSound(null);
      }
    }
  }, [visible]);

  // Update recording state based on isRecording prop
  useEffect(() => {
    if (isRecording) {
      setRecordingState('recording');
    } else if (audioUri && !isRecording && !isProcessing && recordingState === 'recording') {
      // Transition to review state when recording finishes and we have an audio URI
      setRecordingState('review');
      loadRecordedAudio();
    }
  }, [isRecording, audioUri, isProcessing]);
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);
  
  // Load the recorded audio for playback
  const loadRecordedAudio = async () => {
    if (!audioUri) return;
    
    // Unload previous sound if it exists
    if (sound) {
      await sound.unloadAsync();
    }
    
    try {
      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        allowsRecordingIOS: false,
      });
      
      // Create and load the sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
    } catch (error) {
      console.error('Failed to load recorded audio:', error);
    }
  };
  
  // Callback for playback status updates
  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPlaybackDuration(status.durationMillis / 1000); // Convert to seconds
      setPlaybackPosition(status.positionMillis / 1000);
      setIsPlaying(status.isPlaying);
      
      // If playback finished, reset to beginning
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  };
  
  // Play/pause the recorded audio
  const togglePlayback = async () => {
    if (!sound) return;
    
    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        // If we reached the end, start from beginning
        const status = await sound.getStatusAsync();
        if (status.positionMillis === status.durationMillis) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };
  
  // Auto-scroll animation for the text during recording
  useEffect(() => {
    if (visible && recordingState === 'recording' && isRecording) {
      // Start automatic scrolling animation - slower to match 60-second recording
      Animated.timing(scrollY, {
        toValue: -1600, // Less scrolling distance to keep text visible
        duration: 190000, // Increased duration for slower scrolling (about 3.3 minutes)
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    } else {
      // Reset scroll position when modal is closed or not recording
      scrollY.setValue(0);
    }
    
    return () => {
      scrollY.stopAnimation();
    };
  }, [visible, recordingState, isRecording, scrollY]);
  
  // Animate modal appearance
  useEffect(() => {
    Animated.timing(modalAnimation, {
      toValue: visible ? 1 : 0,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, modalAnimation]);
  
  // Handle countdown animation using interval instead of Animated API
  const startCountdown = () => {
    setRecordingState('countdown');
    setCountdownNumber(3);
    
    // Use interval for more reliable countdown
    const intervalId = setInterval(() => {
      setCountdownNumber(prev => {
        if (prev <= 1) {
          // Clear interval when we reach 0
          clearInterval(intervalId);
          
          // Wait a moment at "Start!" then begin recording
          setTimeout(() => {
            onStartRecording && onStartRecording();
          }, 500);
          
          return 0; // Show "Start!"
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  // Handle re-recording
  const handleReRecord = () => {
    // Clean up audio playback
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    
    // Reset to instructions state
    setRecordingState('instructions');
    
    // Call the parent component's re-record handler
    if (onReRecord) {
      onReRecord();
    }
  };
  
  // Handle submitting the recording
  const handleSubmitRecording = () => {
    // Clean up audio playback
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    
    // Call the parent component's submit handler
    if (onSubmitRecording) {
      onSubmitRecording(audioUri);
    }
  };
  
  if (!visible) return null;
  
  // Format time (seconds to MM:SS)
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // Render different views based on the current state
  const renderContent = () => {
    if (isProcessing) {
      // Processing View
      return (
        <View style={styles.processingContainer}>
          <Animated.View
            style={[
              styles.processingIndicator,
              {
                transform: [
                  {
                    rotate: modalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <Feather name="loader" size={32} color={COLORS.peach} />
          </Animated.View>
          <Text style={styles.processingText}>
            Trwa Analizowanie Twojego Głosu...
          </Text>
        </View>
      );
    } else if (recordingState === 'review') {
      // Review Recording View
      return (
        <View style={styles.reviewContainer}>
          <Text style={styles.reviewTitle}>Odsłuchaj swoje nagranie</Text>
          
          <Text style={styles.reviewDescription}>
            Posłuchaj nagrania i zdecyduj czy chcesz je wysłać, czy nagrać ponownie.
          </Text>
          
          {/* Audio Player */}
          <View style={styles.playerContainer}>
            {/* Play/Pause Button */}
            <TouchableOpacity 
              style={styles.playPauseButton}
              onPress={togglePlayback}
            >
              <Feather 
                name={isPlaying ? 'pause' : 'play'} 
                size={32} 
                color={COLORS.white} 
              />
            </TouchableOpacity>
            
            {/* Timer */}
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>
                {formatTime(playbackPosition)} / {formatTime(playbackDuration)}
              </Text>
            </View>
          </View>
          
          <View style={styles.reviewHintContainer}>
            <Feather name="info" size={16} color={COLORS.lavender} style={styles.reviewHintIcon} />
            <Text style={styles.reviewHint}>
              Upewnij się, że Twój głos jest wyraźny i nie ma zakłóceń w tle.
            </Text>
          </View>
        </View>
      );
    } else if (recordingState === 'instructions') {
      // Instructions View
      return (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>Zanim zaczniesz nagrywać:</Text>
          
          <View style={styles.instructionItem}>
            <Feather name="volume-2" size={24} color={COLORS.peach} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>Mów wyraźnie i w naturalnym tempie</Text>
          </View>
          
          <View style={styles.instructionItem}>
            <Feather name="mic" size={24} color={COLORS.peach} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>Trzymaj telefon w odległości 20-30 cm od ust</Text>
          </View>
          
          <View style={styles.instructionItem}>
            <Feather name="shield" size={24} color={COLORS.peach} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>Znajdź ciche miejsce bez hałasów i pogłosu</Text>
          </View>
          
          <View style={styles.instructionItem}>
            <Feather name="clock" size={24} color={COLORS.peach} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>Nagranie potrwa 60 sekund - odczytaj tekst całego akapitu</Text>
          </View>
        </View>
      );
    } else if (recordingState === 'countdown') {
      // Countdown View
      return (
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownLabel}>Przygotuj się, zaczynamy za...</Text>
          <Text style={styles.countdownNumber}>
            {countdownNumber === 0 ? "Start!" : countdownNumber}
          </Text>
          <Text style={styles.countdownHint}>Bądź gotów do czytania tekstu na głos</Text>
        </View>
      );
    } else {
      // Recording View with Scrolling Text
      return (
        <View style={styles.scrollingContainer}>
          <Animated.View
            style={[
              styles.textContainer,
              {
                transform: [{ translateY: scrollY }],
              },
            ]}
          >
            <Text style={styles.recordingText}>
              Był spokojny, ciepły wieczór. Słońce powoli chowało się za horyzontem, malując niebo odcieniami pomarańczu i różu. Anna usiadła wygodnie w fotelu przy oknie, trzymając w dłoniach filiżankę herbaty. Ciepło ostatnich promieni przenikało przez szybę, nadając wnętrzu miękki, złocisty blask.
              {'\n\n'}
              W miarę jak niebo przechodziło od intensywnych barw zachodu do stonowanej granatowej głębi, Anna zanurzała się w refleksjach. Myśli niesione delikatnym powiewem wiatru przenosiły ją do czasów dzieciństwa, pełnych beztroskich zabaw na świeżym powietrzu i przygód, które zdawały się trwać wiecznie. Wspomnienia te miały w sobie coś czarującego, jak zapach świeżo skoszonej trawy po letniej ulewie.
              {'\n\n'}
              Powietrze pachniało letnim deszczem, który niedawno przeszedł przez miasto. Krople, jeszcze odbijające blask księżyca, zdobiły liście drzew, tworząc naturalne koronkowe wzory na gałęziach. W oddali słychać było cichy śmiech dzieci bawiących się na podwórku oraz delikatny szum liści poruszanych przez lekki wiatr. Każdy dźwięk tej spokojnej symfonii zdawał się przypominać, że nawet w ciszy kryje się cała paleta emocji i wspomnień.
              {'\n\n'}
              Kot, zwinięty w kłębek na parapecie, leniwie otworzył jedno oko, jakby chciał sprawdzić, czy wszystko jest w porządku. Jego spokojne spojrzenie i niewzruszony wyraz twarzy budziły w Annie poczucie bezpieczeństwa i ciepła domowego ogniska. Przez chwilę obserwowała swojego futrzanego towarzysza, przypominając sobie, jak często właśnie te małe, codzienne momenty potrafią nadać życiu niespodziewanego blasku.
              {'\n\n'}
              Zamykając oczy na moment, Anna wsłuchiwała się w ciche dźwięki wieczoru. W tle dało się słyszeć delikatne szmery rozmów przechodniów oraz odległe echo muzyki płynącej z pobliskiej kawiarni. Każdy dźwięk, każda migawka światła tworzyły pejzaż, w którym łączyły się teraźniejszość i minione chwile, wzbudzając uczucie, że czas zwalnia w najpiękniejszych momentach.
              {'\n\n'}
              Z filiżanką herbaty w dłoniach i sercem otwartym na to, co przynosi kolejna chwila, Anna czuła, że wieczór ten jest darem – chwilą zatrzymania się, refleksji i wyciszenia. W tej magicznej ciszy, gdzie szept liści mieszał się z echem dawnych wspomnień, każdy oddech stawał się celebracją życia. Gdy patrzyła na rozgwieżdżone niebo, wiedziała, że to właśnie te drobne, niemal niezauważalne momenty tworzą najpiękniejszą mozaikę codzienności, skłaniając ją do głębszych przemyśleń i cieszenia się każdą, nawet najcichszą chwilą.
            </Text>
          </Animated.View>
        </View>
      );
    }
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <BlurView intensity={20} style={styles.backdrop}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              opacity: modalAnimation,
              transform: [
                {
                  translateY: modalAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Modal Header */}
          <View style={styles.header}>
            <Feather name="mic" size={20} color={COLORS.peach} />
            <Text style={styles.headerTitle}>
              {recordingState === 'review' ? 'Sprawdź Nagranie' : 'Dodaj Swój Głos'}
            </Text>
          </View>
          
          {/* Content Area */}
          {renderContent()}
          
          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {/* Progress Bar - only show when recording or processing */}
            {(recordingState === 'recording' || isProcessing) && (
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${progress}%` }]}
                  />
                </View>
              </View>
            )}
            
            {/* Processing State Message */}
            {isProcessing && (
              <Text style={styles.statusText}>
                Przetwarzanie głosu...
              </Text>
            )}
            
            {/* Status Text with Countdown Timer - only show when recording */}
            {recordingState === 'recording' && (
              <Text style={styles.statusText}>
                {statusText || (isRecording ? `Pozostało: ${formatDuration(recordingDuration)}` : 'Rozpocznij mówić')}
              </Text>
            )}
            
            {/* Action buttons based on state */}
            <View style={styles.footerButtonsContainer}>
              {/* Review state buttons */}
              {recordingState === 'review' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.reRecordButton]}
                    onPress={handleReRecord}
                    activeOpacity={0.7}
                  >
                    <Feather name="refresh-cw" size={20} color={COLORS.text.secondary} style={{marginRight: 8}} />
                    <Text style={styles.reRecordButtonText}>Nagraj ponownie</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.actionButton, styles.submitButton]}
                    onPress={handleSubmitRecording}
                    activeOpacity={0.7}
                  >
                    <Feather name="check" size={20} color={COLORS.white} style={{marginRight: 8}} />
                    <Text style={styles.submitButtonText}>Wyślij nagranie</Text>
                  </TouchableOpacity>
                </>
              )}
              
              {/* Start button - only in instructions view */}
              {recordingState === 'instructions' && (
                <TouchableOpacity
                  style={styles.startButtonFooter}
                  onPress={startCountdown}
                  activeOpacity={0.7}
                >
                  <Feather name="play-circle" size={20} color={COLORS.white} style={{marginRight: 8}} />
                  <Text style={styles.startButtonTextFooter}>Rozpocznij nagrywanie</Text>
                </TouchableOpacity>
              )}
              
              {/* Cancel Button - always show except in review state */}
              {recordingState !== 'review' && (
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    recordingState === 'instructions' ? styles.cancelButtonSecondary : {}
                  ]}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>
                    {isProcessing 
                      ? 'Anuluj przetwarzanie' 
                      : recordingState === 'recording'
                        ? 'Przerwij nagrywanie'
                        : 'Anuluj'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: `${COLORS.background}10`, // 10% opacity
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.background}20`, // 20% opacity
  },
  headerTitle: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginLeft: 8,
  },
  // Instructions View
  instructionsContainer: {
    padding: 24,
    height: 340,
  },
  instructionsTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 20,
    textAlign: 'center',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  instructionIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  instructionText: {
    flex: 1,
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text.secondary,
  },
  // Review View
  reviewContainer: {
    padding: 24,
    height: 340,
    justifyContent: 'center',
  },
  reviewTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  reviewDescription: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  playerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  playPauseButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  reviewHintContainer: {
    flexDirection: 'row',
    backgroundColor: `${COLORS.lavender}15`, // 15% opacity
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  reviewHintIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  reviewHint: {
    flex: 1,
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text.secondary,
  },
  // Start button
  startButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.peach,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  startButtonIcon: {
    marginRight: 12,
  },
  startButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.white,
  },
  // Footer start button
  startButtonFooter: {
    flexDirection: 'row',
    backgroundColor: COLORS.peach,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginRight: 10,
  },
  startButtonTextFooter: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  // Countdown styles
  countdownContainer: {
    height: 340,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  countdownLabel: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 18,
    color: COLORS.text.secondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  countdownNumber: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 72,
    fontWeight: 'bold',
    color: COLORS.peach,
    marginVertical: 24,
  },
  countdownHint: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginTop: 16,
    textAlign: 'center',
  },
  // Existing styles for recording and processing views
  scrollingContainer: {
    height: 340, // Increased height for more text
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: `${COLORS.white}`, // 5% opacity
  },
  textContainer: {
    padding: 24,
    paddingBottom: 40, // Extra padding at bottom
  },
  recordingText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 18, // Slightly increased text size for better readability
    lineHeight: 32, // Increased line height
    color: COLORS.text.primary,
    flexWrap: 'wrap', // Ensure text wraps properly
    width: '100%', // Full width
    height: 4000,
  },
  processingContainer: {
    height: 340, // Match height with scrollingContainer
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.background}`, // 5% opacity
  },
  processingIndicator: {
    marginBottom: 16,
  },
  processingText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  footer: {
    padding: 16,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  footerButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.peach,
  },
  statusText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16, // Increased size
    fontWeight: 'bold', // Make it bold
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Action buttons for review state
  actionButton: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  reRecordButton: {
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  reRecordButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  submitButton: {
    backgroundColor: COLORS.peach,
    marginLeft: 8,
  },
  submitButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.white,
  },
  // Cancel button
  cancelButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  cancelButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
  },
});