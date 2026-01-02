// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * DedalusMCPClient - A wrapper around the MCP SDK Client for Dedalus integration.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  ServerCapabilities,
  Implementation,
  Tool,
  ListToolsResult,
  CallToolResult,
  Resource,
  ListResourcesResult,
  ReadResourceResult,
  ListResourceTemplatesResult,
  Prompt,
  ListPromptsResult,
  GetPromptResult,
  CompleteResult,
  LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js';
import { createStdioTransport, createHTTPTransport } from './transports';
import { MCPConnectionError, MCPTimeoutError } from './errors';
import type {
  DedalusMCPClientOptions,
  StdioTransportOptions,
  HTTPTransportOptions,
  ClientCapabilitiesConfig,
  CallToolOptions,
  LogLevel,
  LogMessage,
  Root,
} from './types';
import { RootsHandler } from './handlers/roots';
import { ElicitationHandler, type ElicitationHandlerOptions } from './handlers/elicitation';
import { ProgressTracker, type ProgressCallback, type ProgressToken } from './progress';
import { CancellationManager, type RequestId, type CancellableOperation } from './cancellation';
import {
  TaskStatusManager,
  type Task,
  type TaskId,
  type TaskResult,
  type ListTasksResult,
  type TaskStatusCallback,
} from './tasks';

/** Default connection timeout in milliseconds */
const DEFAULT_CONNECTION_TIMEOUT = 30000;

/** Default request timeout in milliseconds */
const DEFAULT_REQUEST_TIMEOUT = 60000;

/** Default client identification */
const DEFAULT_CLIENT_INFO = {
  name: 'dedalus-sdk',
  version: '0.1.0-alpha.8', // TODO: Pull from package.json dynamically
};

/**
 * Options with all defaults resolved.
 */
interface ResolvedOptions {
  clientInfo: { name: string; version: string };
  capabilities: ClientCapabilitiesConfig;
  connectionTimeout: number;
  requestTimeout: number;
}

/**
 * DedalusMCPClient wraps the MCP SDK Client to provide a simplified interface
 * for connecting to MCP servers and consuming their capabilities.
 *
 * @example
 * ```typescript
 * // Connect to a stdio server
 * const client = await DedalusMCPClient.fromStdio({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
 * });
 *
 * // Use the client
 * const capabilities = client.getServerCapabilities();
 * console.log('Server supports tools:', capabilities?.tools);
 *
 * // Clean up
 * await client.close();
 * ```
 */
export class DedalusMCPClient {
  private readonly client: Client;
  private readonly transport: Transport;
  private readonly options: ResolvedOptions;
  private connected = false;
  private rootsHandler?: RootsHandler;
  private elicitationHandler?: ElicitationHandler;

  // Phase 4: Utilities
  private readonly progressTracker = new ProgressTracker();
  private readonly cancellationManager = new CancellationManager();
  private readonly taskStatusManager = new TaskStatusManager();

  /**
   * Private constructor - use static factory methods to create instances.
   */
  private constructor(transport: Transport, options: DedalusMCPClientOptions) {
    this.transport = transport;
    this.options = {
      clientInfo: options.clientInfo ?? DEFAULT_CLIENT_INFO,
      capabilities: options.capabilities ?? {},
      connectionTimeout: options.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
      requestTimeout: options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
    };

    this.client = new Client(this.options.clientInfo, {
      capabilities: this.buildCapabilities(this.options.capabilities),
    });

    // Set up request handlers for client capabilities
    this.setupCapabilityHandlers();

    // Set up notification handlers for progress and tasks
    this.setupNotificationHandlers();
  }

  /**
   * Create and connect to an MCP server via stdio transport.
   *
   * This spawns a subprocess and communicates via stdin/stdout.
   * Suitable for local MCP servers that run as CLI tools.
   *
   * @param options - Stdio transport configuration
   * @returns Connected DedalusMCPClient instance
   * @throws {MCPConnectionError} If connection fails
   * @throws {MCPTimeoutError} If connection times out
   *
   * @example
   * ```typescript
   * const client = await DedalusMCPClient.fromStdio({
   *   command: 'npx',
   *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
   *   env: { DEBUG: 'true' },
   * });
   * ```
   */
  static async fromStdio(options: StdioTransportOptions): Promise<DedalusMCPClient> {
    const transport = createStdioTransport(options);
    const client = new DedalusMCPClient(transport, options);
    await client.connect();
    return client;
  }

