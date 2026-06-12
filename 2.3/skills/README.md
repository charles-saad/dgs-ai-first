# Estratégia de Skills — NovaTech Assistant

Skills são arquivos `.md` que encapsulam como gerar tipos específicos de outputs neste projeto. Um agente (Copilot, Claude Code) carrega a skill relevante antes de gerar código ou artefatos — não como leitura opcional, mas como pré-requisito da geração.

A hierarquia é **Foundation → Domain → Artifact**: Foundation define o que nunca muda; Domain define padrões por camada; Artifact combina Foundation + Domain para gerar um entregável concreto.

---

## Árvore de skills

```
skills/
├── foundation/
│   ├── typescript-conventions.md   ← base de toda geração de código TypeScript
│   ├── error-handling.md           ← contrato de erros e respostas de falha
│   └── project-structure.md        ← onde cada tipo de arquivo vive no repo
│
├── domain/
│   ├── azure-functions-endpoint.md ← estrutura de um endpoint: handler + validator + service
│   ├── azure-ai-search-integration.md ← contrato de chamada ao Azure AI Search
│   ├── testing-patterns.md         ← como escrever testes unitários e de integração
│   └── react-components.md         ← componentes do painel web (cards, formulários)
│
└── artifact/
    ├── create-rag-endpoint.md      ← receita: handler + validator + service + response-builder
    ├── create-integration-test.md  ← receita: testes de integração para um endpoint
    └── create-react-card.md        ← receita: componente React de card de resposta
```

---

## Mapeamento de criação e consumo

### Foundation

| Skill | Frase-ativação | Cria | Consome | Frequência |
|-------|---------------|------|---------|------------|
| `typescript-conventions.md` | "Gerar código TypeScript para este projeto" | Tech Lead | Dev (pleno/sênior), Copilot em toda geração de código | Alta — toda geração |
| `error-handling.md` | "Como tratar e retornar erros neste projeto" | Tech Lead | Dev, QA (ao escrever asserções de erro), Copilot | Alta — todo handler e service |
| `project-structure.md` | "Onde criar este arquivo no repositório" | Tech Lead | Dev, QA, Delivery Manager (ao estimar escopo), Copilot | Média — onboarding e cada novo módulo |

### Domain

| Skill | Frase-ativação | Cria | Consome | Frequência |
|-------|---------------|------|---------|------------|
| `azure-functions-endpoint.md` | "Criar um novo endpoint Azure Functions v4" | Tech Lead | Dev, Copilot | Alta — um endpoint por módulo do projeto |
| `azure-ai-search-integration.md` | "Integrar busca de chunks no Azure AI Search" | Dev Sênior | Dev, Copilot | Média — query endpoint, pipeline, health check |
| `testing-patterns.md` | "Escrever testes para este endpoint / service" | QA + Tech Lead | Dev, QA, Copilot | Alta — todo arquivo de teste |
| `react-components.md` | "Criar um componente React para o painel web" | Dev Pleno/Sênior | Dev, Copilot | Média — painel web (card de resposta, feedback form) |

### Artifact

| Skill | Frase-ativação | Cria | Consome | Frequência |
|-------|---------------|------|---------|------------|
| `create-rag-endpoint.md` | "Criar o endpoint RAG completo para [módulo]" | Dev Sênior + Tech Lead | Dev, Copilot | Média — cada novo endpoint RAG (feedback, health) |
| `create-integration-test.md` | "Criar testes de integração para [endpoint]" | QA + Dev Sênior | Dev, QA, Copilot | Média — após cada endpoint implementado |
| `create-react-card.md` | "Criar o card de resposta / feedback no painel" | Dev + Product Specialist (revisão) | Dev, Copilot | Baixa — componentes específicos do painel |

---

## Regras de uso

1. **Skills Foundation são pré-requisito implícito** de todas as outras. Copilot/Claude deve carregar `typescript-conventions.md` antes de qualquer geração de código TypeScript, mesmo que a tarefa seja um artifact.

2. **Skills Artifact incluem por referência** as skills Foundation e Domain que precisam. O arquivo artifact declara explicitamente quais skills são pré-requisito na seção `## Pré-requisitos`.

3. **Quem cria mantém.** A skill pertence ao papel que a criou. Mudanças de padrão devem passar pelo criador original — PR review com o papel anotado.

4. **Anti-padrões documentados têm prioridade sobre o exemplo positivo.** Se o Copilot insistir em um anti-padrão, colar o trecho da seção `## Anti-padrões` no prompt é suficiente para corrigir o curso.

---

## Skills complementares a criar (próximos ciclos)

| Skill (a criar) | Camada | Quem cria | Motivação |
|-----------------|--------|-----------|-----------|
| `sdd-spec.md` | Artifact | Product Specialist | Padronizar a geração de `requirements.md` e `tasks.md` via Claude |
| `adr-template.md` | Artifact | Tech Lead | Garantir ADRs com Contexto/Decisão/Consequências consistentes |
| `prompt-engineering.md` | Domain | Tech Lead + PS | Reger mudanças no system prompt com changelog obrigatório |
| `logging-observability.md` | Foundation | Tech Lead | Separar convenções de pino (child loggers, serializers) do typescript-conventions |
