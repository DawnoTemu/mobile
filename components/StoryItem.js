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
  onPress,
}) {
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
      </View>
      
      {/* Right Side - Status */}
      <View style={styles.status}>
        {isGenerating ? (
          <ActivityIndicator size="small" color={COLORS.peach} />
        ) : isSelected ? (
          <Feather name="check-circle" size={20} color={COLORS.peach} />
        ) : (
          <Feather name="play-circle" size={20} color={COLORS.text.tertiary} />
        )}
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
    backgroundColor: COLORS.lavender + '30', // 30% opacity
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
  status: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
});