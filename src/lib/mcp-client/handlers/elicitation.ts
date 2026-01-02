// ==============================================================================
//                  © 2025 Dedalus Labs, Inc. and affiliates
//                            Licensed under MIT
//           github.com/dedalus-labs/dedalus-sdk-typescript/LICENSE
// ==============================================================================

/**
 * Elicitation handler for MCP client.
 *
 * Handles elicitation/create requests from servers, enabling servers to
 * request user input via forms or external URLs.
 */

/**
 * Result actions for elicitation requests.
 */
export type ElicitationAction = 'accept' | 'decline' | 'cancel';

/**
 * Request for form-based elicitation.
 */
export interface FormElicitationRequest {
  /** Request ID for tracking */
  requestId: string;

  /** Message to display to user */
  message: string;

  /** JSON Schema defining the form fields */
  schema: Record<string, unknown>;
}

/**
 * Result of form elicitation.
 */
export interface FormElicitationResult {
  /** Action taken by the user */
  action: ElicitationAction;

  /** Form data when action is 'accept' */
  content?: Record<string, unknown>;
}

/**
 * Request for URL-based elicitation.
 */
export interface URLElicitationRequest {
  /** Request ID for tracking */
  requestId: string;

  /** Message to display to user */
  message: string;

  /** URL for user interaction */
  url: string;
}

/**
 * Result of URL elicitation.
 */
export interface URLElicitationResult {
  /** Action taken by the user */
  action: ElicitationAction;
}

/**
 * Handler function for form-based elicitation.
 */
export type FormElicitationHandler = (
  request: FormElicitationRequest,
) => Promise<FormElicitationResult>;

/**
 * Handler function for URL-based elicitation.
 */
export type URLElicitationHandler = (
  request: URLElicitationRequest,
) => Promise<URLElicitationResult>;

/**
 * Options for creating an ElicitationHandler.
 */
export interface ElicitationHandlerOptions {
  /** Handler for form elicitation requests */
  formHandler?: FormElicitationHandler | undefined;

  /** Handler for URL elicitation requests */
  urlHandler?: URLElicitationHandler | undefined;

  /**
   * Allowed URL schemes for URL elicitation.
   * @default ['https', 'data']
   */
  allowedSchemes?: string[] | undefined;
}

/**
 * Internal elicitation request format.
 */
interface ElicitRequest {
  requestId: string;
  content: ElicitationContent;
}

/**
 * Elicitation content types.
 */
type ElicitationContent =
  | { type: 'form'; message: string; schema: Record<string, unknown> }
  | { type: 'url'; message: string; url: string };

/**
 * Internal elicitation result format.
 */
interface ElicitResult {
  action: ElicitationAction;
  content?: Record<string, unknown>;
}

/**
 * Handler for elicitation requests.
 *
 * Supports two types of elicitation:
 * - Form: Collect structured data from the user via a JSON Schema-based form
 * - URL: Direct the user to an external URL for authentication or data entry
 *
 * @example
 * ```typescript
 * const handler = new ElicitationHandler({
 *   formHandler: async (request) => {
 *     // Show form UI based on request.schema
 *     const answers = await showForm(request.schema);
 *     return { action: 'accept', content: answers };
 *   },
 *   urlHandler: async (request) => {
 *     // Open URL in browser
 *     await openBrowser(request.url);
 *     return { action: 'accept' };
 *   },
 * });
 * ```
 */
export class ElicitationHandler {
  private formHandler: FormElicitationHandler | undefined;
  private urlHandler: URLElicitationHandler | undefined;
  private allowedSchemes: Set<string>;

  constructor(options: ElicitationHandlerOptions) {
    this.formHandler = options.formHandler ?? undefined;
    this.urlHandler = options.urlHandler ?? undefined;
    this.allowedSchemes = new Set(options.allowedSchemes ?? ['https', 'data']);
  }

  /**
   * Check if form elicitation is supported.
   */
  supportsForm(): boolean {
    return !!this.formHandler;
  }

  /**
   * Check if URL elicitation is supported.
   */
  supportsURL(): boolean {
    return !!this.urlHandler;
  }

  /**
   * Handle an elicitation/create request.
   *
   * @param request - The elicitation request
   * @returns Elicitation result
   */
  async handleElicitation(request: ElicitRequest): Promise<ElicitResult> {
    const content = request.content;

    if (this.isFormContent(content)) {
      return this.handleFormElicitation(request.requestId, content);
    }

    if (this.isURLContent(content)) {
      return this.handleURLElicitation(request.requestId, content);
    }

    // Unknown content type - decline
    return { action: 'decline' };
  }

  /**
   * Handle form-based elicitation.
   */
  private async handleFormElicitation(
    requestId: string,
    content: { type: 'form'; message: string; schema: Record<string, unknown> },
  ): Promise<ElicitResult> {
    if (!this.formHandler) {
      return { action: 'decline' };
    }

    try {
      const result = await this.formHandler({
        requestId,
        message: content.message,
        schema: content.schema,
      });

      if (result.action === 'accept' && result.content) {
        return { action: 'accept', content: result.content };
      }

      return { action: result.action };
    } catch {
      return { action: 'cancel' };
    }
  }

  /**
   * Handle URL-based elicitation.
   */
  private async handleURLElicitation(
    requestId: string,
    content: { type: 'url'; message: string; url: string },
  ): Promise<ElicitResult> {
    if (!this.urlHandler) {
      return { action: 'decline' };
    }

    // Validate URL scheme for security
    try {
      const url = new URL(content.url);
      const scheme = url.protocol.replace(':', '');
      if (!this.allowedSchemes.has(scheme)) {
        // Reject disallowed schemes silently
        return { action: 'decline' };
      }
    } catch {
      // Invalid URL
      return { action: 'decline' };
    }

    try {
      const result = await this.urlHandler({
        requestId,
        message: content.message,
        url: content.url,
      });

      return { action: result.action };
    } catch {
      return { action: 'cancel' };
    }
  }

  /**
   * Type guard for form content.
   */
  private isFormContent(
    content: ElicitationContent,
  ): content is { type: 'form'; message: string; schema: Record<string, unknown> } {
    return content.type === 'form';
  }

  /**
   * Type guard for URL content.
   */
  private isURLContent(
    content: ElicitationContent,
  ): content is { type: 'url'; message: string; url: string } {
    return content.type === 'url';
  }

  /**
   * Get the list of allowed URL schemes.
   */
  getAllowedSchemes(): string[] {
    return Array.from(this.allowedSchemes);
  }

  /**
   * Add an allowed URL scheme.
   */
  addAllowedScheme(scheme: string): void {
    this.allowedSchemes.add(scheme.toLowerCase());
  }

  /**
   * Remove an allowed URL scheme.
   */
  removeAllowedScheme(scheme: string): void {
    this.allowedSchemes.delete(scheme.toLowerCase());
  }
}
