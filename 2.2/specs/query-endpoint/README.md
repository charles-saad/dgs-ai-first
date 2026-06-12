# Exercício 2.2 — Query Endpoint

## Objetivo

Converter o `plan.md` em tasks atômicas e implementar o endpoint de query do NovaTech Assistant seguindo Spec Driven Development: TypeScript, Zod, Azure Functions v4 e estrutura de diretórios do Anexo C.

---

## Artefatos da spec

| Artefato | Descrição |
|----------|-----------|
| [requirements.md](requirements.md) | Cenário de produto, personas e 5 user stories com critérios de aceite em Given/When/Then |
| [plan.md](plan.md) | Abordagem técnica, decisões e referências às ADRs do cenário 1 |
| [tasks.md](tasks.md) | 8 tasks atômicas (Q-001 a Q-008) com ID, critérios de aceite, dependências e estimativa P/M/G |
| [critical-review.md](critical-review.md) | Iteração com Copilot documentada (prompts, saída da 1ª tentativa, refinamentos manuais) e pontos remanescentes |

---

## O que foi entregue

**Spec completa:**
- `requirements.md` com 5 user stories rastreadas às restrições de negócio (ADR-0002, ADR-0003, R-01 a R-06)
- `plan.md` com abordagem técnica e prior decisions do cenário 1
- `tasks.md` com cadeia de dependências Q-001 → Q-008

**Código implementado (Q-001 a Q-006):**
- [src/functions/query/handler.ts](../../src/functions/query/handler.ts) — HTTP trigger com método check (405), logging estruturado, injeção de dependências via `createQueryHandler(deps?)`
- [src/functions/query/validator.ts](../../src/functions/query/validator.ts) — Zod schema para input: `question` obrigatório, trim, máx. 500 chars
- [src/functions/query/response-builder.ts](../../src/functions/query/response-builder.ts) — Zod schema para output: `answer`, `source_document`, `citations[]`
- [src/functions/query/service.ts](../../src/functions/query/service.ts) — orquestrador com retry (backoff exponencial), budget de contexto (4K system + 8K chunks), busca local + Azure AI Search
- [src/functions/query/function.ts](../../src/functions/query/function.ts) — registro do endpoint no runtime Azure Functions v4

**Testes:**
- [tests/unit/query-validator.test.ts](../../tests/unit/query-validator.test.ts) — validação de input, forma da resposta, injeção de deps, comportamento de retry

---

## Rastreabilidade spec → código

```
requirements.md  →  plan.md  →  tasks.md  →  código
     US-01            passo 1      Q-001        handler.ts + validator.ts
     US-02            passo 5      Q-002        response-builder.ts
     US-03            passo 1      Q-001        handler.ts (400/405)
     US-04            passo 4      Q-006        service.ts:buildPrompt + loadSystemPrompt
     US-05            decisão      Q-004        service.ts:withRetry
```

Restrições de negócio implementadas como constantes nomeadas em [service.ts](../../src/functions/query/service.ts):
- `SYSTEM_PROMPT_BUDGET_CHARS = 4000` — R-02 / ADR-0002
- `CHUNK_CONTEXT_BUDGET_CHARS = 8000` — R-02 / ADR-0002

---

## Como validar

```bash
npm test
```

Cenários cobertos pelos testes:
- `parseQueryRequest` aceita pergunta válida e rejeita vazia ou > 500 chars
- `queryHandler` retorna 400 para input inválido e 200 com shape correto para input válido
- `createQueryHandler` usa search e completion injetados quando fornecidos
- `executeQuery` respeita o budget de contexto (prompt < 12.000 chars) e retenta falhas transitórias

---

## O que ainda falta para produção (Q-007/Q-008)

| Item | Task | Detalhe |
|------|------|---------|
| Integração real Azure AI Search + GPT-4o | Q-007 | Autenticação, payload real, testes com ambiente provisionado |
| Diferenciação de erros transitórios/permanentes | Q-004 | Retry hoje é genérico — erros de autenticação não deveriam ser retentados |
| Testes de integração do fluxo completo | Q-008 | Fixtures em `tests/fixtures/` ainda são stubs |
| Registro de mudanças no system prompt | — | `prompts/prompt-changelog.md` está vazio |
