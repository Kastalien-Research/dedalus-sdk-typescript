import {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPErrorCodes,
  createProtocolError,
} from '../../../src/lib/mcp-client/errors';

describe('MCP Error Classes', () => {
  describe('MCPError', () => {
    it('should create an error with correct name and message', () => {
      const error = new MCPError('Test error message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MCPError);
      expect(error.name).toBe('MCPError');
      expect(error.message).toBe('Test error message');
    });

    it('should have a stack trace', () => {
      const error = new MCPError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MCPError');
    });
  });

  describe('MCPConnectionError', () => {
    it('should create an error with message only', () => {
      const error = new MCPConnectionError('Connection failed');

      expect(error).toBeInstanceOf(MCPError);
      expect(error).toBeInstanceOf(MCPConnectionError);
      expect(error.name).toBe('MCPConnectionError');
      expect(error.message).toBe('Connection failed');
      expect(error.cause).toBeUndefined();
    });

    it('should create an error with cause', () => {
      const cause = new Error('Original error');
      const error = new MCPConnectionError('Connection failed', cause);

      expect(error.message).toBe('Connection failed');
      expect(error.cause).toBe(cause);
    });
  });

  describe('MCPTimeoutError', () => {
    it('should create an error with timeout value', () => {
      const error = new MCPTimeoutError('Operation timed out', 30000);

      expect(error).toBeInstanceOf(MCPError);
      expect(error).toBeInstanceOf(MCPTimeoutError);
      expect(error.name).toBe('MCPTimeoutError');
      expect(error.message).toBe('Operation timed out');
      expect(error.timeoutMs).toBe(30000);
    });
  });

  describe('MCPProtocolError', () => {
    it('should create an error with code only', () => {
      const error = new MCPProtocolError('Method not found', -32601);

      expect(error).toBeInstanceOf(MCPError);
      expect(error).toBeInstanceOf(MCPProtocolError);
      expect(error.name).toBe('MCPProtocolError');
      expect(error.message).toBe('Method not found');
      expect(error.code).toBe(-32601);
      expect(error.data).toBeUndefined();
    });

    it('should create an error with code and data', () => {
      const data = { details: 'Additional info' };
      const error = new MCPProtocolError('Invalid params', -32602, data);

      expect(error.code).toBe(-32602);
      expect(error.data).toEqual(data);
    });
  });

  describe('MCPErrorCodes', () => {
    it('should have correct standard JSON-RPC error codes', () => {
      expect(MCPErrorCodes.ParseError).toBe(-32700);
      expect(MCPErrorCodes.InvalidRequest).toBe(-32600);
      expect(MCPErrorCodes.MethodNotFound).toBe(-32601);
      expect(MCPErrorCodes.InvalidParams).toBe(-32602);
      expect(MCPErrorCodes.InternalError).toBe(-32603);
    });

    it('should have correct MCP-specific error codes', () => {
      expect(MCPErrorCodes.ResourceNotFound).toBe(-32002);
      expect(MCPErrorCodes.URLElicitationRequired).toBe(-32042);
      expect(MCPErrorCodes.UserRejected).toBe(-1);
    });
  });

  describe('createProtocolError', () => {
    it('should create error with default message for known codes', () => {
      const error = createProtocolError(MCPErrorCodes.MethodNotFound);

      expect(error).toBeInstanceOf(MCPProtocolError);
      expect(error.code).toBe(-32601);
      expect(error.message).toBe('Method not found');
    });

    it('should create error with custom message', () => {
      const error = createProtocolError(MCPErrorCodes.InvalidParams, 'Custom message');

      expect(error.message).toBe('Custom message');
      expect(error.code).toBe(-32602);
    });

    it('should create error with data', () => {
      const data = { field: 'test' };
      const error = createProtocolError(MCPErrorCodes.InternalError, 'Error', data);

      expect(error.data).toEqual(data);
    });

    it('should handle all error codes', () => {
      const codes = [
        MCPErrorCodes.ParseError,
        MCPErrorCodes.InvalidRequest,
        MCPErrorCodes.MethodNotFound,
        MCPErrorCodes.InvalidParams,
        MCPErrorCodes.InternalError,
        MCPErrorCodes.ResourceNotFound,
        MCPErrorCodes.URLElicitationRequired,
        MCPErrorCodes.UserRejected,
      ];

      for (const code of codes) {
        const error = createProtocolError(code);
        expect(error.code).toBe(code);
        expect(error.message).toBeTruthy();
      }
    });
  });
});
