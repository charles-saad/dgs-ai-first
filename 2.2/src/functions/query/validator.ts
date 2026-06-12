import { z } from 'zod';

export const QueryRequestSchema = z.object({
  question: z
    .string({ required_error: 'A pergunta é obrigatória.' })
    .trim()
    .min(1, 'A pergunta não pode estar vazia.')
    .max(500, 'A pergunta deve ter no máximo 500 caracteres.'),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export function parseQueryRequest(input: unknown): QueryRequest {
  return QueryRequestSchema.parse(input);
}
