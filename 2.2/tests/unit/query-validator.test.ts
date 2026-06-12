import { describe, expect, it } from 'vitest';

import { createQueryHandler, queryHandler } from '../../src/functions/query/handler';
import { executeQuery } from '../../src/functions/query/service';
import { parseQueryRequest, QueryRequestSchema } from '../../src/functions/query/validator';

describe('parseQueryRequest', () => {
  it('accepts a non-empty question and trims whitespace', () => {
    const parsed = parseQueryRequest({ question: '  Quais são os prazos de entrega?  ' });

    expect(parsed.question).toBe('Quais são os prazos de entrega?');
  });

  it('rejects empty questions', () => {
    expect(() => parseQueryRequest({ question: '   ' })).toThrow();
  });

  it('rejects questions longer than 500 characters', () => {
    const longQuestion = 'x'.repeat(501);

    expect(() => parseQueryRequest({ question: longQuestion })).toThrow();
  });
});

describe('QueryRequestSchema', () => {
  it('requires a question field', () => {
    expect(() => QueryRequestSchema.parse({})).toThrow();
  });
});

describe('queryHandler', () => {
  it('returns a 400 response for invalid input', async () => {
    const response = await queryHandler({ method: 'POST', body: { question: '   ' } });

    expect(response.status).toBe(400);
  });

  it('returns a 200 response for a valid question', async () => {
    const response = await queryHandler({ method: 'POST', body: { question: 'Quais são os prazos de entrega?' } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      answer: expect.any(String),
      source_document: expect.any(String),
      citations: expect.any(Array),
    });
  });

  it('uses injected search and completion services when available', async () => {
    const handler = createQueryHandler({
      search: async () => [{ source_document: 'doc-1.md', snippet: 'slas', score: 0.98 }],
      completion: async () => 'Resposta baseada em contexto',
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    const response = await handler({ method: 'POST', body: { question: 'Quais são os prazos?' } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      answer: 'Resposta baseada em contexto',
      source_document: 'doc-1.md',
      citations: [{ source_document: 'doc-1.md', snippet: 'slas', score: 0.98 }],
    });
  });
});

describe('executeQuery', () => {
  it('uses the versioned system prompt and respects the context budget', async () => {
    const response = await executeQuery('Quais são os prazos?', {
      search: async () => [{ source_document: 'doc-1.md', snippet: 'slas', score: 0.98 }],
      completion: async (prompt) => {
        expect(prompt).toContain('Você é o assistente');
        expect(prompt.length).toBeLessThan(12000);
        return 'Resposta com contexto';
      },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    expect(response.answer).toBe('Resposta com contexto');
    expect(response.citations).toHaveLength(1);
  });

  it('retries transient failures before succeeding', async () => {
    let attempts = 0;

    const response = await executeQuery('Quais são os prazos?', {
      search: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary search failure');
        }

        return [{ source_document: 'doc-1.md', snippet: 'slas', score: 0.98 }];
      },
      completion: async () => 'Resposta resiliente',
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    expect(attempts).toBe(2);
    expect(response.answer).toBe('Resposta resiliente');
  });
});
