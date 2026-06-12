# Exercício 2.1 — MCP servers locais e least privilege

## 1. Mapeamento de necessidades para servers locais

| Necessidade | Server local | O que expõe | Escopo/privilegio | Consumidor |
|---|---|---|---|---|
| Ler e escrever código, specs e skills | `filesystem` | `list_directory`, `read_file`, `search_text`, `write_file` | Diretórios do repositório: `src`, `specs`, `skills`, `prompts`, `tests`, `.mcp`; leitura de `docs/novatech` e `data/retrieval-corpus` apenas para leitura | Devs, Tech Lead, agentes Copilot/Claude |
| Documentação de negócio da NovaTech | `filesystem` | mesmo server, mas no escopo `docs/novatech` | Read-only | Devs, Product Specialist, QA |
| Corpus de chunks para recuperação | `filesystem` | mesmo server, mas no escopo `data/retrieval-corpus` | Read-only | Devs, Tech Lead, QA |
| Histórico/branches do repositório | `git` | `git_status`, `git_log`, `git_branch` | Apenas o repositório local | Devs, Tech Lead |
| Memória persistente de decisões | `memory` | `read_memory`, `write_memory` | Banco JSON local em `.mcp/memory.json` | Time inteiro, agentes |

## 2. Justificativa do least privilege

- O `filesystem` server recebe apenas os diretórios que o projeto realmente usa: código, specs, skills, prompts, testes e os dois repositórios de leitura de negócio (`docs/novatech` e `data/retrieval-corpus`).
- Os diretórios de negócio foram tratados como read-only para evitar que um agente altere a documentação oficial ou o corpus de referência sem revisão.
- O escopo de escrita ficou restrito a diretórios de trabalho do projeto, sem acesso a `.env`, segredos, ou arquivos fora do repositório.

## 3. Riscos e mitigação

O detalhamento completo está em [docs/mcp-riscos-e-mitigacoes.md](mcp-riscos-e-mitigacoes.md).

Resumo rápido:

1. Escopo amplo demais do `filesystem` server
   - Risco: exposição de segredos ou arquivos sensíveis fora do projeto.
   - Mitigação: limitar o escopo a diretórios explícitos e bloquear qualquer caminho fora do repositório.

2. Escrita sem revisão
   - Risco: agente alterar arquivos de documentação ou código sem gate humano.
   - Mitigação: manter `docs/novatech` e `data/retrieval-corpus` em modo read-only e exigir revisão para mudanças em `src`, `specs` e `skills`.

3. Memória persistente mal controlada
   - Risco: decisões acumuladas tornarem-se ambíguas ou inconsistentes.
   - Mitigação: manter a memória em um arquivo JSON simples e revisar periodicamente as entradas.

## 4. Transcript de execução

Execução validada com os servidores locais implementados na pasta `.mcp/servers/`:

- Leitura de um documento de negócio: `docs/novatech/FAQ-atendimento.md`
- Recuperação de um chunk relevante do corpus: `data/retrieval-corpus/chunks-novatech.md`
- Leitura do histórico do repositório via git: `git_status` e `git_log`

Saída observada no ambiente local:

```text
DOC_READ_START
# FAQ-Atendimento — Perguntas Frequentes do Time de Suporte

**Versão:** Não controlada
**Última atualização:** Diversas (documento colaborativo)
**Responsável:** Nenhum responsável formal — mantido informalmente pelo time de atendimento
**Classificação:** Documento informal — NÃO validado por Compliance ou Operações.
DOC_READ_END
SEARCH_START
[{'path': 'data\\retrieval-corpus\\chunks-novatech.md', 'snippet': '# Anexo B — Chunks de Referência do Pipeline de RAG'}]
SEARCH_END
GIT_STATUS_START
M .github/workflows/ci.yml
 M .mcp/mcp.json
?? .mcp/README.md
?? .mcp/servers/
?? .mcp/validate_mcp_config.py
?? .vscode/
?? docs/mcp-exercicio-2-1.md
GIT_STATUS_END
GIT_LOG_START
bbdd03a|2026-06-09|chore: starter repo (Anexo D) â€” estrutura + dados semeados dos Anexos A e B
GIT_LOG_END
```

## 5. Conexão com o cenário 1: ADRs e limites de contexto

A solução foi desenhada para refletir as decisões de contexto do cenário 1:

- A decisão de escopo restrito e leitura direcionada está registrada em [docs/adr/ADR-0002-gestao-contexto-mcp.md](adr/ADR-0002-gestao-contexto-mcp.md).
- O limite de contexto é preservado ao evitar leitura ampla do repositório e ao buscar apenas os arquivos ou diretórios necessários para a tarefa.
- O fluxo recomendado para agentes é: localizar o documento ou chunk relevante, ler o mínimo necessário e, somente depois, ampliar o escopo se a tarefa exigir.
