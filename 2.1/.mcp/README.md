# MCP local para o NovaTech Assistant

## Requisitos de ambiente

- Python 3.10+ com o comando `python` disponível no PATH.
- Pacote MCP do Python:
  - `python -m pip install mcp`
- O repositório local deve estar disponível no caminho atual do agente.

## Passos de uso

1. Confirme que `python` está disponível.
2. Instale a dependência MCP com `python -m pip install mcp`.
3. Abra o agente com o arquivo [.mcp/mcp.json](mcp.json) como configuração MCP.
4. Use prompts curtos e específicos para pedir leitura, busca ou histórico do repositório.

## Exemplos de prompts para os agentes

### Filesystem
- `Leia o documento docs/novatech/README.md e resuma as regras principais.`
- `Encontre trechos sobre SLA no diretório data/retrieval-corpus.`
- `Liste os arquivos em src e leia o handler do endpoint de query.`

### Git
- `Mostre o status do repositório e os últimos 3 commits.`
- `Liste as branches locais e o histórico recente.`

### Memory
- `Leia a memória persistente do projeto.`
- `Adicione uma decisão sobre a política de contexto do assistente.`

## Validação local

Execute:

```bash
python .mcp/validate_mcp_config.py
```
