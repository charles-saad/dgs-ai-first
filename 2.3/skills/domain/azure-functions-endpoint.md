# Skill: Azure Functions Endpoint

**Camada:** Domain  
**Frase-ativação:** "Criar um novo endpoint Azure Functions v4"  
**Pré-requisitos:** [`typescript-conventions.md`](../foundation/typescript-conventions.md), [`error-handling.md`](../foundation/error-handling.md)  
**Criado por:** Tech Lead  
**Consome:** Dev (pleno/sênior), Copilot  
**Frequência:** Alta — um endpoint por módulo do projeto (query, feedback, health)  
**Última revisão:** 2026-06-12

---

## Contexto

Todo endpoint HTTP deste projeto segue um padrão de 4 arquivos dentro de `src/functions/<módulo>/`. A separação é obrigatória — handler não tem lógica de negócio, service não conhece HTTP. Isso garante testabilidade isolada de cada camada.

O Copilot tende a colocar validação e lógica dentro do handler, ou a usar `app.http()` diretamente no handler sem o arquivo `function.ts`. Ambos os padrões são proibidos aqui.

---

## Estrutura obrigatória por endpoint

```
src/functions/<módulo>/
├── handler.ts          ← HTTP trigger: recebe requisição, chama service, retorna resposta
├── validator.ts        ← Schema Zod: valida input antes do handler processar
├── service.ts          ← Lógica de negócio: busca, montagem de prompt, chamada ao modelo
├── response-builder.ts ← Monta e valida o payload de saída com Zod
└── function.ts         ← Registro do endpoint no runtime Azure Functions v4
```

### Responsabilidade de cada arquivo

| Arquivo | Faz | Não faz |
|---------|-----|---------|
| `handler.ts` | Valida método HTTP, chama `parseXxx`, chama `executeXxx`, chama `buildXxxResponse`, faz logging com requestId | Lógica de busca, chamada a APIs externas, montagem de prompt |
| `validator.ts` | Define `XxxRequestSchema` (Zod), `XxxRequest` (type), `parseXxx(input)` | Regras de negócio, chamadas externas |
| `service.ts` | Implementa `executeXxx(input, deps)` com injeção de dependências | Conhecimento de HTTP (status codes, headers) |
| `response-builder.ts` | Define `XxxResponseSchema` (Zod), `XxxResponse` (interface), `buildXxxResponse(...)` | Lógica de negócio |
| `function.ts` | Registra via `app.http('módulo', { methods, route, handler })` | Qualquer lógica |

---

## Padrões obrigatórios

### 1. Handler: método explícito, logging com requestId, sem lógica de negócio

```typescript
// ✅ DO — src/functions/feedback/handler.ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ZodError } from 'zod';
import { createLogger } from '../../shared/logger.js';
import { parseFeedbackRequest } from './validator.js';
import { executeFeedback } from './service.js';
import { buildFeedbackResponse } from './response-builder.js';

export async function feedbackHttpTrigger(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger();
  const requestId = context.invocationId;
  const start = Date.now();

  logger.info('feedback.request.received', { requestId, method: request.method });

  if (request.method !== 'POST') {
    return { status: 405, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  try {
    const body: unknown = await request.json();
    const parsed = parseFeedbackRequest(body);
    const result = await executeFeedback(parsed.rating, parsed.comment);
    const response = buildFeedbackResponse(result);

    logger.info('feedback.request.completed', { requestId, durationMs: Date.now() - start });
    return { status: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response) };

  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn('feedback.request.invalid', { requestId, error: error.message });
      return { status: 400, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.errors[0]?.message ?? 'Input inválido.' }) };
    }
    logger.error('feedback.request.failed', {
      requestId, durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Erro interno. Tente novamente.' }) };
  }
}

// ❌ DON'T — handler com lógica de negócio embutida e sem verificação de método
export async function feedbackHttpTrigger(req: any, ctx: any) {
  const body = await req.json();
  if (!body.rating) return { status: 400 };
  // ... chamada ao Azure Cosmos diretamente aqui, sem DI ...
  return { status: 200, body: JSON.stringify({ ok: true }) };
}
```

---

### 2. Validator: schema + type + função de parse — nada mais

```typescript
// ✅ DO — src/functions/feedback/validator.ts
import { z } from 'zod';

export const FeedbackRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export function parseFeedbackRequest(input: unknown): FeedbackRequest {
  return FeedbackRequestSchema.parse(input);
}

// ❌ DON'T — validação manual sem schema
export function parseFeedbackRequest(input: any): FeedbackRequest {
  if (typeof input.rating !== 'number' || input.rating < 1 || input.rating > 5) {
    throw new Error('rating inválido');
  }
  return input as FeedbackRequest;
}
```

---

### 3. Service: injeção de dependências, sem import direto de SDK externo no core

