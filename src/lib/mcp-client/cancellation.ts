// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Request cancellation utilities for MCP client.
 *
 * Provides support for cancelling in-progress requests using
 * AbortController and tracking pending requests.
 */

/**
 * Request ID used to identify cancellable requests.
 */
export type RequestId = string | number;

/**
 * Manages request cancellation.
 *
 * The CancellationManager tracks pending requests with their AbortControllers,
 * allowing requests to be cancelled by ID.
 *
 * @example
 * ```typescript
 * const manager = new CancellationManager();
 *
 * // Create a cancellable request
 * const requestId = 'req-123';
 * const controller = manager.create(requestId);
 *
 * // Use controller.signal with fetch or other AbortSignal-aware APIs
 * try {
 *   const result = await fetch(url, { signal: controller.signal });
 *   manager.complete(requestId);
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Request was cancelled');
 *   }
 *   manager.complete(requestId);
 * }
 *
 * // Or cancel the request from elsewhere
 * manager.cancel(requestId);
 * ```
 */
export class CancellationManager {
  private pendingRequests = new Map<RequestId, AbortController>();
  private counter = 0;

  /**
   * Generate a unique request ID.
   *
   * @returns A unique request ID
   */
  generateRequestId(): RequestId {
    return `req-${Date.now()}-${this.counter++}`;
  }

  /**
   * Create an AbortController for a request.
   *
   * The controller is tracked internally and can be used to cancel
   * the request later via the cancel() method.
   *
   * @param requestId - Unique identifier for the request
   * @returns AbortController for the request
   */
  create(requestId: RequestId): AbortController {
    const controller = new AbortController();
    this.pendingRequests.set(requestId, controller);
    return controller;
  }

  /**
   * Mark a request as completed (remove from tracking).
   *
   * Should be called when a request completes successfully or with an error
   * to clean up the internal tracking.
   *
   * @param requestId - ID of the completed request
   */
  complete(requestId: RequestId): void {
    this.pendingRequests.delete(requestId);
  }

  /**
   * Cancel a request by ID.
   *
   * If the request is still pending, its AbortController.abort() is called,
   * which will cause any AbortSignal-aware operations to throw an AbortError.
   *
   * @param requestId - ID of the request to cancel
   * @returns true if a pending request was cancelled, false if not found
   */
  cancel(requestId: RequestId): boolean {
    const controller = this.pendingRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Check if a request is pending.
   *
   * @param requestId - ID of the request to check
   * @returns true if the request is still pending
   */
  isPending(requestId: RequestId): boolean {
    return this.pendingRequests.has(requestId);
  }

  /**
   * Get the AbortSignal for a pending request.
   *
   * @param requestId - ID of the request
   * @returns The AbortSignal if the request is pending, undefined otherwise
   */
  getSignal(requestId: RequestId): AbortSignal | undefined {
    return this.pendingRequests.get(requestId)?.signal;
  }

  /**
   * Get the number of pending requests.
   *
   * @returns The count of pending requests
   */
  get size(): number {
    return this.pendingRequests.size;
  }

  /**
   * Cancel all pending requests.
   *
   * Should be called when the client disconnects to abort any
   * outstanding operations.
   */
  cancelAll(): void {
    for (const controller of this.pendingRequests.values()) {
      controller.abort();
    }
    this.pendingRequests.clear();
  }
}

/**
 * Result of a cancellable operation.
 */
export interface CancellableOperation<T> {
  /** Promise that resolves with the result or rejects on error/cancellation */
  promise: Promise<T>;

  /** Function to cancel the operation */
  cancel: () => void;

  /** ID of the request for external tracking */
  requestId: RequestId;
}
