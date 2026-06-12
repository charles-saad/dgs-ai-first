# Revisão crítica — Query Endpoint

## Melhorias implementadas

1. Integração explícita com o system prompt versionado e o budget de contexto.
   - O fluxo real agora lê o prompt da versão versionada em [prompts/system-prompt.md](../../prompts/system-prompt.md) e monta um prompt com limite explícito de contexto para o system prompt e para os chunks recuperados.
   - Isso reduz a interpretação manual e torna o comportamento mais previsível, alinhado ao plano e à ADR-0002.

2. Avanço além do scaffold para incluir resiliência e observabilidade.
   - O fluxo passou a usar retry com exponential backoff para busca e geração de resposta, com logs estruturados para início, sucesso e falha de execução.
   - O handler também registra `requestId`, `traceParent` e tempo de execução, aproximando o endpoint do padrão esperado para produção.

3. Contrato de saída mais robusto.
   - A resposta agora é validada por Zod e inclui `answer`, `source_document` e `citations`, com schema explícito para as citações.
   - Isso melhora a interoperabilidade com clientes e facilita a revisão do comportamento do endpoint.

## Iteração com IA — como o Copilot foi usado e o que exigiu ajuste manual

### Prompt 1 — geração do handler inicial

**Prompt usado:**
> "Create an Azure Functions v4 HTTP trigger in TypeScript for `POST /api/query`. Accept a JSON body with a `question` field. Use Zod to validate: question is required, non-empty, max 500 characters. Return 400 for invalid input and 200 with a placeholder response for valid input."

**O que o Copilot gerou na primeira tentativa:**
- Handler funcional com validação Zod para o campo `question`.
- Retorno 400 para input inválido e 200 com body `{ answer: "placeholder" }`.
- Uso de `console.log` para logging.
- Sem verificação de método HTTP — aceitava GET, PUT etc. sem erro.
- Sem `requestId` ou rastreabilidade na resposta de erro.
- Sem registro da função no runtime do Azure Functions v4 (`app.http(...)`).

**O que foi refinado manualmente:**
1. Adicionada verificação de método HTTP com retorno `405` para métodos diferentes de `POST` — o Copilot não incluiu isso porque o prompt não mencionava o caso negativo.
2. Substituído `console.log` por logger estruturado JSON (`createLogger`) com `requestId`, `traceParent` e `durationMs` — o Copilot gerou logging simples, inadequado para observabilidade em produção.
3. Adicionado registro explícito via `app.http('query', { ... })` em `function.ts` — o Copilot gerou apenas o handler sem o ponto de entrada do Azure Functions v4.
4. Extraída a criação do handler para `createQueryHandler(deps?)` com injeção de dependências — necessário para testabilidade; o Copilot gerou o handler como função estática sem DI.

---

### Prompt 2 — geração do service com busca e retry

**Prompt usado:**
> "Implement an `executeQuery(question, deps)` function in TypeScript. It should: (1) search for relevant chunks using a `search` dependency, (2) build a prompt respecting a 4000-char system prompt budget and 8000-char context budget, (3) call a `completion` dependency, (4) return `{ answer, citations }`. Add exponential backoff retry (max 3 attempts) for both search and completion calls."

**O que o Copilot gerou na primeira tentativa:**
- Estrutura correta de `executeQuery` com `search` e `completion` como parâmetros.
- Retry implementado, mas com delay fixo de 1000 ms — sem backoff exponencial.
- `buildPrompt` concatenava os chunks sem truncamento — sem respeitar os budgets de 4K/8K.
- `loadSystemPrompt` lendo diretamente de um caminho hardcoded sem fallback se o arquivo não existir.
- Score dos chunks de busca local fixo em `1.0` sem distinção de relevância.

**O que foi refinado manualmente:**
1. Corrigido o delay do retry para backoff exponencial `100ms * 2^(attempt-1)` conforme a task Q-004 — o valor de 1000 ms fixo tornaria o sistema lento sem ganho real de resiliência.
2. Adicionado `truncateText` aplicado separadamente ao system prompt (4K) e ao bloco de chunks (8K), garantindo o budget do ADR-0002 — o Copilot ignorou os limites por não tê-los no prompt.
3. Adicionado `existsSync` antes de `readFileSync` com fallback para prompt genérico — necessário para o ambiente de testes onde o arquivo pode não existir.
4. Score dos resultados locais ajustado para `0.9` para refletir que é um fallback heurístico, não uma busca vetorial real.

---

## Pontos remanescentes antes de um code review mais rigoroso

1. Integração real com Azure AI Search e GPT-4o.
   - A implementação atual usa um fallback local quando os serviços Azure não estão configurados. Isso é adequado para desenvolvimento, mas ainda precisa de testes de integração com o ambiente real para validar autenticação, latência e forma do payload.

2. Tratamento de erro específico por provedor.
   - O retry está implementado de forma geral, mas ainda falta diferenciação mais fina entre erros temporários e permanentes, especialmente para buscas e chamadas de modelo.

3. Documentação de rastreabilidade mais explícita.
   - A relação entre requisitos, plano, tasks e código já foi melhorada, mas pode ser aprofundada com uma matriz de rastreabilidade em um próximo passo.
