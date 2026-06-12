declare module '@azure/functions' {
  export interface HttpRequest {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    body?: unknown;
  }

  export interface HttpResponseInit {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  }

  export interface InvocationContext {
    invocationId: string;
    traceContext?: {
      traceparent?: string;
    };
  }

  export interface HttpHandler {
    (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>;
  }

  export interface HttpFunctionOptions {
    methods?: string[];
    authLevel?: string;
    route?: string;
    handler: HttpHandler;
  }

  export const app: {
    http(name: string, options: HttpFunctionOptions): void;
  };
}
