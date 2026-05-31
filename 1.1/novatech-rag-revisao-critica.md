# Revisão Crítica da Análise Técnica — Assistente RAG NovaTech

**Documento:** Revisão e Contrapontos à Análise de Viabilidade  
**Elaborado por:** DB1 — Engenharia de IA (Revisão Interna)  
**Data:** Maio 2026

> Este documento assume que a análise técnica anterior está correta em seus fundamentos e propõe questionamentos sobre o que foi subestimado, omitido ou apresentado com excesso de otimismo. O objetivo é expor riscos antes que o projeto os encontre em produção.

---

## 1. Estimativas de Token Subestimadas

### 1.1 O volume real provavelmente é 2–3× maior

A análise usa "500 palavras por página" como média para PDFs técnicos de logística. Documentos com tabelas densas, regulamentos e manuais operacionais frequentemente chegam a 700–900 palavras por página de conteúdo útil — especialmente após serialização de tabelas (onde uma tabela de 15 colunas × 30 linhas produz significativamente mais texto quando expandida em formato legível pelo LLM).

**Estimativa revisada:**

| Fonte | Estimativa original | Estimativa revisada |
|---|---|---|
| PDFs (texto + tabelas serializadas) | ~5,3M tokens | ~8–10M tokens |
| Wiki (com resolução de macros e links) | ~800K tokens | ~1,2–1,5M tokens |
| Planilhas (serialização estruturada) | ~133K tokens | ~300–500K tokens |
| **Total** | **~6,2M tokens** | **~10–12M tokens** |

**Implicação prática:** O custo de embedding inicial e re-indexação mensal é significativamente maior. Com `text-embedding-3-small` a ~US$ 0,02 por 1M tokens, 12M tokens = ~US$ 240 por rodada de indexação completa. Com re-indexações mensais de 30% do acervo, são ~US$ 60–80/mês apenas em embeddings — não catastrófico, mas não mencionado no orçamento.

---

## 2. Latências Otimistas

### 2.1 O P95 real em produção é significativamente pior

A análise cita P95 de ~5–6 segundos. Esse número é válido em condições de laboratório (uma query isolada, infraestrutura dedicada, sem concorrência). Em produção, com 45 atendentes e picos de chamado simultâneo:

- **Azure OpenAI throttling:** O GPT-4o tem limites de TPM (tokens per minute) por deployment. Com 45 usuários enviando queries simultâneas, cada uma com ~6.000–8.000 tokens de input, o risco de throttling é real. Um deployment padrão pode ter limite de 80.000–120.000 TPM — suficiente para ~10–15 queries simultâneas de 8K tokens, não 45.
- **Tempo de streaming vs. tempo até primeiro token:** A análise menciona streaming como solução de percepção de latência, mas o tempo até o **primeiro token** ainda pode ser 1–2 segundos — e para perguntas com respostas longas (procedimentos de 5 etapas), o tempo total de streaming pode chegar a 8–12 segundos.
- **Latência de rede interna:** Se o assistente for acessado via Teams Bot Framework, há overhead adicional de webhook, processamento do Bot Service e entrega via canal Teams que a análise ignora.

**Estimativa revisada (produção real com carga):**

| Métrica | Análise original | Revisão realista |
|---|---|---|
| P50 (sem carga) | ~2,3s | ~3–4s |
| P95 (carga normal) | ~5–6s | ~8–12s |
| P99 (pico de carga) | Não mencionado | ~15–20s+ |

---

## 3. Problema de Contradições Entre Documentos: Subestimado

### 3.1 A análise menciona o problema mas não propõe solução

O cenário descreve explicitamente que "alguns documentos se contradizem entre versões". A análise técnica identifica isso como "risco de governança" e recomenda um processo de revisão — mas não endereça o que o assistente fará **quando o RAG encontrar chunks contraditórios sobre a mesma pergunta**.

**Cenários concretos não tratados:**

- O sistema retorna dois chunks com valores de frete diferentes para a mesma rota porque um manual de 2024 e um de 2025 estão ambos indexados.
- O LLM, ao receber informações contraditórias no contexto, pode: (a) inventar uma síntese, (b) apresentar ambos os valores sem hierarquia, ou (c) silenciosamente escolher um — nenhuma dessas é aceitável para operação de atendimento ao cliente.

**O que a análise deveria propor mas não propôs:**

- Metadado de `data_vigência` obrigatório em todos os chunks, com filtro de retrieval que prioriza ou exclui documentos desatualizados.
- Estratégia de **versão canônica**: cada tipo de documento tem uma fonte de verdade designada. Se a tabela de frete está no SharePoint E na planilha, apenas uma é indexada para aquela pergunta.
- Prompt engineering específico para lidar com contradição: o LLM deve ser instruído explicitamente a sinalizar quando encontrar informações conflitantes em vez de sintetizá-las silenciosamente.

