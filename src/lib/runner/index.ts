// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

export { DedalusRunner, RunResult } from './runner';
export type { Tool, Message, ToolCall, ToolResult, ToolHandler } from './types';
export { toSchema } from '../utils';

// MCP integration utilities
export {
  aggregateMCPTools,
  mcpToolsToDedalusFormat,
  routeMCPToolCall,
  isMCPTool,
  gatherResourceContext,
  formatResourceContext,
  closeAllMCPClients,
} from './mcp-integration';
export type { MCPToolInfo, ResourceContext } from './mcp-integration';
