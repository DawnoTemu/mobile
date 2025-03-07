import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Permissions from 'expo-permissions';
import { Platform } from 'react-native';

export default function useAudioRecorder() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUri, setAudioUri] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  
  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionStatus(status);
    })();
    
    // Clean up recording if component unmounts
    return () => {
      stopRecording();
    };
  }, []);
  
  // Update duration every second while recording
  useEffect(() => {
    let interval = null;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          // Update progress based on a 60-second maximum recording time
          setProgress(Math.min(newDuration / 60, 1) * 100);
          return newDuration;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);
  
  // Start recording function
  const startRecording = async () => {
    try {
      // Check permissions
      if (permissionStatus !== 'granted') {
        const { status } = await Audio.requestPermissionsAsync();
        setPermissionStatus(status);
        if (status !== 'granted') {
          throw new Error('Permission to access microphone was denied');
        }
      }
      
      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        // interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        staysActiveInBackground: false,
        // interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Create and prepare recording
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      
      // Start recording
      await newRecording.startAsync();
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      setProgress(0);
      
      return true;
    } catch (error) {
      console.error('Failed to start recording', error);
      return false;
    }
  };
  
  // Stop recording function
  const stopRecording = async () => {
    try {
      if (!recording) return;
      
      // Stop recording
      await recording.stopAndUnloadAsync();
      
      // Get the recording URI
      const uri = recording.getURI();
      setAudioUri(uri);
      
      // Reset recording state
      setIsRecording(false);
      setRecording(null);
      
      return uri;
    } catch (error) {
      console.error('Failed to stop recording', error);
      
      // Reset recording state even if there's an error
      setIsRecording(false);
      setRecording(null);
      
      return null;
    }
  };
  
  // Format duration for display (mm:ss)
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // Handle file uploads
  const handleAudioFileUpload = async (fileUri) => {
    try {
      setAudioUri(fileUri);
      return fileUri;
    } catch (error) {
      console.error('Failed to handle audio file', error);
      return null;
    }
  };
  
  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingDuration,
    formatDuration,
    audioUri,
    permissionStatus,
    progress,
    handleAudioFileUpload,
  };
}