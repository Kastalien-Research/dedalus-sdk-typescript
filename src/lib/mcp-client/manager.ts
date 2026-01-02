// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * MCP Client Manager for managing multiple MCP client connections.
 * Provides configuration loading, aggregated APIs, and connection management.
 *
 * @example
 * ```typescript
 * import { MCPClientManager } from 'dedalus-labs/mcp-client';
 *
 * const manager = new MCPClientManager();
 *
 * // Load from config file
 * await manager.loadConfigFile('./mcp-config.json');
 *
 * // Or load config programmatically
 * await manager.loadConfig({
 *   mcpServers: {
 *     filesystem: {
 *       command: 'npx',
 *       args: ['-y', '@modelcontextprotocol/server-filesystem', '/project'],
 *     },
 *   },
 * });
 *
 * // Use aggregated APIs
 * const tools = await manager.listAllTools();
 * const result = await manager.callTool('filesystem.read_file', { path: '/README.md' });
 *
 * // Clean up
 * await manager.closeAll();
 * ```
 */

import { DedalusMCPClient } from './client';
import type {
  StdioTransportOptions,
  HTTPTransportOptions,
  Tool,
  Resource,
  Prompt,
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
} from './types';

/**
 * Configuration for a single MCP server.
 * Either `command` (for stdio) or `url` (for HTTP) must be provided.
 */
export interface MCPServerConfig {
  /** Stdio server: command to execute */
  command?: string;
  /** Stdio server: command arguments */
  args?: string[];
  /** Stdio server: environment variables */
  env?: Record<string, string>;
  /** Stdio server: working directory */
  cwd?: string;
  /** HTTP server: URL endpoint */
  url?: string;
  /** HTTP server: request headers */
  headers?: Record<string, string>;
}

/**
 * MCP configuration format (compatible with Claude Desktop).
 */
export interface MCPConfig {
  /** Map of server names to configurations */
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Options for MCPClientManager.
 */
export interface MCPClientManagerOptions {
  /** Default client options applied to all connections */
  defaultClientOptions?: Partial<StdioTransportOptions & HTTPTransportOptions>;
  /** Connect to servers in parallel (default: true) */
  parallelConnect?: boolean;
  /** Maximum concurrent connections (default: 10) */
  maxConcurrent?: number;
}

/**
 * Manages multiple MCP client connections with a unified API.
 *
 * Features:
 * - Load configuration from files (Claude Desktop format)
 * - Environment variable expansion in config
 * - Parallel connection management
 * - Aggregated APIs for tools, resources, and prompts
 * - Automatic namespacing to avoid collisions
 */
export class MCPClientManager {
  private clients = new Map<string, DedalusMCPClient>();
  private options: Required<MCPClientManagerOptions>;

  constructor(options: MCPClientManagerOptions = {}) {
    this.options = {
      defaultClientOptions: options.defaultClientOptions ?? {},
      parallelConnect: options.parallelConnect ?? true,
      maxConcurrent: options.maxConcurrent ?? 10,
    };
  }

  /**
   * Load and connect to servers from configuration.
   *
   * @param config - MCP configuration object
   *
   * @example
   * ```typescript
   * await manager.loadConfig({
   *   mcpServers: {
   *     filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
   *     api: { url: 'http://localhost:3000/mcp' },
   *   },
   * });
   * ```
   */
  async loadConfig(config: MCPConfig): Promise<void> {
    const entries = Object.entries(config.mcpServers);

    if (this.options.parallelConnect) {
      await this.connectParallel(entries);
    } else {
      for (const [name, serverConfig] of entries) {
        await this.addServer(name, serverConfig);
      }
    }
  }

  /**
   * Load configuration from a JSON file (Claude Desktop format).
   *
   * Supports environment variable expansion using `${VAR}` syntax.
   *
   * @param path - Path to the configuration file
   *
   * @example
   * ```typescript
   * // config.json:
   * // {
   * //   "mcpServers": {
   * //     "github": {
   * //       "command": "npx",
   * //       "args": ["-y", "@modelcontextprotocol/server-github"],
   * //       "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
   * //     }
   * //   }
   * // }
   * await manager.loadConfigFile('./config.json');
   * ```
   */
  async loadConfigFile(path: string): Promise<void> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    const config = JSON.parse(content) as MCPConfig;

    // Expand environment variables in config
    const expandedConfig = this.expandEnvVars(config);

    await this.loadConfig(expandedConfig);
  }

  /**
   * Add and connect to a single server.
   *
   * @param name - Unique name for the server (used for namespacing)
   * @param config - Server configuration
   * @returns Connected client
   * @throws Error if server name already exists
   */
  async addServer(name: string, config: MCPServerConfig): Promise<DedalusMCPClient> {
    if (this.clients.has(name)) {
      throw new Error(`Server "${name}" already exists`);
    }

    const client = await this.createClient(config);
    this.clients.set(name, client);
    return client;
  }

  /**
   * Remove and disconnect a server.
   *
   * @param name - Server name to remove
   * @returns true if server was removed, false if not found
   */
  async removeServer(name: string): Promise<boolean> {
    const client = this.clients.get(name);
    if (!client) {
      return false;
    }

    await client.close();
    this.clients.delete(name);
    return true;
  }

  /**
   * Get a specific client by name.
   *
   * @param name - Server name
   * @returns Client if found, undefined otherwise
   */
  getClient(name: string): DedalusMCPClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Get all server names.
   */
  getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get all connected clients.
   */
  getAllClients(): DedalusMCPClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if a server is connected.
   */
  hasServer(name: string): boolean {
    return this.clients.has(name);
  }

  /**
   * Get number of connected servers.
   */
  get size(): number {
    return this.clients.size;
  }

  // ========== Aggregated APIs ==========

