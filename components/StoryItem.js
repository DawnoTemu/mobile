import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  statusMessage = '',
  onPress,
}) {
  const normalizedUnitLabel = deriveUnitLabel(creditUnitLabel);
  const hasNumericCredits =
    !isReady &&
    typeof requiredCredits === 'number' &&
    !Number.isNaN(requiredCredits);
  const badgeLabel = isReady
    ? 'Gotowa bajka'
    : hasNumericCredits
      ? `${requiredCredits} ${normalizedUnitLabel}`
      : 'Brak danych';
  const badgeIcon = isReady
    ? 'check-circle'
    : hasNumericCredits
      ? 'star'
      : 'help-circle';
  const isInsufficient = !isReady && hasNumericCredits && !isAffordable;
  const renderStatusIcon = () => {
    if (isGenerating) {
      return <ActivityIndicator size="small" color={COLORS.peach} />;
    }

    if (isCreditLoading) {
      return <ActivityIndicator size="small" color={COLORS.lavender} />;
    }

    if (!isAffordable && typeof requiredCredits === 'number') {
      return <Feather name="lock" size={20} color={COLORS.error} />;
    }

    if (isSelected) {
      return <Feather name="check-circle" size={20} color={COLORS.peach} />;
    }

    return <Feather name="play-circle" size={20} color={COLORS.text.tertiary} />;
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && styles.selected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Left Side - Image */}
      <Image
        source={
          imageSource
            ? { uri: imageSource }
            : require('../assets/images/cover.png')
        }
        style={styles.image}
        resizeMode="cover"
        // Add error handling to fallback to default image if the URL fails to load
        onError={(e) => console.log('Image loading error:', e.nativeEvent.error)}
      />
      
      {/* Middle - Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {author}
        </Text>
        
        {/* Duration */}
        {duration && (
          <View style={styles.durationContainer}>
            <Feather name="clock" size={12} color={COLORS.text.tertiary} />
            <Text style={styles.duration}>{duration}</Text>
          </View>
        )}

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

        {isInsufficient && (
          <Text style={styles.creditWarning}>
            Za mało Story Points
          </Text>
        )}
        {statusMessage ? (
          <Text style={styles.generationStatus} numberOfLines={2}>
            {statusMessage}
          </Text>
        ) : null}
      </View>
      
      {/* Right Side - Status */}
      <View style={styles.status}>
        {renderStatusIcon()}
      </View>
    </TouchableOpacity>
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
  },
  selected: {
    borderColor: COLORS.peach,
    backgroundColor: `${COLORS.peach}15`, // 15% opacity
    transform: [{ translateY: -3 }],
    shadowColor: COLORS.peach,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    zIndex: 10,
  },
  image: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: COLORS.gradients.lavenderToPeach + '30', // 30% opacity
  },
  content: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
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
    lineHeight: 18,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  duration: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.text.tertiary,
    marginLeft: 4,
  },
  creditsRow: {
    marginTop: 6,
    minHeight: 18,
    justifyContent: 'center'
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${COLORS.lavender}15`,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  creditBadgeReady: {
    backgroundColor: COLORS.mint,
  },
  creditBadgeInsufficient: {
    backgroundColor: `${COLORS.error}15`,
  },
  creditBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.white,
    marginLeft: 4,
  },
  creditBadgeReadyText: {
    color: COLORS.white,
  },
  creditBadgeTextInsufficient: {
    color: COLORS.white,
  },
  creditBadgePlaceholder: {
    backgroundColor: `${COLORS.text.secondary}10`,
    borderWidth: 1,
    borderColor: `${COLORS.text.secondary}20`
  },
  creditBadgePlaceholderText: {
    color: COLORS.text.secondary
  },
  creditWarning: {
    marginTop: 6,
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.error,
  },
  generationStatus: {
    marginTop: 8,
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18
  },
  status: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
});
