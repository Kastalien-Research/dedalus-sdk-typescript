import { DedalusMCPClient } from '../../../src/lib/mcp-client/client';
import { MCPConnectionError, MCPTimeoutError } from '../../../src/lib/mcp-client/errors';
import type {
  DedalusMCPClientOptions,
  StdioTransportOptions,
  HTTPTransportOptions,
} from '../../../src/lib/mcp-client/types';

// Mock the MCP SDK client and transports
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

describe('DedalusMCPClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fromStdio', () => {
    it('should create a client with minimal options', async () => {
      const options: StdioTransportOptions = {
        command: 'test-command',
      };

      const client = await DedalusMCPClient.fromStdio(options);

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });

    it('should create a client with all options', async () => {
      const options: StdioTransportOptions = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: { DEBUG: 'true' },
        cwd: '/home/user',
        clientInfo: { name: 'test-client', version: '2.0.0' },
        connectionTimeout: 5000,
        requestTimeout: 10000,
      };

      const client = await DedalusMCPClient.fromStdio(options);

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('fromHTTP', () => {
    it('should create a client with URL only', async () => {
      const options: HTTPTransportOptions = {
        url: 'http://localhost:3000/mcp',
      };

      const client = await DedalusMCPClient.fromHTTP(options);

      expect(client).toBeInstanceOf(DedalusMCPClient);
      expect(client.isConnected()).toBe(true);
    });

    it('should create a client with headers', async () => {
      const options: HTTPTransportOptions = {
        url: 'http://localhost:3000/mcp',
        headers: { Authorization: 'Bearer token' },
      };

      const client = await DedalusMCPClient.fromHTTP(options);

      expect(client.isConnected()).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the connection', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      expect(client.isConnected()).toBe(true);

      await client.close();

      expect(client.isConnected()).toBe(false);
    });

    it('should be idempotent', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      await client.close();
      await client.close();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getServerCapabilities', () => {
    it('should return server capabilities', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const capabilities = client.getServerCapabilities();

      expect(capabilities).toEqual({ tools: {} });
    });
  });

  describe('getServerInfo', () => {
    it('should return server info', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const info = client.getServerInfo();

      expect(info).toEqual({ name: 'test-server', version: '1.0.0' });
    });
  });

  describe('getRequestTimeout', () => {
    it('should return default timeout', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      expect(client.getRequestTimeout()).toBe(60000);
    });

    it('should return custom timeout', async () => {
      const client = await DedalusMCPClient.fromStdio({
        command: 'test',
        requestTimeout: 30000,
      });

      expect(client.getRequestTimeout()).toBe(30000);
    });
  });

  describe('getInternalClient', () => {
    it('should return the internal MCP SDK client', async () => {
      const client = await DedalusMCPClient.fromStdio({ command: 'test' });

      const internalClient = client.getInternalClient();

      expect(internalClient).toBeDefined();
      expect(typeof internalClient.connect).toBe('function');
    });
  });

  describe('capabilities configuration', () => {
    it('should accept sampling capability config', async () => {
      const client = await DedalusMCPClient.fromStdio({
        command: 'test',
        capabilities: {
          sampling: {
            handler: async () => ({ role: 'assistant', content: { type: 'text', text: 'response' } }),
          },
        },
      });

      expect(client.isConnected()).toBe(true);
    });

    it('should accept roots capability config', async () => {
      const client = await DedalusMCPClient.fromStdio({
        command: 'test',
        capabilities: {
          roots: {
            roots: [{ uri: 'file:///home/user', name: 'Home' }],
            listChanged: true,
          },
        },
      });

      expect(client.isConnected()).toBe(true);
    });

    it('should accept elicitation capability config', async () => {
      const client = await DedalusMCPClient.fromStdio({
        command: 'test',
        capabilities: {
          elicitation: {
            formHandler: async () => ({ action: 'accept', content: {} }),
            urlHandler: async () => ({ action: 'accept' }),
          },
        },
      });

      expect(client.isConnected()).toBe(true);
    });
  });
});

describe('Type Definitions', () => {
  it('should have correct StdioTransportOptions shape', () => {
    const options: StdioTransportOptions = {
      command: 'test',
      args: ['arg1'],
      env: { KEY: 'value' },
      cwd: '/path',
      clientInfo: { name: 'test', version: '1.0.0' },
      capabilities: {},
      connectionTimeout: 30000,
      requestTimeout: 60000,
    };

    expect(options.command).toBe('test');
  });

  it('should have correct HTTPTransportOptions shape', () => {
    const options: HTTPTransportOptions = {
      url: 'http://localhost:3000',
      headers: { 'X-Custom': 'header' },
      clientInfo: { name: 'test', version: '1.0.0' },
      capabilities: {},
      connectionTimeout: 30000,
      requestTimeout: 60000,
    };

    expect(options.url).toBe('http://localhost:3000');
  });
});
