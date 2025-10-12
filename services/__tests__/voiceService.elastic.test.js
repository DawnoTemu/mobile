jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn())
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  cacheDirectory: 'file://cache/',
  createDownloadResumable: jest.fn()
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn()
  }
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const voiceService = require('../voiceService');
const {
  __TEST_ONLY__: {
    interpretAudioSynthesisResponse,
    parseQueueHeaders,
    saveGenerationStateSnapshot,
    loadGenerationStateSnapshot,
    listGenerationStateSnapshots,
    purgeExpiredGenerationStateSnapshots,
    setTimingOverrides,
    resetTimingOverrides,
    setTelemetryHandler,
    reportTelemetryEvent
  }
} = voiceService;

const advanceTime = (ms) => {
  jest.spyOn(Date, 'now').mockImplementation(() => originalNow + ms);
};

let originalNow;

beforeEach(async () => {
  jest.useFakeTimers();
  originalNow = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => originalNow);
  await AsyncStorage.clear();
  resetTimingOverrides();
  setTelemetryHandler(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('interpretAudioSynthesisResponse', () => {
  test('parses status payload and queue headers', () => {
    const response = {
      success: true,
      status: 202,
      headers: {
        'x-voice-queue-position': '2',
        'x-voice-queue-length': '5',
        'x-voice-remote-id': 'voice_remote'
      },
      data: {
        id: 301,
        status: 'allocating_voice',
        message: 'Voice allocation is in progress',
        voice: {
          voice_id: 42,
          allocation_status: 'allocating',
          service_provider: 'elevenlabs',
          queue_position: 2,
          queue_length: 5,
          elevenlabs_voice_id: 'remote-eleven'
        }
      }
    };

    const result = interpretAudioSynthesisResponse(response);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: 'allocating_voice',
        queuePosition: 2,
        queueLength: 5,
        remoteVoiceId: 'voice_remote',
        allocationStatus: 'allocating',
        serviceProvider: 'elevenlabs',
        audioId: '301'
      })
    );
  });

  test('falls back to headers when voice metadata missing', () => {
    const response = {
      success: true,
      status: 202,
      headers: {
        'x-voice-queue-position': '1',
        'x-voice-queue-length': '2'
      },
      data: {
        status: 'queued_for_slot'
      }
    };

    const result = interpretAudioSynthesisResponse(response);

    expect(result.queuePosition).toBe(1);
    expect(result.queueLength).toBe(2);
    expect(result.remoteVoiceId).toBeNull();
  });
});

describe('queue header parsing', () => {
  test('parses numeric values and remote id', () => {
    const headers = parseQueueHeaders({
      'x-voice-queue-position': '3',
      'x-voice-queue-length': '10',
      'x-voice-remote-id': 'sample-remote'
    });

    expect(headers).toEqual({
      queuePosition: 3,
      queueLength: 10,
      remoteVoiceId: 'sample-remote'
    });
  });

  test('handles missing fields gracefully', () => {
    const headers = parseQueueHeaders({});
    expect(headers).toEqual({
      queuePosition: null,
      queueLength: null,
      remoteVoiceId: null
    });
  });
});

describe('generation state persistence', () => {
  test('save/load snapshots round trip', async () => {
    const voiceId = 'voice-123';
    const storyId = 'story-456';

    await saveGenerationStateSnapshot(voiceId, storyId, {
      status: 'processing',
      queuePosition: 1
    });

    const loaded = await loadGenerationStateSnapshot(voiceId, storyId);
    expect(loaded.success).toBe(true);
    expect(loaded.state.status).toBe('processing');
    expect(loaded.state.queuePosition).toBe(1);
  });

  test('purge removes expired snapshots', async () => {
    const voiceId = 'voice-999';
    const storyId = 'story-001';

    await saveGenerationStateSnapshot(voiceId, storyId, { status: 'queued_for_slot' });

    // move time two hours + 1 minute forward to exceed TTL
    advanceTime(2 * 60 * 60 * 1000 + 60 * 1000);

    const result = await purgeExpiredGenerationStateSnapshots();
    expect(result.mutated).toBe(true);

    const loaded = await loadGenerationStateSnapshot(voiceId, storyId);
    expect(loaded.state).toBeNull();
    expect(loaded.expired).toBe(false);
  });
});

describe('telemetry handler', () => {
  test('invokes handler when telemetry event reported', () => {
    const handler = jest.fn();
    setTelemetryHandler(handler);

    const event = {
      category: 'voice_generation',
      phase: 'generation',
      status: 'processing',
      queuePosition: 0
    };

    reportTelemetryEvent(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  test('ignores telemetry when handler not provided', () => {
    const handler = jest.fn();
    setTelemetryHandler(handler);
    setTelemetryHandler(null);

    reportTelemetryEvent({ category: 'voice_generation' });

    expect(handler).not.toHaveBeenCalled();
  });
});
