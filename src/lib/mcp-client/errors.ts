// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Error classes for MCP client operations.
 */

/**
 * Base class for all MCP errors.
 */
export class MCPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Connection-related errors (failed to connect, disconnected unexpectedly).
 */
export class MCPConnectionError extends MCPError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'MCPConnectionError';
  }
}

/**
 * Timeout errors for connection or requests.
 */
export class MCPTimeoutError extends MCPError {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'MCPTimeoutError';
  }
}

/**
 * Protocol-level errors (JSON-RPC errors from server).
 */
export class MCPProtocolError extends MCPError {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'MCPProtocolError';
  }
}

/**
 * Standard MCP error codes from the JSON-RPC 2.0 spec and MCP extensions.
 */
export const MCPErrorCodes = {
  /** Invalid JSON was received by the server */
  ParseError: -32700,

  /** The JSON sent is not a valid Request object */
  InvalidRequest: -32600,

  /** The method does not exist / is not available */
  MethodNotFound: -32601,

  /** Invalid method parameter(s) */
  InvalidParams: -32602,

  /** Internal JSON-RPC error */
  InternalError: -32603,

  /** The requested resource was not found */
  ResourceNotFound: -32002,

  /** URL elicitation is required to complete the operation */
  URLElicitationRequired: -32042,

  /** The user rejected the request */
  UserRejected: -1,
} as const;

/**
 * Type for MCP error codes.
 */
export type MCPErrorCode = (typeof MCPErrorCodes)[keyof typeof MCPErrorCodes];

/**
 * Creates an MCPProtocolError from an error code and optional message.
 */
export function createProtocolError(
  code: MCPErrorCode,
  message?: string,
  data?: unknown,
): MCPProtocolError {
  const defaultMessages: Record<MCPErrorCode, string> = {
    [MCPErrorCodes.ParseError]: 'Parse error',
    [MCPErrorCodes.InvalidRequest]: 'Invalid request',
    [MCPErrorCodes.MethodNotFound]: 'Method not found',
    [MCPErrorCodes.InvalidParams]: 'Invalid params',
    [MCPErrorCodes.InternalError]: 'Internal error',
    [MCPErrorCodes.ResourceNotFound]: 'Resource not found',
    [MCPErrorCodes.URLElicitationRequired]: 'URL elicitation required',
    [MCPErrorCodes.UserRejected]: 'User rejected',
  };

  return new MCPProtocolError(
    message ?? defaultMessages[code] ?? 'Unknown error',
    code,
    data,
  );
}
