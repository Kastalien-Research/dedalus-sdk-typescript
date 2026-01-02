// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * MCP Client for Dedalus SDK
 *
 * This module provides a full-featured Model Context Protocol (MCP) client
 * implementation for the Dedalus TypeScript SDK. It enables connecting to
 * arbitrary MCP servers and consuming all MCP primitives.
 *
 * @example
 * ```typescript
 * import { DedalusMCPClient } from 'dedalus-labs/mcp-client';
 *
 * // Connect to a stdio server
 * const client = await DedalusMCPClient.fromStdio({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
 * });
 *
 * // Check server capabilities
 * const capabilities = client.getServerCapabilities();
 *
 * // Clean up
 * await client.close();
 * ```
 *
 * @module
 */

// =============================================================================
// Client
// =============================================================================

export { DedalusMCPClient } from './client';

// =============================================================================
// Types
// =============================================================================

export type {
  // Client options
  DedalusMCPClientOptions,
  StdioTransportOptions,
  HTTPTransportOptions,

  // Capability configuration
  ClientCapabilitiesConfig,
  SamplingCapabilityConfig,
  RootsCapabilityConfig,
  ElicitationCapabilityConfig,

  // Root types
  Root,

  // Handler types
  SamplingHandler,
  FormElicitationHandler,
  URLElicitationHandler,
  FormElicitationRequest,
  URLElicitationRequest,
  ElicitationResult,

  // Tool result types
  ToolResultContent,

  // Phase 2: Server feature types
  CallToolOptions,
  LogLevel,
  LogMessage,
  RequestOptions,
} from './types';

// Re-export useful MCP SDK types for convenience
export type {
  Tool,
  Resource,
  ResourceTemplate,
  ResourceContents,
  Prompt,
  PromptArgument,
  PromptMessage,
  TextContent,
  ImageContent,
  AudioContent,
  EmbeddedResource,
  ServerCapabilities,
  ClientCapabilities,
  Implementation,
  LoggingLevel,
  CreateMessageRequest,
  CreateMessageResult,
  SamplingMessage,
  ModelPreferences,
  ModelHint,
  // Phase 2: Result types
  ListToolsResult,
  CallToolResult,
  ListResourcesResult,
  ReadResourceResult,
  ListResourceTemplatesResult,
  ListPromptsResult,
  GetPromptResult,
  CompleteResult,
} from './types';

// =============================================================================
// Errors
// =============================================================================

export {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPErrorCodes,
  createProtocolError,
} from './errors';

export type { MCPErrorCode } from './errors';

// =============================================================================
// Phase 3: Handlers
// =============================================================================

// Sampling handlers
export { createSamplingHandler, createSamplingWithToolsHandler } from './handlers/sampling';
export type { SamplingHandlerOptions, SamplingWithToolsOptions } from './handlers/sampling';

// Roots handler
export { RootsHandler } from './handlers/roots';
export type { RootsHandlerOptions, ListRootsResult } from './handlers/roots';

// Elicitation handler
export { ElicitationHandler } from './handlers/elicitation';
export type {
  ElicitationHandlerOptions,
  ElicitationAction,
  FormElicitationResult,
  URLElicitationResult,
} from './handlers/elicitation';

// =============================================================================
// Phase 4: Utilities
// =============================================================================

// Progress tracking
export { ProgressTracker } from './progress';
export type {
  ProgressToken,
  ProgressInfo,
  ProgressCallback,
  ProgressNotification,
} from './progress';

// Request cancellation
export { CancellationManager } from './cancellation';
export type { RequestId, CancellableOperation } from './cancellation';

// Tasks (experimental)
export {
  TaskTimeoutError,
  TaskAbortedError,
  TaskStatusManager,
  waitForTask,
} from './tasks';
export type {
  TaskId,
  TaskState,
  Task,
  TaskResult,
  ListTasksResult,
  TaskStatusCallback,
  WaitForTaskOptions,
  TaskCapableClient,
} from './tasks';

// =============================================================================
// Phase 6: High-Level API
// =============================================================================

// Client manager
export { MCPClientManager } from './manager';
export type {
  MCPConfig,
  MCPServerConfig,
  MCPClientManagerOptions,
} from './manager';

// Configuration utilities
export {
  CONFIG_LOCATIONS,
  loadMCPConfig,
  loadClaudeDesktopConfig,
  validateMCPConfig,
  createMCPConfig,
  mergeMCPConfigs,
  getClaudeDesktopConfigPath,
} from './config';
