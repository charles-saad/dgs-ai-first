import { z } from 'zod';

import { SearchResult } from './service';

export const QueryResponseSchema = z.object({
  answer: z.string().min(1),
  source_document: z.string().nullable(),
  citations: z.array(
    z.object({
      source_document: z.string(),
      snippet: z.string(),
      score: z.number().min(0).max(1),
    }),
  ),
});

export interface QueryResponse {
  answer: string;
  source_document: string | null;
  citations: Array<{
    source_document: string;
    snippet: string;
    score: number;
  }>;
}

export function buildQueryResponse(answer: string, citations: SearchResult[]): QueryResponse {
  const primaryDocument = citations[0]?.source_document ?? null;
  const payload: QueryResponse = {
    answer,
    source_document: primaryDocument,
    citations: citations.map((citation) => ({
      source_document: citation.source_document,
      snippet: citation.snippet,
      score: citation.score,
    })),
  };

  return QueryResponseSchema.parse(payload);
}
