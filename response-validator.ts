import { logger } from "../shared/logger";
import {
  AssistantResponseSchema,
  AssistantResponse,
} from "./schemas/assistant-response.schema";

/**
 * Resposta padrão e segura, devolvida sempre que um guardrail bloqueia a
 * resposta original. Nunca contém informação não verificada.
 */
const FALLBACK_RESPONSE: AssistantResponse = {
  answer:
    "Não consegui validar esta informação com segurança. Um atendente humano vai revisar sua solicitação antes de responder.",
  source_document: "N/A",
  confidence_score: 0,
};

/**
 * Detecta menção a carga perigosa, cobrindo singular/plural.
 */
const CARGA_PERIGOSA_PATTERN = /carga[s]?\s+perigosa[s]?/i;

/**
 * Detecta menção a devolução, cobrindo variações verbais comuns:
 * devolução / devolver / devolvida(o) / devolvendo.
 */
const DEVOLUCAO_PATTERN = /devolu[çc][ãa]o|devolv(?:er|id[oa]|endo)/i;

/**
 * Detecta uma negativa explícita associada à devolução. Cobre as formas
 * mais comuns que aparecem nas respostas do assistente quando ele nega
 * corretamente a devolução (baseado na POL-001 seção 3.2).
 */
const NEGATION_PATTERN =
  /n[ãa]o\s+(?:é|s[ãa]o|pode|podem|é\s+poss[íi]vel|s[ãa]o\s+eleg[íi]ve(?:l|is)|pode\s+ser\s+devolvid[oa])/i;

export type RejectionReason =
  | "schema_validation_failed"
  | "missing_source_document"
  | "dangerous_cargo_return_without_negation";

export interface ValidationResult {
  valid: boolean;
  response: AssistantResponse;
  rejectionReason?: RejectionReason;
}

/**
 * Valida e aplica os guardrails determinísticos sobre uma resposta gerada
 * pelo LLM. Esta função NUNCA deixa passar uma resposta inválida — em caso
 * de qualquer falha, retorna FALLBACK_RESPONSE com valid=false.
 *
 * Importante: estas verificações são código (determinístico), não prompt
 * (probabilístico). Mesmo que o prompt "esqueça" de seguir uma instrução,
 * esta camada garante que a resposta nunca chega ao atendente sem validação.
 */
export function validateAssistantResponse(rawResponse: unknown): ValidationResult {
  // [1] Validação de schema (structured output)
  const parsed = AssistantResponseSchema.safeParse(rawResponse);

  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Resposta rejeitada: formato inválido (schema_validation_failed)"
    );
    return {
      valid: false,
      response: FALLBACK_RESPONSE,
      rejectionReason: "schema_validation_failed",
    };
  }

  const response = parsed.data;

  // [2] Guardrail 1 — source_document obrigatório.
  // O schema já garante min(1), mas reforçamos contra strings só com espaços
  // (" " passa pelo min(1) do Zod, mas não é uma fonte válida).
  if (response.source_document.trim().length === 0) {
    logger.warn(
      { response },
      "Resposta bloqueada: source_document ausente ou em branco (missing_source_document)"
    );
    return {
      valid: false,
      response: FALLBACK_RESPONSE,
      rejectionReason: "missing_source_document",
    };
  }

  // [3] Guardrail 2 — carga perigosa + devolução sem negativa.
  const mentionsCargaPerigosa = CARGA_PERIGOSA_PATTERN.test(response.answer);
  const mentionsDevolucao = DEVOLUCAO_PATTERN.test(response.answer);

  if (mentionsCargaPerigosa && mentionsDevolucao) {
    const hasNegation = NEGATION_PATTERN.test(response.answer);
    if (!hasNegation) {
      logger.warn(
        { answer: response.answer },
        "Resposta bloqueada: menção a carga perigosa + devolução sem negativa explícita (dangerous_cargo_return_without_negation)"
      );
      return {
        valid: false,
        response: FALLBACK_RESPONSE,
        rejectionReason: "dangerous_cargo_return_without_negation",
      };
    }
  }

  return { valid: true, response };
}
