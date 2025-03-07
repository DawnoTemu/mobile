import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';

export default function useAudioPlayer() {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState(null);
  
  // Reference to track position update interval
  const positionInterval = useRef(null);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      if (positionInterval.current) {
        clearInterval(positionInterval.current);
      }
    };
  }, [sound]);
  
  // Format time (seconds to MM:SS)
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // Load an audio file
  const loadAudio = async (uri) => {
    // try {
      setIsLoading(true);
      setError(null);
      
      // Unload any existing sound
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        // interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX, 
        // interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldDuckAndroid: true,
      });
      
      // Create and load the sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      setIsLoading(false);
      
      return true;
    // } catch (error) {
      console.error('Error loading audio:', error);
      setError('Failed to load audio file');
      setIsLoading(false);
      return false;
    // }
  };
  
  // Callback for playback status updates
  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis / 1000); // Convert to seconds
      setPosition(status.positionMillis / 1000);
      setIsPlaying(status.isPlaying);
      setIsBuffering(status.isBuffering);
      
      // If playback finished
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    } else if (status.error) {
      setError(`Error during playback: ${status.error}`);
    }
  };
  
  // Play/Pause toggle
  const togglePlayPause = async () => {
    if (!sound) return;
    
    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      setError('Failed to control playback');
    }
  };
  
  // Rewind (5 seconds by default)
  const rewind = async (seconds = 5) => {
    if (!sound) return;
    
    try {
      const newPosition = Math.max(0, position - seconds);
      await sound.setPositionAsync(newPosition * 1000);
    } catch (error) {
      console.error('Error rewinding:', error);
    }
  };
  
  // Forward (5 seconds by default)
  const forward = async (seconds = 5) => {
    if (!sound || !duration) return;
    
    try {
      const newPosition = Math.min(duration, position + seconds);
      await sound.setPositionAsync(newPosition * 1000);
    } catch (error) {
      console.error('Error fast-forwarding:', error);
    }
  };
  
  // Seek to a specific position
  const seekTo = async (seconds) => {
    if (!sound) return;
    
    try {
      await sound.setPositionAsync(seconds * 1000);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };
  
  // Unload the current sound
  const unloadAudio = async () => {
    if (!sound) return;
    
    try {
      await sound.unloadAsync();
      setSound(null);
      setDuration(0);
      setPosition(0);
      setIsPlaying(false);
    } catch (error) {
      console.error('Error unloading audio:', error);
    }
  };
  
  return {
    sound,
    isPlaying,
    duration,
    position,
    isLoading,
    isBuffering,
    error,
    formatTime,
    loadAudio,
    togglePlayPause,
    rewind,
    forward,
    seekTo,
    unloadAudio,
  };
}