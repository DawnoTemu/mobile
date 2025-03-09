import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Permissions from 'expo-permissions';
import { Platform } from 'react-native';

export default function useAudioRecorder() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(30); // Start at 30 seconds
  const [audioUri, setAudioUri] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  
  // Add ref for auto-stop timer
  const recordingTimerRef = useRef(null);
  
  // Add ref to store the auto-stop callback
  const autoStopCallbackRef = useRef(null);
  
  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionStatus(status);
    })();
    
    // Clean up recording if component unmounts
    return () => {
      stopRecording();
      // Also clear the timer on unmount
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);
  
  // Update duration every second while recording and handle auto-stop
  useEffect(() => {
    let interval = null;
    
    if (isRecording) {
      // Reset to 30 when recording starts
      setRecordingDuration(30);
      setProgress(0);
      
      interval = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev - 1; // Count down instead of up
          
          // Auto-stop recording at 0 seconds
          if (newDuration <= 0) {
            // We need to use setTimeout to avoid calling stopRecording inside setState
            // This prevents state update during another state update
            if (!recordingTimerRef.current) {
              recordingTimerRef.current = setTimeout(async () => {
                const uri = await stopRecording();
                
                // Call the auto-stop callback if provided
                if (autoStopCallbackRef.current && uri) {
                  autoStopCallbackRef.current(uri);
                }
                
                recordingTimerRef.current = null;
              }, 100);
            }
            return 0; // Don't go below 0
          }
          
          // Update progress based on remaining time (30 seconds to 0)
          setProgress(((30 - newDuration) / 30) * 100);
          return newDuration;
        });
      }, 1000);
    } else {
      // Reset to 30 when not recording
      setRecordingDuration(30);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      // Clear the auto-stop timer on cleanup
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecording]);
  
  // Start recording function with auto-stop callback
  const startRecording = async (autoStopCallback = null) => {
    try {
      // Store the callback for later use
      autoStopCallbackRef.current = autoStopCallback;
      
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
        setRecordingDuration(30); // Initialize to 30 seconds
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
        
        // RESET AUDIO MODE FOR PLAYBACK - ADD THIS
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: true, // Set back to true for normal speaker output
        });
        
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