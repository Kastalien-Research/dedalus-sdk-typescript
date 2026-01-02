import { DedalusMCPClient } from '../../../src/lib/mcp-client/client';
import {
  MCPClientManager,
  MCPConfig,
  MCPServerConfig,
} from '../../../src/lib/mcp-client/manager';
import {
  validateMCPConfig,
  createMCPConfig,
  mergeMCPConfigs,
  getClaudeDesktopConfigPath,
  CONFIG_LOCATIONS,
} from '../../../src/lib/mcp-client/config';

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
    listResources: jest.fn(),
    listPrompts: jest.fn(),
    getPrompt: jest.fn(),
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

describe('MCPClientManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create manager with default options', () => {
      const manager = new MCPClientManager();
      expect(manager.size).toBe(0);
    });

    it('should create manager with custom options', () => {
      const manager = new MCPClientManager({
        parallelConnect: false,
        maxConcurrent: 5,
      });
      expect(manager.size).toBe(0);
    });
  });

  describe('loadConfig', () => {
    it('should load config and connect to servers', async () => {
      const manager = new MCPClientManager();

      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@mcp/server-fs'] },
          api: { url: 'http://localhost:3000/mcp' },
        },
      };

      await manager.loadConfig(config);

      expect(manager.size).toBe(2);
      expect(manager.hasServer('filesystem')).toBe(true);
      expect(manager.hasServer('api')).toBe(true);
    });

    it('should load config sequentially when parallelConnect is false', async () => {
      const manager = new MCPClientManager({ parallelConnect: false });

      const config: MCPConfig = {
        mcpServers: {
          server1: { command: 'test1' },
          server2: { command: 'test2' },
        },
      };

      await manager.loadConfig(config);

      expect(manager.size).toBe(2);
    });
  });

  describe('addServer', () => {
    it('should add a single server', async () => {
      const manager = new MCPClientManager();

      const client = await manager.addServer('test', { command: 'test-cmd' });

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(manager.hasServer('test')).toBe(true);
    });

    it('should throw if server already exists', async () => {
      const manager = new MCPClientManager();

      await manager.addServer('test', { command: 'test-cmd' });

      await expect(manager.addServer('test', { command: 'test2' })).rejects.toThrow(
        'Server "test" already exists',
      );
    });

    it('should throw for invalid config', async () => {
      const manager = new MCPClientManager();

      await expect(manager.addServer('test', {} as MCPServerConfig)).rejects.toThrow(
        'Server config must have either "command" or "url"',
      );
    });
  });

  describe('removeServer', () => {
    it('should remove an existing server', async () => {
      const manager = new MCPClientManager();
      await manager.addServer('test', { command: 'test-cmd' });

      const result = await manager.removeServer('test');

      expect(result).toBe(true);
      expect(manager.hasServer('test')).toBe(false);
    });

    it('should return false for non-existent server', async () => {
      const manager = new MCPClientManager();

      const result = await manager.removeServer('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getClient', () => {
    it('should return client for existing server', async () => {
      const manager = new MCPClientManager();
      await manager.addServer('test', { command: 'test-cmd' });

      const client = manager.getClient('test');

      expect(client).toBeInstanceOf(DedalusMCPClient);
    });

    it('should return undefined for non-existent server', () => {
      const manager = new MCPClientManager();

      const client = manager.getClient('nonexistent');

      expect(client).toBeUndefined();
    });
  });

  describe('getServerNames', () => {
    it('should return all server names', async () => {
      const manager = new MCPClientManager();
      await manager.addServer('server1', { command: 'cmd1' });
      await manager.addServer('server2', { command: 'cmd2' });

      const names = manager.getServerNames();

      expect(names).toEqual(['server1', 'server2']);
    });
  });

  describe('getAllClients', () => {
    it('should return all clients', async () => {
      const manager = new MCPClientManager();
      await manager.addServer('server1', { command: 'cmd1' });
      await manager.addServer('server2', { command: 'cmd2' });

      const clients = manager.getAllClients();

      expect(clients).toHaveLength(2);
      expect(clients[0]).toBeInstanceOf(DedalusMCPClient);
    });
  });

  describe('aggregated APIs', () => {
    let manager: MCPClientManager;

    beforeEach(async () => {
      manager = new MCPClientManager();
      const client1 = await manager.addServer('fs', { command: 'fs-cmd' });
      const client2 = await manager.addServer('git', { command: 'git-cmd' });

      // Mock tool listings
      jest.spyOn(client1, 'listAllTools').mockResolvedValue([
        { name: 'read_file', description: 'Read a file', inputSchema: {} },
      ]);
      jest.spyOn(client2, 'listAllTools').mockResolvedValue([
        { name: 'commit', description: 'Git commit', inputSchema: {} },
      ]);

      // Mock resource listings
      jest.spyOn(client1, 'listAllResources').mockResolvedValue([
        { uri: 'file:///test.txt', name: 'test.txt' },
      ]);
      jest.spyOn(client2, 'listAllResources').mockResolvedValue([]);

      // Mock prompt listings
      jest.spyOn(client1, 'listAllPrompts').mockResolvedValue([]);
      jest.spyOn(client2, 'listAllPrompts').mockResolvedValue([
        { name: 'commit_message', description: 'Generate commit message' },
      ]);
    });

    describe('listAllTools', () => {
      it('should aggregate tools from all servers with namespacing', async () => {
        const tools = await manager.listAllTools();

        expect(tools).toHaveLength(2);
        expect(tools[0]!.name).toBe('fs.read_file');
        expect(tools[0]!.description).toBe('[fs] Read a file');
        expect(tools[0]!.server).toBe('fs');
        expect(tools[1]!.name).toBe('git.commit');
        expect(tools[1]!.server).toBe('git');
      });
    });

    describe('listAllResources', () => {
      it('should aggregate resources from all servers', async () => {
        const resources = await manager.listAllResources();

        expect(resources).toHaveLength(1);
        expect(resources[0]!.uri).toBe('file:///test.txt');
        expect(resources[0]!.server).toBe('fs');
      });
    });

    describe('listAllPrompts', () => {
      it('should aggregate prompts from all servers with namespacing', async () => {
        const prompts = await manager.listAllPrompts();

        expect(prompts).toHaveLength(1);
        expect(prompts[0]!.name).toBe('git.commit_message');
        expect(prompts[0]!.server).toBe('git');
      });
    });

    describe('callTool', () => {
      it('should route tool call to correct server', async () => {
        const client = manager.getClient('fs')!;
        jest.spyOn(client, 'callTool').mockResolvedValue({
          content: [{ type: 'text', text: 'file content' }],
        });

        const result = await manager.callTool('fs.read_file', { path: '/test.txt' });

        expect(client.callTool).toHaveBeenCalledWith('read_file', { path: '/test.txt' });
        expect(result.content[0]).toEqual({ type: 'text', text: 'file content' });
      });

      it('should throw for unknown server', async () => {
        await expect(manager.callTool('unknown.tool', {})).rejects.toThrow('Unknown server: unknown');
      });

      it('should throw for invalid tool name', async () => {
        await expect(manager.callTool('', {})).rejects.toThrow('Invalid tool name');
      });
    });

    describe('readResource', () => {
      it('should try servers until one succeeds', async () => {
        const client1 = manager.getClient('fs')!;
        jest.spyOn(client1, 'readResource').mockResolvedValue({
          contents: [{ uri: 'file:///test.txt', text: 'content' }],
        });

        const result = await manager.readResource('file:///test.txt');

        expect(result.server).toBe('fs');
        expect(result.contents[0]!.text).toBe('content');
      });

      it('should throw if resource not found in any server', async () => {
        const client1 = manager.getClient('fs')!;
        const client2 = manager.getClient('git')!;
        jest.spyOn(client1, 'readResource').mockRejectedValue(new Error('Not found'));
        jest.spyOn(client2, 'readResource').mockRejectedValue(new Error('Not found'));

        await expect(manager.readResource('file:///missing.txt')).rejects.toThrow(
          'Resource not found: file:///missing.txt',
        );
      });
    });

    describe('getPrompt', () => {
      it('should route prompt request to correct server', async () => {
        const client = manager.getClient('git')!;
        jest.spyOn(client, 'getPrompt').mockResolvedValue({
          messages: [{ role: 'user', content: { type: 'text', text: 'Generate message' } }],
        });

        const result = await manager.getPrompt('git.commit_message', { diff: 'test' });

        expect(client.getPrompt).toHaveBeenCalledWith('commit_message', { diff: 'test' });
        expect(result.messages).toHaveLength(1);
      });

      it('should throw for unknown server', async () => {
        await expect(manager.getPrompt('unknown.prompt', {})).rejects.toThrow(
          'Unknown server: unknown',
        );
      });
    });
  });

  describe('closeAll', () => {
    it('should close all clients', async () => {
      const manager = new MCPClientManager();
      const client1 = await manager.addServer('server1', { command: 'cmd1' });
      const client2 = await manager.addServer('server2', { command: 'cmd2' });

      const closeSpy1 = jest.spyOn(client1, 'close').mockResolvedValue(undefined);
      const closeSpy2 = jest.spyOn(client2, 'close').mockResolvedValue(undefined);

      await manager.closeAll();

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
      expect(manager.size).toBe(0);
    });

    it('should handle close errors gracefully', async () => {
      const manager = new MCPClientManager();
      const client1 = await manager.addServer('server1', { command: 'cmd1' });
      const client2 = await manager.addServer('server2', { command: 'cmd2' });

      jest.spyOn(client1, 'close').mockRejectedValue(new Error('Close failed'));
      const closeSpy2 = jest.spyOn(client2, 'close').mockResolvedValue(undefined);

      // Should not throw
      await manager.closeAll();

      expect(closeSpy2).toHaveBeenCalled();
      expect(manager.size).toBe(0);
    });
  });

  describe('environment variable expansion', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, TEST_TOKEN: 'secret123' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should expand env vars in server config', async () => {
      const manager = new MCPClientManager();

      // Since we can't easily test the internal expansion, we just verify
      // it doesn't throw when loading config with env vars
      const config: MCPConfig = {
        mcpServers: {
          test: {
            command: 'cmd',
            env: { TOKEN: '${TEST_TOKEN}' },
          },
        },
      };

      await manager.loadConfig(config);
      expect(manager.hasServer('test')).toBe(true);
    });
  });
});