```typescript
// ✅ DO — src/functions/feedback/service.ts
import type { Logger } from '../../shared/logger.js';

export interface FeedbackDependencies {
  storage: (rating: number, comment?: string) => Promise<void>;
  logger: Logger;
}

export async function executeFeedback(
  rating: number,
  comment: string | undefined,
  deps: Partial<FeedbackDependencies> = {},
): Promise<{ stored: boolean }> {
  const logger = deps.logger ?? { info: () => undefined, warn: () => undefined, error: () => undefined };
  const storage = deps.storage ?? storeCosmosDB;

  logger.info('feedback.execution.started', { rating });
  await storage(rating, comment);
  logger.info('feedback.execution.completed', { rating });
  return { stored: true };
}

// ❌ DON'T — SDK importado diretamente (impossibilita testes unitários sem network)
import { CosmosClient } from '@azure/cosmos';
export async function executeFeedback(rating: number) {
  const client = new CosmosClient(process.env.COSMOS_URI!);
  // sem DI → sem mock → testes precisam de Cosmos real
}
```

---

### 4. function.ts: apenas o registro, sem lógica

```typescript
// ✅ DO — src/functions/feedback/function.ts
import { app } from '@azure/functions';
import { feedbackHttpTrigger } from './handler.js';

app.http('feedback', {
  methods: ['POST'],
  route: 'feedback',
  authLevel: 'anonymous',
  handler: feedbackHttpTrigger,
});

// ❌ DON'T — handler inline com lógica embutida no registro
app.http('feedback', {
  methods: ['POST'],
  handler: async (req, ctx) => {
    const body = await req.json();
    // ... validação e lógica aqui ...
  },
});
```

---

### 5. Nomes de eventos de log: `<módulo>.<camada>.<estado>`

```typescript
// ✅ DO
logger.info('feedback.request.received', { requestId });
logger.info('feedback.execution.started', { rating });
logger.warn('feedback.execution.retry', { attempt, delayMs });
logger.info('feedback.request.completed', { requestId, durationMs });
logger.error('feedback.request.failed', { requestId, durationMs, error });

// ❌ DON'T
logger.info('Received feedback request');
logger.error('Error processing feedback: ' + error.message);
```

> O padrão `<módulo>.<camada>.<estado>` permite filtros no Azure Monitor por módulo ou estado sem parsing de string.

---

## Anti-padrões recorrentes do Copilot

| Anti-padrão | Por que falha aqui | Correção |
|-------------|-------------------|----------|
| Validação e lógica no `handler.ts` | Impossibilita testar a lógica sem HTTP | Mover para `validator.ts` + `service.ts` |
| `app.http()` dentro de `handler.ts` | Mistura registro e implementação | Separar em `function.ts` |
| `req: any` no handler | Viola strict mode | `request: HttpRequest` do `@azure/functions` |
| Import direto de Azure SDK no service | Impossibilita mock em testes unitários | Injetar via `deps` com interface tipada |
| 200 para todos os casos de `catch` | Esconde erros do cliente | 400 para `ZodError`, 500 para erros internos |
| Resposta sem `buildXxxResponse` | Saída sem contrato validado por Zod | `buildXxxResponse(result)` com schema de saída |
| `context.log(...)` do Azure Functions | Fora do padrão de logging do projeto | `createLogger()` + `logger.info(...)` |

---

## Decisões de arquitetura referenciadas

| Decisão | ADR | Impacto nesta skill |
|---------|-----|---------------------|
| Budget de contexto: ~4K system prompt + ~8K chunks | [ADR-0002](../../docs/adr/ADR-0002-gestao-contexto-mcp.md) | Endpoints RAG devem montar o prompt com `SYSTEM_PROMPT_BUDGET_CHARS` e `CHUNK_CONTEXT_BUDGET_CHARS` do `service.ts` |
| Stack: Azure Functions v4, TypeScript, Zod | ADR-0001 | Usar `app.http()` do `@azure/functions` v4 — não o modelo v3 com `module.exports = { httpTrigger }` |

---

## Como foi gerada

Esta skill foi escrita manualmente, sem geração via Copilot. A decisão foi intencional: o padrão de 4 arquivos por endpoint (`handler`, `validator`, `service`, `response-builder` + `function.ts`) foi extraído da implementação real do módulo `query` após a revisão crítica do exercício 2.2, não de uma geração automática. Gerar esta skill com Copilot teria produzido um padrão genérico de Azure Functions sem a separação de responsabilidades específica do projeto — exatamente o anti-padrão que a skill documenta.

**O que foi feito em vez disso:**
1. O módulo `query` foi usado como fonte de verdade: cada arquivo real virou um padrão documentado.
2. Os anti-padrões foram coletados dos erros encontrados na revisão do código gerado pelo Copilot no exercício 2.2 (handler com lógica embutida, `app.http()` no mesmo arquivo do handler, `req: any`).
3. O exemplo DO foi adaptado para o módulo `feedback` em vez de `query` — para demonstrar que o padrão generaliza, não para documentar o módulo já implementado.

**Nível de confiança:** Alto — a skill descreve o que já está funcionando em produção local, não uma convenção hipotética. Qualquer mudança no padrão do módulo `query` deve ser refletida aqui.
