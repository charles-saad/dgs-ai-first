# Code Review — Exercício 3.1 (response-validator.ts)

## Versão inicial (hipótese de primeira geração)

Uma primeira implementação plausível — do tipo que sai de um prompt simples ao Copilot —
ficaria assim:

```typescript
// VERSÃO INICIAL — contém problemas, não usar
import { z } from "zod";

const AssistantResponseSchema = z.object({
  answer: z.string(),
  source_document: z.string(),
  confidence_score: z.number(),
});

export function validateAssistantResponse(raw: unknown) {
  const parsed = AssistantResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.log("validação falhou");
    return { valid: false };
  }

  if (!parsed.data.source_document) {
    console.log("sem fonte");
  }

  if (parsed.data.answer.includes("carga perigosa") && parsed.data.answer.includes("devolução")) {
    console.log("atenção: carga perigosa + devolução");
  }

  return { valid: true, response: parsed.data };
}
```

## Problemas identificados

| # | Problema | Por que importa |
|---|----------|------------------|
| 1 | Schema sem `.strict()` | Aceita qualquer campo extra (`z.object` por padrão ignora campos não declarados, mas **não rejeita** o objeto). Se o LLM incluir um campo indesejado, ele passa silenciosamente. Risco baixo isoladamente, mas quebra o princípio de "formato fixo e controlado" do structured output. |
| 2 | `confidence_score: z.number()` sem `.min(0).max(1)` | Um valor como `150` ou `-3` passaria a validação. Não é um "número qualquer", é uma confiança — precisa estar no intervalo válido. |
| 3 | Guardrail 1 só *loga* (`console.log("sem fonte")`), **não bloqueia** | Esta é justamente a regra de corte do framework de avaliação: *"Código que deveria bloquear respostas mas só loga → D3 ≤ 2"*. A função continua retornando `valid: true` mesmo sem fonte. |
| 4 | Guardrail 2 também só loga, e usa `.includes()` com string literal exata | `"carga perigosa"` não bate com `"cargas perigosas"`, `"Carga Perigosa"` (case) nem com `"o cliente não pode devolver cargas perigosas"` reorganizado de outra forma com plural. Além disso, mesmo quando detecta a combinação, **não verifica se há uma negativa** — ou seja, bloquearia (se bloqueasse) até respostas corretas, e deixaria passar respostas incorretas que afirmam a devolução. |
| 5 | `console.log` para tudo | Sem nível de log, sem estrutura (`pino` permite log estruturado e níveis, essencial para observabilidade em produção). |
| 6 | Nenhuma resposta de fallback definida | Quando algo falha, o cliente da função recebe apenas `{ valid: false }`, sem um texto seguro para mostrar ao atendente. |

## Correções aplicadas (versão final entregue)

A versão final, em `src/services/response-validator.ts`, resolve cada ponto:

1. `.strict()` adicionado ao schema → objetos com campos extras são rejeitados.
2. `confidence_score` com `.min(0).max(1)`.
3. Guardrail 1 agora **retorna `valid: false` com fallback** quando `source_document` está
   vazio ou só contém espaços (cobertura extra: `.trim().length === 0`, já que `min(1)` do
   Zod não rejeita strings só com espaço).
4. Guardrail 2 reescrito com regex que cobre singular/plural e variações verbais de
   "devolução" (`devolver`, `devolvida`, `devolvendo`), e — ponto central — só bloqueia
   quando a combinação aparece **sem uma negativa explícita** próxima. Isso evita dois
   erros opostos: bloquear respostas corretas (que negam a devolução) e deixar passar
   respostas incorretas (que afirmam a devolução).
5. Logging migrado para `pino` (`logger.warn` com contexto estruturado).
6. `FALLBACK_RESPONSE` definida como constante e devolvida em toda rejeição.

## Limitação conhecida (não resolvida — fora de escopo)

A regex de negação é uma aproximação lexical, não uma análise semântica. Uma resposta como
*"o cliente perguntou se carga perigosa pode ser devolvida e a resposta, infelizmente, é
não"* pode não casar perfeitamente dependendo da distância entre os termos. Para o nível
deste exercício (2 guardrails, revisão "rápida"), essa cobertura é aceitável; uma versão de
produção provavelmente usaria uma classificação mais robusta (ex: um segundo prompt
estruturado especificamente para classificar "afirma ou nega a devolução").
