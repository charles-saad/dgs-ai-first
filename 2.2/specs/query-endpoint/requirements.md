# Requirements — Query Endpoint

## Contexto do produto

Os atendentes da NovaTech consultam documentação interna em ~60% dos 320 chamados diários (SLAs, fretes, devoluções, procedimentos). O tempo médio de busca é de 12 minutos por chamado — a meta é menos de 2 minutos. Este endpoint é o ponto central: recebe a pergunta do atendente e devolve resposta fundamentada na documentação oficial, com indicação da fonte.

## Personas

**Atendente (consumidor direto):** Usa o assistente via Teams ou painel web durante um chamado ativo. Precisa de resposta rápida, precisa e com fonte rastreável para citar ao cliente ou encaminhar o documento.

**Sistema cliente (Teams bot / painel web):** Consome o endpoint via HTTP. Espera contrato JSON estável e códigos de status previsíveis para tratar erros na interface sem crashar.

---

## User Stories

### US-01 — Consultar documentação por pergunta em linguagem natural

Como atendente, quero enviar uma pergunta sobre procedimentos, SLAs ou regras de frete e receber uma resposta objetiva fundamentada nos documentos oficiais da NovaTech, para não precisar abrir o SharePoint durante o chamado.

**Critérios de aceite:**

- **Dado** que envio `POST /api/query` com body `{ "question": "Qual é o prazo de SLA para clientes Gold em incidente crítico?" }`,
- **Quando** o endpoint processa com sucesso,
- **Então** a resposta tem status `200` e body com:
  - `answer`: string não vazia com a resposta em português.
  - `source_document`: identificador do documento mais relevante (string ou `null`).
  - `citations`: array com os documentos usados como contexto (pode ser `[]`).

---

### US-02 — Receber indicação da fonte em cada resposta

Como atendente, quero saber de qual documento a resposta veio, para poder citar a fonte ao cliente ou encaminhar o arquivo completo quando necessário.

**Critérios de aceite:**

- `source_document` contém o identificador do documento mais relevante usado na resposta.
- `citations` lista cada documento com `source_document` (nome/caminho), `snippet` (trecho usado) e `score` (relevância, valor 0-1).
- Quando nenhum documento relevante é encontrado, `source_document` é `null` e `citations` é `[]`.
- A resposta nunca omite `citations` do payload — o campo sempre está presente, mesmo vazio.

---

### US-03 — Receber erro claro ao enviar input inválido

Como sistema cliente, quero receber um erro estruturado quando o input é inválido, para exibir uma mensagem útil ao atendente sem expor stack traces.

**Critérios de aceite:**

- Pergunta ausente ou apenas espaços em branco → `400` com `{ "error": "<mensagem descritiva>" }`.
- Pergunta com mais de 500 caracteres → `400` com mensagem indicando o limite excedido.
- Requisição com método diferente de `POST` → `405` com mensagem de método não permitido.
- Em todos os casos de erro, o body é JSON com campo `error` (string). Nenhum stack trace é exposto.

---

### US-04 — Respostas baseadas exclusivamente na documentação oficial

Como NovaTech (stakeholder), quero que o assistente responda apenas com base nos documentos indexados, para evitar que o modelo invente informações e gere passivos legais junto aos clientes.

**Critérios de aceite:**

- O system prompt carregado de `/prompts/system-prompt.md` instrui o modelo a usar apenas o contexto fornecido e citar a fonte.
- O prompt montado respeita o budget do ADR-0002: máximo ~4.000 chars para o system prompt e ~8.000 chars para os chunks recuperados.
- Quando os chunks não contêm informação suficiente, a resposta indica que não há dados disponíveis — o modelo não especula.
- Documentos com versões conflitantes: o modelo prioriza o mais recente (ADR-0003), o que é garantido pelo metadado de vigência no payload dos chunks.

---

### US-05 — Tolerância a falhas transitórias nos serviços Azure

Como sistema cliente, quero que o endpoint tente novamente em caso de falha temporária, para que instabilidades pontuais nos serviços Azure não resultem em erros visíveis ao atendente.

**Critérios de aceite:**

- Falhas transitórias (timeout, HTTP 5xx) em Azure AI Search ou Azure OpenAI são retentadas até 3 vezes com backoff exponencial (100 ms, 200 ms, 400 ms).
- Após esgotar as tentativas, o endpoint retorna `500` com `{ "error": "Serviço temporariamente indisponível." }` — sem stack trace.
- Cada tentativa de retry gera uma entrada de log estruturado com: operação, número da tentativa, delay e mensagem de erro.

---

## Restrições e regras de negócio

| # | Restrição | Origem |
|---|-----------|--------|
| R-01 | Respostas sempre em português (pt-BR) | NovaTech — equipe de atendimento é nacional |
| R-02 | Budget de contexto: ~4K chars system prompt + ~8K chars chunks | ADR-0002 |
| R-03 | Documentos contraditórios: priorizar versão mais recente via metadado de vigência | ADR-0003 |
| R-04 | System prompt versionado em `/prompts/system-prompt.md`; mudanças registradas em `prompt-changelog.md` | ADR-0002 |
| R-05 | Pergunta máxima: 500 caracteres | Operacional — previne abuso e prompt injection via input longo |
| R-06 | Stack traces nunca expostos em respostas de erro | Segurança — evita vazamento de detalhes internos |

---

## Fora do escopo deste endpoint

- Histórico de conversa multi-turno (sem session tracking nesta versão).
- Autenticação e autorização de usuário (delegadas à camada do Teams Bot / painel web).
- Ingestão, atualização ou exclusão de documentos (responsabilidade do pipeline de ingestão).
- Rate limiting e throttling por usuário (responsabilidade do API Gateway).
