import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { CreditProvider, useCredits, useCreditActions, __TESTING__ } from '../useCredits';

jest.mock('../../services/authService', () => ({
  subscribeAuthEvents: jest.fn(),
  getAccessToken: jest.fn(() => Promise.resolve('mock-token'))
}));

jest.mock('../../services/creditService', () => ({
  getCredits: jest.fn(),
  getStoryCredits: jest.fn(),
  primeStoryCredits: jest.fn(),
  invalidateCreditsCache: jest.fn(),
  invalidateStoryCredits: jest.fn()
}));

const creditService = require('../../services/creditService');
const { getCredits, invalidateCreditsCache } = creditService;
const authService = require('../../services/authService');
const { subscribeAuthEvents } = authService;

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useCredits', () => {
  let addEventListenerSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    subscribeAuthEvents.mockImplementation(() => () => {});
    addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({
      remove: jest.fn()
    }));
  });

  afterEach(() => {
    if (addEventListenerSpy?.mockRestore) {
      addEventListenerSpy.mockRestore();
    }
  });

  test('loads credits on mount and exposes state', async () => {
    const payload = {
      balance: 25,
      unitLabel: 'Story Stars',
      unitSize: 1000,
      lots: [],
      recentTransactions: [],
      fetchedAt: Date.now()
    };

    getCredits.mockResolvedValue({
      success: true,
      data: payload,
      fromCache: false,
      stale: false,
      cachedAt: payload.fetchedAt
    });

    let capturedState;
    const TestComponent = () => {
      capturedState = useCredits();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await flushMicrotasks();
    });

    expect(getCredits).toHaveBeenCalledWith({ forceRefresh: false });
    expect(capturedState.balance).toBe(25);
    expect(capturedState.initializing).toBe(false);
    expect(capturedState.stale).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  test('refreshes credits after login event', async () => {
    let authListener;
    subscribeAuthEvents.mockImplementation((listener) => {
      authListener = listener;
      return jest.fn();
    });

    getCredits
      .mockResolvedValueOnce({
        success: false,
        status: 401,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          balance: 8,
          unitLabel: 'Story Points',
          unitSize: 1000,
          lots: [],
          recentTransactions: [],
          fetchedAt: Date.now()
        },
        fromCache: false,
        stale: false,
        cachedAt: Date.now()
      });

    let capturedState;

    const TestComponent = () => {
      capturedState = useCredits();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await flushMicrotasks();
    });

    expect(getCredits).toHaveBeenCalledTimes(1);
    expect(capturedState.error).toEqual({ message: 'Authentication failed', code: 'AUTH_ERROR' });

    await act(async () => {
      authListener('LOGIN');
      await flushMicrotasks();
    });

    expect(getCredits).toHaveBeenCalledTimes(2);
    expect(capturedState.balance).toBe(8);
    expect(capturedState.error).toBeNull();

    await act(async () => {
      renderer.unmount();
    });
  });

  test('resets state when logout event fires', async () => {
    let authListener;
    subscribeAuthEvents.mockImplementation((listener) => {
      authListener = listener;
      return jest.fn();
    });

    invalidateCreditsCache.mockResolvedValue();

    getCredits.mockResolvedValue({
      success: true,
      data: {
        balance: 6,
        unitLabel: 'Story Points',
        unitSize: 1000,
        lots: [],
        recentTransactions: [],
        fetchedAt: Date.now()
      },
      fromCache: false,
      stale: false,
      cachedAt: Date.now()
    });

    let capturedState;

    const TestComponent = () => {
      capturedState = useCredits();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await flushMicrotasks();
    });

    expect(capturedState.balance).toBe(6);

    await act(async () => {
      authListener('LOGOUT');
      await flushMicrotasks();
    });

    expect(invalidateCreditsCache).toHaveBeenCalled();
    expect(capturedState.balance).toBe(0);
    expect(capturedState.pendingAdjustments).toEqual({});
    expect(capturedState.error).toBeNull();

    await act(async () => {
      renderer.unmount();
    });
  });

  test('ignores stale fetch resolution after logout', async () => {
    let authListener;
    subscribeAuthEvents.mockImplementation((listener) => {
      authListener = listener;
      return jest.fn();
    });

    invalidateCreditsCache.mockResolvedValue();

    let resolveFetch;
    getCredits.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    let capturedState;

    const TestComponent = () => {
      capturedState = useCredits();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await Promise.resolve();
    });

    expect(typeof resolveFetch).toBe('function');

    await act(async () => {
      authListener('LOGOUT');
      await flushMicrotasks();
    });

    await act(async () => {
      resolveFetch({
        success: true,
        data: {
          balance: 99,
          unitLabel: 'Story Points',
          unitSize: 1000,
          lots: [],
          recentTransactions: [],
          fetchedAt: Date.now()
        },
        fromCache: false,
        stale: false,
        cachedAt: Date.now()
      });
      await flushMicrotasks();
    });

    expect(capturedState.balance).toBe(0);
    expect(capturedState.pendingAdjustments).toEqual({});

    await act(async () => {
      renderer.unmount();
    });
  });

  test('applyDebitOptimistic updates balance and rollback restores it', async () => {
    const payload = {
      balance: 10,
      unitLabel: 'Story Points',
      unitSize: 1000,
      lots: [],
      recentTransactions: [],
      fetchedAt: Date.now()
    };

    getCredits.mockResolvedValue({
      success: true,
      data: payload,
      fromCache: false,
      stale: false,
      cachedAt: payload.fetchedAt
    });

    let capturedState;
    let actions;

    const TestComponent = () => {
      capturedState = useCredits();
      actions = useCreditActions();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await flushMicrotasks();
    });

    expect(capturedState.balance).toBe(10);

    await act(async () => {
      actions.applyDebitOptimistic({ amount: 3, id: 'test-adj' });
    });

    expect(capturedState.balance).toBe(7);
    expect(capturedState.pendingAdjustments['test-adj']).toBeDefined();

    await act(async () => {
      actions.rollbackAdjustment('test-adj');
    });

    expect(capturedState.balance).toBe(10);
    expect(capturedState.pendingAdjustments['test-adj']).toBeUndefined();

    await act(async () => {
      renderer.unmount();
    });
  });

  test('handles error response and preserves message', async () => {
    getCredits.mockResolvedValue({
      success: false,
      status: 500,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });

    let capturedState;

    const TestComponent = () => {
      capturedState = useCredits();
      return null;
    };

    let renderer;
    await act(async () => {
      renderer = create(
        <CreditProvider>
          <TestComponent />
        </CreditProvider>
      );
      await flushMicrotasks();
    });

    expect(getCredits).toHaveBeenCalled();
    expect(capturedState.error).toEqual({ message: 'Server error', code: 'SERVER_ERROR' });
    expect(capturedState.initializing).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('credit reducer', () => {
  const { reducer, initialState } = __TESTING__;

  test('APPLY_ADJUSTMENT updates balance and pending map', () => {
    const result = reducer(initialState, {
      type: 'APPLY_ADJUSTMENT',
      payload: { id: 'adj', delta: -5 }
    });

    expect(result.balance).toBe(-5);
    expect(result.pendingAdjustments['adj']).toEqual({ delta: -5, metadata: undefined });
  });

  test('ROLLBACK_ADJUSTMENT restores balance', () => {
    const withPending = {
      ...initialState,
      balance: 5,
      pendingAdjustments: { adj: { delta: -5 } }
    };

    const result = reducer(withPending, {
      type: 'ROLLBACK_ADJUSTMENT',
      payload: { id: 'adj' }
    });

    expect(result.balance).toBe(10);
    expect(result.pendingAdjustments['adj']).toBeUndefined();
  });
});
