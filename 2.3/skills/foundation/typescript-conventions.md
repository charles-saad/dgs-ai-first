# Skill: TypeScript Conventions

**Camada:** Foundation  
**Frase-ativação:** "Gerar código TypeScript para este projeto"  
**Pré-requisito de:** todas as outras skills deste projeto  
**Criado por:** Tech Lead  
**Última revisão:** 2026-06-12

---

## Contexto

Este projeto usa TypeScript 5.5 com `strict: true`, módulos ESM (`"type": "module"`), Zod para validação em fronteiras externas, e Azure Functions v4 como runtime. Estas convenções governam **toda geração de código** — se uma skill de camada Domain ou Artifact entrar em conflito com esta, esta skill prevalece.

O Copilot gera código TypeScript funcional mas frequentemente sem os padrões exigidos aqui: usa `console.log`, `as any`, `require()`, `process.env` direto, e exports default. Cada seção abaixo endereça um ponto de falha recorrente.

---

## Regras obrigatórias

### 1. Sistema de módulos: sempre ESM

```typescript
// ✅ DO
import { z } from 'zod';
import { getEnv } from '../../shared/config.js';
export function parseQueryRequest(input: unknown) { ... }

// ❌ DON'T
const { z } = require('zod');
const { getEnv } = require('../../shared/config');
module.exports = { parseQueryRequest };
```

> A extensão `.js` nos imports locais é obrigatória no modo ESM mesmo que o arquivo-fonte seja `.ts`. O compilador TypeScript com `"moduleResolution": "Bundler"` resolve isso corretamente.

---

### 2. Sem `any` — use `unknown` e narrow

```typescript
// ✅ DO
async function handler(req: HttpRequest): Promise<HttpResponseInit> {
  const body: unknown = await req.json();
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) { ... }
}

// ❌ DON'T
async function handler(req: any): Promise<any> {
  const body = await req.json() as QueryRequest;
}
```

> `as Type` sem validação prévia é uma mentira para o compilador. Toda asserção de tipo sem Zod ou type guard é proibida em fronteiras externas.

---

### 3. Zod em fronteiras externas, TypeScript internamente

Fronteiras externas = HTTP body, variáveis de ambiente, resposta de APIs Azure, arquivos lidos do disco.  
Código interno = chamadas entre funções dentro do mesmo módulo.

```typescript
// ✅ DO — fronteira HTTP: Zod obrigatório
export const QueryRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

// ✅ DO — chamada interna: TypeScript puro, sem Zod
function buildPrompt(question: string, citations: SearchResult[]): string {
  // question já foi validado pelo schema na fronteira
}

// ❌ DON'T — validação manual sem schema
if (typeof body.question !== 'string' || body.question.length === 0) {
  return { status: 400 };
}
```

---

### 4. Logging estruturado — nunca `console.log`

```typescript
// ✅ DO
import { createLogger } from '../../shared/logger.js';
const logger = createLogger();
logger.info('query.request.received', { requestId, method: req.method });
logger.warn('query.execution.retry', { attempt, delayMs, error: err.message });

// ❌ DON'T
console.log('Received request:', req.method, req.url);
console.error('Error:', error);
```

> `console.log` não tem nível, não tem estrutura, não tem contexto de correlação. Em produção (Azure Application Insights) esse log não é indexável. Use sempre o logger do projeto.

---

### 5. Variáveis de ambiente via `getEnv()`

```typescript
// ✅ DO
import { getEnv, isAzureConfigured } from '../../shared/config.js';
const endpoint = getEnv('AZURE_SEARCH_ENDPOINT');
if (!isAzureConfigured()) { /* fallback */ }

// ❌ DON'T
const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
const endpoint = process.env['AZURE_SEARCH_ENDPOINT']!;
```

> `process.env` direto retorna `string | undefined` e o `!` é uma asserção silenciosa. `getEnv()` centraliza o acesso e facilita mocking em testes.

---

### 6. Exports nomeados — sem default export

```typescript
// ✅ DO
export function parseQueryRequest(input: unknown): QueryRequest { ... }
export const QueryRequestSchema = z.object({ ... });
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

// ❌ DON'T
export default function parseQueryRequest(input: unknown) { ... }
export default QueryRequestSchema;
```

> Exceção: o handler registrado no Azure Functions v4 via `app.http()` pode ser uma função anônima. Mas o handler em si (`queryHttpTrigger`) deve ser um export nomeado para ser testável isoladamente.

---

### 7. Tipos de retorno explícitos em funções públicas

```typescript
// ✅ DO
export function buildQueryResponse(
  answer: string,
  citations: SearchResult[],
): QueryResponse { ... }

export async function executeQuery(
  question: string,
  deps: Partial<QueryDependencies> = {},
): Promise<{ answer: string; citations: SearchResult[] }> { ... }

// ❌ DON'T
export function buildQueryResponse(answer, citations) { ... }
export async function executeQuery(question, deps = {}) { ... }
```

---

### 8. Tratamento de erros com narrowing

```typescript
// ✅ DO
try {
  return await operation();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('operation.failed', { message });
  throw error;
}

// ❌ DON'T
} catch (error: any) {
  logger.error('operation.failed', { message: error.message });
}
```

> `catch (error: any)` é proibido pelo `strict: true`. `error` em catch é `unknown` — narrow antes de usar.