---

## 4. OCR: O Risco Mais Subestimado do Projeto

### 4.1 Azure AI Document Intelligence não é uma solução mágica

A análise recomenda Azure AI Document Intelligence e menciona "flagging de páginas com score < 80%". O que não está dito:

- **Proporção de documentos escaneados desconhecida:** Os 800 PDFs incluem "alguns documentos escaneados" — mas sem auditoria, não sabemos se são 50 ou 300. Um documento escaneado de má qualidade pode exigir revisão humana de todas as suas páginas.
- **Custo de OCR não estimado:** Azure AI Document Intelligence custa ~US$ 1,50 por 1.000 páginas para Read API. Se 20% dos 8.000 páginas de PDF forem escaneadas, são 1.600 páginas × US$ 1,50/1.000 = ~US$ 2,40 inicial. Não catastrófico — mas re-indexações mensais de documentos escaneados novos adicionam custo contínuo.
- **Tabelas em documentos escaneados:** A análise trata tabelas e OCR como problemas separados. Tabelas em documentos escaneados são o pior caso combinado — o OCR de uma tabela de 15 colunas em um escaneado de baixa qualidade frequentemente produz texto completamente inutilizável. A estratégia de "serializar tabelas com pdfplumber" não funciona para escaneados.
- **Fluxogramas embutidos como imagens:** A análise menciona esse caso mas não propõe tratamento. Fluxogramas são invisíveis para OCR de texto — o RAG simplesmente não terá acesso ao conteúdo desses diagramas. Em documentos de procedimento operacional, um fluxograma pode ser a informação mais importante da página.

---

## 5. A Wiki do Confluence É Mais Complexa do Que Parece

### 5.1 Macros customizadas podem conter conteúdo crítico

A análise propõe "remover ou normalizar macros customizadas". Isso é correto como abordagem geral, mas pressupõe que as macros são apenas formatação. Na prática:

- Macros como `{excerpt}`, `{include}`, e macros customizadas de empresas frequentemente contêm **conteúdo de negócio crítico** — um bloco de alerta sobre exceção de SLA pode estar inteiramente dentro de uma macro `{warning}`.
- Macros de tabela customizadas podem estruturar dados que se tornam texto sem sentido quando renderizados como HTML puro.

**Risco:** Ignorar macros pode silenciosamente omitir informações críticas do índice, sem que a equipe perceba até um incidente em produção.

### 5.2 Links internos como grafo de dependências: complexidade real

A proposta de "parent-child chunking" e "grafo de dependências" é tecnicamente sólida, mas subestima o esforço de implementação. Construir e manter um grafo de dependências para 400 páginas wiki requer:

- Parsing de todos os links internos na indexação inicial.
- Re-indexação em cascata quando uma página referenciada muda (se a página B é referenciada por A, C e D, atualizar B pode requerer re-indexação de A, C e D).
- Detecção de ciclos no grafo (wikis costumam ter links bidirecionais).

Isso não é trivial e pode consumir sprints significativos do projeto de 3 meses.

---

## 6. Chunking Híbrido por Tipo de Conteúdo: Complexidade Operacional Ignorada

A análise recomenda uma estratégia de chunking diferenciada por tipo de documento, o que é tecnicamente correto. O que não está dito é o custo operacional dessa abordagem:

- **Classificação automática de tipo de documento:** Para aplicar chunking diferenciado, o pipeline precisa primeiro **classificar** cada documento (é uma tabela? um procedimento? uma política?). Essa classificação pode ser feita com heurísticas, mas terá erros — e erros de classificação produzem chunks de baixa qualidade silenciosamente.
- **Manutenção do pipeline:** Com 4 estratégias de chunking diferentes e 3 fontes de dados, o pipeline de ingestão tem pelo menos 12 combinações a testar e manter. Quando um novo tipo de documento aparece (e aparecerá), alguém precisa decidir qual estratégia aplicar.
- **Atualização mensal coordenada:** A documentação é atualizada mensalmente por 3 áreas sem processo unificado. O pipeline de re-indexação precisa ser robusto o suficiente para lidar com documentos adicionados, modificados e removidos simultaneamente, sem re-indexar tudo do zero (o que levaria horas).

---

## 7. Riscos de Negócio Não Considerados

### 7.1 Responsabilidade por respostas incorretas