  /**
   * Create and connect to an MCP server via HTTP transport.
   *
   * This uses Streamable HTTP with Server-Sent Events for bidirectional
   * communication. Suitable for remote MCP servers running as HTTP services.
   *
   * @param options - HTTP transport configuration
   * @returns Connected DedalusMCPClient instance
   * @throws {MCPConnectionError} If connection fails
   * @throws {MCPTimeoutError} If connection times out
   *
   * @example
   * ```typescript
   * const client = await DedalusMCPClient.fromHTTP({
   *   url: 'http://localhost:3000/mcp',
   *   headers: { Authorization: 'Bearer token' },
   * });
   * ```
   */
  static async fromHTTP(options: HTTPTransportOptions): Promise<DedalusMCPClient> {
    const transport = createHTTPTransport(options);
    // Cast needed due to exactOptionalPropertyTypes strictness in SDK types
    const client = new DedalusMCPClient(transport as Transport, options);
    await client.connect();
    return client;
  }

  /**
   * Connect to the MCP server.
   *
   * This performs the MCP initialization handshake, including:
   * - Sending client capabilities
   * - Receiving server capabilities
   * - Negotiating protocol version
   *
   * @throws {MCPConnectionError} If connection fails
   * @throws {MCPTimeoutError} If connection times out
   */
  private async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new MCPTimeoutError('Connection timed out', this.options.connectionTimeout)),
        this.options.connectionTimeout,
      );
    });

    try {
      await Promise.race([this.client.connect(this.transport), timeoutPromise]);
      this.connected = true;
    } catch (error) {
      if (error instanceof MCPTimeoutError) {
        // Attempt to close the transport on timeout
        try {
          await this.transport.close();
        } catch {
          // Ignore close errors
        }
        throw error;
      }
      throw new MCPConnectionError(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Close the connection to the MCP server.
   *
   * This cleanly shuts down the connection, releasing any resources.
   * Safe to call multiple times (idempotent).
   */
  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }
    try {
      await this.client.close();
    } finally {
      this.connected = false;
      // Clean up Phase 4 managers
      this.progressTracker.clear();
      this.cancellationManager.cancelAll();
      this.taskStatusManager.clear();
    }
  }

  /**
   * Check if the client is currently connected to the server.
   *
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the server's capabilities.
   *
   * Available after successful connection. Returns the capabilities
   * advertised by the server during initialization.
   *
   * @returns Server capabilities or undefined if not connected
   */
  getServerCapabilities(): ServerCapabilities | undefined {
    return this.client.getServerCapabilities();
  }

  /**
   * Get the server's implementation info.
   *
   * Available after successful connection. Returns the server's
   * name and version as reported during initialization.
   *
   * @returns Server implementation info or undefined if not connected
   */
  getServerInfo(): Implementation | undefined {
    return this.client.getServerVersion();
  }

  /**
   * Get the request timeout in milliseconds.
   *
   * @returns Request timeout value
   */
  getRequestTimeout(): number {
    return this.options.requestTimeout;
  }

  /**
   * Get the underlying MCP SDK Client instance.
   *
   * Use this for advanced operations not exposed by DedalusMCPClient.
   * Note: Direct manipulation of the internal client may lead to
   * inconsistent state.
   *
   * @returns The internal MCP SDK Client instance
   */
  getInternalClient(): Client {
    return this.client;
  }

  // ==========================================================================
  // Phase 2: Tools API
  // ==========================================================================

  /**
   * List tools available on the server.
   *
   * @param cursor - Pagination cursor for subsequent requests
   * @returns List of tools and optional next cursor
   * @throws {MCPConnectionError} If not connected
   */
  async listTools(cursor?: string): Promise<ListToolsResult> {
    this.ensureConnected();
    return await this.client.listTools(cursor ? { cursor } : undefined);
  }

  /**
   * List all tools, automatically handling pagination.
   *
   * @returns Array of all tools from the server
   * @throws {MCPConnectionError} If not connected
   */
  async listAllTools(): Promise<Tool[]> {
    const tools: Tool[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.listTools(cursor);
      tools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);

    return tools;
  }

  /**
   * Call a tool by name.
   *
   * @param name - Tool name
   * @param args - Tool arguments (must match tool's inputSchema)
   * @param options - Call options (progress token, etc.)
   * @returns Tool execution result
   * @throws {MCPConnectionError} If not connected
   * @throws {MCPProtocolError} If tool not found or execution fails
   */
  async callTool(
    name: string,
    args?: Record<string, unknown>,
    options?: CallToolOptions,
  ): Promise<CallToolResult> {
    this.ensureConnected();
    const result = await this.client.callTool({
      name,
      arguments: args,
      _meta: options?._meta,
    });
    // Extract CallToolResult fields from the SDK response
    return {
      content: result.content,
      isError: result.isError,
      structuredContent: result.structuredContent,
      _meta: result._meta,
    } as CallToolResult;
  }

  /**
   * Subscribe to tool list changes.
   *
   * @param callback - Called when tool list changes on the server
   * @returns Unsubscribe function
   */
  onToolsChanged(callback: () => void): () => void {
    this.client.setNotificationHandler(
      { method: 'notifications/tools/list_changed' } as any,
      callback,
    );
    return () => {
      this.client.removeNotificationHandler({ method: 'notifications/tools/list_changed' } as any);
    };
  }

  // ==========================================================================
  // Phase 2: Resources API
  // ==========================================================================

  /**
   * List resources available on the server.
   *
   * @param cursor - Pagination cursor for subsequent requests
   * @returns List of resources and optional next cursor
   * @throws {MCPConnectionError} If not connected
   */
  async listResources(cursor?: string): Promise<ListResourcesResult> {
    this.ensureConnected();
    return await this.client.listResources(cursor ? { cursor } : undefined);
  }

  /**
   * List all resources, automatically handling pagination.
   *
   * @returns Array of all resources from the server
   * @throws {MCPConnectionError} If not connected
   */
  async listAllResources(): Promise<Resource[]> {
    const resources: Resource[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.listResources(cursor);
      resources.push(...result.resources);
      cursor = result.nextCursor;
    } while (cursor);

    return resources;
  }

  /**
   * List resource templates (URI patterns) available on the server.
   *
   * @param cursor - Pagination cursor for subsequent requests
   * @returns List of resource templates and optional next cursor
   * @throws {MCPConnectionError} If not connected
   */
  async listResourceTemplates(cursor?: string): Promise<ListResourceTemplatesResult> {
    this.ensureConnected();
    return await this.client.listResourceTemplates(cursor ? { cursor } : undefined);
  }

  /**
   * Read a resource by URI.
   *
   * @param uri - Resource URI
   * @returns Resource content (text or base64-encoded blob)
   * @throws {MCPConnectionError} If not connected
   * @throws {MCPProtocolError} If resource not found
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    this.ensureConnected();
    return await this.client.readResource({ uri });
  }

  /**
   * Subscribe to updates for a specific resource.
   *
   * After subscribing, use `onResourceUpdated` to receive notifications.
   *
   * @param uri - Resource URI to subscribe to
   * @throws {MCPConnectionError} If not connected
   */
  async subscribeToResource(uri: string): Promise<void> {
    this.ensureConnected();
    await this.client.subscribeResource({ uri });
  }

  /**
   * Unsubscribe from updates for a specific resource.
   *
   * @param uri - Resource URI to unsubscribe from
   * @throws {MCPConnectionError} If not connected
   */
  async unsubscribeFromResource(uri: string): Promise<void> {
    this.ensureConnected();
    await this.client.unsubscribeResource({ uri });
  }

  /**
   * Subscribe to resource list changes.
   *
   * @param callback - Called when resource list changes on the server
   * @returns Unsubscribe function
   */
  onResourcesChanged(callback: () => void): () => void {
    this.client.setNotificationHandler(
      { method: 'notifications/resources/list_changed' } as any,
      callback,
    );
    return () => {
      this.client.removeNotificationHandler({ method: 'notifications/resources/list_changed' } as any);
    };
  }

  /**
   * Subscribe to updates for subscribed resources.
   *
   * Note: Must call `subscribeToResource` first to receive updates for specific URIs.
   *
   * @param callback - Called with the URI of the updated resource
   * @returns Unsubscribe function
   */
  onResourceUpdated(callback: (uri: string) => void): () => void {
    this.client.setNotificationHandler(
      { method: 'notifications/resources/updated' } as any,
      (params: any) => callback(params.uri),
    );
    return () => {
      this.client.removeNotificationHandler({ method: 'notifications/resources/updated' } as any);
    };
  }

  // ==========================================================================
  // Phase 2: Prompts API
  // ==========================================================================

  /**
   * List prompts available on the server.
   *
   * @param cursor - Pagination cursor for subsequent requests
   * @returns List of prompts and optional next cursor
   * @throws {MCPConnectionError} If not connected
   */
  async listPrompts(cursor?: string): Promise<ListPromptsResult> {
    this.ensureConnected();
    return await this.client.listPrompts(cursor ? { cursor } : undefined);
  }

  /**
   * List all prompts, automatically handling pagination.
   *
   * @returns Array of all prompts from the server
   * @throws {MCPConnectionError} If not connected
   */
  async listAllPrompts(): Promise<Prompt[]> {
    const prompts: Prompt[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.listPrompts(cursor);
      prompts.push(...result.prompts);
      cursor = result.nextCursor;
    } while (cursor);

    return prompts;
  }

  /**
   * Get a prompt by name with argument substitution.
   *
   * @param name - Prompt name
   * @param args - Arguments to substitute into the prompt
   * @returns Prompt messages with arguments substituted
   * @throws {MCPConnectionError} If not connected
   * @throws {MCPProtocolError} If prompt not found
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    this.ensureConnected();
    return await this.client.getPrompt({ name, arguments: args });
  }

  /**
   * Subscribe to prompt list changes.
   *
   * @param callback - Called when prompt list changes on the server
   * @returns Unsubscribe function
   */
  onPromptsChanged(callback: () => void): () => void {
    this.client.setNotificationHandler(
      { method: 'notifications/prompts/list_changed' } as any,
      callback,
    );
    return () => {
      this.client.removeNotificationHandler({ method: 'notifications/prompts/list_changed' } as any);
    };
  }

  // ==========================================================================
  // Phase 2: Completions API
  // ==========================================================================

  /**
   * Get completion suggestions for a prompt argument.
   *
   * @param promptName - Name of the prompt
   * @param argumentName - Name of the argument to complete
   * @param argumentValue - Current value of the argument
   * @param context - Other argument values for context
   * @returns Completion suggestions
   * @throws {MCPConnectionError} If not connected
   */
  async completePromptArgument(
    promptName: string,
    argumentName: string,
    argumentValue: string,
    context?: Record<string, string>,
  ): Promise<CompleteResult> {
    this.ensureConnected();
    return await this.client.complete({
      ref: { type: 'ref/prompt', name: promptName },
      argument: { name: argumentName, value: argumentValue },
      context: context ? { arguments: context } : undefined,
    });
  }

  /**
   * Get completion suggestions for a resource URI argument.
   *
   * @param uriTemplate - URI template pattern
   * @param argumentName - Name of the argument to complete
   * @param argumentValue - Current value of the argument
   * @returns Completion suggestions
   * @throws {MCPConnectionError} If not connected
   */
  async completeResourceArgument(
    uriTemplate: string,
    argumentName: string,
    argumentValue: string,
  ): Promise<CompleteResult> {
    this.ensureConnected();
    return await this.client.complete({
      ref: { type: 'ref/resource', uri: uriTemplate },
      argument: { name: argumentName, value: argumentValue },
    });
  }

  // ==========================================================================
  // Phase 2: Logging API
  // ==========================================================================

  /**
   * Set the server's logging level.
   *
   * @param level - Minimum log level to receive
   * @throws {MCPConnectionError} If not connected
   */
  async setLogLevel(level: LogLevel): Promise<void> {
    this.ensureConnected();
    await this.client.setLoggingLevel(level as LoggingLevel);
  }

  /**
   * Subscribe to log messages from the server.
   *
   * @param callback - Called for each log message received
   * @returns Unsubscribe function
   */
  onLogMessage(callback: (message: LogMessage) => void): () => void {
    this.client.setNotificationHandler(
      { method: 'notifications/message' } as any,
      (params: any) => callback(params as LogMessage),
    );
    return () => {
      this.client.removeNotificationHandler({ method: 'notifications/message' } as any);
    };
  }

  // ==========================================================================
  // Phase 3: Roots Management
  // ==========================================================================

  /**
   * Get the current list of roots.
   *
   * Only available if roots capability was configured.
   *
   * @returns Array of roots, or undefined if roots not enabled
   */
  getRoots(): Root[] | undefined {
    return this.rootsHandler?.getRoots();
  }

  /**
   * Replace all roots with a new list.
   *
   * This will trigger a roots/list_changed notification to the server.
   *
   * @param roots - New roots to set
   * @throws {Error} If roots capability not enabled
   */
  setRoots(roots: Root[]): void {
    if (!this.rootsHandler) {
      throw new Error('Roots capability not enabled for this client');
    }
    this.rootsHandler.setRoots(roots);
  }

  /**
   * Add a root to the list.
   *
   * This will trigger a roots/list_changed notification to the server.
   *
   * @param root - Root to add
   * @throws {Error} If roots capability not enabled
   */
  addRoot(root: Root): void {
    if (!this.rootsHandler) {
      throw new Error('Roots capability not enabled for this client');
    }
    this.rootsHandler.addRoot(root);
  }

  /**
   * Remove a root by URI.
   *
   * This will trigger a roots/list_changed notification to the server.
   *
   * @param uri - URI of the root to remove
   * @returns true if root was removed, false if not found
   * @throws {Error} If roots capability not enabled
   */
  removeRoot(uri: string): boolean {
    if (!this.rootsHandler) {
      throw new Error('Roots capability not enabled for this client');
    }
    return this.rootsHandler.removeRoot(uri);
  }

  // ==========================================================================
  // Phase 4: Ping
  // ==========================================================================

  /**
   * Send a ping to the server to check connection health.
   *
   * @returns Promise that resolves when pong is received
   * @throws {MCPConnectionError} If not connected
   * @throws {MCPTimeoutError} If server doesn't respond
   */
  async ping(): Promise<void> {
    this.ensureConnected();
    await this.client.request({ method: 'ping' } as any, {} as any);
  }

  // ==========================================================================
  // Phase 4: Progress Tracking
  // ==========================================================================

  /**
   * Call a tool with progress tracking.
   *
   * Progress callbacks receive updates during long-running operations
   * if the server supports progress notifications.
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param onProgress - Callback for progress updates
   * @returns Tool result
   * @throws {MCPConnectionError} If not connected
   *
   * @example
   * ```typescript
   * const result = await client.callToolWithProgress(
   *   'process_file',
   *   { path: '/data/large.csv' },
   *   (progress) => {
   *     const percent = progress.total
   *       ? Math.round((progress.progress / progress.total) * 100)
   *       : progress.progress;
   *     console.log(`Progress: ${percent}%`);
   *   },
   * );
   * ```
   */
  async callToolWithProgress(
    name: string,
    args: Record<string, unknown> | undefined,
    onProgress: ProgressCallback,
  ): Promise<CallToolResult> {
    this.ensureConnected();
    const token = this.progressTracker.generateToken();
    this.progressTracker.register(token, onProgress);

    try {
      return await this.callTool(name, args, { _meta: { progressToken: token } });
    } finally {
      this.progressTracker.unregister(token);
    }
  }

  /**
   * Read a resource with progress tracking.
   *
   * Progress callbacks receive updates during large resource reads
   * if the server supports progress notifications.
   *
   * @param uri - Resource URI
   * @param onProgress - Callback for progress updates
   * @returns Resource contents
   * @throws {MCPConnectionError} If not connected
   */
  async readResourceWithProgress(
    uri: string,
    onProgress: ProgressCallback,
  ): Promise<ReadResourceResult> {
    this.ensureConnected();
    const token = this.progressTracker.generateToken();
    this.progressTracker.register(token, onProgress);

    try {
      return await this.client.readResource({ uri, _meta: { progressToken: token } } as any);
    } finally {
      this.progressTracker.unregister(token);
    }
  }

  // ==========================================================================
  // Phase 4: Request Cancellation
  // ==========================================================================

  /**
   * Call a tool with cancellation support.
   *
   * Returns an object with the result promise and a cancel function.
   * Calling cancel() will abort the request and notify the server.
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Object with promise, cancel function, and requestId
   *
   * @example
   * ```typescript
   * const { promise, cancel, requestId } = client.callToolCancellable(
   *   'long_operation',
   *   { input: data },
   * );
   *
   * // Set timeout
   * const timeout = setTimeout(() => cancel(), 30000);
   *
   * try {
   *   const result = await promise;
   *   clearTimeout(timeout);
   * } catch (error) {
   *   clearTimeout(timeout);
   * }
   * ```
   */
  callToolCancellable(
    name: string,
    args?: Record<string, unknown>,
  ): CancellableOperation<CallToolResult> {
    const requestId = this.cancellationManager.generateRequestId();
    this.cancellationManager.create(requestId);

    const promise = (async () => {
      this.ensureConnected();
      try {
        const result = await this.callTool(name, args);
        this.cancellationManager.complete(requestId);
        return result;
      } catch (error) {
        this.cancellationManager.complete(requestId);
        throw error;
      }
    })();

    const cancel = () => {
      if (this.cancellationManager.cancel(requestId)) {
        // Send cancellation notification to server
        this.client.notification({
          method: 'notifications/cancelled',
          params: { requestId, reason: 'User cancelled' },
        } as any);
      }
    };

    return { promise, cancel, requestId };
  }

  /**
   * Cancel a specific request by ID.
   *
   * @param requestId - ID of the request to cancel
   * @param reason - Optional reason for cancellation
   */
  cancelRequest(requestId: RequestId, reason?: string): void {
    if (this.cancellationManager.cancel(requestId)) {
      this.client.notification({
        method: 'notifications/cancelled',
        params: { requestId, reason },
      } as any);
    }
  }

  // ==========================================================================
  // Phase 4: Tasks (Experimental)
  // ==========================================================================

  /**
   * Get a task by ID.
   *
   * @param taskId - Task identifier
   * @returns Task information
   * @throws {MCPConnectionError} If not connected
   */
  async getTask(taskId: TaskId): Promise<Task> {
    this.ensureConnected();
    return this.client.request(
      { method: 'tasks/get', params: { id: taskId } } as any,
      {} as any,
    );
  }

  /**
   * Get a task's result.
   *
   * This will block until the task completes if it's still running.
   *
   * @param taskId - Task identifier
   * @param pollInterval - Polling interval in ms (if server doesn't support blocking)
   * @returns Task result
   * @throws {MCPConnectionError} If not connected
   */
  async getTaskResult<T = unknown>(taskId: TaskId, pollInterval?: number): Promise<TaskResult<T>> {
    this.ensureConnected();
    return this.client.request(
      {
        method: 'tasks/result',
        params: { id: taskId, pollInterval },
      } as any,
      {} as any,
    );
  }

  /**
   * List all tasks.
   *
   * @param cursor - Pagination cursor for next page
   * @returns List of tasks and optional next cursor
   * @throws {MCPConnectionError} If not connected
   */
  async listTasks(cursor?: string): Promise<ListTasksResult> {
    this.ensureConnected();
    return this.client.request(
      { method: 'tasks/list', params: cursor ? { cursor } : {} } as any,
      {} as any,
    );
  }

  /**
   * Cancel a task.
   *
   * @param taskId - Task identifier
   * @throws {MCPConnectionError} If not connected
   */
  async cancelTask(taskId: TaskId): Promise<void> {
    this.ensureConnected();
    await this.client.request(
      { method: 'tasks/cancel', params: { id: taskId } } as any,
      {} as any,
    );
  }

  /**
   * Subscribe to task status changes.
   *
   * @param taskId - Task identifier
   * @param callback - Called when task status changes
   * @returns Unsubscribe function
   */
  onTaskStatus(taskId: TaskId, callback: TaskStatusCallback): () => void {
    return this.taskStatusManager.subscribe(taskId, callback);
  }

  /**
   * Call a tool as a background task.
   *
   * This requires server support for the experimental tasks system.
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Task identifier for tracking
   * @throws {MCPConnectionError} If not connected
   * @throws {Error} If server doesn't support tasks
   *
   * @example
   * ```typescript
   * const taskId = await client.callToolAsTask('batch_process', { items: data });
   *
   * // Monitor progress
   * const unsubscribe = client.onTaskStatus(taskId, (task) => {
   *   console.log(`Task ${task.state}: ${task.message ?? ''}`);  
   * });
   *
   * // Wait for completion
   * const result = await client.getTaskResult(taskId);
   * unsubscribe();
   * ```
   */
  async callToolAsTask(name: string, args?: Record<string, unknown>): Promise<TaskId> {
    this.ensureConnected();
    const result = await this.client.request(
      {
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          _meta: { task: true },
        },
      } as any,
      {} as any,
    );
    return (result as any)._meta?.taskId ?? (result as any).taskId;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Ensure the client is connected before making requests.
   * @throws {MCPConnectionError} If not connected
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new MCPConnectionError('Not connected to MCP server. Call connect() first.');
    }
  }

  /**
   * Build the client capabilities object for the MCP handshake.
   */
  private buildCapabilities(config: ClientCapabilitiesConfig): Record<string, unknown> {
    const capabilities: Record<string, unknown> = {};

    // Sampling capability
    if (config.sampling) {
      capabilities['sampling'] = {};
    }

    // Roots capability
    if (config.roots) {
      capabilities['roots'] = {
        listChanged: config.roots.listChanged ?? true,
      };
    }

    // Elicitation capability
    if (config.elicitation) {
      capabilities['elicitation'] = {
        form: !!config.elicitation.formHandler,
        url: !!config.elicitation.urlHandler,
      };
    }

    return capabilities;
  }

  /**
   * Set up request handlers for client capabilities.
   *
   * These handlers respond to requests from the server for capabilities
   * the client has advertised (sampling, roots, elicitation).
   */
  private setupCapabilityHandlers(): void {
    const { capabilities } = this.options;

    // Set up sampling handler
    if (capabilities.sampling?.handler) {
      const handler = capabilities.sampling.handler;
      this.client.setRequestHandler(
        { method: 'sampling/createMessage' } as any,
        async (request: any) => {
          return await handler(request.params);
        },
      );
    }

    // Set up roots handler with dynamic management
    if (capabilities.roots) {
      this.rootsHandler = new RootsHandler({ roots: capabilities.roots.roots });

      this.client.setRequestHandler(
        { method: 'roots/list' } as any,
        async (): Promise<any> => {
          return this.rootsHandler!.handleList();
        },
      );

      // Emit notifications when roots change (if listChanged enabled)
      if (capabilities.roots.listChanged !== false) {
        this.rootsHandler.onRootsChanged(() => {
          if (this.connected) {
            this.client.notification({ method: 'notifications/roots/list_changed' } as any);
          }
        });
      }
    }

    // Set up elicitation handler
    if (capabilities.elicitation) {
      const formHandler = capabilities.elicitation.formHandler;
      const urlHandler = capabilities.elicitation.urlHandler;

      const handlerOptions: ElicitationHandlerOptions = {};
      if (formHandler) {
        handlerOptions.formHandler = async (req) => {
          const result = await formHandler(req);
          return result.content
            ? { action: result.action, content: result.content }
            : { action: result.action };
        };
      }
      if (urlHandler) {
        handlerOptions.urlHandler = async (req) => {
          const result = await urlHandler(req);
          return { action: result.action };
        };
      }

      this.elicitationHandler = new ElicitationHandler(handlerOptions);

      this.client.setRequestHandler(
        { method: 'elicitation/create' } as any,
        async (request: any): Promise<any> => {
          return this.elicitationHandler!.handleElicitation({
            requestId: request.params.requestId ?? 'unknown',
            content: request.params.content ?? request.params,
          });
        },
      );
    }
  }

  /**
   * Set up notification handlers for progress and task status.
   *
   * These handlers dispatch incoming notifications from the server
   * to registered callbacks.
   */
  private setupNotificationHandlers(): void {
    // Handle progress notifications
    this.client.setNotificationHandler(
      { method: 'notifications/progress' } as any,
      (params: any) => {
        this.progressTracker.handleProgress({
          progressToken: params.progressToken,
          progress: params.progress,
          total: params.total,
          message: params.message,
        });
      },
    );

    // Handle task status notifications
    this.client.setNotificationHandler(
      { method: 'notifications/tasks/status' } as any,
      (params: any) => {
        if (params.task) {
          this.taskStatusManager.handleStatus(params.task);
        }
      },
    );
  }

  // ==========================================================================
  // Phase 6: Convenience Constructors
  // ==========================================================================

  /**
   * Create client for the official filesystem MCP server.
   *
   * Provides tools for reading, writing, and managing files within
   * the specified allowed directories.
   *
   * @param allowedDirectories - Directories the server can access
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const fs = await DedalusMCPClient.filesystem(['/home/user/project', '/tmp']);
   * const files = await fs.listAllResources();
   * ```
   */
  static async filesystem(
    allowedDirectories: string[],
    options?: Omit<StdioTransportOptions, 'command' | 'args'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedDirectories],
    });
  }

  /**
   * Create client for the official GitHub MCP server.
   *
   * Provides tools for interacting with GitHub repositories,
   * issues, pull requests, and more.
   *
   * @param token - GitHub personal access token
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const gh = await DedalusMCPClient.github(process.env.GITHUB_TOKEN!);
   * const issues = await gh.callTool('list_issues', { repo: 'owner/repo' });
   * ```
   */
  static async github(
    token: string,
    options?: Omit<StdioTransportOptions, 'command' | 'args' | 'env'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
    });
  }

  /**
   * Create client for the official Git MCP server.
   *
   * Provides tools for Git operations like log, diff, status,
   * commit, etc. within a repository.
   *
   * @param repoPath - Path to the git repository
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const git = await DedalusMCPClient.git('/home/user/project');
   * const log = await git.callTool('git_log', { maxCount: 10 });
   * ```
   */
  static async git(
    repoPath: string,
    options?: Omit<StdioTransportOptions, 'command' | 'args'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git', repoPath],
    });
  }

  /**
   * Create client for the official Puppeteer MCP server.
   *
   * Provides tools for browser automation, web scraping,
   * and screenshot capture.
   *
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const browser = await DedalusMCPClient.puppeteer();
   * const result = await browser.callTool('puppeteer_navigate', {
   *   url: 'https://example.com'
   * });
   * ```
   */
  static async puppeteer(
    options?: Omit<StdioTransportOptions, 'command' | 'args'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    });
  }

  /**
   * Create client for the official Brave Search MCP server.
   *
   * Provides tools for web search using the Brave Search API.
   *
   * @param apiKey - Brave Search API key
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const search = await DedalusMCPClient.braveSearch(process.env.BRAVE_API_KEY!);
   * const results = await search.callTool('brave_search', {
   *   query: 'TypeScript MCP servers'
   * });
   * ```
   */
  static async braveSearch(
    apiKey: string,
    options?: Omit<StdioTransportOptions, 'command' | 'args' | 'env'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: apiKey },
    });
  }

  /**
   * Create client for a custom npm package MCP server.
   *
   * Uses npx to run any npm-published MCP server package.
   *
   * @param packageName - npm package name (e.g., '@org/mcp-server-custom')
   * @param args - Additional arguments to pass to the server
   * @param options - Additional client options
   * @returns Connected client
   *
   * @example
   * ```typescript
   * const custom = await DedalusMCPClient.fromNpmPackage(
   *   '@myorg/mcp-server-database',
   *   ['--connection-string', 'postgres://localhost/db'],
   * );
   * ```
   */
  static async fromNpmPackage(
    packageName: string,
    args: string[] = [],
    options?: Omit<StdioTransportOptions, 'command' | 'args'>,
  ): Promise<DedalusMCPClient> {
    return DedalusMCPClient.fromStdio({
      ...options,
      command: 'npx',
      args: ['-y', packageName, ...args],
    });
  }
}
