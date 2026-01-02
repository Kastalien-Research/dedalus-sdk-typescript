import { DedalusMCPClient } from '../../../src/lib/mcp-client/client';
import { MCPConnectionError } from '../../../src/lib/mcp-client/errors';

// Mock the MCP SDK client and transports
const mockListTools = jest.fn();
const mockCallTool = jest.fn();
const mockListResources = jest.fn();
const mockReadResource = jest.fn();
const mockListResourceTemplates = jest.fn();
const mockSubscribeResource = jest.fn();
const mockUnsubscribeResource = jest.fn();
const mockListPrompts = jest.fn();
const mockGetPrompt = jest.fn();
const mockComplete = jest.fn();
const mockSetLoggingLevel = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockRemoveNotificationHandler = jest.fn();

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getServerCapabilities: jest.fn().mockReturnValue({ tools: {}, resources: {}, prompts: {} }),
    getServerVersion: jest.fn().mockReturnValue({ name: 'test-server', version: '1.0.0' }),
    setRequestHandler: jest.fn(),
    // Phase 2 methods
    listTools: mockListTools,
    callTool: mockCallTool,
    listResources: mockListResources,
    readResource: mockReadResource,
    listResourceTemplates: mockListResourceTemplates,
    subscribeResource: mockSubscribeResource,
    unsubscribeResource: mockUnsubscribeResource,
    listPrompts: mockListPrompts,
    getPrompt: mockGetPrompt,
    complete: mockComplete,
    setLoggingLevel: mockSetLoggingLevel,
    setNotificationHandler: mockSetNotificationHandler,
    removeNotificationHandler: mockRemoveNotificationHandler,
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

