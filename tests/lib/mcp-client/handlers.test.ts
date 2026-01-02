// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

import {
  RootsHandler,
  ElicitationHandler,
} from '../../../src/lib/mcp-client/handlers';

// =============================================================================
// RootsHandler Tests
// =============================================================================

describe('RootsHandler', () => {
  describe('constructor', () => {
    it('should initialize with empty roots by default', () => {
      const handler = new RootsHandler({});
      const result = handler.handleList();
      expect(result.roots).toEqual([]);
    });

    it('should initialize with provided roots', () => {
      const roots = [
        { uri: 'file:///home/user/project', name: 'Project' },
        { uri: 'file:///home/user/config' },
      ];
      const handler = new RootsHandler({ roots });
      const result = handler.handleList();

      expect(result.roots).toHaveLength(2);
      expect(result.roots[0]).toEqual({ uri: 'file:///home/user/project', name: 'Project' });
      expect(result.roots[1]).toEqual({ uri: 'file:///home/user/config' });
    });
  });

  describe('handleList', () => {
    it('should return current roots', () => {
      const roots = [{ uri: 'file:///test', name: 'Test' }];
      const handler = new RootsHandler({ roots });

      const result = handler.handleList();
      expect(result).toEqual({ roots });
    });
  });

  describe('getRoots', () => {
    it('should return a copy of the roots array', () => {
      const roots = [{ uri: 'file:///test' }];
      const handler = new RootsHandler({ roots });

      const retrieved = handler.getRoots();
      expect(retrieved).toEqual(roots);

      // Ensure it's a copy
      retrieved.push({ uri: 'file:///other' });
      expect(handler.getRoots()).toHaveLength(1);
    });
  });

  describe('setRoots', () => {
    it('should replace all roots', () => {
      const handler = new RootsHandler({ roots: [{ uri: 'file:///old' }] });
      const newRoots = [{ uri: 'file:///new1' }, { uri: 'file:///new2' }];

      handler.setRoots(newRoots);
      expect(handler.getRoots()).toEqual(newRoots);
    });

    it('should trigger change callback', () => {
      const callback = jest.fn();
      const handler = new RootsHandler({ roots: [] });
      handler.onRootsChanged(callback);

      handler.setRoots([{ uri: 'file:///new' }]);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('addRoot', () => {
    it('should add a new root', () => {
      const handler = new RootsHandler({ roots: [{ uri: 'file:///existing' }] });
      handler.addRoot({ uri: 'file:///new', name: 'New' });

      const roots = handler.getRoots();
      expect(roots).toHaveLength(2);
      expect(roots[1]).toEqual({ uri: 'file:///new', name: 'New' });
    });

    it('should not add duplicate URIs', () => {
      const handler = new RootsHandler({ roots: [{ uri: 'file:///existing' }] });
      handler.addRoot({ uri: 'file:///existing', name: 'Duplicate' });

      expect(handler.getRoots()).toHaveLength(1);
    });

    it('should trigger change callback only for new roots', () => {
      const callback = jest.fn();
      const handler = new RootsHandler({ roots: [{ uri: 'file:///existing' }] });
      handler.onRootsChanged(callback);

      handler.addRoot({ uri: 'file:///new' });
      expect(callback).toHaveBeenCalledTimes(1);

      handler.addRoot({ uri: 'file:///existing' }); // Duplicate
      expect(callback).toHaveBeenCalledTimes(1); // No additional call
    });
  });

  describe('removeRoot', () => {
    it('should remove a root by URI', () => {
      const handler = new RootsHandler({
        roots: [{ uri: 'file:///a' }, { uri: 'file:///b' }],
      });

      const removed = handler.removeRoot('file:///a');
      expect(removed).toBe(true);
      expect(handler.getRoots()).toHaveLength(1);
      expect(handler.getRoots()[0]?.uri).toBe('file:///b');
    });

    it('should return false for non-existent URI', () => {
      const handler = new RootsHandler({ roots: [{ uri: 'file:///a' }] });
      const removed = handler.removeRoot('file:///nonexistent');

      expect(removed).toBe(false);
      expect(handler.getRoots()).toHaveLength(1);
    });

    it('should trigger change callback only for actual removals', () => {
      const callback = jest.fn();
      const handler = new RootsHandler({ roots: [{ uri: 'file:///a' }] });
      handler.onRootsChanged(callback);

      handler.removeRoot('file:///nonexistent');
      expect(callback).not.toHaveBeenCalled();

      handler.removeRoot('file:///a');
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasRoot', () => {
    it('should return true for existing roots', () => {
      const handler = new RootsHandler({ roots: [{ uri: 'file:///exists' }] });
      expect(handler.hasRoot('file:///exists')).toBe(true);
    });

    it('should return false for non-existent roots', () => {
      const handler = new RootsHandler({ roots: [] });
      expect(handler.hasRoot('file:///missing')).toBe(false);
    });
  });

  describe('onRootsChanged', () => {
    it('should allow multiple callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const handler = new RootsHandler({ roots: [] });

      handler.onRootsChanged(callback1);
      handler.onRootsChanged(callback2);
      handler.setRoots([{ uri: 'file:///new' }]);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const handler = new RootsHandler({ roots: [] });

      const unsubscribe = handler.onRootsChanged(callback);
      handler.setRoots([{ uri: 'file:///first' }]);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      handler.setRoots([{ uri: 'file:///second' }]);
      expect(callback).toHaveBeenCalledTimes(1); // No additional call
    });
  });
});

// =============================================================================
// ElicitationHandler Tests
// =============================================================================

describe('ElicitationHandler', () => {
  describe('constructor', () => {
    it('should initialize without handlers', () => {
      const handler = new ElicitationHandler({});
      expect(handler.supportsForm()).toBe(false);
      expect(handler.supportsURL()).toBe(false);
    });

    it('should initialize with form handler', () => {
      const formHandler = jest.fn();
      const handler = new ElicitationHandler({ formHandler });
      expect(handler.supportsForm()).toBe(true);
      expect(handler.supportsURL()).toBe(false);
    });

    it('should initialize with URL handler', () => {
      const urlHandler = jest.fn();
      const handler = new ElicitationHandler({ urlHandler });
      expect(handler.supportsForm()).toBe(false);
      expect(handler.supportsURL()).toBe(true);
    });

    it('should initialize with both handlers', () => {
      const handler = new ElicitationHandler({
        formHandler: jest.fn(),
        urlHandler: jest.fn(),
      });
      expect(handler.supportsForm()).toBe(true);
      expect(handler.supportsURL()).toBe(true);
    });
  });

  describe('handleElicitation - form type', () => {
    it('should handle form elicitation with accept', async () => {
      const formHandler = jest.fn().mockResolvedValue({
        action: 'accept',
        content: { name: 'Test', value: 123 },
      });

      const handler = new ElicitationHandler({ formHandler });

      const result = await handler.handleElicitation({
        requestId: 'req-1',
        content: {
          type: 'form',
          message: 'Please fill out this form',
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      });

      expect(formHandler).toHaveBeenCalledWith({
        requestId: 'req-1',
        message: 'Please fill out this form',
        schema: { type: 'object', properties: { name: { type: 'string' } } },
      });
      expect(result).toEqual({
        action: 'accept',
        content: { name: 'Test', value: 123 },
      });
    });

    it('should handle form elicitation with decline', async () => {
      const formHandler = jest.fn().mockResolvedValue({ action: 'decline' });
      const handler = new ElicitationHandler({ formHandler });

      const result = await handler.handleElicitation({
        requestId: 'req-2',
        content: { type: 'form', message: 'Fill this', schema: {} },
      });

      expect(result).toEqual({ action: 'decline' });
    });

    it('should handle form elicitation with cancel', async () => {
      const formHandler = jest.fn().mockResolvedValue({ action: 'cancel' });
      const handler = new ElicitationHandler({ formHandler });

      const result = await handler.handleElicitation({
        requestId: 'req-3',
        content: { type: 'form', message: 'Fill this', schema: {} },
      });

      expect(result).toEqual({ action: 'cancel' });
    });

    it('should decline when no form handler provided', async () => {
      const handler = new ElicitationHandler({});

      const result = await handler.handleElicitation({
        requestId: 'req-4',
        content: { type: 'form', message: 'Fill this', schema: {} },
      });

      expect(result).toEqual({ action: 'decline' });
    });

    it('should cancel on form handler error', async () => {
      const formHandler = jest.fn().mockRejectedValue(new Error('Form error'));
      const handler = new ElicitationHandler({ formHandler });

      const result = await handler.handleElicitation({
        requestId: 'req-5',
        content: { type: 'form', message: 'Fill this', schema: {} },
      });

      // Errors during handling result in 'cancel' action
      expect(result).toEqual({ action: 'cancel' });
    });
  });

  describe('handleElicitation - URL type', () => {
    it('should handle URL elicitation with accept', async () => {
      const urlHandler = jest.fn().mockResolvedValue({ action: 'accept' });
      const handler = new ElicitationHandler({
        urlHandler,
        allowedSchemes: ['https', 'data'],
      });

      const result = await handler.handleElicitation({
        requestId: 'req-6',
        content: {
          type: 'url',
          message: 'Please visit this URL',
          url: 'https://example.com/auth',
        },
      });

      expect(urlHandler).toHaveBeenCalledWith({
        requestId: 'req-6',
        message: 'Please visit this URL',
        url: 'https://example.com/auth',
      });
      expect(result).toEqual({ action: 'accept' });
    });

    it('should decline when no URL handler provided', async () => {
      const handler = new ElicitationHandler({});

      const result = await handler.handleElicitation({
        requestId: 'req-7',
        content: { type: 'url', message: 'Visit', url: 'https://example.com' },
      });

      expect(result).toEqual({ action: 'decline' });
    });

    it('should decline disallowed URL schemes', async () => {
      const urlHandler = jest.fn().mockResolvedValue({ action: 'accept' });
      const handler = new ElicitationHandler({
        urlHandler,
        allowedSchemes: ['https'],
      });

      const result = await handler.handleElicitation({
        requestId: 'req-8',
        content: { type: 'url', message: 'Visit', url: 'javascript:alert(1)' },
      });

      expect(urlHandler).not.toHaveBeenCalled();
      expect(result).toEqual({ action: 'decline' });
    });

    it('should cancel on URL handler error', async () => {
      const urlHandler = jest.fn().mockRejectedValue(new Error('URL error'));
      const handler = new ElicitationHandler({ urlHandler });

      const result = await handler.handleElicitation({
        requestId: 'req-9',
        content: { type: 'url', message: 'Visit', url: 'https://example.com' },
      });

      // Errors during handling result in 'cancel' action
      expect(result).toEqual({ action: 'cancel' });
    });
  });

  describe('handleElicitation - unknown type', () => {
    it('should decline unknown content types', async () => {
      const handler = new ElicitationHandler({
        formHandler: jest.fn(),
        urlHandler: jest.fn(),
      });

      const result = await handler.handleElicitation({
        requestId: 'req-10',
        content: { type: 'unknown' as any, message: 'Unknown' },
      });

      expect(result).toEqual({ action: 'decline' });
    });
  });
});
