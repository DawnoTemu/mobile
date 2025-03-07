import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../styles/colors';

const { width } = Dimensions.get('window');

export default function AudioControls({
  isVisible,
  isPlaying,
  duration = 0,
  position = 0,
  onPlayPause,
  onRewind,
  onForward,
  onSeek,
  onClose,
  formatTime,
  audioTitle,
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const hasAudio = duration > 0;
  const hasAutoPlayed = useRef(false);
  
  // Update slider value when position changes (unless user is seeking)
  useEffect(() => {
    if (!isSeeking && duration > 0) {
      setSliderValue(position / duration);
    }
  }, [position, duration, isSeeking]);
  
  // Animate in/out when visibility changes
  useEffect(() => {
    if (isVisible) {
      // Animate in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, slideAnim, fadeAnim]);
  
  // Handle slider value change when user is seeking
  const handleSliderChange = (value) => {
    setSliderValue(value);
  };
  
  // Handle slider seek start
  const handleSlidingStart = () => {
    setIsSeeking(true);
  };
  
  // Handle slider seek complete
  const handleSlidingComplete = (value) => {
    setIsSeeking(false);
    if (duration > 0) {
      onSeek(value * duration);
    }
  };

  // AUTO-Plays
  useEffect(() => {
    if (isVisible && hasAudio && !isPlaying && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      
      const playTimer = setTimeout(() => {
        onPlayPause();
      }, 500);
      
      return () => clearTimeout(playTimer);
    }
  }, [isVisible, hasAudio, isPlaying, onPlayPause]);
  
  // Optional: Reset the auto-play flag when component becomes invisible
  useEffect(() => {
    if (!isVisible) {
      hasAutoPlayed.current = false;
    }
  }, [isVisible]);
    
  // Don't return null, let the animation handle visibility
  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
      accessible={isVisible}
      accessibilityRole="toolbar"
      accessibilityLabel="Audio player controls"
    >
      {!hasAudio ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>✨ Wybierz bajkę, by rozpocząć</Text>
        </View>
      ) : (
        <View style={styles.controls}>
          {/* Audio title */}
          {audioTitle && (
            <Text numberOfLines={1} style={styles.audioTitle}>
              {audioTitle}
            </Text>
          )}
          
          <View style={styles.sliderContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={sliderValue}
              minimumTrackTintColor={COLORS.lavender}
              maximumTrackTintColor="#E5E7EB"
              thumbTintColor={COLORS.lavender}
              onValueChange={handleSliderChange}
              onSlidingStart={handleSlidingStart}
              onSlidingComplete={handleSlidingComplete}
              accessibilityLabel="Audio progress slider"
              accessibilityHint="Drag to change position in the audio"
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
          
          <View style={styles.buttonsContainer}>
            {/* Rewind Button */}
            <TouchableOpacity 
              onPress={() => onRewind(10)} 
              style={styles.sideButton}
              accessibilityLabel="Rewind 10 seconds"
              accessibilityRole="button"
              accessibilityHint="Double tap to go back 10 seconds"
            >
              <View style={styles.buttonGroup}>
                <Feather name="rewind" size={24} color={COLORS.text.secondary} />
                <Text style={styles.buttonText}>10s</Text>
              </View>
            </TouchableOpacity>
            
            {/* Play/Pause Button */}
            <TouchableOpacity 
              onPress={onPlayPause} 
              style={styles.playButton}
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
              accessibilityRole="button"
              accessibilityHint={isPlaying ? "Double tap to pause" : "Double tap to play"}
            >
              <Feather 
                name={isPlaying ? 'pause' : 'play'} 
                size={28} 
                color={COLORS.white} 
              />
            </TouchableOpacity>
            
            {/* Forward Button */}
            <TouchableOpacity 
              onPress={() => onForward(10)} 
              style={styles.sideButton}
              accessibilityLabel="Forward 10 seconds"
              accessibilityRole="button"
              accessibilityHint="Double tap to skip forward 10 seconds"
            >
              <View style={styles.buttonGroup}>
                <Text style={styles.buttonText}>10s</Text>
                <Feather name="fast-forward" size={24} color={COLORS.text.secondary} />
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Close button */}
          {/* {onClose && (
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close audio player"
              accessibilityRole="button"
            >
              <Feather name="x" size={20} color={COLORS.text.tertiary} />
            </TouchableOpacity>
          )} */}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    paddingTop: 12,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  emptyState: {
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.tertiary,
  },
  controls: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  audioTitle: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 8,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sideButton: {
    padding: 12,
    width: 80,
    alignItems: 'center',
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginHorizontal: 4,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  timeText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.secondary,
    width: 44,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 4,
    right: 8,
    padding: 8,
  },
});