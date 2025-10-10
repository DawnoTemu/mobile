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
  creditUnitLabel = 'Story Points',
  onPress,
}) {
  const normalizedUnitLabel = creditUnitLabel?.split(' (')[0] || creditUnitLabel;
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
          ) : typeof requiredCredits === 'number' ? (
            <View
              style={[
                styles.creditBadge,
                !isAffordable && styles.creditBadgeInsufficient
              ]}
            >
              <Feather
                name="star"
                size={12}
                color={isAffordable ? COLORS.lavender : COLORS.error}
              />
              <Text
                style={[
                  styles.creditBadgeText,
                  !isAffordable && styles.creditBadgeTextInsufficient
                ]}
                numberOfLines={1}
              >
                {requiredCredits} {normalizedUnitLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {!isAffordable && typeof requiredCredits === 'number' && (
          <Text style={styles.creditWarning}>
            Za mało Story Points
          </Text>
        )}
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
  creditBadgeInsufficient: {
    backgroundColor: `${COLORS.error}15`,
  },
  creditBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.lavender,
    marginLeft: 4,
  },
  creditBadgeTextInsufficient: {
    color: COLORS.error,
  },
  creditWarning: {
    marginTop: 6,
    fontFamily: 'Quicksand-Regular',
    fontSize: 12,
    color: COLORS.error,
  },
  status: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
});
