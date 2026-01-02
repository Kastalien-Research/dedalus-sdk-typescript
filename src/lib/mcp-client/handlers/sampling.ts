// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Sampling handler for MCP client.
 *
 * Routes sampling/createMessage requests from MCP servers to the Dedalus API,
 * enabling servers to request LLM completions through the client.
 */

import type { Dedalus } from '../../../client';
import type {
  CreateMessageRequestParams,
  CreateMessageResult,
  SamplingMessage,
  ModelPreferences,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Options for creating a sampling handler.
 */
export interface SamplingHandlerOptions {
  /** Dedalus client instance for making API calls */
  dedalus: Dedalus;

  /**
   * Default model to use if none specified in preferences.
   * @default 'openai/gpt-4o'
   */
  defaultModel?: string;

  /**
   * Human-in-the-loop approval callback.
   * Called before each sampling request to get user approval.
   * Return true to allow, false to reject.
   */
  approvalCallback?: (request: CreateMessageRequestParams) => Promise<boolean>;

  /**
   * Maximum tokens per request.
   * @default 4096
   */
  maxTokens?: number;
}

/**
 * Options for creating a sampling handler with tool use support.
 */
export interface SamplingWithToolsOptions extends SamplingHandlerOptions {
  /** Available tools for sampling */
  tools?: Tool[];

  /** Tool call handler - called when the model requests a tool call */
  toolHandler?: (name: string, args: Record<string, unknown>) => Promise<unknown>;

  /**
   * Maximum tool use iterations before failing.
   * @default 10
   */
  maxIterations?: number;
}

/**
 * Create a sampling handler that routes requests to the Dedalus API.
 *
 * @param options - Handler configuration
 * @returns Handler function for sampling/createMessage requests
 *
 * @example
 * ```typescript
 * const handler = createSamplingHandler({
 *   dedalus: new Dedalus({ apiKey: '...' }),
 *   defaultModel: 'anthropic/claude-3-5-sonnet',
 *   approvalCallback: async (req) => confirm('Allow sampling?'),
 * });
 * ```
 */
export function createSamplingHandler(
  options: SamplingHandlerOptions,
): (request: CreateMessageRequestParams) => Promise<CreateMessageResult> {
  const {
    dedalus,
    defaultModel = 'openai/gpt-4o',
    approvalCallback,
    maxTokens = 4096,
  } = options;

  return async (request: CreateMessageRequestParams): Promise<CreateMessageResult> => {
    // Human-in-the-loop approval
    if (approvalCallback) {
      const approved = await approvalCallback(request);
      if (!approved) {
        throw new Error('User rejected sampling request');
      }
    }

    // Resolve model from preferences
    const model = resolveModel(request.modelPreferences, defaultModel);

    // Convert MCP messages to Dedalus format
    const messages = convertMessages(request.messages);

    // Build final messages array with optional system prompt
    const finalMessages = request.systemPrompt
      ? [{ role: 'system' as const, content: request.systemPrompt }, ...messages]
      : messages;

    // Make request to Dedalus API
    const response = await dedalus.chat.completions.create({
      model,
      messages: finalMessages,
      max_tokens: Math.min(request.maxTokens ?? maxTokens, maxTokens),
      stop: request.stopSequences ?? null,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response from Dedalus API');
    }

    return {
      role: 'assistant',
      content: {
        type: 'text',
        text: choice.message.content ?? '',
      },
      model: response.model,
      stopReason: mapStopReason(choice.finish_reason),
    };
  };
}

/**
 * Create a sampling handler that supports tool use.
 *
 * This handler will execute a tool use loop, calling tools as requested
 * by the model until a final response is generated or max iterations is reached.
 *
 * @param options - Handler configuration with tools
 * @returns Handler function for sampling/createMessage requests
 *
 * @example
 * ```typescript
 * const handler = createSamplingWithToolsHandler({
 *   dedalus: new Dedalus({ apiKey: '...' }),
 *   tools: [{ name: 'search', ... }],
 *   toolHandler: async (name, args) => {
 *     if (name === 'search') return searchWeb(args.query);
 *   },
 * });
 * ```
 */
export function createSamplingWithToolsHandler(
  options: SamplingWithToolsOptions,
): (request: CreateMessageRequestParams) => Promise<CreateMessageResult> {
  const {
    dedalus,
    defaultModel = 'openai/gpt-4o',
    approvalCallback,
    maxTokens = 4096,
    tools = [],
    toolHandler,
    maxIterations = 10,
  } = options;

  return async (request: CreateMessageRequestParams): Promise<CreateMessageResult> => {
    // Human-in-the-loop approval
    if (approvalCallback) {
      const approved = await approvalCallback(request);
      if (!approved) {
        throw new Error('User rejected sampling request');
      }
    }

    const model = resolveModel(request.modelPreferences, defaultModel);

    // Build messages with optional system prompt
    const baseMessages = convertMessages(request.messages);
    const messages: Array<{ role: string; content: string; tool_call_id?: string }> =
      request.systemPrompt
        ? [{ role: 'system', content: request.systemPrompt }, ...baseMessages]
        : [...baseMessages];

    // Convert MCP tools to OpenAI format
    const openaiTools = tools.length > 0
      ? tools.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: tool.inputSchema,
          },
        }))
      : null;

    for (let i = 0; i < maxIterations; i++) {
      const response = await dedalus.chat.completions.create({
        model,
        messages: messages as any,
        tools: openaiTools,
        max_tokens: Math.min(request.maxTokens ?? maxTokens, maxTokens),
        stop: request.stopSequences ?? null,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from Dedalus API');
      }

      // If no tool calls, return the response
      if (!choice.message.tool_calls?.length) {
        return {
          role: 'assistant',
          content: {
            type: 'text',
            text: choice.message.content ?? '',
          },
          model: response.model,
          stopReason: mapStopReason(choice.finish_reason),
        };
      }

      // Process tool calls
      messages.push({
        role: 'assistant',
        content: choice.message.content ?? '',
        ...({ tool_calls: choice.message.tool_calls } as any),
      });

      for (const toolCall of choice.message.tool_calls) {
        if (!toolHandler) {
          throw new Error('Tool handler required for tool calls but not provided');
        }

        // Handle standard function tool calls
        if ('function' in toolCall && toolCall.function) {
          try {
            const result = await toolHandler(
              toolCall.function.name,
              JSON.parse(toolCall.function.arguments),
            );

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });
          } catch (error) {
            // Include tool error in the conversation
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }
    }

    throw new Error(`Max iterations (${maxIterations}) exceeded in sampling with tools`);
  };
}

