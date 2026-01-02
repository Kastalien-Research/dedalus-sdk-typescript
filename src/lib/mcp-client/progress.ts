// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Progress tracking utilities for MCP client.
 *
 * Provides support for tracking progress of long-running operations
 * via progress tokens and callbacks.
 */

/**
 * Progress token used to correlate progress notifications with requests.
 */
export type ProgressToken = string | number;

/**
 * Progress information received from the server.
 */
export interface ProgressInfo {
  /** Current progress value */
  progress: number;

  /** Total expected value (if known) */
  total?: number | undefined;

  /** Human-readable status message */
  message?: string | undefined;
}

/**
 * Callback function for progress updates.
 */
export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * Progress notification parameters from server.
 */
export interface ProgressNotification {
  progressToken: ProgressToken;
  progress: number;
  total?: number;
  message?: string;
}

/**
 * Manages progress tracking for requests.
 *
 * The ProgressTracker generates unique tokens for requests,
 * registers callbacks to receive progress updates, and dispatches
 * incoming progress notifications to the appropriate callbacks.
 *
 * @example
 * ```typescript
 * const tracker = new ProgressTracker();
 *
 * // Generate token and register callback
 * const token = tracker.generateToken();
 * tracker.register(token, (info) => {
 *   console.log(`Progress: ${info.progress}/${info.total ?? '?'}`);
 * });
 *
 * // Later, when progress notification arrives:
 * tracker.handleProgress({ progressToken: token, progress: 50, total: 100 });
 *
 * // Clean up when done
 * tracker.unregister(token);
 * ```
 */
export class ProgressTracker {
  private callbacks = new Map<ProgressToken, ProgressCallback>();
  private counter = 0;

  /**
   * Generate a unique progress token.
   *
   * Tokens are unique within this tracker instance and can be used
   * to correlate requests with their progress notifications.
   *
   * @returns A unique progress token
   */
  generateToken(): ProgressToken {
    return `progress-${Date.now()}-${this.counter++}`;
  }

  /**
   * Register a callback for a progress token.
   *
   * The callback will be invoked when progress notifications
   * are received with the matching token.
   *
   * @param token - The progress token to listen for
   * @param callback - Function to call with progress updates
   */
  register(token: ProgressToken, callback: ProgressCallback): void {
    this.callbacks.set(token, callback);
  }

  /**
   * Unregister a callback for a progress token.
   *
   * Should be called when the request completes to clean up resources.
   *
   * @param token - The progress token to unregister
   */
  unregister(token: ProgressToken): void {
    this.callbacks.delete(token);
  }

  /**
   * Handle an incoming progress notification.
   *
   * Dispatches the progress update to the registered callback
   * for the given token, if one exists.
   *
   * @param notification - The progress notification from the server
   */
  handleProgress(notification: ProgressNotification): void {
    const callback = this.callbacks.get(notification.progressToken);
    if (callback) {
      callback({
        progress: notification.progress,
        total: notification.total,
        message: notification.message,
      });
    }
  }

  /**
   * Check if a token has a registered callback.
   *
   * @param token - The progress token to check
   * @returns true if a callback is registered
   */
  hasCallback(token: ProgressToken): boolean {
    return this.callbacks.has(token);
  }

  /**
   * Get the number of registered callbacks.
   *
   * @returns The count of active progress subscriptions
   */
  get size(): number {
    return this.callbacks.size;
  }

  /**
   * Clear all registered callbacks.
   *
   * Should be called when the client disconnects to clean up resources.
   */
  clear(): void {
    this.callbacks.clear();
  }
}