A análise não aborda o que acontece quando o assistente fornece uma resposta errada que leva um atendente a dar informação incorreta a um cliente. Em logística, erros de SLA e frete têm impacto financeiro direto. Quem é responsável — o assistente, o atendente, a DB1, a NovaTech?

**Recomendação não feita:** O sistema deve incluir disclaimers claros, mecanismo de feedback por resposta, e um fluxo de escalation para quando o atendente não confia na resposta.

### 7.2 Adoção pelos atendentes

A análise não menciona gestão de mudança. Um sistema tecnicamente perfeito pode ter adoção zero se os 45 atendentes perceberem o assistente como ameaça ao emprego ou encontrarem casos de erro nas primeiras semanas e perderem confiança. O go-live em 3 meses não deixa espaço para um piloto controlado.

### 7.3 Conformidade com LGPD

Os chamados de atendimento ao cliente contêm dados pessoais de clientes. Se o histórico de conversa for mantido no contexto para multi-turn, há risco de que dados pessoais de um chamado anterior "contaminem" um chamado posterior (especialmente em sessões de atendente sem isolamento adequado por sessão). A análise não menciona LGPD em nenhum momento.

### 7.4 Documentos com informações sensíveis

Nem toda documentação corporativa deve estar acessível a todos os 45 atendentes. Políticas de compliance podem ter seções confidenciais, contratos individuais de clientes podem ter SLAs diferenciados que não devem ser expostos. O pipeline de RAG descrito não inclui controle de acesso em nível de chunk — se um documento está indexado, qualquer atendente pode recuperar seu conteúdo via query.

---

## 8. Prazo de 3 Meses: Altamente Otimista

A análise implicitamente valida o prazo de 3 meses sem questioná-lo. Uma estimativa mais realista:

| Fase | Estimativa original implícita | Estimativa realista |
|---|---|---|
| Discovery e auditoria documental | 2–3 semanas | 4–5 semanas (800 docs a auditar) |
| Pipeline de ingestão (OCR, tabelas, wiki) | 3–4 semanas | 6–8 semanas |
| RAG core + integração Azure AI Search | 2–3 semanas | 3–4 semanas |
| Integração Teams + Bot Framework | 1–2 semanas | 2–3 semanas |
| Testes, ajustes de qualidade, red-teaming | 2 semanas | 4–6 semanas |
| Go-live e estabilização | 1 semana | 2–3 semanas |
| **Total** | **~12 semanas** | **~21–29 semanas** |

O prazo de 3 meses é viável apenas se: (a) o escopo for reduzido (ex.: indexar apenas PDFs do SharePoint no MVP, adicionando wiki e planilhas em fases posteriores), (b) a NovaTech já tiver feito curadoria básica dos documentos, e (c) não houver bloqueios de aprovação corporativa para provisionar os Azure AI Services.

---

## 9. O Que a Análise Acertou

Para equilíbrio, os seguintes aspectos estão bem fundamentados e merecem ser mantidos:

- A recomendação de RAG híbrido (dense + sparse + re-ranking) é a abordagem correta para o perfil de perguntas da NovaTech.
- O orçamento de contexto de 10–12 chunks é conservador e adequado para mitigar "lost in the middle".
- A identificação de tabelas como chunks atômicos é correta e frequentemente negligenciada em projetos RAG.
- O uso de Azure AI Search com suporte nativo a busca híbrida é a escolha tecnológica mais pragmática dado o ecossistema Microsoft da NovaTech.
- O apontamento da governança documental como risco central é preciso — é o único problema que a tecnologia sozinha não resolve.

---

## 10. Recomendações Adicionais

1. **Fazer uma auditoria documental antes de qualquer desenvolvimento:** Amostrar 50 documentos de cada fonte para medir taxa real de OCR, qualidade de tabelas e dependências de wiki. Isso alimenta estimativas reais de esforço.

2. **Propor MVP faseado:** Fase 1 (6 semanas): apenas PDFs do SharePoint sem OCR. Fase 2 (4 semanas): adicionar wiki. Fase 3 (4 semanas): planilhas + OCR. Fase 4 (4 semanas): polimento, integração Teams completa, go-live.

3. **Definir SLA do assistente:** Antes do go-live, a NovaTech e a DB1 precisam concordar com métricas de qualidade aceitáveis (ex.: "90% das respostas corretas avaliadas por amostragem semanal") e com o processo quando o sistema erra.

4. **Incluir LGPD no escopo:** Contratar ou consultar DPO da NovaTech para definir quais dados podem trafegar pelo assistente e como logs devem ser tratados.

5. **Provisionar capacidade de Azure OpenAI adequada ao pico de carga:** Calcular TPM necessário para 45 usuários simultâneos e provisionar com folga de 2× para acomodar variações.
