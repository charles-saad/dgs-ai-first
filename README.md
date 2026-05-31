# Pipeline RAG — NovaTech Logística

Prova de conceito de um pipeline de Retrieval-Augmented Generation (RAG) para o assistente interno de atendimento da NovaTech Logística. O pipeline ingere documentos normativos, cria embeddings semânticos, armazena num vector store local e monta prompts prontos para envio ao LLM.

---

## Stack

| Componente | Tecnologia | Versão |
|---|---|---|
| Linguagem | Python | 3.10+ |
| Vector store | ChromaDB (local, persistente) | 0.5.0 |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`) | 3.0.1 |
| Orquestração | LangChain | 0.2.6 |
| LLM (geração) | Claude via chat manual (sem API key) | — |

Toda a stack é gratuita e open-source. Nenhuma chave de API é necessária para ingestão e busca.

---

## Estrutura do projeto

```
.
├── anexo-a-documentos-individuais/   # Documentos da NovaTech prontos para ingestão
│   ├── POL-001.md                    # Política de devoluções (normativo, v2.1)
│   ├── SLA-2024.md                   # Tabela de SLA por tier de cliente
│   ├── PROC-042-v2.md                # Cálculo de frete especial (versão atual)
│   ├── PROC-042-v1.md                # Versão obsoleta (mantida para testar conflito de versões)
│   └── FAQ-Atendimento.md            # FAQ informal da equipe (baixa confiabilidade)
│
├── rag_pipeline/
│   ├── ingest.py                     # Etapa 1: chunking + embeddings + ChromaDB
│   ├── search.py                     # Etapa 2: busca semântica com score de similaridade
│   ├── prompt_builder.py             # Etapa 3: montagem do prompt (system prompt v2 + chunks + pergunta)
│   └── evaluate.py                   # Testes Q1–Q5 contra gabarito do Anexo B
│
├── cenario-1/
│   └── RESULTADOS_AVALIACAO.md       # Análise dos 5 testes, problemas e propostas de correção
│
├── run_pipeline.py                   # Runner principal (ingestão + avaliação em sequência)
├── requirements.txt
└── setup_and_run.sh                  # Script de setup (Linux/Mac)
```

---

## Instalação

```bash
# 1. Criar e ativar ambiente virtual
python -m venv venv

# Linux/Mac
source venv/bin/activate

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# 2. Instalar dependências
pip install -r requirements.txt
```

---

## Execução

### Pipeline completo (ingestão + avaliação)

```bash
python run_pipeline.py
```

Executa as duas etapas em sequência:
1. Lê os 5 documentos de `anexo-a-documentos-individuais/`, divide em chunks semânticos, gera embeddings e persiste no ChromaDB (`chroma_db/`).
2. Roda as 5 perguntas do gabarito, exibe os chunks recuperados com score de similaridade e o prompt montado para cada pergunta.

### Apenas ingestão

```bash
python rag_pipeline/ingest.py
```

### Busca avulsa

```python
from rag_pipeline.search import search_with_details

search_with_details("Qual o prazo de devolução para carga perigosa?", n_results=3)
```

---

## Estratégia de chunking

O pipeline usa **chunking semântico por cabeçalho Markdown** (`##` e `###`) em vez de chunking por tamanho fixo.

**Por quê não chunking fixo (512 tokens):**
- Tabelas de SLA e de multiplicadores de frete cortadas no meio perdem o contexto necessário para responder corretamente.
- Seções distintas (ex: SLA de chamados gerais e SLA de incidentes críticos) ficariam misturadas no mesmo chunk, impossibilitando o retrieval diferenciado.

**Resultado do chunking semântico:**
- Cada chunk = uma seção coesa (regra, tabela ou procedimento completo).
- Tamanho médio: 100–300 tokens, bem dentro do limite do modelo de embedding (512 tokens).
- Título da seção pai é preservado no texto do chunk para manter contexto.

---

## Confiabilidade das fontes

Cada chunk armazenado no ChromaDB carrega metadados de confiabilidade, usados na montagem do prompt:

| Documento | Tipo | Confiabilidade | Uso no prompt |
|---|---|---|---|
| POL-001, SLA-2024, PROC-042-v2 | Normativo | `high` | Fonte primária |
| PROC-042-v1 | Normativo (obsoleto) | `medium` | Alertado como versão antiga |
| FAQ-Atendimento | Informal | `low` | Sinalizado como não validado por Compliance |

---

## System prompt

O `prompt_builder.py` implementa o **system prompt v2** com 6 regras invioláveis:

| Regra | Função |
|---|---|
| Regra 1 | Citar sempre a fonte no formato `[Fonte: DOC, seção X.X]` |
| Regra 2 | Usar apenas o que está textualmente nos chunks — sem completar com conhecimento externo |
| Regra 3 | Nunca inventar valores, prazos ou multiplicadores |
| Regra 4 | Sinalizar quando não há cobertura nos chunks disponíveis |
| Regra 5 | Alertar sobre contradições e versões múltiplas do mesmo documento |
| Regra 6 | Sempre alertar sobre SLAs diferenciados para incidentes críticos |

A ordem do prompt por query é: `system estático → dados do cliente → chunks RAG → pergunta`. Os chunks ficam próximos da pergunta para maximizar a atenção do modelo sobre a informação relevante.

---

## Resultados da avaliação (5 perguntas)

| Pergunta | Chunk exato (top-3) | Doc correto (top-1) | Similaridade top-1 |
|---|:---:|:---:|:---:|
| Q1 — Prazo devolução carga perigosa | ✅ | ✅ | ~0.72 |
| Q2 — SLA cliente Gold | ✅ | ✅ | ~0.68 |
| Q3 — Frete 600kg para Manaus | ✅ | ✅ | ~0.74 |
| Q4 — Prazo devolução padrão | ✅ | ✅ | ~0.78 |
| Q5 — O que é incidente crítico | ✅ | ✅ | ~0.71 |
| **Total** | **5/5** | **5/5** | **~0.73** |

Análise detalhada, problemas identificados e propostas de correção em [cenario-1/RESULTADOS_AVALIACAO.md](cenario-1/RESULTADOS_AVALIACAO.md).

---

## Problemas identificados

**1. Versões obsoletas contaminam o retrieval**
PROC-042-v1 aparece entre os top-3 com score próximo à v2 (~0.69 vs ~0.74) porque o modelo de embedding não distingue versões semanticamente. Proposta: pós-processamento que descarta a versão mais antiga quando ambas aparecem, ou prefixo `[VERSÃO OBSOLETA]` no texto dos chunks da v1.

**2. SLA de incidentes críticos não emerge em perguntas genéricas**
A seção de incidentes críticos fica fora do top-3 para perguntas do tipo "qual o SLA do cliente Gold?". A Regra 6 do system prompt atua como safety net, mas não substitui ter o chunk correto. Proposta: busca híbrida que força recuperação de ao menos 1 chunk da seção de incidentes críticos sempre que a query envolver SLA.
