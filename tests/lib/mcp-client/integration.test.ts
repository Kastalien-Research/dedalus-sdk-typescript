import { DedalusMCPClient } from '../../../src/lib/mcp-client/client';
import {
  aggregateMCPTools,
  mcpToolsToDedalusFormat,
  routeMCPToolCall,
  isMCPTool,
  gatherResourceContext,
  formatResourceContext,
  closeAllMCPClients,
  MCPToolInfo,
  ResourceContext,
} from '../../../src/lib/runner/mcp-integration';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getServerCapabilities: jest.fn().mockReturnValue({ tools: {} }),
    getServerVersion: jest.fn().mockReturnValue({ name: 'test-server', version: '1.0.0' }),
    setRequestHandler: jest.fn(),
    setNotificationHandler: jest.fn(),
    removeNotificationHandler: jest.fn(),
    notification: jest.fn(),
    listTools: jest.fn(),
    callTool: jest.fn(),
    readResource: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('MCP Integration Utilities', () => {
  let mockClient: DedalusMCPClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('aggregateMCPTools', () => {
    it('should aggregate tools from multiple clients', async () => {
      const client1 = await DedalusMCPClient.fromStdio({ command: 'test1' });
      const client2 = await DedalusMCPClient.fromStdio({ command: 'test2' });

      // Override server info for testing
      jest.spyOn(client1, 'getServerInfo').mockReturnValue({ name: 'filesystem' } as any);
      jest.spyOn(client2, 'getServerInfo').mockReturnValue({ name: 'git' } as any);

      // Mock tool listings
      jest.spyOn(client1, 'listAllTools').mockResolvedValue([
        { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
        { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object' } },
      ]);
      jest.spyOn(client2, 'listAllTools').mockResolvedValue([
        { name: 'commit', description: 'Git commit', inputSchema: { type: 'object' } },
      ]);

      const toolMap = await aggregateMCPTools([client1, client2]);

      expect(toolMap.size).toBe(3);
      expect(toolMap.has('filesystem.read_file')).toBe(true);
      expect(toolMap.has('filesystem.write_file')).toBe(true);
      expect(toolMap.has('git.commit')).toBe(true);

      const readFileTool = toolMap.get('filesystem.read_file')!;
      expect(readFileTool.serverName).toBe('filesystem');
      expect(readFileTool.originalName).toBe('read_file');
      expect(readFileTool.tool.name).toBe('filesystem.read_file');
      expect(readFileTool.tool.description).toBe('[filesystem] Read a file');
    });

    it('should return empty map for no clients', async () => {
      const toolMap = await aggregateMCPTools([]);
      expect(toolMap.size).toBe(0);
    });

    it('should use "unknown" for server without name', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });
      jest.spyOn(client, 'getServerInfo').mockReturnValue(undefined);
      jest.spyOn(client, 'listAllTools').mockResolvedValue([
        { name: 'tool1', inputSchema: { type: 'object' } },
      ]);

      const toolMap = await aggregateMCPTools([client]);

      expect(toolMap.has('unknown.tool1')).toBe(true);
    });
  });

  describe('mcpToolsToDedalusFormat', () => {
    it('should convert MCP tools to Dedalus format', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'server.tool1',
          {
            tool: {
              name: 'server.tool1',
              description: '[server] Tool 1',
              inputSchema: {
                type: 'object',
                properties: { input: { type: 'string' } },
              },
            },
            client,
            serverName: 'server',
            originalName: 'tool1',
          },
        ],
      ]);

      const dedalusTools = mcpToolsToDedalusFormat(toolMap);

      expect(dedalusTools).toHaveLength(1);
      expect(dedalusTools[0]!.type).toBe('function');
      expect(dedalusTools[0]!.function.name).toBe('server.tool1');
      expect(dedalusTools[0]!.function.description).toBe('[server] Tool 1');
      expect(dedalusTools[0]!.function.parameters).toEqual({
        type: 'object',
        properties: { input: { type: 'string' } },
      });
    });

    it('should handle tools without description', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'server.tool1',
          {
            tool: {
              name: 'server.tool1',
              inputSchema: { type: 'object' },
            },
            client,
            serverName: 'server',
            originalName: 'tool1',
          },
        ],
      ]);

      const dedalusTools = mcpToolsToDedalusFormat(toolMap);

      expect(dedalusTools).toHaveLength(1);
      expect(dedalusTools[0]!.function.description).toBeUndefined();
    });

    it('should return empty array for empty map', () => {
      const dedalusTools = mcpToolsToDedalusFormat(new Map());
      expect(dedalusTools).toEqual([]);
    });
  });

  describe('routeMCPToolCall', () => {
    it('should route tool call to correct client', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'callTool').mockResolvedValue({
        content: [{ type: 'text', text: 'file contents' }],
      });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'filesystem.read_file',
          {
            tool: {
              name: 'filesystem.read_file',
              description: 'Read a file',
              inputSchema: { type: 'object' },
            },
            client,
            serverName: 'filesystem',
            originalName: 'read_file',
          },
        ],
      ]);

      const result = await routeMCPToolCall('filesystem.read_file', { path: '/tmp/test.txt' }, toolMap);

      expect(client.callTool).toHaveBeenCalledWith('read_file', { path: '/tmp/test.txt' });
      expect(result).toBe('file contents');
    });

    it('should throw error for unknown tool', async () => {
      const toolMap = new Map<string, MCPToolInfo>();

      await expect(routeMCPToolCall('unknown.tool', {}, toolMap)).rejects.toThrow('Unknown MCP tool: unknown.tool');
    });

    it('should format error results', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'callTool').mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'File not found' }],
      });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'filesystem.read_file',
          {
            tool: {
              name: 'filesystem.read_file',
              inputSchema: { type: 'object' },
            },
            client,
            serverName: 'filesystem',
            originalName: 'read_file',
          },
        ],
      ]);

      const result = await routeMCPToolCall('filesystem.read_file', { path: '/missing.txt' }, toolMap);

      expect(result).toBe('Error: File not found');
    });

    it('should return structured content as JSON', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'callTool').mockResolvedValue({
        content: [{ type: 'text', text: 'fallback' }],
        structuredContent: { files: ['a.txt', 'b.txt'] },
      });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'filesystem.list',
          {
            tool: {
              name: 'filesystem.list',
              inputSchema: { type: 'object' },
            },
            client,
            serverName: 'filesystem',
            originalName: 'list',
          },
        ],
      ]);

      const result = await routeMCPToolCall('filesystem.list', { path: '/tmp' }, toolMap);

      expect(JSON.parse(result)).toEqual({ files: ['a.txt', 'b.txt'] });
    });
  });

  describe('isMCPTool', () => {
    it('should return true for MCP tool', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const toolMap = new Map<string, MCPToolInfo>([
        [
          'server.tool1',
          {
            tool: { name: 'server.tool1', inputSchema: {} },
            client,
            serverName: 'server',
            originalName: 'tool1',
          },
        ],
      ]);

      expect(isMCPTool('server.tool1', toolMap)).toBe(true);
    });

    it('should return false for non-MCP tool', () => {
      const toolMap = new Map<string, MCPToolInfo>();

      expect(isMCPTool('local_tool', toolMap)).toBe(false);
    });
  });

  describe('gatherResourceContext', () => {
    it('should gather resources from clients', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'readResource').mockResolvedValue({
        contents: [
          { uri: 'file:///readme.md', text: '# README', mimeType: 'text/markdown' },
        ],
      });

      const contexts = await gatherResourceContext([client], ['file:///readme.md']);

      expect(contexts).toHaveLength(1);
      expect(contexts[0]!.uri).toBe('file:///readme.md');
      expect(contexts[0]!.content).toBe('# README');
      expect(contexts[0]!.mimeType).toBe('text/markdown');
    });

    it('should handle binary content', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'readResource').mockResolvedValue({
        contents: [{ uri: 'file:///image.png', blob: 'base64data', mimeType: 'image/png' }],
      });

      const contexts = await gatherResourceContext([client], ['file:///image.png']);

      expect(contexts).toHaveLength(1);
      expect(contexts[0]!.content).toBe('[Binary: 10 bytes]');
    });

    it('should try multiple clients until one succeeds', async () => {
      const client1 = await DedalusMCPClient.fromStdio({ command: 'test1' });
      const client2 = await DedalusMCPClient.fromStdio({ command: 'test2' });

      jest.spyOn(client1, 'readResource').mockRejectedValue(new Error('Not found'));
      jest.spyOn(client2, 'readResource').mockResolvedValue({
        contents: [{ uri: 'file:///test.txt', text: 'content' }],
      });

      const contexts = await gatherResourceContext([client1, client2], ['file:///test.txt']);

      expect(contexts).toHaveLength(1);
      expect(contexts[0]!.content).toBe('content');
      expect(client1.readResource).toHaveBeenCalled();
      expect(client2.readResource).toHaveBeenCalled();
    });

    it('should skip resources not found in any client', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      jest.spyOn(client, 'readResource').mockRejectedValue(new Error('Not found'));

      const contexts = await gatherResourceContext([client], ['file:///missing.txt']);

      expect(contexts).toHaveLength(0);
    });

    it('should return empty array for no URIs', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const contexts = await gatherResourceContext([client], []);

      expect(contexts).toEqual([]);
    });
  });

  describe('formatResourceContext', () => {
    it('should format resource contexts', () => {
      const contexts: ResourceContext[] = [
        { uri: 'file:///readme.md', content: '# README', mimeType: 'text/markdown' },
        { uri: 'file:///config.yaml', content: 'key: value' },
      ];

      const formatted = formatResourceContext(contexts);

      expect(formatted).toContain('The following resources are available for reference');
      expect(formatted).toContain('[file:///readme.md] (text/markdown)');
      expect(formatted).toContain('# README');
      expect(formatted).toContain('[file:///config.yaml]');
      expect(formatted).toContain('key: value');
    });

    it('should return empty string for no contexts', () => {
      const formatted = formatResourceContext([]);
      expect(formatted).toBe('');
    });
  });

  describe('closeAllMCPClients', () => {
    it('should close all clients', async () => {
      const client1 = await DedalusMCPClient.fromStdio({ command: 'test1' });
      const client2 = await DedalusMCPClient.fromStdio({ command: 'test2' });

      const closeSpy1 = jest.spyOn(client1, 'close').mockResolvedValue(undefined);
      const closeSpy2 = jest.spyOn(client2, 'close').mockResolvedValue(undefined);

      await closeAllMCPClients([client1, client2]);

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const client1 = await DedalusMCPClient.fromStdio({ command: 'test1' });
      const client2 = await DedalusMCPClient.fromStdio({ command: 'test2' });

      jest.spyOn(client1, 'close').mockRejectedValue(new Error('Close failed'));
      const closeSpy2 = jest.spyOn(client2, 'close').mockResolvedValue(undefined);

      // Should not throw
      await closeAllMCPClients([client1, client2]);

      expect(closeSpy2).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      // Should not throw
      await closeAllMCPClients([]);
    });
  });
});
