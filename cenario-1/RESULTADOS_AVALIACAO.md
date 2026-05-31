# Resultados da Avaliação do Pipeline RAG — NovaTech Logística

**Data:** Maio/2026  
**Branch:** cenario-1  
**Stack:** Python + ChromaDB + sentence-transformers (all-MiniLM-L6-v2) + LangChain

---

## 1. Estratégia de Chunking Adotada e Justificativa

### Abordagem: Chunking por seção semântica (cabeçalhos Markdown)

Em vez de chunking por tamanho fixo (ex: 512 tokens com overlap), optamos por dividir os documentos **respeitando a estrutura de seções `##` e `###`** do Markdown.

**Justificativa:**

| Critério | Chunking fixo (512 tokens) | Chunking semântico (por seção) |
|----------|---------------------------|-------------------------------|
| Preservação de tabelas | ❌ Corta tabelas no meio | ✅ Tabela inteira num chunk |
| Coerência informacional | ❌ Mistura seções distintas | ✅ Cada chunk = uma regra/seção |
| Recuperabilidade | ❌ Chunks ambíguos | ✅ Título identifica o chunk |
| Tamanho médio | Fixo (512 tokens) | Variável (100–350 tokens) |

A tabela de SLA (SLA-2024, seção 2) tem ~150 tokens — chunking fixo de 512 tokens juntaria SLAs de chamados gerais com SLAs de incidentes críticos num mesmo chunk, tornando impossível distinguir os dois contextos na recuperação.

---

## 2. Resultados dos 5 Testes

### Q1 — "Qual o prazo de devolução para carga perigosa?"

| | |
|---|---|
| **Chunk esperado (gabarito)** | POL-001, seção 3.2 — Exceções por tipo de carga |
| **Top-1 recuperado** | POL-001_chunk_3 ✅ |
| **Score de similaridade** | ~0.72 |
| **Documento correto no top-1** | ✅ Sim |

**Prompt montado e resposta do Claude (v2):**
> **Cargas perigosas NÃO são elegíveis para devolução pelo processo padrão.**
> Conforme a política vigente, cargas perigosas (classes 1 a 6 da ANTT) estão excluídas do processo padrão de 7 dias úteis. O cliente deve solicitar tratamento especial — os detalhes do procedimento não estão presentes no trecho recuperado; verifique a documentação completa da POL-001 ou consulte o supervisor.
> [Fonte: POL-001, seção 3.2 — versão 2.1, janeiro/2024]

**Avaliação:** ✅ Correta | ✅ Citou fonte | ✅ Respeitou guardrail (não inventou detalhes ausentes)

---

### Q2 — "Meu cliente é Gold, qual o SLA de resolução?"

| | |
|---|---|
| **Chunk esperado (gabarito)** | SLA-2024, seção 2 — tabela de chamados gerais |
| **Top-1 recuperado** | SLA-2024_chunk_2 ✅ |
| **Score de similaridade** | ~0.68 |
| **Documento correto no top-1** | ✅ Sim |

**Resposta do Claude (v2):**
> Para clientes Gold, o SLA de resolução para **chamados gerais** é de até **24 horas úteis** (primeira resposta: 2 horas úteis).
> ⚠️ Nota: os prazos acima se aplicam a chamados gerais. Para incidentes críticos, os prazos são diferentes — consulte a tabela de incidentes críticos na SLA-2024.
> [Fonte: SLA-2024, tabela de SLAs]

**Avaliação:** ✅ Correta | ✅ Citou fonte | ✅ Alerta de incidente crítico presente (Regra 6)

---

### Q3 — "Quanto custa o frete para 600kg para Manaus?"

| | |
|---|---|
| **Chunk esperado (gabarito)** | PROC-042-v2, seção 2 — multiplicadores e fórmula |
| **Top-1 recuperado** | PROC-042-v2_chunk_2 ✅ |
| **Score de similaridade** | ~0.74 |
| **Documento correto no top-1** | ✅ Sim |
| **Problema identificado** | PROC-042-v1 apareceu como chunk 3 (score ~0.69) |

**Resposta do Claude (v2):**
> ⚠️ Atenção: há duas versões deste documento com valores diferentes. Usando a versão mais recente (PROC-042-v2, novembro/2023), conforme prioridade definida.
>
> Para 600kg destino Manaus (Região Norte):
> - Multiplicador regional (Norte): **1,8**
> - Fator de peso (500–1.000kg): **1,0**
> - Valor do frete = Valor base × 1,8
>
> Para o valor monetário final, consulte a tarifa base vigente na tabela mensal de fretes.
> [Fonte: PROC-042-v2, seção 2 — versão revisada, novembro/2023]

**Avaliação:** ✅ Correta | ✅ Citou versão correta | ✅ Sinalizou contradição entre v1 e v2 | ✅ Não inventou valor base

---

### Q4 — "Qual o prazo de devolução padrão?"

| | |
|---|---|
| **Chunk esperado (gabarito)** | POL-001, seção 3.1 — Prazo padrão |
| **Top-1 recuperado** | POL-001_chunk_2 ✅ |
| **Score de similaridade** | ~0.78 |
| **Documento correto no top-1** | ✅ Sim |

**Resposta do Claude (v2):**
> O prazo padrão para solicitação de devolução é de **7 dias úteis** a partir da data de entrega registrada no sistema.
> [Fonte: POL-001, seção 3.1 — versão 2.1, janeiro/2024]

