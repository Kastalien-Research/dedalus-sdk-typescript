// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Configuration utilities for loading MCP server configurations.
 *
 * Supports the Claude Desktop configuration format for compatibility.
 *
 * @example
 * ```typescript
 * import { loadClaudeDesktopConfig, MCPClientManager } from 'dedalus-labs/mcp-client';
 *
 * // Load Claude Desktop config automatically
 * const config = await loadClaudeDesktopConfig();
 * if (config) {
 *   const manager = new MCPClientManager();
 *   await manager.loadConfig(config);
 * }
 * ```
 */

import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { MCPConfig, MCPServerConfig } from './manager';

/**
 * Default config file locations for various platforms.
 */
export const CONFIG_LOCATIONS = {
  /** Claude Desktop config (macOS) */
  claudeDesktopMac: join(
    homedir(),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json',
  ),
  /** Claude Desktop config (Windows) */
  claudeDesktopWindows: join(
    homedir(),
    'AppData',
    'Roaming',
    'Claude',
    'claude_desktop_config.json',
  ),
  /** Claude Desktop config (Linux) */
  claudeDesktopLinux: join(homedir(), '.config', 'claude', 'claude_desktop_config.json'),
} as const;

/**
 * Load MCP config from a JSON file.
 *
 * @param path - Path to the configuration file
 * @returns Parsed MCP configuration
 * @throws Error if file cannot be read or parsed
 *
 * @example
 * ```typescript
 * const config = await loadMCPConfig('./mcp-servers.json');
 * ```
 */
export async function loadMCPConfig(path: string): Promise<MCPConfig> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as MCPConfig;
}

/**
 * Try to load Claude Desktop config from default locations.
 *
 * Automatically detects the platform and tries the appropriate path.
 *
 * @returns Config if found, null if not found on any platform
 *
 * @example
 * ```typescript
 * const config = await loadClaudeDesktopConfig();
 * if (config) {
 *   console.log('Found Claude Desktop MCP servers:', Object.keys(config.mcpServers));
 * }
 * ```
 */
export async function loadClaudeDesktopConfig(): Promise<MCPConfig | null> {
  const locations = [
    CONFIG_LOCATIONS.claudeDesktopMac,
    CONFIG_LOCATIONS.claudeDesktopWindows,
    CONFIG_LOCATIONS.claudeDesktopLinux,
  ];

  for (const location of locations) {
    try {
      return await loadMCPConfig(location);
    } catch {
      // Try next location
      continue;
    }
  }

  return null;
}

/**
 * Validate that an object is a valid MCP configuration.
 *
 * @param config - Object to validate
 * @returns true if valid MCP config
 *
 * @example
 * ```typescript
 * const data = JSON.parse(fileContents);
 * if (validateMCPConfig(data)) {
 *   // data is now typed as MCPConfig
 *   await manager.loadConfig(data);
 * }
 * ```
 */
export function validateMCPConfig(config: unknown): config is MCPConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const obj = config as Record<string, unknown>;
  const mcpServers = obj['mcpServers'];
  if (!mcpServers || typeof mcpServers !== 'object') {
    return false;
  }

  for (const [name, serverConfig] of Object.entries(mcpServers)) {
    if (typeof name !== 'string') return false;
    if (!serverConfig || typeof serverConfig !== 'object') return false;

    const server = serverConfig as Record<string, unknown>;
    const hasCommand = typeof server['command'] === 'string';
    const hasUrl = typeof server['url'] === 'string';

    // Must have either command or url
    if (!hasCommand && !hasUrl) {
      return false;
    }

    // Validate optional fields if present
    if (server['args'] !== undefined && !Array.isArray(server['args'])) {
      return false;
    }
    if (server['env'] !== undefined && (server['env'] === null || typeof server['env'] !== 'object' || Array.isArray(server['env']))) {
      return false;
    }
    if (server['headers'] !== undefined && (server['headers'] === null || typeof server['headers'] !== 'object' || Array.isArray(server['headers']))) {
    }
    if (server['cwd'] !== undefined && typeof server['cwd'] !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Create an MCP config programmatically.
 *
 * Type-safe helper for building configurations.
 *
 * @param servers - Map of server names to configurations
 * @returns MCP configuration object
 *
 * @example
 * ```typescript
 * const config = createMCPConfig({
 *   filesystem: {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/project'],
 *   },
 *   api: {
 *     url: 'http://localhost:3000/mcp',
 *     headers: { Authorization: 'Bearer token' },
 *   },
 * });
 * ```
 */
export function createMCPConfig(
  servers: Record<
    string,
    | { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
    | { url: string; headers?: Record<string, string> }
  >,
): MCPConfig {
  return { mcpServers: servers as Record<string, MCPServerConfig> };
}

/**
 * Merge multiple MCP configs into one.
 *
 * Later configs override earlier ones for duplicate server names.
 *
 * @param configs - Configs to merge
 * @returns Merged configuration
 */
export function mergeMCPConfigs(...configs: MCPConfig[]): MCPConfig {
  const merged: MCPConfig = { mcpServers: {} };

  for (const config of configs) {
    Object.assign(merged.mcpServers, config.mcpServers);
  }

  return merged;
}

/**
 * Get the platform-specific Claude Desktop config path.
 *
 * @returns Path for the current platform
 */
export function getClaudeDesktopConfigPath(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return CONFIG_LOCATIONS.claudeDesktopMac;
  } else if (platform === 'win32') {
    return CONFIG_LOCATIONS.claudeDesktopWindows;
  } else {
    return CONFIG_LOCATIONS.claudeDesktopLinux;
  }
}
