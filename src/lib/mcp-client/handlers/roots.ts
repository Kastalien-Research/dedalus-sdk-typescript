// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Roots handler for MCP client.
 *
 * Manages root directories that define filesystem boundaries the server can access.
 * Handles roots/list requests and emits notifications when roots change.
 */

import type { Root } from '../types';

/**
 * Result of a roots/list request.
 */
export interface ListRootsResult {
  roots: Root[];
}

/**
 * Options for creating a RootsHandler.
 */
export interface RootsHandlerOptions {
  /** Initial list of roots */
  roots?: Root[];
}

/**
 * Handler for managing root directories.
 *
 * Servers can query the list of roots via roots/list, and the client
 * can dynamically add, remove, or replace roots at runtime.
 *
 * @example
 * ```typescript
 * const handler = new RootsHandler({
 *   roots: [
 *     { uri: 'file:///home/user/project', name: 'Project' },
 *   ],
 * });
 *
 * // Handle roots/list request
 * const result = handler.handleList();
 *
 * // Dynamically add a root
 * handler.addRoot({ uri: 'file:///tmp', name: 'Temp' });
 *
 * // Subscribe to changes
 * const unsubscribe = handler.onRootsChanged(() => {
 *   console.log('Roots changed:', handler.getRoots());
 * });
 * ```
 */
export class RootsHandler {
  private roots: Root[];
  private changeListeners: Array<() => void> = [];

  constructor(options: RootsHandlerOptions) {
    this.roots = [...(options.roots ?? [])];
  }

  /**
   * Handle a roots/list request.
   *
   * @returns The list of configured roots
   */
  handleList(): ListRootsResult {
    return { roots: [...this.roots] };
  }

  /**
   * Get the current list of roots.
   *
   * @returns Copy of the roots array
   */
  getRoots(): Root[] {
    return [...this.roots];
  }

  /**
   * Replace all roots with a new list.
   *
   * @param roots - New roots to set
   */
  setRoots(roots: Root[]): void {
    this.roots = [...roots];
    this.notifyChange();
  }

  /**
   * Add a root to the list.
   *
   * @param root - Root to add
   */
  addRoot(root: Root): void {
    // Check for duplicate URIs
    if (this.roots.some((r) => r.uri === root.uri)) {
      return; // Already exists
    }
    this.roots.push({ ...root });
    this.notifyChange();
  }

  /**
   * Remove a root by URI.
   *
   * @param uri - URI of the root to remove
   * @returns true if a root was removed, false if not found
   */
  removeRoot(uri: string): boolean {
    const index = this.roots.findIndex((r) => r.uri === uri);
    if (index === -1) {
      return false;
    }
    this.roots.splice(index, 1);
    this.notifyChange();
    return true;
  }

  /**
   * Check if a root exists.
   *
   * @param uri - URI to check
   * @returns true if root exists
   */
  hasRoot(uri: string): boolean {
    return this.roots.some((r) => r.uri === uri);
  }

  /**
   * Subscribe to root change notifications.
   *
   * The callback is called whenever roots are added, removed, or replaced.
   *
   * @param callback - Function to call when roots change
   * @returns Unsubscribe function
   */
  onRootsChanged(callback: () => void): () => void {
    this.changeListeners.push(callback);
    return () => {
      const index = this.changeListeners.indexOf(callback);
      if (index !== -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of a change.
   */
  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }
}
