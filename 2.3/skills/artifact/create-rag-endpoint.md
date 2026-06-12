# Skill: Create RAG Endpoint

**Camada:** Artifact  
**Frase-ativação:** "Criar o endpoint RAG completo para [módulo]"  
**Pré-requisitos:**
- [`typescript-conventions.md`](../foundation/typescript-conventions.md)
- [`error-handling.md`](../foundation/error-handling.md)
- [`azure-functions-endpoint.md`](../domain/azure-functions-endpoint.md)

**Criado por:** Dev Sênior + Tech Lead  
**Consome:** Dev (pleno/sênior), Copilot  
**Frequência:** Média — um por módulo RAG do projeto (query, feedback com lookup, health com contexto)  
**Última revisão:** 2026-06-12

---

## Contexto

Esta receita gera os 5 arquivos de um endpoint RAG completo em `src/functions/<módulo>/`. O padrão é fixo — o que muda entre módulos é o nome do módulo, os campos do schema de input/output e a lógica de negócio do `service.ts`. A estrutura, os imports e o contrato de erro não mudam.

Use esta skill sempre que criar um novo endpoint que (a) recebe input via HTTP POST, (b) busca chunks no Azure AI Search e (c) chama o modelo via Azure OpenAI.

---

## Pré-condições antes de gerar

- [ ] O `requirements.md` do módulo está aprovado (define o contrato de input/output).
- [ ] O `tasks.md` tem as tasks atômicas listadas e priorizadas.
- [ ] O system prompt em `/prompts/system-prompt.md` está na versão correta para o módulo.
- [ ] As variáveis de ambiente estão documentadas em `shared/config.ts` via `isAzureConfigured()`.

---

## Checklist de arquivos a gerar

```
src/functions/<módulo>/
├── [ ] handler.ts          ← colar DO block da skill azure-functions-endpoint.md (Regra 1)
├── [ ] validator.ts        ← schema Zod + type + função parse
├── [ ] service.ts          ← executeXxx(input, deps) com DI, retry e budget de contexto
├── [ ] response-builder.ts ← buildXxxResponse() com schema Zod de saída
└── [ ] function.ts         ← app.http() com route, methods, authLevel
```

Após gerar cada arquivo: rodar `npm run build` antes de passar para o próximo. Erros de compilação no `handler.ts` bloqueiam a validação dos outros.

---

## Sequência de geração com Copilot

### Passo 1 — `validator.ts`

Gerar primeiro porque `handler.ts` e `service.ts` dependem dos tipos exportados.

**Prompt sugerido:**
> "Create a Zod validator for the `<módulo>` endpoint. Input: `{ <campos> }`. Export: `XxxRequestSchema`, `XxxRequest` type, `parseXxxRequest(input: unknown): XxxRequest`. Validation rules: [listar regras do requirements.md]. Error messages in pt-BR."

**Verificar no output:**
- [ ] Schema usa `.trim()` em strings (previne whitespace-only).
- [ ] Mensagens de erro em português.
- [ ] Export nomeado (sem `export default`).

---

### Passo 2 — `response-builder.ts`

**Prompt sugerido:**
> "Create a response builder for the `<módulo>` endpoint. Output contract: `{ <campos de saída> }`. Export: `XxxResponseSchema` (Zod), `XxxResponse` (interface), `buildXxxResponse(...): XxxResponse`. Validate output with Zod before returning."

**Verificar no output:**
- [ ] Schema valida o output antes de retornar (`XxxResponseSchema.parse(...)`).
- [ ] `source_document` tipado como `string | null` (não `string | undefined`).

---

### Passo 3 — `service.ts`

**Prompt sugerido:**
> "Create `executeXxx(input, deps: Partial<XxxDependencies>)` in TypeScript. Dependencies: `search`, `completion`, `logger`. Include: (1) exponential backoff retry for search and completion (max 3 attempts, delay 100ms * 2^attempt), (2) prompt assembly respecting 4000-char system prompt budget and 8000-char context budget (ADR-0002), (3) loadSystemPrompt() reading from `prompts/system-prompt.md` with fallback. Return `{ answer: string, citations: SearchResult[] }`."

**Verificar no output:**
- [ ] Budgets como constantes nomeadas com comentário `// ADR-0002` (Regra 9 de typescript-conventions.md).
- [ ] `withRetry` usa backoff exponencial (`100 * 2 ** (attempt - 1)`), não delay fixo.
- [ ] `loadSystemPrompt()` usa `existsSync` antes de `readFileSync`.
- [ ] Fallback local em `searchAzure` quando `AZURE_SEARCH_ENDPOINT` não configurado.
- [ ] `completeAzure` retorna resposta mock quando Azure não configurado (viabiliza testes locais).

---

### Passo 4 — `handler.ts`

Gerar depois do `service.ts` para usar os tipos já definidos.

**Prompt sugerido:**
> "Create an Azure Functions v4 HTTP handler for `POST /api/<módulo>`. Use `parseXxxRequest`, `executeXxx`, `buildXxxResponse`. Add: (1) method check returning 405 for non-POST, (2) structured logging with requestId from `context.invocationId` and durationMs, (3) ZodError → 400, other errors → 500. No business logic in handler."

**Verificar no output:**
- [ ] Verificação de método antes do try/catch.
- [ ] `requestId` = `context.invocationId` (não gerado manualmente).
- [ ] `ZodError` separado de erros internos (ver `error-handling.md` Regra 2).
- [ ] Sem `console.log` — usa `createLogger()`.
- [ ] Exporta `createXxxHandler(deps?)` para injeção em testes.

---

### Passo 5 — `function.ts`

**Prompt sugerido:**
> "Register the `<módulo>` Azure Functions v4 endpoint. Route: `<rota>`, methods: ['POST'], authLevel: 'anonymous', handler: `xxxHttpTrigger`."

**Verificar no output:**
- [ ] Apenas `app.http(...)` — sem lógica.
- [ ] `authLevel: 'anonymous'` (autenticação é responsabilidade do API Gateway / Teams Bot).

---

## Verificação pós-geração

```bash
npm run build          # zero erros de TypeScript
npm run test           # testes do módulo passando (handler 400/200, retry, DI)
```

**Checklist de review antes de abrir PR:**
- [ ] Nenhum `console.log` nos 5 arquivos.
- [ ] Nenhum `as any` ou `catch (e: any)`.
- [ ] Constantes de budget com comentário `// ADR-0002`.
- [ ] `handler.ts` não importa `fetch`, `CosmosClient` ou qualquer SDK externo diretamente.
- [ ] Testes cobrem: input inválido (400), input válido (200 com shape correto), retry (falha na 1ª, sucesso na 2ª).

---

## Módulos que usam esta receita

| Módulo | Status | Observação |
|--------|--------|------------|
| `query` | Implementado | Referência — ver `src/functions/query/` |
| `feedback` | A implementar | Salva rating + comment; Cosmos DB como storage |
| `health` | A implementar | Endpoint simples; sem busca de chunks |