/**
 * Resolve model from preferences using hints.
 */
function resolveModel(preferences: ModelPreferences | undefined, defaultModel: string): string {
  if (!preferences) {
    return defaultModel;
  }

  // Try hints first (in order of preference)
  if (preferences.hints?.length) {
    for (const hint of preferences.hints) {
      if (hint.name) {
        return hint.name;
      }
    }
  }

  return defaultModel;
}

/**
 * Convert MCP sampling messages to Dedalus chat format.
 */
function convertMessages(
  messages: SamplingMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: extractTextContent(msg.content),
  }));
}

/**
 * Extract text from content (handling different content types).
 * Content can be a single block or an array of blocks.
 */
function extractTextContent(content: SamplingMessage['content']): string {
  // Handle array of content blocks
  if (Array.isArray(content)) {
    return content
      .map((block) => extractSingleBlock(block))
      .filter(Boolean)
      .join('\n');
  }
  // Handle single content block
  return extractSingleBlock(content);
}

/**
 * Extract text from a single content block.
 */
function extractSingleBlock(block: { type: string; text?: string }): string {
  if (block.type === 'text' && 'text' in block) {
    return block.text ?? '';
  }
  // For image/audio/tool content, indicate non-text content
  // Full multimodal support could be added here
  return `[${block.type} content]`;
}

/**
 * Map Dedalus finish reason to MCP stop reason.
 */
function mapStopReason(
  finishReason: string | null | undefined,
): 'endTurn' | 'stopSequence' | 'maxTokens' | undefined {
  if (finishReason == null) {
    return undefined;
  }
  switch (finishReason) {
    case 'stop':
      return 'endTurn';
    case 'length':
      return 'maxTokens';
    case 'content_filter':
      return 'endTurn';
    default:
      return undefined;
  }
}
