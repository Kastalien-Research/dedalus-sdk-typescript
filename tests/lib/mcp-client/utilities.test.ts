// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

import {
  ProgressTracker,
  CancellationManager,
  TaskStatusManager,
  TaskTimeoutError,
  TaskAbortedError,
  waitForTask,
} from '../../../src/lib/mcp-client';
import type {
  ProgressCallback,
  Task,
  TaskCapableClient,
  TaskResult,
  TaskStatusCallback,
} from '../../../src/lib/mcp-client';

// =============================================================================
// ProgressTracker Tests
// =============================================================================

describe('ProgressTracker', () => {
  describe('generateToken', () => {
    it('should generate unique tokens', () => {
      const tracker = new ProgressTracker();
      const token1 = tracker.generateToken();
      const token2 = tracker.generateToken();
      const token3 = tracker.generateToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(typeof token1).toBe('string');
    });
  });

  describe('register and unregister', () => {
    it('should register a callback', () => {
      const tracker = new ProgressTracker();
      const token = tracker.generateToken();
      const callback = jest.fn();

      tracker.register(token, callback);
      expect(tracker.hasCallback(token)).toBe(true);
    });

    it('should unregister a callback', () => {
      const tracker = new ProgressTracker();
      const token = tracker.generateToken();
      const callback = jest.fn();

      tracker.register(token, callback);
      tracker.unregister(token);
      expect(tracker.hasCallback(token)).toBe(false);
    });

    it('should track size correctly', () => {
      const tracker = new ProgressTracker();
      expect(tracker.size).toBe(0);

      const token1 = tracker.generateToken();
      const token2 = tracker.generateToken();

      tracker.register(token1, jest.fn());
      expect(tracker.size).toBe(1);

      tracker.register(token2, jest.fn());
      expect(tracker.size).toBe(2);

      tracker.unregister(token1);
      expect(tracker.size).toBe(1);
    });
  });

  describe('handleProgress', () => {
    it('should dispatch progress to registered callback', () => {
      const tracker = new ProgressTracker();
      const token = tracker.generateToken();
      const callback = jest.fn();

      tracker.register(token, callback);
      tracker.handleProgress({
        progressToken: token,
        progress: 50,
        total: 100,
        message: 'Halfway there',
      });

      expect(callback).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
        message: 'Halfway there',
      });
    });

    it('should not fail for unknown tokens', () => {
      const tracker = new ProgressTracker();
      expect(() => {
        tracker.handleProgress({
          progressToken: 'unknown-token',
          progress: 10,
        });
      }).not.toThrow();
    });

    it('should handle progress without optional fields', () => {
      const tracker = new ProgressTracker();
      const token = tracker.generateToken();
      const callback = jest.fn();

      tracker.register(token, callback);
      tracker.handleProgress({
        progressToken: token,
        progress: 25,
      });

      expect(callback).toHaveBeenCalledWith({
        progress: 25,
        total: undefined,
        message: undefined,
      });
    });

    it('should dispatch to correct callback with multiple registered', () => {
      const tracker = new ProgressTracker();
      const token1 = tracker.generateToken();
      const token2 = tracker.generateToken();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      tracker.register(token1, callback1);
      tracker.register(token2, callback2);

      tracker.handleProgress({ progressToken: token1, progress: 10 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all callbacks', () => {
      const tracker = new ProgressTracker();
      const token1 = tracker.generateToken();
      const token2 = tracker.generateToken();

      tracker.register(token1, jest.fn());
      tracker.register(token2, jest.fn());
      expect(tracker.size).toBe(2);

      tracker.clear();
      expect(tracker.size).toBe(0);
      expect(tracker.hasCallback(token1)).toBe(false);
      expect(tracker.hasCallback(token2)).toBe(false);
    });
  });
});

// =============================================================================
// CancellationManager Tests
// =============================================================================

