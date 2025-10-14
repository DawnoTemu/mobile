import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { COLORS } from '../styles/colors';

const deriveUnitLabel = (label) => {
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
};

export default function StoryItem({
  title,
  author,
  duration,
  imageSource,
  isSelected,
  isGenerating,
  requiredCredits,
  isAffordable = true,
  isCreditLoading = false,
  creditUnitLabel = 'Punkty Magii',
  isReady = false,
  onPress,
  onAddToQueue,
  onPlayNext,
  queuePosition = null,
  isActiveQueueItem = false,
  disabled = false
}) {
  const swipeableRef = useRef(null);
  const normalizedUnitLabel = deriveUnitLabel(creditUnitLabel);
  const hasNumericCredits =
    !isReady &&
    typeof requiredCredits === 'number' &&
    !Number.isNaN(requiredCredits);
  const formattedCredits = hasNumericCredits
    ? `${requiredCredits} ${normalizedUnitLabel}`
    : null;
  const isInsufficient = !isReady && hasNumericCredits && !isAffordable;
  const badgeLabel = isReady
    ? 'Gotowa bajka'
    : hasNumericCredits
      ? isInsufficient
        ? `Brak środków • ${formattedCredits}`
        : formattedCredits
      : 'Brak danych';
  const badgeIcon = isReady
    ? 'check-circle'
    : hasNumericCredits
      ? 'star'
      : 'help-circle';
  const isQueued = queuePosition !== null && queuePosition !== undefined;

  const queueBadgeLabel = useMemo(() => {
    if (isActiveQueueItem) {
      return 'Teraz odtwarzana';
    }
    if (isQueued) {
      const safePosition =
        typeof queuePosition === 'number' && Number.isFinite(queuePosition)
          ? queuePosition
          : null;
      return safePosition ? `W kolejce • #${safePosition}` : 'W kolejce';
    }
    return null;
  }, [isActiveQueueItem, isQueued, queuePosition]);

  const closeSwipeable = () => {
    if (swipeableRef.current && typeof swipeableRef.current.close === 'function') {
      swipeableRef.current.close();
    }
  };

  const handleAddToQueue = () => {
    closeSwipeable();
    onAddToQueue?.();
  };

  const handlePlayNext = () => {
    closeSwipeable();
    onPlayNext?.();
  };

  const renderStatusIcon = () => {
    if (isGenerating) {
      return <ActivityIndicator size="small" color={COLORS.peach} />;
    }

    if (isCreditLoading) {
      return <ActivityIndicator size="small" color={COLORS.lavender} />;
    }

    if (!isReady && !isAffordable && typeof requiredCredits === 'number') {
      return <Feather name="lock" size={20} color={COLORS.error} />;
    }

    if (isSelected) {
      return <Feather name="check-circle" size={20} color={COLORS.peach} />;
    }

    return <Feather name="play-circle" size={20} color={COLORS.text.tertiary} />;
  };

  const renderQueueBadge = () => {
    if (!queueBadgeLabel) {
      return null;
    }

    return (
      <View
        style={[
          styles.queueBadge,
          isActiveQueueItem ? styles.queueBadgeActive : styles.queueBadgeQueued
        ]}
      >
        <Feather
          name={isActiveQueueItem ? 'volume-2' : 'list'}
          size={12}
          color={isActiveQueueItem ? COLORS.white : COLORS.lavender}
        />
        <Text
          style={[
            styles.queueBadgeText,
            isActiveQueueItem ? styles.queueBadgeTextActive : styles.queueBadgeTextQueued
          ]}
          numberOfLines={1}
        >
          {queueBadgeLabel}
        </Text>
      </View>
    );
  };

  const renderActions = () => {
    if (!onAddToQueue && !onPlayNext) {
      return null;
    }

    return (
      <View style={styles.swipeActionsContainer}>
        {onPlayNext ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.playNextAction]}
            onPress={handlePlayNext}
            activeOpacity={0.8}
          >
            <Feather name="corner-right-up" size={18} color={COLORS.white} />
            <Text style={styles.swipeActionText}>Odtwórz jako następna</Text>
          </TouchableOpacity>
        ) : null}
        {onAddToQueue ? (
          <TouchableOpacity
            style={[styles.swipeAction, styles.addToQueueAction]}
            onPress={handleAddToQueue}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={18} color={COLORS.white} />
            <Text style={styles.swipeActionText}>Dodaj do kolejki</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const card = (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && styles.selected,
        isQueued && styles.queued,
        isActiveQueueItem && styles.activeQueue
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {renderQueueBadge()}
      <Image
        source={
          imageSource
            ? { uri: imageSource }
            : require('../assets/images/cover.png')
        }
        style={styles.image}
        resizeMode="cover"
        onError={(e) => console.log('Image loading error:', e.nativeEvent.error)}
      />

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {author}
        </Text>

        {duration ? (
          <View style={styles.durationContainer}>
            <Feather name="clock" size={12} color={COLORS.text.tertiary} />
            <Text style={styles.duration}>{duration}</Text>
          </View>
        ) : null}

        <View style={styles.creditsRow}>
          {isCreditLoading ? (
            <ActivityIndicator size="small" color={COLORS.lavender} />
          ) : (
            <View
              style={[
                styles.creditBadge,
                isReady && styles.creditBadgeReady,
                isInsufficient && styles.creditBadgeInsufficient,
                !hasNumericCredits && !isReady && styles.creditBadgePlaceholder
              ]}
            >
              <Feather
                name={badgeIcon}
                size={12}
                color={
                  isReady
                    ? COLORS.white
                    : hasNumericCredits
                      ? isInsufficient
                        ? COLORS.error
                        : COLORS.white
                      : COLORS.text.secondary
                }
              />
              <Text
                style={[
                  styles.creditBadgeText,
                  isReady && styles.creditBadgeReadyText,
                  isInsufficient && styles.creditBadgeTextInsufficient,
                  !hasNumericCredits && !isReady && styles.creditBadgePlaceholderText
                ]}
                numberOfLines={1}
              >
                {badgeLabel}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.status}>{renderStatusIcon()}</View>
    </TouchableOpacity>
  );

  if (!onAddToQueue && !onPlayNext) {
    return card;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderRightActions={renderActions}
      containerStyle={styles.swipeableContainer}
    >
      {card}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  selected: {
    borderColor: COLORS.peach,
  },
  queued: {
    borderColor: 'rgba(218, 143, 255, 0.35)',
  },
  activeQueue: {
    borderColor: COLORS.peach,
    backgroundColor: 'rgba(251, 190, 159, 0.08)',
  },
  swipeableContainer: {
    marginVertical: 0,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  author: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 6,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  duration: {
    marginLeft: 4,
    fontSize: 12,
    color: COLORS.text.tertiary,
    fontFamily: 'Quicksand-Regular',
  },
  creditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(85, 95, 255, 0.08)',
  },
  creditBadgeReady: {
    backgroundColor: COLORS.peach,
  },
  creditBadgeInsufficient: {
    backgroundColor: 'rgba(255, 181, 167, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  creditBadgePlaceholder: {
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
  },
  creditBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    fontFamily: 'Quicksand-Medium',
    color: COLORS.text.secondary,
  },
  creditBadgeReadyText: {
    color: COLORS.white,
  },
  creditBadgeTextInsufficient: {
    color: COLORS.error,
  },
  creditBadgePlaceholderText: {
    color: COLORS.text.tertiary,
  },
  status: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  queueBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(218, 143, 255, 0.12)',
  },
  queueBadgeQueued: {
    backgroundColor: 'rgba(218, 143, 255, 0.12)',
  },
  queueBadgeActive: {
    backgroundColor: COLORS.peach,
  },
  queueBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 11,
    marginLeft: 4,
  },
  queueBadgeTextQueued: {
    color: COLORS.lavender,
  },
  queueBadgeTextActive: {
    color: COLORS.white,
  },
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  swipeAction: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 150,
  },
  playNextAction: {
    backgroundColor: COLORS.lavender,
    marginRight: 8,
  },
  addToQueueAction: {
    backgroundColor: COLORS.peach,
  },
  swipeActionText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.white,
    marginLeft: 6,
  },
});
