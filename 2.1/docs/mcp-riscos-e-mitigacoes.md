# Riscos de segurança e mitigação do MCP local

## Riscos

1. Escopo excessivo do filesystem
   - Risco: um agente pode acessar mais arquivos do que o necessário e eventualmente ler segredos ou dados sensíveis.
   - Mitigação: o servidor de filesystem limita explicitamente o acesso a diretórios do repositório e valida qualquer caminho antes de operar.

2. Alteração sem revisão
   - Risco: um agente pode editar documentação operacional ou código sem passar por revisão humana.
   - Mitigação: os diretórios de negócio e corpus foram expostos em modo read-only; a escrita ficou restrita a diretórios de trabalho autorizados do projeto.

3. Acúmulo de memória ambígua
   - Risco: decisões persistidas pode se tornar inconsistente ou difícil de auditar com o tempo.
   - Mitigação: a memória é mantida em um arquivo JSON local simples e deve ser revisada periodicamente por quem mantém o projeto.

4. Vazamento de contexto do repositório
   - Risco: o agente pode usar mais contexto do que precisa, aumentando o custo de tokens e o risco de incluir informações irrelevantes.
   - Mitigação: os prompts devem pedir apenas o arquivo, diretório ou consulta necessária; o fluxo recomendado é ler o mínimo indispensável e, quando necessário, usar busca por palavra-chave.

5. Exposição do histórico do git
   - Risco: a informação de commits e branches pode revelar detalhes internos do projeto.
   - Mitigação: o servidor de git apenas expõe status, log e branch atual do repositório local, sem enviar dados para serviços externos.

## Medidas de controle

- Escopo de leitura e escrita explícito por diretório.
- Validação de caminhos para impedir saída do repositório.
- Diretórios sensíveis do negócio mantidos em modo read-only.
- Validação automatizada via [\.mcp/validate_mcp_config.py](../.mcp/validate_mcp_config.py).
- Documentação de uso e prompt exemplos em [\.mcp/README.md](../.mcp/README.md).