describe('CancellationManager', () => {
  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const manager = new CancellationManager();
      const id1 = manager.generateRequestId();
      const id2 = manager.generateRequestId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
    });
  });

  describe('create and complete', () => {
    it('should create and track a request', () => {
      const manager = new CancellationManager();
      const requestId = 'req-1';

      const controller = manager.create(requestId);
      expect(controller).toBeInstanceOf(AbortController);
      expect(manager.isPending(requestId)).toBe(true);
    });

    it('should mark request as complete', () => {
      const manager = new CancellationManager();
      const requestId = 'req-2';

      manager.create(requestId);
      manager.complete(requestId);
      expect(manager.isPending(requestId)).toBe(false);
    });

    it('should track size correctly', () => {
      const manager = new CancellationManager();
      expect(manager.size).toBe(0);

      manager.create('req-1');
      expect(manager.size).toBe(1);

      manager.create('req-2');
      expect(manager.size).toBe(2);

      manager.complete('req-1');
      expect(manager.size).toBe(1);
    });
  });

  describe('cancel', () => {
    it('should cancel a pending request', () => {
      const manager = new CancellationManager();
      const requestId = 'req-3';
      const controller = manager.create(requestId);

      const cancelled = manager.cancel(requestId);

      expect(cancelled).toBe(true);
      expect(controller.signal.aborted).toBe(true);
      expect(manager.isPending(requestId)).toBe(false);
    });

    it('should return false for non-existent request', () => {
      const manager = new CancellationManager();
      const cancelled = manager.cancel('non-existent');
      expect(cancelled).toBe(false);
    });

    it('should return false for already-completed request', () => {
      const manager = new CancellationManager();
      manager.create('req-4');
      manager.complete('req-4');

      const cancelled = manager.cancel('req-4');
      expect(cancelled).toBe(false);
    });
  });

  describe('getSignal', () => {
    it('should return signal for pending request', () => {
      const manager = new CancellationManager();
      const requestId = 'req-5';
      manager.create(requestId);

      const signal = manager.getSignal(requestId);
      expect(signal).toBeDefined();
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('should return undefined for non-existent request', () => {
      const manager = new CancellationManager();
      const signal = manager.getSignal('non-existent');
      expect(signal).toBeUndefined();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all pending requests', () => {
      const manager = new CancellationManager();
      const controller1 = manager.create('req-6');
      const controller2 = manager.create('req-7');
      const controller3 = manager.create('req-8');

      manager.cancelAll();

      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(true);
      expect(controller3.signal.aborted).toBe(true);
      expect(manager.size).toBe(0);
    });
  });
});

// =============================================================================
// TaskStatusManager Tests
// =============================================================================

describe('TaskStatusManager', () => {
  const mockTask: Task = {
    id: 'task-1',
    state: 'running',
    message: 'Processing...',
  };

  describe('subscribe', () => {
    it('should register a callback', () => {
      const manager = new TaskStatusManager();
      const callback = jest.fn();

      manager.subscribe('task-1', callback);
      expect(manager.hasSubscribers('task-1')).toBe(true);
    });

    it('should return unsubscribe function', () => {
      const manager = new TaskStatusManager();
      const callback = jest.fn();

      const unsubscribe = manager.subscribe('task-1', callback);
      expect(manager.hasSubscribers('task-1')).toBe(true);

      unsubscribe();
      expect(manager.hasSubscribers('task-1')).toBe(false);
    });

    it('should allow multiple callbacks for same task', () => {
      const manager = new TaskStatusManager();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      manager.subscribe('task-1', callback1);
      manager.subscribe('task-1', callback2);

      manager.handleStatus(mockTask);

      expect(callback1).toHaveBeenCalledWith(mockTask);
      expect(callback2).toHaveBeenCalledWith(mockTask);
    });
  });

  describe('handleStatus', () => {
    it('should dispatch to subscribed callbacks', () => {
      const manager = new TaskStatusManager();
      const callback = jest.fn();

      manager.subscribe('task-1', callback);
      manager.handleStatus(mockTask);

      expect(callback).toHaveBeenCalledWith(mockTask);
    });

    it('should not dispatch to unrelated task subscribers', () => {
      const manager = new TaskStatusManager();
      const callback = jest.fn();

      manager.subscribe('task-2', callback);
      manager.handleStatus(mockTask); // task-1

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const manager = new TaskStatusManager();
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      manager.subscribe('task-1', errorCallback);
      manager.subscribe('task-1', normalCallback);

      // Should not throw
      expect(() => manager.handleStatus(mockTask)).not.toThrow();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all subscriptions', () => {
      const manager = new TaskStatusManager();

      manager.subscribe('task-1', jest.fn());
      manager.subscribe('task-2', jest.fn());

      manager.clear();

      expect(manager.hasSubscribers('task-1')).toBe(false);
      expect(manager.hasSubscribers('task-2')).toBe(false);
    });
  });
});

