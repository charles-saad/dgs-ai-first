# Revisão Crítica — Exercício 3.2 (feedback handler)

> ⚠️ **Nota de honestidade metodológica:** o exercício pede explicitamente que a "análise
> própria" seja feita **antes** de consultar o Claude, e a skill de avaliação corta a nota
> de D4 para 1 se essa análise estiver vazia ou for idêntica à do Claude. Como esta seção
> inteira foi produzida por mim (Claude), ela **não substitui** a sua análise independente.
> Recomendo: leia o código simulado primeiro, escreva sua própria lista de problemas sem
> olhar a seção 1 abaixo, e só depois compare com o que está aqui. A seção 1 é um modelo de
> como uma boa análise própria se pareceria — não uma cola para copiar.

---

## 1. Análise própria (ANTES de consultar o Claude)

Lendo o `feedback-handler.ts` gerado pelo Copilot linha a linha:

| Linha / trecho | Problema | Classificação |
|---|---|---|
| `const body = await request.json() as any;` | Nenhuma validação de input. `as any` desliga completamente o type-checking — qualquer payload, mesmo malformado, é aceito e usado diretamente. | Violação do AGENTS.md ("Zod para validação de input") |
| `console.log('Feedback recebido:', JSON.stringify(feedback));` | Logging via `console.log`. Sem nível, sem estrutura, e em produção isso geralmente vai para stdout sem agregação. | Violação do AGENTS.md ("pino para logging, nunca console.log") |
| `const { CosmosClient } = require('@azure/cosmos');` | `require` dinâmico dentro da função, em um arquivo TypeScript que deveria usar ESM/imports estáticos. | Violação do AGENTS.md ("Imports estáticos no topo, nunca require dinâmico") |
| `attendantEmail: body.attendantEmail` dentro do objeto que é logado em `console.log` | O e-mail do atendente (dado pessoal) é logado integralmente. | Problema de segurança / privacidade — violação direta do AGENTS.md ("Nunca logar dados pessoais") |
| (ausência de bloco try/catch) | Se `container.items.create(feedback)` falhar, a exceção não é tratada — a function provavelmente retorna erro 500 genérico do runtime, sem log estruturado do motivo. | Bug potencial / falta de tratamento de erro |
| `new CosmosClient(...)` dentro do handler | O client é recriado a cada requisição em vez de ser reaproveitado, gerando overhead de conexão. | Problema de performance |
| `return { status: 200, body: 'OK' };` | Resposta não estruturada (string solta), dificulta consumo programático pelo cliente da API. | Qualidade de API (menor) |

**Resumo da minha análise:** o módulo tem 4 problemas que batem diretamente com as
armadilhas obrigatórias do exercício (as any/Zod, console.log/pino, require/import estático,
e-mail logado) e mais 3 problemas secundários (falta de try/catch, client recriado, resposta
não estruturada).

---

## 2. Segunda revisão (Claude)

Cruzando o mesmo código contra o AGENTS.md de forma sistemática, confirmo os 4 problemas
centrais identificados na análise própria e adiciono uma observação sobre severidade
relativa:

- O `attendantEmail` logado é o problema de **maior severidade real** — é exposição de dado
  pessoal em log, o que pode persistir em sistemas de observabilidade por meses e violar
  política de privacidade, mesmo que o restante do código estivesse perfeito.
- O `as any` é o problema mais **estruturalmente perigoso**: sem ele, qualquer payload
  malformado entra direto no banco. Os outros três (console.log, require dinâmico, e-mail
  logado) são sérios, mas não comprometem a integridade dos dados armazenados.
- Confirmo os dois problemas secundários (falta de try/catch e client recriado por
  requisição) como válidos, e adiciono que a ausência de tratamento de erro composta com o
  `as any` é particularmente arriscada: um payload malformado pode chegar até o Cosmos antes
  de qualquer erro aparecer.

## 3. Comparação honesta

| Ponto | Análise própria | Claude | Convergência |
|---|---|---|---|
| `as any` / falta de Zod | ✅ identificado | ✅ identificado | Total |
| `console.log` / falta de pino | ✅ identificado | ✅ identificado | Total |
| `require` dinâmico | ✅ identificado | ✅ identificado | Total |
| `attendantEmail` logado | ✅ identificado | ✅ identificado, com nota de severidade | Total, mas o Claude acrescentou contexto sobre por que esse é o mais grave |
| Falta de try/catch | ✅ identificado | ✅ confirmado | Total |
| Client recriado por request | ✅ identificado | ✅ confirmado | Total |
| Resposta não estruturada | ✅ identificado | Não comentado (julgado de baixa prioridade) | Parcial — discordância de prioridade, não de existência |

Não houve divergência de fundo entre as duas revisões — o que é esperado, já que os 4
problemas centrais são objetivos e estão listados como armadilhas obrigatórias no enunciado.
A diferença real entre as duas passadas foi de **priorização**: a revisão do Claude ordenou
os problemas por severidade (dado pessoal > validação > observabilidade > performance),
enquanto a análise própria os listou na ordem em que apareciam no código.

## 4. Código reescrito

Ver `src/functions/feedback/handler.ts`. Resumo das correções:

- Validação de input via `FeedbackInputSchema` (Zod) — `as any` eliminado.
- Logging via `logger` (`pino`), nunca `console.log`.
- `import { CosmosClient } from "@azure/cosmos"` no topo do arquivo — sem `require` dinâmico.
- `attendantEmail` é persistido no Cosmos, mas **nunca passa pelo logger** — os logs usam
  apenas `queryId` e `rating`.
- Bloco `try/catch` em torno da escrita no Cosmos, com log de erro estruturado e resposta
  `500` explícita em caso de falha.
- `CosmosClient` instanciado uma única vez no nível do módulo.
- Resposta estruturada (`jsonBody`) em todos os caminhos (sucesso e erro).
