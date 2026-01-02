// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Client feature handlers for MCP.
 *
 * These handlers implement capabilities that the MCP client provides to
 * connected servers: sampling, roots, and elicitation.
 */

// Sampling
export { createSamplingHandler, createSamplingWithToolsHandler } from './sampling';
export type { SamplingHandlerOptions, SamplingWithToolsOptions } from './sampling';

// Roots
export { RootsHandler } from './roots';
export type { RootsHandlerOptions, ListRootsResult } from './roots';

// Elicitation
export { ElicitationHandler } from './elicitation';
export type {
  ElicitationHandlerOptions,
  ElicitationAction,
  FormElicitationHandler,
  URLElicitationHandler,
  FormElicitationRequest,
  URLElicitationRequest,
  FormElicitationResult,
  URLElicitationResult,
} from './elicitation';
