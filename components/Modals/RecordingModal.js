import React, { useEffect, useRef } from 'react';
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
}) {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  // Auto-scroll animation for the text
  useEffect(() => {
    if (visible && isRecording) {
      // Start automatic scrolling animation - much slower now
      Animated.timing(scrollY, {
        toValue: -1200, // Less scrolling distance to keep text visible
        duration: 140000, // 3 minutes - very slow scrolling
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
  }, [visible, isRecording, scrollY]);
  
  // Animate modal appearance
  useEffect(() => {
    Animated.timing(modalAnimation, {
      toValue: visible ? 1 : 0,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, modalAnimation]);
  
  if (!visible) return null;
  
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
          {isProcessing ? (
            // Processing View
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
          ) : (
            // Recording View with Scrolling Text
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
          )}
          
          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
            </View>
            
            {/* Status Text with Countdown Timer */}
            <Text style={styles.statusText}>
              {statusText || (isRecording ? `Pozostało: ${formatDuration(recordingDuration)}` : 'Rozpocznij mówić')}
            </Text>
            
            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>
                {isProcessing ? 'Anuluj przetwarzanie' : 'Przerwij nagrywanie'}
              </Text>
            </TouchableOpacity>
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
    fontSize: 16, // Large text size
    lineHeight: 32, // Increased line height
    color: COLORS.text.primary,
    flexWrap: 'wrap', // Ensure text wraps properly
    width: '100%', // Full width
    height: 4000,
  },
  processingContainer: {
    height: 320, // Match height with scrollingContainer
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.mint}05`, // 5% opacity
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
  },
  cancelButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
  },
});