  /**
   * List all tools from all servers (namespaced by server name).
   *
   * @returns Array of tools with server name appended
   *
   * @example
   * ```typescript
   * const tools = await manager.listAllTools();
   * // Returns: [
   * //   { name: 'filesystem.read_file', description: '[filesystem] Read a file', server: 'filesystem', ... },
   * //   { name: 'github.create_issue', description: '[github] Create an issue', server: 'github', ... },
   * // ]
   * ```
   */
  async listAllTools(): Promise<Array<Tool & { server: string }>> {
    const allTools: Array<Tool & { server: string }> = [];

    for (const [name, client] of this.clients) {
      const tools = await client.listAllTools();
      for (const tool of tools) {
        allTools.push({
          ...tool,
          name: `${name}.${tool.name}`,
          description: `[${name}] ${tool.description ?? ''}`,
          server: name,
        });
      }
    }

    return allTools;
  }

  /**
   * List all resources from all servers.
   *
   * @returns Array of resources with server name
   */
  async listAllResources(): Promise<Array<Resource & { server: string }>> {
    const allResources: Array<Resource & { server: string }> = [];

    for (const [name, client] of this.clients) {
      const resources = await client.listAllResources();
      for (const resource of resources) {
        allResources.push({ ...resource, server: name });
      }
    }

    return allResources;
  }

  /**
   * List all prompts from all servers (namespaced by server name).
   *
   * @returns Array of prompts with server name
   */
  async listAllPrompts(): Promise<Array<Prompt & { server: string }>> {
    const allPrompts: Array<Prompt & { server: string }> = [];

    for (const [name, client] of this.clients) {
      const prompts = await client.listAllPrompts();
      for (const prompt of prompts) {
        allPrompts.push({
          ...prompt,
          name: `${name}.${prompt.name}`,
          server: name,
        });
      }
    }

    return allPrompts;
  }

  /**
   * Call a tool (routes to correct server based on namespace).
   *
   * @param name - Namespaced tool name (e.g., "filesystem.read_file")
   * @param args - Tool arguments
   * @returns Tool result
   * @throws Error if server not found
   *
   * @example
   * ```typescript
   * const result = await manager.callTool('filesystem.read_file', { path: '/tmp/test.txt' });
   * ```
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    const [serverName, ...toolNameParts] = name.split('.');
    const toolName = toolNameParts.join('.');

    if (!serverName || toolNameParts.length === 0) {
      throw new Error(`Invalid tool name: ${name}`);
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Unknown server: ${serverName}`);
    }

    return client.callTool(toolName, args);
  }

  /**
   * Read a resource (tries all servers until one succeeds).
   *
   * @param uri - Resource URI
   * @returns Resource result with server name
   * @throws Error if resource not found in any server
   */
  async readResource(uri: string): Promise<ReadResourceResult & { server: string }> {
    for (const [name, client] of this.clients) {
      try {
        const result = await client.readResource(uri);
        return { ...result, server: name };
      } catch {
        // Try next server
        continue;
      }
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  /**
   * Get a prompt (routes based on namespace).
   *
   * @param name - Namespaced prompt name (e.g., "server.prompt_name")
   * @param args - Prompt arguments
   * @returns Prompt result
   * @throws Error if server not found
   */
    if (!serverName || serverName.trim() === '') {
      throw new Error(`Invalid prompt name: ${name}`);
    }

  /**
   * Close all connections.
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.clients.values()).map((client) =>
      client.close().catch(() => {}),
    );
    await Promise.all(closePromises);
    this.clients.clear();
  }

  // ========== Private Methods ==========

  private async createClient(config: MCPServerConfig): Promise<DedalusMCPClient> {
    if (config.url) {
      const httpOptions: HTTPTransportOptions = {
        ...this.options.defaultClientOptions,
        url: config.url,
      };
      if (config.headers !== undefined) {
        httpOptions.headers = config.headers;
      }
      return DedalusMCPClient.fromHTTP(httpOptions);
    }

    if (config.command) {
      const stdioOptions: StdioTransportOptions = {
        ...this.options.defaultClientOptions,
        command: config.command,
      };
      if (config.args !== undefined) {
        stdioOptions.args = config.args;
      }
      if (config.env !== undefined) {
        stdioOptions.env = config.env;
      }
      if (config.cwd !== undefined) {
        stdioOptions.cwd = config.cwd;
      }
      return DedalusMCPClient.fromStdio(stdioOptions);
    }

    throw new Error('Server config must have either "command" or "url"');
  }

  private async connectParallel(
    entries: Array<[string, MCPServerConfig]>,
  ): Promise<void> {
    const chunks: Array<Array<[string, MCPServerConfig]>> = [];
    for (let i = 0; i < entries.length; i += this.options.maxConcurrent) {
      chunks.push(entries.slice(i, i + this.options.maxConcurrent));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async ([name, config]) => {
          try {
            await this.addServer(name, config);
          } catch (error) {
            // Log error but continue with other servers
            console.error(`Failed to connect to server "${name}":`, error);
          }
        }),
      );
    }
  }

  private expandEnvVars(config: MCPConfig): MCPConfig {
    const expanded: MCPConfig = { mcpServers: {} };

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      expanded.mcpServers[name] = {
        ...serverConfig,
      };

      if (serverConfig.env) {
        expanded.mcpServers[name]!.env = Object.fromEntries(
          Object.entries(serverConfig.env).map(([k, v]) => [k, this.expandEnvVar(v)]),
        );
      }

      if (serverConfig.headers) {
        expanded.mcpServers[name]!.headers = Object.fromEntries(
          Object.entries(serverConfig.headers).map(([k, v]) => [k, this.expandEnvVar(v)]),
        );
      }
    }

    return expanded;
  }

  private expandEnvVar(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '');
  }
}
