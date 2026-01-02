// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * MCP integration utilities for DedalusRunner.
 *
 * Provides tool aggregation, routing, and resource context gathering
 * for integrating MCP servers with the DedalusRunner.
 */

import type { DedalusMCPClient } from '../mcp-client/client';
import type { Tool as MCPTool, CallToolResult } from '../mcp-client/types';

/**
 * Information about an MCP tool including its source client.
 */
export interface MCPToolInfo {
  /** Original tool from MCP server */
  tool: MCPTool;

  /** Client that provides this tool */
  client: DedalusMCPClient;

  /** Server name (for namespacing) */
  serverName: string;

  /** Original tool name (without namespace) */
  originalName: string;
}

/**
 * Resource context gathered from MCP servers.
 */
export interface ResourceContext {
  /** Resource URI */
  uri: string;

  /** Resource content as text */
  content: string;

  /** MIME type of the content */
  mimeType?: string;
}

/**
 * Aggregate tools from multiple MCP clients.
 *
 * Tools are namespaced by server name to avoid collisions when
 * multiple servers provide tools with the same name.
 *
 * @param clients - MCP clients to gather tools from
 * @returns Map of namespaced tool names to tool info
 *
 * @example
 * ```typescript
 * const toolMap = await aggregateMCPTools([fsClient, gitClient]);
 * // toolMap contains:
 * // "filesystem.read_file" -> MCPToolInfo
 * // "git.commit" -> MCPToolInfo
 * ```
 */
export async function aggregateMCPTools(
  clients: DedalusMCPClient[],
): Promise<Map<string, MCPToolInfo>> {
  const toolMap = new Map<string, MCPToolInfo>();

  for (const client of clients) {
    const serverInfo = client.getServerInfo();
    const serverName = serverInfo?.name ?? 'unknown';

    // Get all tools from this client
    const tools = await client.listAllTools();

    for (const tool of tools) {
      // Namespace tool name: "server_name.tool_name"
      const namespacedName = `${serverName}.${tool.name}`;

      toolMap.set(namespacedName, {
        tool: {
          ...tool,
          name: namespacedName,
          description: `[${serverName}] ${tool.description ?? ''}`,
        },
        client,
        serverName,
        originalName: tool.name,
      });
    }
  }

  return toolMap;
}

/**
 * Convert MCP tools to Dedalus chat completion tool format.
 *
 * @param toolMap - Map of MCP tools
 * @returns Array of tools in Dedalus format
 */
export function mcpToolsToDedalusFormat(
  toolMap: Map<string, MCPToolInfo>,
): Array<{
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}> {
  return Array.from(toolMap.values()).map(({ tool }) => {
    const fn: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    } = {
      name: tool.name,
    };

    if (tool.description !== undefined) {
      fn.description = tool.description;
    }

    if (tool.inputSchema !== undefined) {
      fn.parameters = tool.inputSchema as Record<string, unknown>;
    }

    return {
      type: 'function' as const,
      function: fn,
    };
  });
}

/**
 * Route a tool call to the appropriate MCP client.
 *
 * @param toolName - Namespaced tool name
 * @param args - Tool arguments
 * @param toolMap - Map of MCP tools
 * @returns Tool result as a string
 * @throws Error if tool is not found
 *
 * @example
 * ```typescript
 * const result = await routeMCPToolCall(
 *   'filesystem.read_file',
 *   { path: '/tmp/test.txt' },
 *   toolMap
 * );
 * ```
 */
export async function routeMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
  toolMap: Map<string, MCPToolInfo>,
): Promise<string> {
  const toolInfo = toolMap.get(toolName);
  if (!toolInfo) {
    throw new Error(`Unknown MCP tool: ${toolName}`);
  }

  // Use the original tool name (without namespace) for the actual call
  const result = await toolInfo.client.callTool(toolInfo.originalName, args);

  // Convert result to string for chat completion
  return formatToolResult(result);
}

/**
 * Check if a tool name is an MCP tool (exists in the tool map).
 *
 * @param toolName - Tool name to check
 * @param toolMap - Map of MCP tools
 * @returns true if the tool is an MCP tool
 */
export function isMCPTool(
  toolName: string,
  toolMap: Map<string, MCPToolInfo>,
): boolean {
  return toolMap.has(toolName);
}

/**
 * Format a tool call result for inclusion in chat messages.
 */
function formatToolResult(result: CallToolResult): string {
  if (result.isError) {
    return `Error: ${extractText(result.content)}`;
  }

  // If structured content is available, return as JSON
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  return extractText(result.content);
}

/**
 * Extract text content from MCP tool result content array.
 */
function extractText(
  content: CallToolResult['content'],
): string {
  if (!content || !Array.isArray(content)) {
    return '';
  }

  return content
    .map((c) => {
      if ('text' in c && c.type === 'text') return c.text;
      if ('data' in c && c.type === 'image') return `[Image: ${(c as any).mimeType ?? 'unknown'}]`;
      if ('data' in c && c.type === 'audio') return `[Audio: ${(c as any).mimeType ?? 'unknown'}]`;
      if ('resource' in c && c.type === 'resource') return `[Resource: ${(c as any).resource?.uri ?? 'unknown'}]`;
      return '[Unknown content]';
    })
    .join('\n');
}

/**
 * Read resources from MCP clients and format as context.
 *
 * Attempts to read each resource URI from the available clients
 * until one succeeds.
 *
 * @param clients - MCP clients to query
 * @param resourceUris - URIs of resources to read
 * @returns Array of resource contexts
 *
 * @example
 * ```typescript
 * const contexts = await gatherResourceContext(
 *   [fsClient],
 *   ['file:///project/README.md', 'file:///project/config.yaml']
 * );
 * ```
 */
export async function gatherResourceContext(
  clients: DedalusMCPClient[],
  resourceUris: string[],
): Promise<ResourceContext[]> {
  const contexts: ResourceContext[] = [];

  for (const uri of resourceUris) {
    // Find client that can serve this resource
    for (const client of clients) {
      try {
        const result = await client.readResource(uri);
        for (const content of result.contents) {
          // Handle both text and blob content types
          let textContent = '';
          if ('text' in content) {
            textContent = content.text;
          } else if ('blob' in content) {
            textContent = `[Binary: ${content.blob.length} bytes]`;
          }
          const ctx: ResourceContext = {
            uri: content.uri,
            content: textContent,
          };
          if (content.mimeType !== undefined) {
            ctx.mimeType = content.mimeType;
          }
          contexts.push(ctx);
        }
        break; // Found the resource, no need to try other clients
      } catch {
        // This client doesn't have the resource, try next
        continue;
      }
    }
  }

  return contexts;
}

/**
 * Format resource context as a system message prefix.
 *
 * @param contexts - Resource contexts to format
 * @returns Formatted string for inclusion in system message
 */
export function formatResourceContext(contexts: ResourceContext[]): string {
  if (contexts.length === 0) return '';

  const parts = contexts.map((ctx) => {
    const header = ctx.mimeType ? `[${ctx.uri}] (${ctx.mimeType})` : `[${ctx.uri}]`;
    return `${header}\n${ctx.content}`;
  });

  return `The following resources are available for reference:\n\n${parts.join('\n\n---\n\n')}`;
}

/**
 * Close all MCP clients in the array.
 *
 * @param clients - Clients to close
 */
export async function closeAllMCPClients(clients: DedalusMCPClient[]): Promise<void> {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
}
