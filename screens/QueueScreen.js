import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePlaybackQueue, usePlaybackQueueDispatch, LOOP_MODES } from '../context/PlaybackQueueProvider';
import { COLORS } from '../styles/colors';
import { useToast } from '../components/StatusToast';
import voiceService from '../services/voiceService';

const LOOP_MODE_SEQUENCE = [LOOP_MODES.NONE, LOOP_MODES.REPEAT_ALL, LOOP_MODES.REPEAT_ONE];
const LOOP_MODE_LABELS = {
  [LOOP_MODES.NONE]: 'Nie powtarzaj',
  [LOOP_MODES.REPEAT_ALL]: 'Powtarzaj kolejkę',
  [LOOP_MODES.REPEAT_ONE]: 'Powtarzaj bajkę'
};

const renderQueuePosition = (index) => `#${index + 1}`;

export default function QueueScreen() {
  const navigation = useNavigation();
  const { showToast } = useToast();
  const { queue, loopMode, activeIndex: activeQueueIndex } = usePlaybackQueue();
  const {
    removeFromQueue,
    clearQueue,
    enqueue,
    setLoopMode,
    setActiveItem
  } = usePlaybackQueueDispatch();

  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  const queueItems = useMemo(() => {
    if (!Array.isArray(queue)) {
      return [];
    }

    return queue.map((entry, index) => {
      const storyId = entry?.storyId ?? entry?.id ?? `item-${index}`;
      return {
        id: `${storyId}-${index}`,
        storyId,
        title: entry?.title ?? 'Nieznana bajka',
        author: entry?.author ?? 'Anonim',
        duration: entry?.duration ?? null,
        coverUrl: entry?.coverUrl ?? entry?.cover_url ?? null,
        index,
        isActive: index === activeQueueIndex
      };
    });
  }, [queue, activeQueueIndex]);

  const resolveQueueStoryId = useCallback((entry) => {
    if (entry == null) {
      return null;
    }

    if (typeof entry === 'string' || typeof entry === 'number') {
      return String(entry);
    }

    if (typeof entry === 'object') {
      if (entry.storyId != null) {
        return String(entry.storyId);
      }
      if (entry.id != null) {
        return String(entry.id);
      }
    }

    return null;
  }, []);

  const existingStoryIds = useMemo(() => {
    const ids = new Set();
    (queue || []).forEach((entry) => {
      const id = resolveQueueStoryId(entry);
      if (id) {
        ids.add(id);
      }
    });
    return ids;
  }, [queue, resolveQueueStoryId]);

  const applyQueueMutation = useCallback(
    (nextQueue, nextActiveIndex = null) => {
      clearQueue();
      enqueue(nextQueue);
      if (typeof nextActiveIndex === 'number' && nextActiveIndex >= 0) {
        setActiveItem({ index: nextActiveIndex });
      }
    },
    [clearQueue, enqueue, setActiveItem]
  );

  const handleClearQueue = () => {
    if (!queueItems.length || pendingConfirmation) {
      showToast('Kolejka jest już pusta.', 'INFO');
      return;
    }

    setPendingConfirmation(true);
    Alert.alert(
      'Wyczyścić kolejkę?',
      'Usuniemy wszystkie bajki z kolejki. Czy na pewno chcesz kontynuować?',
      [
        {
          text: 'Anuluj',
          style: 'cancel',
          onPress: () => setPendingConfirmation(false)
        },
        {
          text: 'Wyczyść',
          style: 'destructive',
          onPress: () => {
            clearQueue();
            setPendingConfirmation(false);
            showToast('Kolejka wyczyszczona.', 'SUCCESS');
          }
        }
      ]
    );
  };

  const handleRemove = (index) => {
    removeFromQueue({ index });
    showToast('Usunięto bajkę z kolejki.', 'INFO');
  };

  const handleMove = (fromIndex, toIndex) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      !Array.isArray(queue) ||
      fromIndex >= queue.length ||
      toIndex >= queue.length
    ) {
      return;
    }

    const nextQueue = [...queue];
    const [movedItem] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, movedItem);
    applyQueueMutation(nextQueue, toIndex);
    showToast('Zmieniono kolejność w kolejce.', 'SUCCESS');
  };

  const handleMoveUp = (index) => handleMove(index, index - 1);
  const handleMoveDown = (index) => handleMove(index, index + 1);

  const handleCycleLoopMode = () => {
    const currentIndex = LOOP_MODE_SEQUENCE.indexOf(loopMode);
    const nextMode = LOOP_MODE_SEQUENCE[(currentIndex + 1) % LOOP_MODE_SEQUENCE.length];
    setLoopMode(nextMode);
    showToast(LOOP_MODE_LABELS[nextMode], 'INFO');
  };

  const handleAutoFill = async () => {
    if (autoFillLoading) {
      return;
    }

    setAutoFillLoading(true);
    try {
      const [voiceResult, storiesResult] = await Promise.all([
        voiceService.getCurrentVoice(),
        voiceService.getStories(false)
      ]);

      if (!voiceResult.success || !voiceResult.voiceId) {
        showToast('Brak aktywnego głosu. Przejdź do ekranu głównego, aby go wybrać.', 'ERROR');
        return;
      }

      if (!storiesResult.success || !Array.isArray(storiesResult.stories)) {
        showToast('Nie udało się pobrać bajek do kolejki.', 'ERROR');
        return;
      }

      const playableStories = storiesResult.stories.filter((story) => {
        const hasRemoteAudio = Boolean(story.hasAudio);
        const hasLocalAudio = Boolean(story.hasLocalAudio || story.localAudioUri);
        const hasDownloadUri = Boolean(story.localUri);
        return hasRemoteAudio || hasLocalAudio || hasDownloadUri;
      });

      const newItems = [];
      playableStories.forEach((story) => {
        if (story?.id == null) {
          return;
        }
        const storyKey = String(story.id);
        if (existingStoryIds.has(storyKey)) {
          return;
        }

        newItems.push({
          id: storyKey,
          storyId: storyKey,
          title: story.title ?? `Bajka ${storyKey}`,
          author: story.author ?? 'Anonim',
          duration: story.duration ?? null,
          hasAudio: Boolean(story.hasAudio || story.hasLocalAudio || story.localUri),
          hasLocalAudio: Boolean(story.hasLocalAudio || story.localAudioUri),
          localUri: story.localUri ?? null,
          localAudioUri: story.localAudioUri ?? null,
          coverUrl: story.cover_url ?? story.coverUrl ?? voiceService.getStoryCoverUrl?.(story.id) ?? null,
          voiceId: voiceResult.voiceId
        });
      });

      if (!newItems.length) {
        showToast('Brak nowych bajek do dodania.', 'INFO');
        return;
      }

      enqueue(newItems);
      if (!queueItems.length) {
        setActiveItem({ index: 0 });
      }

      showToast(`Dodano ${newItems.length} bajek do kolejki.`, 'SUCCESS');
    } catch (error) {
      console.error('Queue auto-fill failed', error);
      showToast('Nie udało się uzupełnić kolejki.', 'ERROR');
    } finally {
      setAutoFillLoading(false);
    }
  };

  const handleShuffle = () => {
    if (!Array.isArray(queue) || queue.length === 0) {
      showToast('Kolejka jest pusta.', 'INFO');
      return;
    }

    const shuffled = [...queue].sort(() => Math.random() - 0.5);
    applyQueueMutation(shuffled);
    showToast('Przetasowano kolejkę.', 'SUCCESS');
  };

  const handleSelectItem = (index) => {
    setActiveItem({ index });
    showToast('Aktywowano bajkę w kolejce.', 'SUCCESS');
  };

  const renderQueueItem = ({ item }) => (
    <View style={[styles.queueItem, item.isActive && styles.activeQueueItem]}>
      <TouchableOpacity
        style={styles.itemInfoButton}
        onPress={() => handleSelectItem(item.index)}
        activeOpacity={0.7}
      >
        <View style={[styles.positionBadge, item.isActive && styles.positionBadgeActive]}>
          <Text
            style={[styles.positionBadgeText, item.isActive && styles.positionBadgeTextActive]}
          >
            {renderQueuePosition(item.index)}
          </Text>
        </View>
        <View style={styles.itemTextContainer}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.itemAuthor} numberOfLines={1}>{item.author}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.iconButton, item.index === 0 && styles.iconButtonDisabled]}
          onPress={() => handleMoveUp(item.index)}
          disabled={item.index === 0}
        >
          <Feather
            name="arrow-up"
            size={18}
            color={item.index === 0 ? COLORS.text.tertiary : COLORS.text.secondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconButton, item.index === queueItems.length - 1 && styles.iconButtonDisabled]}
          onPress={() => handleMoveDown(item.index)}
          disabled={item.index === queueItems.length - 1}
        >
          <Feather
            name="arrow-down"
            size={18}
            color={item.index === queueItems.length - 1 ? COLORS.text.tertiary : COLORS.text.secondary}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton} onPress={() => handleRemove(item.index)}>
          <Feather name="trash-2" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const queueEmpty = queueItems.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Feather name="chevron-left" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Twoja kolejka</Text>
        <View style={styles.headerButtonPlaceholder} />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionChip, queueEmpty && styles.actionChipDisabled]}
          onPress={handleClearQueue}
          disabled={queueEmpty}
        >
          <Feather name="trash" size={16} color={queueEmpty ? COLORS.text.tertiary : COLORS.error} />
          <Text style={[styles.actionChipText, queueEmpty && styles.actionChipTextDisabled]}>Wyczyść</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, autoFillLoading && styles.actionChipDisabled]}
          onPress={handleAutoFill}
          disabled={autoFillLoading}
        >
          {autoFillLoading ? (
            <ActivityIndicator size="small" color={COLORS.lavender} />
          ) : (
            <Feather name="plus-circle" size={16} color={COLORS.lavender} />
          )}
          <Text style={styles.actionChipText}>Uzupełnij</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, queueEmpty && styles.actionChipDisabled]}
          onPress={handleShuffle}
          disabled={queueEmpty}
        >
          <Feather name="shuffle" size={16} color={queueEmpty ? COLORS.text.tertiary : COLORS.lavender} />
          <Text style={[styles.actionChipText, queueEmpty && styles.actionChipTextDisabled]}>Tasuj</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={handleCycleLoopMode}>
          <Feather
            name="repeat"
            size={16}
            color={loopMode === LOOP_MODES.NONE ? COLORS.text.secondary : COLORS.lavender}
          />
          <Text style={styles.actionChipText}>{LOOP_MODE_LABELS[loopMode]}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        {queueEmpty ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={COLORS.text.tertiary} />
            <Text style={styles.emptyTitle}>Kolejka jest pusta</Text>
            <Text style={styles.emptySubtitle}>
              Dodaj bajki ze strony głównej lub użyj auto-uzupełnienia, aby zacząć.
            </Text>
          </View>
        ) : (
          <FlatList
            data={queueItems}
            renderItem={renderQueueItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)'
  },
  headerButton: {
    padding: 8,
  },
  headerButtonPlaceholder: {
    width: 32,
  },
  headerTitle: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 20,
    color: COLORS.text.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(218, 143, 255, 0.35)',
    backgroundColor: COLORS.white,
    gap: 6,
  },
  actionChipDisabled: {
    opacity: 0.55,
  },
  actionChipText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  actionChipTextDisabled: {
    color: COLORS.text.tertiary,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  activeQueueItem: {
    backgroundColor: 'rgba(251, 190, 159, 0.12)',
  },
  itemInfoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  positionBadge: {
    minWidth: 36,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(218, 143, 255, 0.12)',
    alignItems: 'center',
    marginRight: 12,
  },
  positionBadgeActive: {
    backgroundColor: COLORS.peach,
  },
  positionBadgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12,
    color: COLORS.lavender,
  },
  positionBadgeTextActive: {
    color: COLORS.white,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  itemAuthor: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.white,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 18,
    color: COLORS.text.primary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  }
});