describe('Phase 2: Server Features', () => {
  let client: DedalusMCPClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    client = await DedalusMCPClient.fromStdio({ command: 'test' });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Tools API', () => {
    describe('listTools', () => {
      it('should list tools without cursor', async () => {
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'tool1', description: 'Test tool' }],
        });

        const result = await client.listTools();

        expect(mockListTools).toHaveBeenCalledWith(undefined);
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('tool1');
      });

      it('should list tools with cursor', async () => {
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'tool2' }],
          nextCursor: 'next',
        });

        const result = await client.listTools('cursor1');

        expect(mockListTools).toHaveBeenCalledWith({ cursor: 'cursor1' });
        expect(result.nextCursor).toBe('next');
      });
    });

    describe('listAllTools', () => {
      it('should paginate through all tools', async () => {
        mockListTools
          .mockResolvedValueOnce({
            tools: [{ name: 'tool1' }],
            nextCursor: 'cursor2',
          })
          .mockResolvedValueOnce({
            tools: [{ name: 'tool2' }],
            nextCursor: undefined,
          });

        const tools = await client.listAllTools();

        expect(mockListTools).toHaveBeenCalledTimes(2);
        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe('tool1');
        expect(tools[1].name).toBe('tool2');
      });
    });

    describe('callTool', () => {
      it('should call a tool with arguments', async () => {
        mockCallTool.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'result' }],
          isError: false,
        });

        const result = await client.callTool('myTool', { arg1: 'value1' });

        expect(mockCallTool).toHaveBeenCalledWith({
          name: 'myTool',
          arguments: { arg1: 'value1' },
          _meta: undefined,
        });
        expect(result.content[0]).toMatchObject({ type: 'text', text: 'result' });
      });

      it('should call a tool with progress token', async () => {
        mockCallTool.mockResolvedValueOnce({
          content: [],
          isError: false,
        });

        await client.callTool('myTool', {}, { _meta: { progressToken: 'token123' } });

        expect(mockCallTool).toHaveBeenCalledWith({
          name: 'myTool',
          arguments: {},
          _meta: { progressToken: 'token123' },
        });
      });
    });

    describe('onToolsChanged', () => {
      it('should register and unregister notification handler', () => {
        const callback = jest.fn();
        const unsubscribe = client.onToolsChanged(callback);

        expect(mockSetNotificationHandler).toHaveBeenCalledWith(
          { method: 'notifications/tools/list_changed' },
          callback,
        );

        unsubscribe();
        expect(mockRemoveNotificationHandler).toHaveBeenCalledWith({
          method: 'notifications/tools/list_changed',
        });
      });
    });
  });

  describe('Resources API', () => {
    describe('listResources', () => {
      it('should list resources', async () => {
        mockListResources.mockResolvedValueOnce({
          resources: [{ uri: 'file:///test.txt', name: 'test.txt' }],
        });

        const result = await client.listResources();

        expect(result.resources).toHaveLength(1);
        expect(result.resources[0].uri).toBe('file:///test.txt');
      });
    });

    describe('listAllResources', () => {
      it('should paginate through all resources', async () => {
        mockListResources
          .mockResolvedValueOnce({
            resources: [{ uri: 'file:///a.txt' }],
            nextCursor: 'next',
          })
          .mockResolvedValueOnce({
            resources: [{ uri: 'file:///b.txt' }],
          });

        const resources = await client.listAllResources();

        expect(resources).toHaveLength(2);
      });
    });

    describe('readResource', () => {
      it('should read a resource by URI', async () => {
        mockReadResource.mockResolvedValueOnce({
          contents: [{ uri: 'file:///test.txt', text: 'Hello World' }],
        });

        const result = await client.readResource('file:///test.txt');

        expect(mockReadResource).toHaveBeenCalledWith({ uri: 'file:///test.txt' });
        expect(result.contents[0].text).toBe('Hello World');
      });
    });

    describe('listResourceTemplates', () => {
      it('should list resource templates', async () => {
        mockListResourceTemplates.mockResolvedValueOnce({
          resourceTemplates: [{ uriTemplate: 'file:///{path}', name: 'Files' }],
        });

        const result = await client.listResourceTemplates();

        expect(result.resourceTemplates).toHaveLength(1);
      });
    });

    describe('subscribeToResource', () => {
      it('should subscribe to resource updates', async () => {
        mockSubscribeResource.mockResolvedValueOnce({});

        await client.subscribeToResource('file:///test.txt');

        expect(mockSubscribeResource).toHaveBeenCalledWith({ uri: 'file:///test.txt' });
      });
    });

    describe('unsubscribeFromResource', () => {
      it('should unsubscribe from resource updates', async () => {
        mockUnsubscribeResource.mockResolvedValueOnce({});

        await client.unsubscribeFromResource('file:///test.txt');

        expect(mockUnsubscribeResource).toHaveBeenCalledWith({ uri: 'file:///test.txt' });
      });
    });

    describe('onResourcesChanged', () => {
      it('should register notification handler for resource list changes', () => {
        const callback = jest.fn();
        const unsubscribe = client.onResourcesChanged(callback);

        expect(mockSetNotificationHandler).toHaveBeenCalledWith(
          { method: 'notifications/resources/list_changed' },
          callback,
        );

        unsubscribe();
        expect(mockRemoveNotificationHandler).toHaveBeenCalled();
      });
    });

    describe('onResourceUpdated', () => {
      it('should register notification handler for resource updates', () => {
        const callback = jest.fn();
        client.onResourceUpdated(callback);

        expect(mockSetNotificationHandler).toHaveBeenCalledWith(
          { method: 'notifications/resources/updated' },
          expect.any(Function),
        );
      });
    });
  });

  describe('Prompts API', () => {
    describe('listPrompts', () => {
      it('should list prompts', async () => {
        mockListPrompts.mockResolvedValueOnce({
          prompts: [{ name: 'greeting', description: 'A greeting prompt' }],
        });

        const result = await client.listPrompts();

        expect(result.prompts).toHaveLength(1);
        expect(result.prompts[0].name).toBe('greeting');
      });
    });

    describe('listAllPrompts', () => {
      it('should paginate through all prompts', async () => {
        mockListPrompts
          .mockResolvedValueOnce({
            prompts: [{ name: 'prompt1' }],
            nextCursor: 'next',
          })
          .mockResolvedValueOnce({
            prompts: [{ name: 'prompt2' }],
          });

        const prompts = await client.listAllPrompts();

        expect(prompts).toHaveLength(2);
      });
    });

    describe('getPrompt', () => {
      it('should get a prompt without arguments', async () => {
        mockGetPrompt.mockResolvedValueOnce({
          messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
        });

        const result = await client.getPrompt('greeting');

        expect(mockGetPrompt).toHaveBeenCalledWith({ name: 'greeting', arguments: undefined });
        expect(result.messages).toHaveLength(1);
      });

      it('should get a prompt with arguments', async () => {
        mockGetPrompt.mockResolvedValueOnce({
          messages: [{ role: 'user', content: { type: 'text', text: 'Hello Alice' } }],
        });

        const result = await client.getPrompt('greeting', { name: 'Alice' });

        expect(mockGetPrompt).toHaveBeenCalledWith({
          name: 'greeting',
          arguments: { name: 'Alice' },
        });
        expect(result.messages[0].content).toMatchObject({ text: 'Hello Alice' });
      });
    });

    describe('onPromptsChanged', () => {
      it('should register notification handler for prompt list changes', () => {
        const callback = jest.fn();
        const unsubscribe = client.onPromptsChanged(callback);

        expect(mockSetNotificationHandler).toHaveBeenCalledWith(
          { method: 'notifications/prompts/list_changed' },
          callback,
        );

        unsubscribe();
        expect(mockRemoveNotificationHandler).toHaveBeenCalled();
      });
    });
  });

  describe('Completions API', () => {
    describe('completePromptArgument', () => {
      it('should get completions for a prompt argument', async () => {
        mockComplete.mockResolvedValueOnce({
          completion: { values: ['Alice', 'Bob'], hasMore: false },
        });

        const result = await client.completePromptArgument('greeting', 'name', 'A');

        expect(mockComplete).toHaveBeenCalledWith({
          ref: { type: 'ref/prompt', name: 'greeting' },
          argument: { name: 'name', value: 'A' },
          context: undefined,
        });
        expect(result.completion.values).toContain('Alice');
      });

      it('should pass context arguments', async () => {
        mockComplete.mockResolvedValueOnce({
          completion: { values: ['World'] },
        });

        await client.completePromptArgument('greeting', 'suffix', 'W', { name: 'Alice' });

        expect(mockComplete).toHaveBeenCalledWith({
          ref: { type: 'ref/prompt', name: 'greeting' },
          argument: { name: 'suffix', value: 'W' },
          context: { arguments: { name: 'Alice' } },
        });
      });
    });

    describe('completeResourceArgument', () => {
      it('should get completions for a resource argument', async () => {
        mockComplete.mockResolvedValueOnce({
          completion: { values: ['file1.txt', 'file2.txt'] },
        });

        const result = await client.completeResourceArgument('file:///{path}', 'path', 'file');

        expect(mockComplete).toHaveBeenCalledWith({
          ref: { type: 'ref/resource', uri: 'file:///{path}' },
          argument: { name: 'path', value: 'file' },
        });
        expect(result.completion.values).toHaveLength(2);
      });
    });
  });

  describe('Logging API', () => {
    describe('setLogLevel', () => {
      it('should set the log level', async () => {
        mockSetLoggingLevel.mockResolvedValueOnce({});

        await client.setLogLevel('debug');

        expect(mockSetLoggingLevel).toHaveBeenCalledWith('debug');
      });
    });

    describe('onLogMessage', () => {
      it('should register notification handler for log messages', () => {
        const callback = jest.fn();
        const unsubscribe = client.onLogMessage(callback);

        expect(mockSetNotificationHandler).toHaveBeenCalledWith(
          { method: 'notifications/message' },
          expect.any(Function),
        );

        unsubscribe();
        expect(mockRemoveNotificationHandler).toHaveBeenCalled();
      });
    });
  });

  describe('Connection Guard', () => {
    it('should throw MCPConnectionError when not connected', async () => {
      await client.close();

      await expect(client.listTools()).rejects.toThrow(MCPConnectionError);
      await expect(client.listResources()).rejects.toThrow(MCPConnectionError);
      await expect(client.listPrompts()).rejects.toThrow(MCPConnectionError);
      await expect(client.callTool('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.readResource('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.getPrompt('test')).rejects.toThrow(MCPConnectionError);
      await expect(client.setLogLevel('debug')).rejects.toThrow(MCPConnectionError);
    });
  });
});
