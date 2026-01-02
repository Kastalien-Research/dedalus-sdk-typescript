// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Transport factory helpers for creating MCP client transports.
 */

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StdioTransportOptions, HTTPTransportOptions } from './types';

/**
 * Create a stdio transport for connecting to local MCP servers.
 *
 * Stdio transports spawn a subprocess and communicate via stdin/stdout.
 * This is the standard way to connect to MCP servers that run as CLI tools.
 *
 * @param options - Configuration for the stdio transport
 * @returns A StdioClientTransport instance
 *
 * @example
 * ```typescript
 * const transport = createStdioTransport({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
 * });
 * ```
 */
export function createStdioTransport(options: StdioTransportOptions): StdioClientTransport {
  // Filter out undefined values from env to satisfy strict typing
  const env: Record<string, string> = {};
  if (process.env) {
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      env[key] = value;
    }
  }

  const params: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  } = {
    command: options.command,
  };

  if (options.args) {
    params.args = options.args;
  }
  if (Object.keys(env).length > 0) {
    params.env = env;
  }
  if (options.cwd) {
    params.cwd = options.cwd;
  }

  return new StdioClientTransport(params);
}

/**
 * Create an HTTP transport for connecting to remote MCP servers.
 *
 * HTTP transports use Streamable HTTP with Server-Sent Events (SSE) for
 * bidirectional communication. This is used to connect to MCP servers
 * running as HTTP services.
 *
 * @param options - Configuration for the HTTP transport
 * @returns A StreamableHTTPClientTransport instance
 *
 * @example
 * ```typescript
 * const transport = createHTTPTransport({
 *   url: 'http://localhost:3000/mcp',
 *   headers: { Authorization: 'Bearer token' },
 * });
 * ```
 */
export function createHTTPTransport(options: HTTPTransportOptions): StreamableHTTPClientTransport {
  const requestInit: RequestInit = {};
  if (options.headers) {
    requestInit.headers = options.headers;
  }

  return new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit,
  });
}
