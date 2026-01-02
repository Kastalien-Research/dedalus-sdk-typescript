// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Task management utilities for MCP client.
 *
 * Provides support for the experimental MCP tasks system, which allows
 * long-running operations to be started as background tasks that can be
 * monitored and cancelled.
 *
 * Note: Tasks are marked as experimental in the MCP spec and may change.
 */

/**
 * Task identifier.
 */
export type TaskId = string;

/**
 * Possible states for a task.
 */
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * Task information.
 */
export interface Task {
  /** Unique task identifier */
  id: TaskId;

  /** Current state of the task */
  state: TaskState;

  /** Human-readable status message */
  message?: string;

  /** Progress information if available */
  progress?: {
    /** Current progress value */
    current: number;
    /** Total expected value (if known) */
    total?: number;
  };
}

/**
 * Result of a completed task.
 */
export interface TaskResult<T = unknown> {
  /** Task identifier */
  id: TaskId;

  /** Result value (if task completed successfully) */
  result?: T;

  /** Error information (if task failed) */
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Result of listing tasks.
 */
export interface ListTasksResult {
  /** List of tasks */
  tasks: Task[];

  /** Cursor for pagination (if more tasks available) */
  nextCursor?: string;
}

/**
 * Callback for task status changes.
 */
export type TaskStatusCallback = (task: Task) => void;

/**
 * Options for waiting for a task to complete.
 */
export interface WaitForTaskOptions {
  /**
   * Poll interval in milliseconds.
   * @default 1000
   */
  pollInterval?: number;

  /**
   * Timeout in milliseconds.
   * @default undefined (no timeout)
   */
  timeout?: number;

  /**
   * Callback for status updates during polling.
   */
  onStatus?: TaskStatusCallback;

  /**
   * AbortSignal for cancelling the wait operation.
   */
  signal?: AbortSignal;
}

/**
 * Error thrown when a task operation times out.
 */
export class TaskTimeoutError extends Error {
  constructor(
    public readonly taskId: TaskId,
    public readonly timeoutMs: number,
  ) {
    super(`Task ${taskId} timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
  }
}

/**
 * Error thrown when a task operation is aborted.
 */
export class TaskAbortedError extends Error {
  constructor(public readonly taskId: TaskId) {
    super(`Wait for task ${taskId} was aborted`);
    this.name = 'TaskAbortedError';
  }
}

/**
 * Interface for a client that supports task operations.
 *
 * This is used by the waitForTask helper to avoid circular dependencies.
 */
export interface TaskCapableClient {
  getTask(taskId: TaskId): Promise<Task>;
  getTaskResult<T = unknown>(taskId: TaskId, pollInterval?: number): Promise<TaskResult<T>>;
  onTaskStatus(taskId: TaskId, callback: TaskStatusCallback): () => void;
}

/**
 * Wait for a task to complete.
 *
 * This helper polls the task status until it reaches a terminal state
 * (completed, failed, or canceled), then returns the result.
 *
 * @param client - MCP client instance
 * @param taskId - ID of the task to wait for
 * @param options - Wait options
 * @returns Task result
 * @throws TaskTimeoutError if timeout is reached
 * @throws TaskAbortedError if signal is aborted
 *
 * @example
 * ```typescript
 * // Start a task
 * const taskId = await client.callToolAsTask('batch_process', { items: data });
 *
 * // Wait for completion with progress updates
 * const result = await waitForTask(client, taskId, {
 *   pollInterval: 2000,
 *   timeout: 300000, // 5 minutes
 *   onStatus: (task) => {
 *     console.log(`Task ${task.id}: ${task.state}`);
 *     if (task.progress) {
 *       console.log(`Progress: ${task.progress.current}/${task.progress.total ?? '?'}`);
 *     }
 *   },
 * });
 *
 * if (result.error) {
 *   console.error('Task failed:', result.error.message);
 * } else {
 *   console.log('Task completed:', result.result);
 * }
 * ```
 */
export async function waitForTask<T = unknown>(
  client: TaskCapableClient,
  taskId: TaskId,
  options: WaitForTaskOptions = {},
): Promise<TaskResult<T>> {
  const { pollInterval = 1000, timeout, onStatus, signal } = options;

  const startTime = Date.now();
  let unsubscribe: (() => void) | undefined;

  // Subscribe to status updates if callback provided
  if (onStatus) {
    unsubscribe = client.onTaskStatus(taskId, onStatus);
  }

  // Handle abort signal
  if (signal?.aborted) {
    unsubscribe?.();
    throw new TaskAbortedError(taskId);
  }

  try {
    while (true) {
      // Check for abort
      if (signal?.aborted) {
        throw new TaskAbortedError(taskId);
      }

      // Check for timeout
      if (timeout && Date.now() - startTime > timeout) {
        throw new TaskTimeoutError(taskId, timeout);
      }

      // Get current task status
      const task = await client.getTask(taskId);

      // Notify callback
      if (onStatus) {
        onStatus(task);
      }

      // Check for terminal states
      if (task.state === 'completed' || task.state === 'failed' || task.state === 'canceled') {
        return client.getTaskResult<T>(taskId);
      }

      // Wait before polling again
      await sleep(pollInterval, signal);
    }
  } finally {
    unsubscribe?.();
  }
}

/**
 * Sleep for a specified duration, respecting an optional abort signal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    const abortHandler = () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });

    // Clean up abort listener when timeout fires
    setTimeout(() => {
      signal?.removeEventListener('abort', abortHandler);
    }, ms + 1);
  });
}

/**
 * Manages task status subscriptions.
 *
 * This class is used internally by DedalusMCPClient to manage
 * callbacks for task status notifications.
 */
export class TaskStatusManager {
  private callbacks = new Map<TaskId, Set<TaskStatusCallback>>();

  /**
   * Register a callback for task status updates.
   *
   * @param taskId - Task to subscribe to
   * @param callback - Function to call with status updates
   * @returns Unsubscribe function
   */
  subscribe(taskId: TaskId, callback: TaskStatusCallback): () => void {
    let callbacks = this.callbacks.get(taskId);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(taskId, callbacks);
    }
    callbacks.add(callback);

    return () => {
      callbacks?.delete(callback);
      if (callbacks?.size === 0) {
        this.callbacks.delete(taskId);
      }
    };
  }

  /**
   * Handle an incoming task status notification.
   *
   * @param task - Updated task information
   */
  handleStatus(task: Task): void {
    const callbacks = this.callbacks.get(task.id);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(task);
        } catch {
          // Ignore callback errors
        }
      }
    }
  }

  /**
   * Check if there are any subscribers for a task.
   *
   * @param taskId - Task to check
   * @returns true if there are subscribers
   */
  hasSubscribers(taskId: TaskId): boolean {
    const callbacks = this.callbacks.get(taskId);
    return callbacks !== undefined && callbacks.size > 0;
  }

  /**
   * Clear all subscriptions.
   */
  clear(): void {
    this.callbacks.clear();
  }
}
