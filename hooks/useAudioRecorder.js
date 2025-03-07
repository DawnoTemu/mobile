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
        console.log('Requesting microphone permission...');
        const { status } = await Audio.requestPermissionsAsync();
        setPermissionStatus(status);
        if (status !== 'granted') {
          throw new Error('Permission to access microphone was denied');
        }
      }
      
      // Configure audio session
      console.log('Configuring audio session...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Create and prepare recording
      console.log('Preparing to record...');
      const newRecording = new Audio.Recording();
      
      try {
        await newRecording.prepareToRecordAsync({
          android: {
            extension: '.wav',
            outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT,
            audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          ios: {
            extension: '.wav',
            audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
        });
        
        // Start recording
        console.log('Starting recording...');
        await newRecording.startAsync();
        setRecording(newRecording);
        setIsRecording(true);
        setRecordingDuration(0);
        setProgress(0);
        
        return true;
      } catch (prepareError) {
        console.error('Error preparing recording:', prepareError);
        throw prepareError;
      }
    } catch (error) {
      console.error('Failed to start recording', error);
      return false;
    }
  };
  
  // Stop recording function
  const stopRecording = async () => {
    try {
      if (!recording) {
        console.log('No active recording to stop');
        return null;
      }
      
      console.log('Stopping recording...');
      
      try {
        // Stop recording
        await recording.stopAndUnloadAsync();
        
        // Get the recording URI
        const uri = recording.getURI();
        console.log('Recording saved at:', uri);
        setAudioUri(uri);
        
        // Reset recording state
        setIsRecording(false);
        setRecording(null);
        
        return uri;
      } catch (stopError) {
        console.error('Error stopping recording:', stopError);
        
        // Reset recording state even if there's an error
        setIsRecording(false);
        setRecording(null);
        
        return null;
      }
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