describe('Configuration Utilities', () => {
  describe('validateMCPConfig', () => {
    it('should validate valid config with command', () => {
      const config = {
        mcpServers: {
          test: { command: 'test-cmd', args: ['arg1'] },
        },
      };

      expect(validateMCPConfig(config)).toBe(true);
    });

    it('should validate valid config with url', () => {
      const config = {
        mcpServers: {
          test: { url: 'http://localhost:3000', headers: { 'X-Token': 'abc' } },
        },
      };

      expect(validateMCPConfig(config)).toBe(true);
    });

    it('should reject null config', () => {
      expect(validateMCPConfig(null)).toBe(false);
    });

    it('should reject config without mcpServers', () => {
      expect(validateMCPConfig({})).toBe(false);
      expect(validateMCPConfig({ servers: {} })).toBe(false);
    });

    it('should reject server without command or url', () => {
      const config = {
        mcpServers: {
          test: { args: ['arg1'] },
        },
      };

      expect(validateMCPConfig(config)).toBe(false);
    });

    it('should reject invalid args type', () => {
      const config = {
        mcpServers: {
          test: { command: 'cmd', args: 'invalid' },
        },
      };

      expect(validateMCPConfig(config)).toBe(false);
    });

    it('should reject invalid env type', () => {
      const config = {
        mcpServers: {
          test: { command: 'cmd', env: 'invalid' },
        },
      };

      expect(validateMCPConfig(config)).toBe(false);
    });
  });

  describe('createMCPConfig', () => {
    it('should create config from servers object', () => {
      const config = createMCPConfig({
        filesystem: { command: 'npx', args: ['-y', '@mcp/server-fs'] },
        api: { url: 'http://localhost:3000' },
      });

      expect(config.mcpServers).toHaveProperty('filesystem');
      expect(config.mcpServers).toHaveProperty('api');
      expect(config.mcpServers['filesystem']!.command).toBe('npx');
      expect(config.mcpServers['api']!.url).toBe('http://localhost:3000');
    });
  });

  describe('mergeMCPConfigs', () => {
    it('should merge multiple configs', () => {
      const config1 = createMCPConfig({
        server1: { command: 'cmd1' },
      });
      const config2 = createMCPConfig({
        server2: { command: 'cmd2' },
      });

      const merged = mergeMCPConfigs(config1, config2);

      expect(merged.mcpServers).toHaveProperty('server1');
      expect(merged.mcpServers).toHaveProperty('server2');
    });

    it('should override duplicate servers with later config', () => {
      const config1 = createMCPConfig({
        server: { command: 'cmd1' },
      });
      const config2 = createMCPConfig({
        server: { command: 'cmd2' },
      });

      const merged = mergeMCPConfigs(config1, config2);

      expect(merged.mcpServers['server']!.command).toBe('cmd2');
    });
  });

  describe('getClaudeDesktopConfigPath', () => {
    it('should return platform-specific path', () => {
      const path = getClaudeDesktopConfigPath();

      // Just verify it returns a string containing expected parts
      expect(typeof path).toBe('string');
      expect(path).toContain('claude');
    });
  });

  describe('CONFIG_LOCATIONS', () => {
    it('should have all platform paths defined', () => {
      expect(CONFIG_LOCATIONS.claudeDesktopMac).toContain('claude_desktop_config.json');
      expect(CONFIG_LOCATIONS.claudeDesktopWindows).toContain('claude_desktop_config.json');
      expect(CONFIG_LOCATIONS.claudeDesktopLinux).toContain('claude_desktop_config.json');
    });
  });
});

describe('Convenience Constructors', () => {
  describe('DedalusMCPClient.filesystem', () => {
    it('should create filesystem client with directories', async () => {
      const client = await DedalusMCPClient.filesystem(['/tmp', '/home']);

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('DedalusMCPClient.github', () => {
    it('should create github client with token', async () => {
      const client = await DedalusMCPClient.github('test-token');

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('DedalusMCPClient.git', () => {
    it('should create git client with repo path', async () => {
      const client = await DedalusMCPClient.git('/path/to/repo');

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('DedalusMCPClient.puppeteer', () => {
    it('should create puppeteer client', async () => {
      const client = await DedalusMCPClient.puppeteer();

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('DedalusMCPClient.braveSearch', () => {
    it('should create brave search client with api key', async () => {
      const client = await DedalusMCPClient.braveSearch('test-api-key');

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('DedalusMCPClient.fromNpmPackage', () => {
    it('should create client from npm package', async () => {
      const client = await DedalusMCPClient.fromNpmPackage('@custom/mcp-server', ['--arg']);

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });

    it('should work without additional args', async () => {
      const client = await DedalusMCPClient.fromNpmPackage('@custom/mcp-server');

      expect(client).toBeInstanceOf(DedalusMCPClient);
    });
  });
});