// =============================================================================
// waitForTask Tests
// =============================================================================

describe('waitForTask', () => {
  function createMockClient(
    taskSequence: Task[],
    finalResult: TaskResult,
  ): TaskCapableClient {
    let callCount = 0;
    return {
      getTask: jest.fn().mockImplementation(async () => {
        const task = taskSequence[callCount] ?? taskSequence[taskSequence.length - 1];
        callCount++;
        return task;
      }),
      getTaskResult: jest.fn().mockResolvedValue(finalResult),
      onTaskStatus: jest.fn().mockReturnValue(() => {}),
    };
  }

  it('should return result when task completes', async () => {
    const client = createMockClient(
      [
        { id: 'task-1', state: 'running' },
        { id: 'task-1', state: 'completed' },
      ],
      { id: 'task-1', result: 'success' },
    );

    const result = await waitForTask(client, 'task-1', { pollInterval: 10 });

    expect(result).toEqual({ id: 'task-1', result: 'success' });
    expect(client.getTask).toHaveBeenCalledTimes(2);
  });

  it('should return result when task fails', async () => {
    const client = createMockClient(
      [{ id: 'task-1', state: 'failed' }],
      { id: 'task-1', error: { code: 1, message: 'Failed' } },
    );

    const result = await waitForTask(client, 'task-1', { pollInterval: 10 });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Failed');
  });

  it('should call onStatus callback', async () => {
    const onStatus = jest.fn();
    const client = createMockClient(
      [
        { id: 'task-1', state: 'pending' },
        { id: 'task-1', state: 'running' },
        { id: 'task-1', state: 'completed' },
      ],
      { id: 'task-1', result: 'done' },
    );

    await waitForTask(client, 'task-1', { pollInterval: 10, onStatus });

    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it('should throw TaskTimeoutError on timeout', async () => {
    const client = createMockClient(
      [{ id: 'task-1', state: 'running' }],
      { id: 'task-1' },
    );

    await expect(
      waitForTask(client, 'task-1', { pollInterval: 10, timeout: 25 }),
    ).rejects.toThrow(TaskTimeoutError);
  });

  it('should throw when signal is aborted during wait', async () => {
    const controller = new AbortController();
    const client = createMockClient(
      [{ id: 'task-1', state: 'running' }],
      { id: 'task-1' },
    );

    // Abort after a short delay
    setTimeout(() => controller.abort(), 15);

    // Should throw (either TaskAbortedError from the check or Error from sleep)
    await expect(
      waitForTask(client, 'task-1', {
        pollInterval: 100,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it('should throw immediately if signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const client = createMockClient([], { id: 'task-1' });

    await expect(
      waitForTask(client, 'task-1', { signal: controller.signal }),
    ).rejects.toThrow(TaskAbortedError);
  });
});

// =============================================================================
// Error Classes Tests
// =============================================================================

describe('TaskTimeoutError', () => {
  it('should have correct properties', () => {
    const error = new TaskTimeoutError('task-123', 5000);

    expect(error.name).toBe('TaskTimeoutError');
    expect(error.taskId).toBe('task-123');
    expect(error.timeoutMs).toBe(5000);
    expect(error.message).toContain('task-123');
    expect(error.message).toContain('5000');
  });
});

describe('TaskAbortedError', () => {
  it('should have correct properties', () => {
    const error = new TaskAbortedError('task-456');

    expect(error.name).toBe('TaskAbortedError');
    expect(error.taskId).toBe('task-456');
    expect(error.message).toContain('task-456');
  });
});
