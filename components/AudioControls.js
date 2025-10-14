import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Platform,
  Image,
  ScrollView,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../styles/colors';
import { LOOP_MODES } from '../context/PlaybackQueueProvider';

const { width, height } = Dimensions.get('window');

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
  story,
  onNext,
  onPrevious,
  canSkipNext = false,
  canSkipPrevious = false,
  loopMode = LOOP_MODES.NONE,
  onToggleLoop,
  queuePosition = null,
  queueLength = null,
}) {
  const insets = useSafeAreaInsets();
  // Reduced initial value from 100 to 50 for less extreme starting position
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // JS-driven animation for height/layout (can't use native driver)
  const expandAnim = useRef(new Animated.Value(0)).current;
  
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasAudio = duration > 0;
  const hasAutoPlayed = useRef(false);
  const scrollViewRef = useRef(null);
  const [storyContentHeight, setStoryContentHeight] = useState(0);
  const [storyContainerHeight, setStoryContainerHeight] = useState(0);
  const [isUserScrollingStory, setIsUserScrollingStory] = useState(false);
  const userScrollTimeoutRef = useRef(null);
  const currentScrollYRef = useRef(0);
  const targetScrollRef = useRef(0);
  const lastAutoScrollYRef = useRef(0);
  const pendingScrollYRef = useRef(0);
  const justJumpRef = useRef(false);
  const scrollLoopRef = useRef(null);
  
  // Placeholder story data (will be replaced with real data later)
  const fallbackStoryText =
    "Once upon a time, in a land far, far away...\n\nThis is a placeholder for the full story text. When the server is extended, this will be replaced with the complete story content. For now, let's imagine this is a wonderful tale about brave knights, magical creatures, and exciting adventures.\n\nThe story continues with twists and turns, keeping children engaged and excited to hear what happens next. Every character has their own unique personality and challenges to overcome.\n\nAs the plot develops, valuable lessons about friendship, courage, and kindness are woven into the narrative. These stories help children develop empathy and understanding while enjoying the entertainment of a good story.";

  const storyText = useMemo(() => {
    if (!story) {
      return fallbackStoryText;
    }

    const candidate =
      story.content ??
      story.text ??
      story.storyText ??
      story.story_text ??
      story.fullText ??
      story.body ??
      story.story_content ??
      story.storyBody;

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }

    return fallbackStoryText;
  }, [story]);

  const storyData = useMemo(
    () => ({
      title: story?.title || audioTitle || 'Story Title',
      author: story?.author || 'Author Name',
      cover: story?.cover_url || story?.cover || null,
      description:
        story?.description ||
        story?.summary ||
        'This is a placeholder for the story description. It will be replaced with the actual story description from the server later.',
      text: storyText,
    }),
    [audioTitle, story, storyText]
  );

  const hasNextHandler = typeof onNext === 'function';
  const hasPreviousHandler = typeof onPrevious === 'function';

  const queueSummary = useMemo(() => {
    if (queuePosition && queueLength) {
      return `${queuePosition}/${queueLength}`;
    }

    if (queueLength) {
      return `${queueLength} w kolejce`;
    }

    return 'Kolejka pusta';
  }, [queuePosition, queueLength]);

  const loopState = useMemo(() => {
    switch (loopMode) {
      case LOOP_MODES.REPEAT_ONE:
        return { label: 'Powtarzanie utworu', badge: '1', active: true };
      case LOOP_MODES.REPEAT_ALL:
        return { label: 'Powtarzanie kolejki', badge: null, active: true };
      default:
        return { label: 'Bez powtarzania', badge: null, active: false };
    }
  }, [loopMode]);

  const loopToggleAvailable = typeof onToggleLoop === 'function';
  const previousButtonDisabled = !hasPreviousHandler || !canSkipPrevious;
  const nextButtonDisabled = !hasNextHandler || !canSkipNext;
  const previousIconColor = previousButtonDisabled ? COLORS.text.tertiary : COLORS.text.primary;
  const nextIconColor = nextButtonDisabled ? COLORS.text.tertiary : COLORS.text.primary;

  const coverSource = useMemo(() => {
    if (storyData.cover) {
      return { uri: storyData.cover };
    }
    return require('../assets/images/cover.png');
  }, [storyData.cover]);
  
  // Update slider value when position changes (unless user is seeking)
  useEffect(() => {
    if (!isSeeking && duration > 0) {
      setSliderValue(position / duration);
    }
  }, [position, duration, isSeeking]);
  
  // Animate in/out when visibility changes (using native driver)
  useEffect(() => {
    if (isVisible) {
      // Make component visible immediately before animation
      slideAnim.setValue(140);
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
      
      // Reset expanded state when hiding
      setExpanded(false);
      expandAnim.setValue(0);
    }
  }, [isVisible, slideAnim, fadeAnim]);
  
  // Animation for expanding/collapsing (JS driven - NOT using native driver)
  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // JS-driven for height animation
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [expanded, expandAnim]);
  
  // Calculate expanded container height (minus insets and player height)
  const expandedHeight = height - insets.top - 80;
  
  // Improved pan responder for more reliable gesture detection
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // More sensitive threshold for vertical gestures
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dx) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        // Improved gesture handling
        if (expanded && gestureState.dy > 0) {
          // When expanded, better response for swipe down
          const newValue = 1 - Math.min(1, gestureState.dy / 150);
          expandAnim.setValue(Math.max(0, newValue));
        } else if (!expanded && gestureState.dy < 0) {
          // When collapsed, more responsive swipe up
          const newValue = Math.min(1, -gestureState.dy / 150);
          expandAnim.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // More lenient thresholds for recognizing gestures
        if (expanded) {
          // If swiping down while expanded - lowered threshold
          if (gestureState.dy > 30 || gestureState.vy > 0.3) {
            setExpanded(false);
          } else {
            // Return to expanded state
            expandAnim.setValue(1);
          }
        } else {
          // If swiping up while minimized
          if (gestureState.dy < -30 || gestureState.vy < -0.3) {
            setExpanded(true);
          } else {
            // Return to minimized state
            expandAnim.setValue(0);
          }
        }
      },
    })
  ).current;
  
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
      const newPosition = value * duration;
      onSeek(newPosition);

      const maxOffset = Math.max(0, storyContentHeight - storyContainerHeight);
      const progress = duration > 0 ? newPosition / duration : 0;
      const targetOffset = maxOffset * progress;

      if (Number.isFinite(targetOffset)) {
        targetScrollRef.current = targetOffset;
        pendingScrollYRef.current = targetOffset;
        currentScrollYRef.current = targetOffset;
        lastAutoScrollYRef.current = targetOffset;
        justJumpRef.current = true;
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: targetOffset, animated: false });
        }
      }
    }
  };

  // Handle tap on pull indicator to toggle expanded state
  const toggleExpanded = () => {
    setExpanded(!expanded);
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
  
  // Animated values for rotation using native driver
  const rotateAnim = useRef(new Animated.Value(0)).current;
  
  // Update rotation animation when expanded state changes
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [expanded, rotateAnim]);
  
  // Calculate styles separately for native and JS animations
  const containerHeightStyle = {
    height: expandAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [140, expandedHeight]
    }),
  };
  
  const containerNativeStyle = {
    transform: [{ translateY: slideAnim }],
    opacity: fadeAnim,
  };
  
  const pullIndicatorStyle = {
    transform: [{
      rotate: rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg']
      })
    }]
  };
  
  // Create JS-driven animated values for content visibility
  const minimizedContentOpacity = expandAnim.interpolate({
    inputRange: [0, 0.3],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });
  
  const expandedContentOpacity = expandAnim.interpolate({
    inputRange: [0.7, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });
  
const stopAutoScroll = useCallback(() => {
  if (scrollLoopRef.current) {
    cancelAnimationFrame(scrollLoopRef.current);
    scrollLoopRef.current = null;
  }
}, []);

const startSmoothScroll = (
  scrollViewRef,
  currentScrollYRef,
  targetScrollRef,
  lastAutoScrollYRef,
  expanded,
  isUserScrollingStory,
  isSeeking,
  storyContentHeight,
  storyContainerHeight
) => {
  if (scrollLoopRef.current || !scrollViewRef.current) {
    return;
  }

  const step = () => {
    scrollLoopRef.current = null;

    if (
      !expanded ||
      isUserScrollingStory ||
      isSeeking ||
      storyContentHeight <= storyContainerHeight ||
      !scrollViewRef.current
    ) {
      return;
    }

    const current = currentScrollYRef.current;
    const target = targetScrollRef.current;
    const diff = target - current;

    if (Math.abs(diff) <= 0.6) {
      scrollViewRef.current.scrollTo({ y: target, animated: false });
      currentScrollYRef.current = target;
      lastAutoScrollYRef.current = target;
      justJumpRef.current = false;
      return;
    }

    const eased = current + diff * 0.2;
    currentScrollYRef.current = eased;
    lastAutoScrollYRef.current = eased;
    scrollViewRef.current.scrollTo({ y: eased, animated: false });

    scrollLoopRef.current = requestAnimationFrame(step);
  };

  scrollLoopRef.current = requestAnimationFrame(step);
};

  const handleStoryScrollStart = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = null;
    }
    stopAutoScroll();
    setIsUserScrollingStory(true);
  }, [stopAutoScroll]);

  const handleStoryScrollEnd = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrollingStory(false);
      userScrollTimeoutRef.current = null;
    }, 1200);
  }, []);

  const handleStoryScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    currentScrollYRef.current = offsetY;
    lastAutoScrollYRef.current = offsetY;
  }, []);

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
        userScrollTimeoutRef.current = null;
      }
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  useEffect(() => {
    currentScrollYRef.current = 0;
    targetScrollRef.current = 0;
    setStoryContentHeight(0);
    setStoryContainerHeight(0);
    setIsUserScrollingStory(false);
    lastAutoScrollYRef.current = 0;
    pendingScrollYRef.current = 0;
    justJumpRef.current = true;
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [story?.id, storyText]);

  useEffect(() => {
    if (duration <= 0 || !storyText) {
      targetScrollRef.current = 0;
      pendingScrollYRef.current = 0;
      return;
    }

    const clampedPosition = Math.max(0, Math.min(position, duration));
    const maxOffset = Math.max(0, storyContentHeight - storyContainerHeight);
    const progress = duration > 0 ? clampedPosition / duration : 0;
    const targetOffset = maxOffset * progress;

    if (!Number.isFinite(targetOffset)) {
      return;
    }

    targetScrollRef.current = targetOffset;
    pendingScrollYRef.current = targetOffset;

    if (
      !expanded ||
      isUserScrollingStory ||
      isSeeking ||
      storyContentHeight <= storyContainerHeight ||
      !scrollViewRef.current
    ) {
      stopAutoScroll();
      return;
    }

    const distance = Math.abs(targetOffset - currentScrollYRef.current);
    if (distance < 2) {
      stopAutoScroll();
      return;
    }

    const shouldSmooth = !justJumpRef.current && distance < 250;

    if (!shouldSmooth) {
      stopAutoScroll();
      scrollViewRef.current.scrollTo({ y: targetOffset, animated: false });
      currentScrollYRef.current = targetOffset;
      lastAutoScrollYRef.current = targetOffset;
      justJumpRef.current = false;
      return;
    }

    justJumpRef.current = false;
    startSmoothScroll(
      scrollViewRef,
      currentScrollYRef,
      targetScrollRef,
      lastAutoScrollYRef,
      expanded,
      isUserScrollingStory,
      isSeeking,
      storyContentHeight,
      storyContainerHeight
    );
  }, [
    duration,
    expanded,
    isSeeking,
    isUserScrollingStory,
    stopAutoScroll,
    position,
    storyContainerHeight,
    storyContentHeight,
    storyText,
  ]);

  useEffect(() => {
    if (
      !expanded ||
      isUserScrollingStory ||
      storyContentHeight <= storyContainerHeight ||
      !scrollViewRef.current
    ) {
      stopAutoScroll();
      return;
    }

    stopAutoScroll();
    scrollViewRef.current.scrollTo({ y: pendingScrollYRef.current, animated: false });
    currentScrollYRef.current = pendingScrollYRef.current;
    lastAutoScrollYRef.current = pendingScrollYRef.current;
    justJumpRef.current = false;
  }, [expanded, isUserScrollingStory, stopAutoScroll, storyContentHeight, storyContainerHeight]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 10),
        },
        containerNativeStyle,
      ]}
      accessible={isVisible}
      accessibilityRole="toolbar"
      accessibilityLabel="Audio player controls"
    >
      {/* This wrapper handles the height animation separately */}
      <Animated.View style={[styles.heightContainer, containerHeightStyle]}>
        {/* Pull indicator */}
        <TouchableOpacity 
          style={styles.pullIndicatorContainer}
          onPress={toggleExpanded}
          {...panResponder.panHandlers}
        >
          <Animated.View style={[styles.pullIndicator, pullIndicatorStyle]}>
            <Feather name="chevron-up" size={20} color={COLORS.text.tertiary} />
          </Animated.View>
        </TouchableOpacity>
        
        {!hasAudio ? (
          <View style={styles.emptyState}>
          </View>
        ) : (
          <>
            {/* Minimized Controls - shown when not expanded */}
            <Animated.View style={[styles.controls, { opacity: minimizedContentOpacity }]}>
              <View style={styles.minimizedControls}>
                <View style={styles.queueMetaRow}>
                  <View style={styles.queueInfo}>
                    <Feather name="list" size={14} color={COLORS.text.secondary} />
                    <Text style={styles.queueInfoText}>{queueSummary}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.loopButton,
                      loopState.active && styles.loopButtonActive,
                      !loopToggleAvailable && styles.loopButtonDisabled
                    ]}
                    onPress={onToggleLoop}
                    disabled={!loopToggleAvailable}
                    accessibilityLabel={`Tryb powtarzania: ${loopState.label}`}
                    accessibilityRole="button"
                    accessibilityHint="Stuknij, aby zmienić tryb powtarzania"
                  >
                    <Feather
                      name="repeat"
                      size={16}
                      color={loopState.active ? COLORS.white : COLORS.text.secondary}
                    />
                    {loopState.badge ? (
                      <View style={styles.loopBadgeContainer}>
                        <Text style={styles.loopBadgeText}>{loopState.badge}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
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
                  <TouchableOpacity
                    onPress={onPrevious}
                    disabled={previousButtonDisabled}
                    style={[
                      styles.skipButton,
                      previousButtonDisabled && styles.disabledControl
                    ]}
                    accessibilityLabel="Poprzednia bajka"
                    accessibilityRole="button"
                    accessibilityHint="Stuknij, aby odtworzyć poprzednią bajkę"
                  >
                    <Feather name="skip-back" size={22} color={previousIconColor} />
                  </TouchableOpacity>
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
                  <TouchableOpacity
                    onPress={onNext}
                    disabled={nextButtonDisabled}
                    style={[
                      styles.skipButton,
                      nextButtonDisabled && styles.disabledControl
                    ]}
                    accessibilityLabel="Następna bajka"
                    accessibilityRole="button"
                    accessibilityHint="Stuknij, aby odtworzyć następną bajkę"
                  >
                    <Feather name="skip-forward" size={22} color={nextIconColor} />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
            
            {/* Expanded Content - visible when expanded */}
            <Animated.View 
              style={[
                styles.expandedContent, 
                { opacity: expandedContentOpacity }
              ]}
            >
              {/* Added explicit close button for expanded view */}
              <TouchableOpacity 
                style={styles.closeExpandedButton}
                onPress={() => setExpanded(false)}
                accessibilityLabel="Close expanded view"
                accessibilityRole="button"
              >
                <Feather name="x" size={24} color={COLORS.text.secondary} />
              </TouchableOpacity>
            
              {/* Story Header Section */}
              <View style={styles.storyHeader}>
                <View style={styles.coverContainer}>
                  <Image 
                    source={coverSource}
                    style={styles.coverImage} 
                    resizeMode="cover"
                    onError={(e) => {
                      console.log('Cover image loading error:', e.nativeEvent.error);
                    }}
                  />
                </View>
                <View style={styles.storyInfo}>
                  <Text style={styles.storyTitle}>{storyData.title}</Text>
                  <Text style={styles.storyAuthor}>{storyData.author}</Text>
                  <Text style={styles.storyDescription}>{storyData.description}</Text>
                </View>
              </View>
              
              {/* Story Text Scroll View */}
              <View
                style={styles.storyTextContainer}
                onLayout={(event) =>
                  setStoryContainerHeight(event.nativeEvent.layout.height)
                }
              >
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.storyTextScrollView}
                  contentContainerStyle={styles.storyTextContent}
                  onContentSizeChange={(_, height) => setStoryContentHeight(height)}
                  onScroll={handleStoryScroll}
                  scrollEventThrottle={16}
                  onScrollBeginDrag={handleStoryScrollStart}
                  onScrollEndDrag={handleStoryScrollEnd}
                  onMomentumScrollBegin={handleStoryScrollStart}
                  onMomentumScrollEnd={handleStoryScrollEnd}
                >
                  <Text style={styles.storyText}>{storyData.text}</Text>
                </ScrollView>
              </View>
              
              {/* Player Controls in Expanded Mode */}
              <View style={styles.expandedPlayerControls}>
                <View style={styles.queueMetaRow}>
                  <View style={styles.queueInfo}>
                    <Feather name="list" size={16} color={COLORS.text.secondary} />
                    <Text style={styles.queueInfoText}>{queueSummary}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.loopButton,
                      loopState.active && styles.loopButtonActive,
                      !loopToggleAvailable && styles.loopButtonDisabled
                    ]}
                    onPress={onToggleLoop}
                    disabled={!loopToggleAvailable}
                    accessibilityLabel={`Tryb powtarzania: ${loopState.label}`}
                    accessibilityRole="button"
                    accessibilityHint="Stuknij, aby zmienić tryb powtarzania"
                  >
                    <Feather
                      name="repeat"
                      size={18}
                      color={loopState.active ? COLORS.white : COLORS.text.secondary}
                    />
                    {loopState.badge ? (
                      <View style={styles.loopBadgeContainer}>
                        <Text style={styles.loopBadgeText}>{loopState.badge}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
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
                  />
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
                
                <View style={styles.buttonsContainer}>
                  <TouchableOpacity
                    onPress={onPrevious}
                    disabled={previousButtonDisabled}
                    style={[
                      styles.skipButton,
                      previousButtonDisabled && styles.disabledControl
                    ]}
                    accessibilityLabel="Poprzednia bajka"
                    accessibilityRole="button"
                  >
                    <Feather name="skip-back" size={24} color={previousIconColor} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => onRewind(10)} style={styles.sideButton}>
                    <View style={styles.buttonGroup}>
                      <Feather name="rewind" size={24} color={COLORS.text.secondary} />
                      <Text style={styles.buttonText}>10s</Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={onPlayPause} style={styles.playButton}>
                    <Feather 
                      name={isPlaying ? 'pause' : 'play'} 
                      size={28} 
                      color={COLORS.white} 
                    />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => onForward(10)} style={styles.sideButton}>
                    <View style={styles.buttonGroup}>
                      <Text style={styles.buttonText}>10s</Text>
                      <Feather name="fast-forward" size={24} color={COLORS.text.secondary} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onNext}
                    disabled={nextButtonDisabled}
                    style={[
                      styles.skipButton,
                      nextButtonDisabled && styles.disabledControl
                    ]}
                    accessibilityLabel="Następna bajka"
                    accessibilityRole="button"
                  >
                    <Feather name="skip-forward" size={24} color={nextIconColor} />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </Animated.View>
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
    paddingTop: 0,
    paddingHorizontal: 16,
    zIndex: 100,
    overflow: 'hidden',
  },
  heightContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  pullIndicatorContainer: {
    height: 20,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pullIndicator: {
    width: 40,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 0,
    paddingBottom: 8,
    height: 140,
    position: 'absolute',
    left: 16,
    right: 16,
    top: 20,
  },
  minimizedControls: {
    flex: 1,
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
    justifyContent: 'space-between',
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
    marginHorizontal: 6,
  },
  sideButton: {
    padding: 12,
    minWidth: 80,
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 6,
  },
  skipButton: {
    padding: 10,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  disabledControl: {
    opacity: 0.35,
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
  queueMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  queueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueInfoText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.text.secondary,
    marginLeft: 6,
  },
  loopButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(218, 143, 255, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  loopButtonActive: {
    backgroundColor: COLORS.lavender,
    borderColor: COLORS.lavender,
  },
  loopButtonDisabled: {
    opacity: 0.5,
  },
  loopBadgeContainer: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: COLORS.white,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  loopBadgeText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 10,
    color: COLORS.lavender,
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
  
  // Expanded content styles
  expandedContent: {
    flex: 1,
    padding: 16,
  },
  storyHeader: {
    flexDirection: 'row',
    marginBottom: 20,
    marginTop: 10, // Added margin to make room for close button
  },
  coverContainer: {
    width: 120,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: COLORS.lavender + '30', // 30% opacity
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  storyInfo: {
    flex: 1,
  },
  storyTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 20,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  storyAuthor: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 8,
  },
  storyDescription: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },
  storyTextContainer: {
    flex: 1,
    marginBottom: 16,
  },
  storyTextScrollView: {
    flex: 1,
  },
  storyTextContent: {
    paddingBottom: 20,
  },
  storyText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    lineHeight: 32,
    color: COLORS.text.primary,
    textAlign: 'justify'
  },
  expandedPlayerControls: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  // New style for close button
  closeExpandedButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
  },
});
