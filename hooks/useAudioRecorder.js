import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import {
  useAudioRecorder as useExpoAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

const MAX_DURATION_SECONDS = 60;

export default function useAudioRecorder() {
  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [permissionStatus, setPermissionStatus] = useState(null);
  const [audioUri, setAudioUri] = useState(null);
  const [progress, setProgress] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(MAX_DURATION_SECONDS);

  const recordingTimerRef = useRef(null);
  const autoStopCallbackRef = useRef(null);

  const isRecording = recorderState?.isRecording ?? false;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await getRecordingPermissionsAsync();
        if (mounted) {
          setPermissionStatus(status);
        }
      } catch (error) {
        console.warn('Unable to retrieve microphone permissions', error);
      }
    })();

    return () => {
      mounted = false;
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  const ensurePermissionsAsync = useCallback(async () => {
    if (permissionStatus === 'granted') {
      return true;
    }

    const { status } = await requestRecordingPermissionsAsync();
    setPermissionStatus(status);
    return status === 'granted';
  }, [permissionStatus]);

  const configureRecordingSessionAsync = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  const configurePlaybackSessionAsync = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
      shouldRouteThroughEarpiece: true,
    });
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recorderState?.canRecord && !recorderState?.isRecording) {
      return null;
    }

    try {
      await recorder.stop();
    } catch (error) {
      console.error('Error stopping recording:', error);
    }

    try {
      await configurePlaybackSessionAsync();
    } catch (error) {
      console.warn('Unable to reset audio session after recording', error);
    }

    const uri = recorder.uri;

    if (uri) {
      setAudioUri(uri);
    }

    setProgress(100);
    setRemainingSeconds(MAX_DURATION_SECONDS);
    return uri ?? null;
  }, [configurePlaybackSessionAsync, recorder, recorderState?.canRecord, recorderState?.isRecording]);

  const startRecording = useCallback(
    async (autoStopCallback = null) => {
      try {
        autoStopCallbackRef.current = autoStopCallback;

        const granted = await ensurePermissionsAsync();
        if (!granted) {
          throw new Error('Permission to access microphone was denied');
        }

        await configureRecordingSessionAsync();

        if (recorderState?.isRecording) {
          await recorder.stop();
        }

        setAudioUri(null);
        setProgress(0);
        setRemainingSeconds(MAX_DURATION_SECONDS);

        await recorder.prepareToRecordAsync();
        recorder.record();

        return true;
      } catch (error) {
        console.error('Failed to start recording:', error);
        return false;
      }
    },
    [configureRecordingSessionAsync, ensurePermissionsAsync, recorder, recorderState?.isRecording]
  );

  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  useEffect(() => {
    let intervalId = null;

    if (isRecording) {
      setRemainingSeconds(MAX_DURATION_SECONDS);
      setProgress(0);

      intervalId = setInterval(() => {
        setRemainingSeconds((prev) => {
          const next = prev - 1;

          if (next <= 0) {
            if (!recordingTimerRef.current) {
              recordingTimerRef.current = setTimeout(async () => {
                const uri = await stopRecordingRef.current();
                if (autoStopCallbackRef.current && uri) {
                  autoStopCallbackRef.current(uri);
                }
                autoStopCallbackRef.current = null;
                recordingTimerRef.current = null;
              }, 100);
            }
            setProgress(100);
            return 0;
          }

          setProgress(((MAX_DURATION_SECONDS - next) / MAX_DURATION_SECONDS) * 100);
          return next;
        });
      }, 1000);
    } else {
      setRemainingSeconds(MAX_DURATION_SECONDS);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecording]);

  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);

  const handleAudioFileUpload = useCallback(async (fileUri) => {
    try {
      if (fileUri && Platform.OS === 'ios') {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (!info.exists) {
          console.warn('Uploaded audio file does not exist at path:', fileUri);
          return null;
        }
      }

      setAudioUri(fileUri);
      return fileUri;
    } catch (error) {
      console.error('Failed to handle audio file upload:', error);
      return null;
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingDuration: remainingSeconds,
    formatDuration,
    audioUri,
    permissionStatus,
    progress,
    handleAudioFileUpload,
  };
}
