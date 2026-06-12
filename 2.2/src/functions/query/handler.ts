import { createLogger, Logger } from '../../shared/logger';
import { buildQueryResponse } from './response-builder';
import { executeQuery, QueryDependencies } from './service';
import { parseQueryRequest } from './validator';

export interface HttpRequest {
  method: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  url?: string;
}

export interface HttpResponseInit {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface FunctionContext {
  invocationId?: string;
  traceContext?: {
    traceparent?: string;
  };
}

export interface QueryHandlerDependencies extends Partial<QueryDependencies> {
  logger?: Logger;
}

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      'content-type': 'application/json',
    },
    body,
  };
}

export function createQueryHandler(dependencies: QueryHandlerDependencies = {}): (request: HttpRequest, context?: FunctionContext) => Promise<HttpResponseInit> {
  const logger = dependencies.logger ?? createLogger();

  return async function queryHandler(request: HttpRequest, context?: FunctionContext): Promise<HttpResponseInit> {
    const requestId = context?.invocationId ?? request.headers?.['x-request-id'] ?? 'local-request';
    const startedAt = Date.now();
    logger.info('query.request.received', { requestId, method: request.method, path: request.url, traceParent: context?.traceContext?.traceparent });

    if (request.method.toUpperCase() !== 'POST') {
      logger.warn('query.request.method_not_allowed', { requestId, method: request.method });
      return jsonResponse(405, { error: 'Method Not Allowed' });
    }

    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      const parsedRequest = parseQueryRequest(body);
      const { answer, citations } = await executeQuery(parsedRequest.question, {
        logger,
        search: dependencies.search,
        completion: dependencies.completion,
      });
      const responseBody = buildQueryResponse(answer, citations);

      logger.info('query.request.completed', {
        requestId,
        citationsCount: responseBody.citations.length,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse(200, responseBody);
    } catch (error: unknown) {
      const zodError = error as { issues?: Array<{ path: unknown; message: string }> } | undefined;
      if (zodError?.issues) {
        logger.warn('query.request.invalid', { requestId, details: zodError.issues });
        return jsonResponse(400, {
          error: 'Invalid request',
          details: zodError.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        });
      }

      logger.error('query.request.failed', {
        requestId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse(500, { error: 'Internal Server Error' });
    }
  };
}

export const queryHandler = createQueryHandler();

export async function queryHttpTrigger(request: HttpRequest, context: FunctionContext): Promise<HttpResponseInit> {
  return queryHandler(request, context);
}
