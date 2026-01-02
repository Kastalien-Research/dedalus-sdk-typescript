// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Type definitions for the Dedalus MCP Client.
 *
 * Re-exports types from @modelcontextprotocol/sdk and defines Dedalus-specific extensions.
 */

// Re-exports from @modelcontextprotocol/sdk
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
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Client Options
// ============================================================================

/**
 * Base options for creating a DedalusMCPClient.
 */
export interface DedalusMCPClientOptions {
  /**
   * Client identification sent during initialization.
   * Defaults to { name: 'dedalus-sdk', version: '<package version>' }
   */
  clientInfo?: {
    name: string;
    version: string;
  };

  /**
   * Client capabilities to advertise to the server.
   */
  capabilities?: ClientCapabilitiesConfig;

  /**
   * Connection timeout in milliseconds.
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Request timeout in milliseconds.
   * @default 60000
   */
  requestTimeout?: number;
}

/**
 * Options for creating a stdio transport to a local MCP server.
 */
export interface StdioTransportOptions extends DedalusMCPClientOptions {
  /** Command to execute */
  command: string;

  /** Arguments to pass to the command */
  args?: string[];

  /** Environment variables to set for the process */
  env?: Record<string, string>;

  /** Working directory for the process */
  cwd?: string;
}

/**
 * Options for creating an HTTP transport to a remote MCP server.
 */
export interface HTTPTransportOptions extends DedalusMCPClientOptions {
  /** URL of the MCP server endpoint */
  url: string;

  /** HTTP headers to include in requests */
  headers?: Record<string, string>;
}

// ============================================================================
// Capability Configuration
// ============================================================================

/**
 * Configuration for client capabilities to advertise to servers.
 */
export interface ClientCapabilitiesConfig {
  /** Configuration for sampling capability */
  sampling?: SamplingCapabilityConfig;

  /** Configuration for roots capability */
  roots?: RootsCapabilityConfig;

  /** Configuration for elicitation capability */
  elicitation?: ElicitationCapabilityConfig;
}

/**
 * Configuration for the sampling capability.
 * When enabled, servers can request LLM completions from the client.
 */
export interface SamplingCapabilityConfig {
  /** Handler for sampling requests from server */
  handler: SamplingHandler;

  /**
   * Enable tool use within sampling.
   * @default false
   */
  tools?: boolean;
}

/**
 * Configuration for the roots capability.
 * When enabled, servers can query filesystem boundaries.
 */
export interface RootsCapabilityConfig {
  /** Initial list of roots to advertise */
  roots: Root[];

  /**
   * Enable list_changed notifications when roots change.
   * @default true
   */
  listChanged?: boolean;
}

/**
 * Configuration for the elicitation capability.
 * When enabled, servers can request user input.
 */
export interface ElicitationCapabilityConfig {
  /** Handler for form-based elicitation requests */
  formHandler?: FormElicitationHandler;

  /** Handler for URL-based elicitation requests */
  urlHandler?: URLElicitationHandler;
}

// ============================================================================
// Root Types
// ============================================================================

/**
 * A root directory that the server can access.
 */
export interface Root {
  /** URI of the root (e.g., file:///home/user/project) */
  uri: string;

  /** Human-readable name for the root */
  name?: string;
}

// ============================================================================
// Handler Types
// ============================================================================

// Note: CreateMessageRequest and CreateMessageResult are re-exported above

/**
 * Handler for sampling requests from an MCP server.
 * Called when a server requests an LLM completion via sampling/createMessage.
 */
export type SamplingHandler = (
  request: CreateMessageRequest,
) => Promise<CreateMessageResult>;

/**
 * Request for form-based elicitation.
 */
export interface FormElicitationRequest {
  /** Title of the form */
  title?: string;

  /** Description of what information is being requested */
  description?: string;

  /** JSON Schema defining the form fields */
  schema: Record<string, unknown>;

  /** Default values for form fields */
  defaults?: Record<string, unknown>;
}

/**
 * Request for URL-based elicitation.
 */
export interface URLElicitationRequest {
  /** URL to open for the user */
  url: string;

  /** Human-readable description of why this URL needs to be opened */
  description?: string;
}

/**
 * Result of an elicitation request.
 */
export interface ElicitationResult {
  /** Action taken by the user */
  action: 'accept' | 'decline' | 'cancel';

  /** Content returned by the user (for accept action) */
  content?: Record<string, unknown>;
}

/**
 * Handler for form-based elicitation requests.
 */
export type FormElicitationHandler = (
  request: FormElicitationRequest,
) => Promise<ElicitationResult>;

/**
 * Handler for URL-based elicitation requests.
 */
export type URLElicitationHandler = (
  request: URLElicitationRequest,
) => Promise<ElicitationResult>;

// ============================================================================
// Tool Call Types
// ============================================================================

/**
 * Content returned from a tool call.
 */
export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

/**
 * Result of calling a tool (legacy type, use CallToolResult from SDK).
 */
export interface ToolCallResultLegacy {
  /** Content returned by the tool */
  content: ToolResultContent[];

  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

// ============================================================================
// Phase 2: Server Feature Types
// ============================================================================

/**
 * Options for calling a tool.
 */
export interface CallToolOptions {
  /**
   * Meta fields for the request.
   */
  _meta?: {
    /** Progress token for tracking long-running operations */
    progressToken?: string | number;
  };
}

/**
 * Log levels supported by MCP servers.
 * Follows syslog severity levels.
 */
export type LogLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

/**
 * A log message received from an MCP server.
 */
export interface LogMessage {
  /** Severity level of the log message */
  level: LogLevel;

  /** Optional logger name/category */
  logger?: string;

  /** Log message data (can be any JSON-serializable value) */
  data: unknown;
}

/**
 * Options for request operations.
 */
export interface RequestOptions {
  /**
   * Timeout for the request in milliseconds.
   * If not specified, uses the client's default request timeout.
   */
  timeout?: number;

  /**
   * AbortSignal for cancelling the request.
   */
  signal?: AbortSignal;
}