---

### 9. `const` por padrão, `let` apenas quando necessário, nunca `var`

```typescript
// ✅ DO
const SYSTEM_PROMPT_BUDGET_CHARS = 4000;  // ADR-0002: ~4K chars para system prompt
const CHUNK_CONTEXT_BUDGET_CHARS = 8000;  // ADR-0002: ~8K chars para chunks
let attempts = 0;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) { ... }

// ❌ DON'T
var BUDGET = 4000;
let systemPromptBudget = 4000; // constante que nunca muda
```

> Constantes que refletem decisões arquiteturais (ex: budgets de contexto do ADR-0002) devem ter comentário vinculando ao ADR. Isso torna o número rastreável — quem mudar o valor sabe que precisa atualizar a decisão, não só o código.

---

## Anti-padrões recorrentes do Copilot

Os itens abaixo são os erros mais comuns em geração automática para este projeto. Se aparecerem no código gerado, corrija antes de aceitar o suggestion.

| Anti-padrão | Por que falha aqui | Correção |
|-------------|-------------------|----------|
| `as MyType` sem parse | Mente para o TypeScript, sem runtime safety | `Schema.parse(value)` ou `Schema.safeParse(value)` |
| `console.log(...)` | Não indexável no Azure Monitor | `logger.info('event.name', { ...context })` |
| `require('module')` | Quebra o ESM do projeto | `import { x } from 'module'` |
| `process.env.VAR` direto | Sem centralização, sem mock em teste | `getEnv('VAR')` |
| `export default` | Dificulta tree-shaking e mocking | Export nomeado |
| `catch (e: any)` | Desativa o strict no catch | `catch (e)` + `instanceof Error` |
| `JSON.parse(x) as T` | Sem validação de schema em fronteira externa | `Schema.parse(JSON.parse(x))` |
| `import x from 'node:fs'` para `existsSync` | Default import não existe no types stub do projeto | `import { existsSync } from 'node:fs'` |

---

## Decisões de arquitetura referenciadas

| Decisão | ADR | Impacto nesta skill |
|---------|-----|---------------------|
| Budget de contexto: ~4K system prompt + ~8K chunks | [ADR-0002](../../docs/adr/ADR-0002-gestao-contexto-mcp.md) | Constantes `SYSTEM_PROMPT_BUDGET_CHARS` e `CHUNK_CONTEXT_BUDGET_CHARS` devem ter comentário `// ADR-0002` — ver Regra 9 |
| Escopo de contexto dos agentes: leitura direcionada, sem carga do repo inteiro | [ADR-0002](../../docs/adr/ADR-0002-gestao-contexto-mcp.md) | Código gerado não deve abrir arquivos fora dos escopos declarados no `.mcp/mcp.json` |
| Documentos contraditórios: priorizar versão com metadado de vigência mais recente | ADR-0003 | Ao mapear chunks de resultado de busca, preservar o campo de vigência no payload — não descartar metadados |

---

## Como foi gerada

### Prompt inicial usado com Copilot

> "Create a TypeScript coding conventions skill file for an Azure Functions v4 project. The project uses ESM modules (`"type": "module"`), TypeScript 5.5 with strict mode, Zod for external boundary validation, and structured JSON logging (no console.log). Format as a Markdown skill file with numbered rules, each containing a DO and DON'T code block in TypeScript, followed by a brief explanation. End with an anti-patterns table."

### O que o Copilot gerou na primeira tentativa

- Estrutura correta de regras com DO/DON'T e tabela de anti-padrões.
- Regras genéricas de TypeScript: `const` vs `var`, tipos explícitos, `unknown` vs `any` — corretas mas sem contexto de projeto.
- Regra de logging mencionando "use a structured logger" sem nomear `createLogger` nem o Azure Application Insights como motivação.
- Regra de ESM sem a nota sobre a extensão `.js` obrigatória em imports locais — o ponto mais crítico e silencioso do setup.
- Sem menção a `getEnv()` — o Copilot sugeriu encapsular `process.env` mas sem referenciar o módulo existente.
- Sem anti-padrão `import x from 'node:fs'` (específico do `globals.d.ts` do projeto).

### O que foi refinado manualmente

1. **Nota sobre `.js` em imports locais** — adicionada na Regra 1 com contexto de `"moduleResolution": "Bundler"`. O Copilot ignorou isso por ser uma quirk do ESM + TypeScript raramente documentada.
2. **`createLogger()` e Azure Monitor** — a Regra 4 foi reescrita para nomear o módulo concreto do projeto e explicar por que `console.log` quebra a indexação no Application Insights.
3. **`getEnv()` e `isAzureConfigured()`** — a Regra 5 foi ajustada para referenciar os helpers de `shared/config.ts` em vez de sugerir um wrapper genérico.
4. **ADR-0002 nos comentários** — a Regra 9 foi atualizada para vincular as constantes de budget à decisão arquitetural. O Copilot gerou os valores sem rastreabilidade.
5. **Anti-padrão `import x from 'node:fs'`** — adicionado manualmente após encontrar o erro nos tipos stub do `globals.d.ts`.
6. **Seção "Decisões de arquitetura referenciadas"** — não estava no output do Copilot; adicionada para fechar a rastreabilidade skill → ADR → código.
