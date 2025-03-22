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
}) {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  // Track recording preparation state
  const [recordingState, setRecordingState] = useState('instructions'); // 'instructions', 'countdown', 'recording'
  
  // State for countdown
  const [countdownNumber, setCountdownNumber] = useState(3);
  
  // Reset state when modal is opened/closed
  useEffect(() => {
    if (visible) {
      setRecordingState('instructions');
      setCountdownNumber(3);
    }
  }, [visible]);

  // Update recording state based on isRecording prop
  useEffect(() => {
    if (isRecording) {
      setRecordingState('recording');
    }
  }, [isRecording]);
  
  // Auto-scroll animation for the text
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
  
  if (!visible) return null;
  
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
            {countdownNumber}
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
            <Text style={styles.headerTitle}>Dodaj Swój Głos</Text>
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
            
            {/* Status Text with Countdown Timer - only show when recording */}
            {recordingState === 'recording' && (
              <Text style={styles.statusText}>
                {statusText || (isRecording ? `Pozostało: ${formatDuration(recordingDuration)}` : 'Rozpocznij mówić')}
              </Text>
            )}
            
            {/* Action buttons based on state */}
            <View style={styles.footerButtonsContainer}>
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
              
              {/* Cancel Button - always show */}
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