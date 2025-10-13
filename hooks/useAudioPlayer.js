import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAudioPlayer as useExpoAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from 'expo-audio';

export default function useAudioPlayer() {
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAutoplay, setPendingAutoplay] = useState(false);
  const [currentUri, setCurrentUri] = useState(null);

  const pendingCorruptionHandler = useRef(null);
  const pendingUriRef = useRef(null);

  const player = useExpoAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: false });
  const status = useAudioPlayerStatus(player);

  const formatTime = useCallback((seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);

  const resetPendingFailure = () => {
    pendingCorruptionHandler.current = null;
    pendingUriRef.current = null;
  };

  useEffect(() => {
    if (!currentUri) {
      setIsLoading(false);
      resetPendingFailure();
      return;
    }

    if (isLoading && status?.isLoaded) {
      setIsLoading(false);

      if (pendingAutoplay) {
        try {
          player.play();
        } catch (playError) {
          console.error('Error auto-playing audio:', playError);
          setError('Nie udało się odtworzyć pliku audio.');
        } finally {
          setPendingAutoplay(false);
        }
      }

      resetPendingFailure();
    }
  }, [status?.isLoaded, currentUri, isLoading, pendingAutoplay, player]);

  useEffect(() => {
    if (!status) {
      return;
    }

    if (
      pendingCorruptionHandler.current &&
      (status.playbackState?.toLowerCase?.().includes('failed') ||
        status.reasonForWaitingToPlay?.toLowerCase?.().includes('failed') ||
        status.reasonForWaitingToPlay?.toLowerCase?.().includes('error'))
    ) {
      const handler = pendingCorruptionHandler.current;
      const uri = pendingUriRef.current;

      handler?.(uri);
      resetPendingFailure();
      setError('Wykryto uszkodzony plik audio.');
      setIsLoading(false);
      setPendingAutoplay(false);
    }
  }, [status]);

  const loadAudio = useCallback(
    async (uri, autoPlay = true, onCorruptedFile = null) => {
      if (!uri) {
        setError('Nieprawidłowy adres pliku audio.');
        return false;
      }

      setError(null);
      setIsLoading(true);
      setPendingAutoplay(autoPlay);
      setCurrentUri(uri);

      pendingCorruptionHandler.current = onCorruptedFile;
      pendingUriRef.current = uri;

      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers',
          interruptionModeAndroid: 'duckOthers',
          allowsRecording: false,
          shouldRouteThroughEarpiece: false,
        });

        player.pause();
        player.seekTo(0).catch(() => {});
        await player.replace({ uri });

        if (!autoPlay) {
          setPendingAutoplay(false);
        }

        return true;
      } catch (loadError) {
        console.error('Error loading audio:', loadError);
        setError('Nie udało się załadować pliku audio.');
        setIsLoading(false);
        setPendingAutoplay(false);

        const message = loadError?.message ?? '';
        const isCorruptionError =
          typeof message === 'string' &&
          (message.includes('damaged') ||
            message.includes('AVFoundationErrorDomain') ||
            message.includes('-11849'));

        if (isCorruptionError && onCorruptedFile) {
          onCorruptedFile(uri);
        }

        return false;
      }
    },
    [player]
  );

  const togglePlayPause = useCallback(() => {
    if (!status?.isLoaded) {
      return;
    }

    try {
      if (status.playing) {
        player.pause();
      } else {
        if (status.duration && status.currentTime >= status.duration) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch (toggleError) {
      console.error('Error toggling playback:', toggleError);
      setError('Nie udało się odtworzyć audio.');
    }
  }, [player, status]);

  const rewind = useCallback(
    async (seconds = 5) => {
      if (!status?.isLoaded) {
        return;
      }

      try {
        const newPosition = Math.max(0, (status.currentTime ?? 0) - seconds);
        await player.seekTo(newPosition);
      } catch (rewindError) {
        console.error('Error rewinding audio:', rewindError);
      }
    },
    [player, status?.currentTime, status?.isLoaded]
  );

  const forward = useCallback(
    async (seconds = 5) => {
      if (!status?.isLoaded || !status?.duration) {
        return;
      }

      try {
        const newPosition = Math.min(status.duration, (status.currentTime ?? 0) + seconds);
        await player.seekTo(newPosition);
      } catch (forwardError) {
        console.error('Error forwarding audio:', forwardError);
      }
    },
    [player, status?.currentTime, status?.duration, status?.isLoaded]
  );

  const seekTo = useCallback(
    async (seconds) => {
      if (!status?.isLoaded) {
        return;
      }

      try {
        await player.seekTo(seconds);
      } catch (seekError) {
        console.error('Error seeking audio:', seekError);
      }
    },
    [player, status?.isLoaded]
  );

  const unloadAudio = useCallback(async () => {
    try {
      await player.stop?.();
    } catch (stopError) {
      console.warn('Failed to stop audio during unload', stopError);
    }

    try {
      await player.unloadAsync?.();
    } catch (unloadError) {
      console.warn('Failed to unload audio source', unloadError);
    }

    setCurrentUri(null);
    setPendingAutoplay(false);
    setIsLoading(false);
    setError(null);
    resetPendingFailure();
  }, [player]);

  const derivedState = useMemo(
    () => ({
      isPlaying: status?.playing ?? false,
      duration: status?.duration ?? 0,
      position: status?.currentTime ?? 0,
      isBuffering: status?.isBuffering ?? false,
    }),
    [status?.playing, status?.duration, status?.currentTime, status?.isBuffering]
  );

  return {
    sound: player,
    isPlaying: derivedState.isPlaying,
    duration: derivedState.duration,
    position: derivedState.position,
    isLoading,
    isBuffering: derivedState.isBuffering,
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