**Avaliação:** ✅ Correta | ✅ Citou fonte | ✅ Simples e direta

---

### Q5 — "O que é um incidente crítico?"

| | |
|---|---|
| **Chunk esperado (gabarito)** | SLA-2024, seção 3 — SLA para Incidentes Críticos |
| **Top-1 recuperado** | SLA-2024_chunk_3 ✅ |
| **Score de similaridade** | ~0.71 |
| **Documento correto no top-1** | ✅ Sim |

**Resposta do Claude (v2):**
> Incidentes críticos são definidos como situações que se enquadrem em ao menos um dos seguintes critérios:
> - Carga acima de R$ 100.000 sem localização por mais de 4 horas
> - Carga perigosa com irregularidade de transporte
> - Situação de risco a pessoas
>
> [Fonte: SLA-2024, seção 3 — versão 2024]

**Avaliação:** ✅ Correta | ✅ Citou fonte | ✅ Listagem clara

---

## 3. Sumário dos Resultados

| Pergunta | Chunk exato (top-3) | Doc correto (top-1) | Score top-1 |
|----------|--------------------:|--------------------:|------------:|
| Q1 — Carga perigosa | ✅ | ✅ | ~0.72 |
| Q2 — SLA Gold | ✅ | ✅ | ~0.68 |
| Q3 — Frete 600kg Manaus | ✅ | ✅ | ~0.74 |
| Q4 — Prazo devolução padrão | ✅ | ✅ | ~0.78 |
| Q5 — Incidente crítico | ✅ | ✅ | ~0.71 |
| **Total** | **5/5** | **5/5** | **~0.73** |

---

## 4. Problemas Identificados e Propostas de Correção

### Problema 1: PROC-042-v1 aparece como chunk relevante para perguntas de frete

**Observação:** Nas buscas por cálculo de frete, o PROC-042-v1 (versão obsoleta) aparece consistentemente entre os top-3 chunks com score próximo ao da v2 (~0.69 vs ~0.74). O modelo de embedding não distingue versões — trata ambos como igualmente relevantes semanticamente.

**Risco:** Se a v1 aparecer como top-1 em alguma variação da pergunta, o LLM pode usar multiplicadores desatualizados (Norte = 1,6 em vez de 1,8), gerando erro operacional para o atendente.

**Proposta de correção:**
1. **Metadado de versão no filtro de busca:** Adicionar filtro `where={"doc_type": "normativo"}` combinado com pós-processamento que, quando ambas as versões aparecerem, descarta a mais antiga antes de montar o prompt.
2. **Re-indexação com prefixo de versão no texto:** Adicionar ao início de cada chunk um cabeçalho `[VERSÃO OBSOLETA — use PROC-042-v2]` para os chunks da v1, sinalizando ao LLM antes mesmo da instrução do system prompt.
3. **Remoção da v1 do índice:** Se a v1 não tiver mais valor para nenhum caso de uso (ex: clientes com contratos antigos), simplesmente não ingeri-la.

---

### Problema 2: Perguntas ambíguas sobre SLA recuperam chunks de chamados gerais sem alertar sobre incidentes críticos quando a seção 3 não aparece no top-3

**Observação:** A pergunta "Meu cliente é Gold, qual o SLA?" recuperou corretamente a tabela de chamados gerais (seção 2), mas a seção 3 (incidentes críticos) ficou fora do top-3 por ser semanticamente mais distante da pergunta simples. O alerta só apareceu porque o system prompt (Regra 6) instrui o LLM a adicionar o aviso — não porque o chunk de incidentes críticos foi recuperado.

**Risco:** Se o system prompt for simplificado em versões futuras e a Regra 6 for removida, o atendente recebe o SLA de chamados gerais sem saber que incidentes críticos têm prazo diferente.

**Proposta de correção:**
1. **Busca híbrida por tipo de query:** Para perguntas sobre SLA, forçar recuperação de pelo menos 1 chunk da seção de incidentes críticos além dos chunks por similaridade semântica, usando busca por metadado (`doc_name=SLA-2024`) como complemento.
2. **Chunking com cross-referência:** Incluir ao final do chunk da seção 2 (chamados gerais) uma nota: `"Ver também: seção 3 — SLA para incidentes críticos"`, para que o LLM saiba que existe o contexto complementar mesmo sem o chunk completo.
3. **Manter Regra 6 no system prompt como redundância:** A regra atua como safety net quando o retrieval não retorna o chunk de incidentes — mesmo que seja redundante nos casos em que o chunk aparece, ela é crítica para os casos em que não aparece.

---

## 5. Lições Aprendidas de Engenharia de Pipeline

1. **Chunking semântico > chunking por tamanho fixo** para documentos estruturados com tabelas — tabelas cortadas no meio tornam o chunk inutilizável.
2. **Versões múltiplas de documentos são o maior risco de retrieval** — não porque o LLM alucina, mas porque o modelo de embedding os trata como igualmente relevantes.
3. **O system prompt é um safety net, não a fonte primária de controle** — regras como a Regra 6 precisam existir independentemente do pipeline de retrieval ser perfeito.
4. **Metadados de confiabilidade no ChromaDB** permitem filtrar ou sinalizar chunks de documentos informais (FAQ) antes de montar o prompt, reduzindo o risco de dar o mesmo peso a fontes de confiabilidade diferente.
