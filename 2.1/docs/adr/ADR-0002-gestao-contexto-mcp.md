# ADR-0002: Restringir o contexto do assistente a um escopo explícito via MCP local

## Status: Aceito

## Contexto
O assistente precisa consultar código, especificações, documentação de negócio e o corpus de recuperação, mas não pode depender de um contexto global amplo nem de acesso irrestrito ao repositório. O cenário 1 reforça a necessidade de decisões explícitas sobre contexto, limites de prompt e rastreabilidade para evitar ruído e exposição indevida.

## Decisão
Usar servidores MCP locais com escopo restrito: o filesystem só acessa diretórios autorizados do repositório; a documentação de negócio e o corpus de recuperação ficam em modo read-only; o histórico do git é exposto apenas localmente; e a memória persistente é mantida em um arquivo JSON simples no projeto.

## Consequências
- Contexto mais enxuto e previsível para o assistente.
- Menor risco de leitura de arquivos indevidos ou alteração sem revisão.
- Melhora na rastreabilidade da decisão, porque cada leitura ou busca pode ser vinculada a um diretório explícito.
- O trade-off é que tarefas mais amplas exigem múltiplas leituras direcionadas e prompts mais específicos.

## Alternativas consideradas
- Acesso irrestrito ao filesystem do repositório: descartado por aumentar o risco de leitura indevida e de contexto excessivo.
- Uso de um serviço remoto para MCP: descartado para manter a solução local, barata e de baixa dependência operacional.
- Contexto livre e sem limites: descartado porque conflita com o objetivo do cenário 1 de preservar limites de contexto e consistência das respostas.
