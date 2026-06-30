import { z } from "zod";

/**
 * Schema do structured output do assistente NovaTech.
 *
 * .strict() é deliberado: rejeita qualquer campo além dos previstos.
 * Sem isso, o modelo poderia incluir campos não controlados na resposta
 * (ex: um campo "debug" ou "raw_prompt") que nunca seriam validados nem
 * tratados, e que poderiam ser expostos acidentalmente ao atendente.
 */
export const AssistantResponseSchema = z
  .object({
    answer: z.string().min(1, "answer não pode ser vazio"),
    source_document: z.string().min(1, "source_document é obrigatório"),
    confidence_score: z
      .number()
      .min(0, "confidence_score deve ser >= 0")
      .max(1, "confidence_score deve ser <= 1"),
  })
  .strict();

export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;
