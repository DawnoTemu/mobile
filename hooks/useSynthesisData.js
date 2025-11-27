import { useCallback } from 'react';
import voiceService from '../services/voiceService';
import { createLogger } from '../utils/logger';

const log = createLogger('SynthesisData');

const useSynthesisData = ({
  navigation,
  showToast,
  refreshCredits,
  isOnline,
  hydrateGenerationState,
  setVoiceId,
  setGenerationStatusByStory,
  setProcessingStories,
  setStories,
  setIsLoading
}) => {
  const handleApiError = useCallback((result, defaultMessage) => {
    if (result.code === 'AUTH_ERROR') {
      showToast('Sesja wygasła. Zaloguj się ponownie.', 'ERROR');
      navigation.replace('Login');
      return;
    }

    if (result.code === 'PAYMENT_REQUIRED') {
      showToast('Brak wystarczających Punktów Magii. Odwiedź ekran kredytów.', 'ERROR');
      if (refreshCredits) {
        refreshCredits({ force: true }).catch(() => {});
      }
      return;
    }

    if (!isOnline && result.code === 'OFFLINE') {
      return;
    }

    let message = defaultMessage;

    if (result.code === 'TIMEOUT') {
      message = 'Upłynął limit czasu operacji. Spróbuj ponownie.';
    } else if (result.code === 'STORAGE_ERROR') {
      message = 'Problem z pamięcią urządzenia. Spróbuj ponownie.';
    } else if (result.code === 'GENERATION_TIMEOUT') {
      message = 'Generowanie bajki trwało zbyt długo. Spróbuj ponownie.';
    } else if (result.code === 'DOWNLOAD_ERROR') {
      message = 'Błąd podczas pobierania pliku audio. Spróbuj ponownie.';
    } else if (result.error) {
      message = `${defaultMessage} ${result.error}`;
    }

    showToast(message, 'ERROR');
  }, [isOnline, navigation, refreshCredits, showToast]);

  const fetchStoriesAndVoiceId = useCallback(async (silent = false, forceRefresh = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }

      const voiceResult = await voiceService.getCurrentVoice();
      if (!voiceResult.success || !voiceResult.voiceId) {
        navigation.replace('Clone');
        return;
      }

      const currentVoiceId = voiceResult.voiceId;
      setVoiceId(currentVoiceId);
      setGenerationStatusByStory({});
      setProcessingStories({});

      const storiesResult = await voiceService.getStories(forceRefresh);

      if (storiesResult.success) {
        let storiesData = storiesResult.stories;

        let storiesWithStatus = await Promise.all(
          storiesData.map(async (story) => {
            const audioExists = await voiceService.checkAudioExists(
              currentVoiceId,
              story.id,
              {
                verifyRemote: true,
                cleanupOrphaned: true
              }
            );

            const hasAudio =
              audioExists.success &&
              (audioExists.localExists || audioExists.remoteExists === true);

            return {
              ...story,
              hasAudio,
              localUri: audioExists.localUri || null,
              cover_url: voiceService.getStoryCoverUrl(story.id),
            };
          })
        );

        storiesWithStatus = await voiceService.markStoriesWithLocalAudio(
          currentVoiceId,
          storiesWithStatus
        );

        setStories(storiesWithStatus);
        await hydrateGenerationState(currentVoiceId);
      } else {
        handleApiError(storiesResult, 'Nie udało się pobrać bajek.');
      }
    } catch (error) {
      log.error('Error fetching stories and voice ID', error);
      if (!silent) {
        showToast('Wystąpił problem podczas ładowania danych.', 'ERROR');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [
    handleApiError,
    hydrateGenerationState,
    navigation,
    setGenerationStatusByStory,
    setIsLoading,
    setProcessingStories,
    setStories,
    setVoiceId,
    showToast
  ]);

  return {
    fetchStoriesAndVoiceId,
    handleApiError
  };
};

export default useSynthesisData;
