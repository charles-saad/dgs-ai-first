# Tasks — Query Endpoint

## Visão geral
Esta lista converte o plano do endpoint em tarefas atômicas, testáveis e priorizadas. A primeira tarefa implementada aqui é a configuração do endpoint com validação de input.

| ID | Tarefa | Critérios de aceite | Dependências | Estimativa |
|---|---|---|---|---|
| Q-001 | Criar o endpoint HTTP POST /api/query com validação de input via Zod | O handler aceita POST com body JSON contendo `question`; rejeita perguntas vazias, ausentes ou com mais de 500 caracteres com status 400; retorna 405 para outros métodos; tem testes unitários cobrindo cenários válidos e inválidos. | Nenhuma | P |
| Q-002 | Definir contrato de resposta e builder de payload para o endpoint | A resposta serializada contém `answer` e `source_document`; o builder é testado isoladamente; o payload é consistente para sucesso e erro. | Q-001 | P |
| Q-003 | Adicionar logging estruturado e correlação de request | Cada execução gera um log estruturado com request id, método, status e tempo de execução; o logger não usa `console.log`. | Q-001 | P |
| Q-004 | Implementar retry com exponential backoff para chamadas Azure | Falhas transitórias de chamadas externas são retried até 3 tentativas com backoff exponencial; erros permanentes retornam resposta de erro tratada. | Q-001 | M |
| Q-005 | Integrar busca de chunks no Azure AI Search | O handler busca os top-5 chunks para a pergunta; o resultado inclui os IDs/documentos recuperados e o rank esperado. | Q-002, Q-004 | M |
| Q-006 | Montar prompt com system prompt, chunks e contexto budget | O payload enviado ao modelo respeita o budget definido no ADR-0002 (~4K system + ~8K chunks + pergunta) e usa o system prompt versionado em `/prompts/system-prompt.md`. | Q-005 | M |
| Q-007 | Integrar a chamada ao modelo GPT-4o e validar resposta | O endpoint chama o modelo e retorna uma resposta estruturada com `answer` e `source_document`; respostas fora do schema são rejeitadas e reprocessadas. | Q-006 | G |
| Q-008 | Adicionar testes de integração e ajustar configuração de deploy | Há testes de integração para o fluxo completo; a configuração do endpoint está alinhada ao modelo de runtime do Azure Functions v4. | Q-007 | M |
