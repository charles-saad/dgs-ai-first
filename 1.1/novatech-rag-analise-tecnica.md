# Análise Técnica de Viabilidade — Assistente RAG NovaTech

**Projeto:** Assistente de IA para Atendimento ao Cliente  
**Cliente:** NovaTech Logística  
**Elaborado por:** DB1 — Charles Saad
**Data:** Maio 2026

---

## 1. Desafios por Tipo de Fonte e Estratégias de Tratamento

### 1.1 PDFs com Tabelas Complexas (ex.: tabelas de frete com 15+ colunas)

**Desafio no pipeline de RAG**

Parsers de PDF padrão (PyMuPDF, pdfplumber) extraem texto de tabelas de forma linearizada — ou seja, leem célula por célula na ordem do fluxo de texto, destruindo a relação entre cabeçalhos e valores. Uma tabela de frete com 15 colunas pode produzir chunks como `"SP RJ MG ... 1.20 3.40 2.80"` completamente descontextualizados. O chunking genérico por tamanho vai partir a tabela ao meio, separando colunas de seus valores.

**Impacto na qualidade das respostas**

O LLM receberá fragmentos numéricos sem rótulo de coluna, levando a respostas imprecisas ou fabricadas em perguntas como "Qual o frete de SP para RJ para cargas acima de 500kg?". Este é um dos cenários de maior risco de alucinação.

**Estratégia de tratamento**

- Usar **extração estruturada de tabelas** via `pdfplumber` ou `camelot`, que preservam a estrutura linha × coluna.
- Serializar cada tabela em formato **Markdown ou JSON** antes de indexar, mantendo cabeçalhos embutidos em cada célula serializada: `"Origem: SP | Destino: RJ | Faixa de Peso: 500-1000kg | Valor: R$ 3,40/kg"`.
- Tratar cada tabela como uma **unidade atômica de chunk** — não dividi-la, mesmo que exceda o tamanho-alvo do chunk.
- Enriquecer o chunk com metadados: nome do documento, número da página, data de vigência.

---

### 1.2 PDFs Escaneados (OCR necessário)

**Desafio no pipeline de RAG**

Documentos escaneados são imagens — sem OCR, são completamente invisíveis ao pipeline de RAG. O OCR introduz erros de reconhecimento (especialmente em documentos de baixa qualidade, fontes não-padrão ou tabelas), produzindo texto com caracteres incorretos, palavras fundidas ou quebras de linha arbitrárias. A confiança do OCR varia por página e não é capturada automaticamente.

**Impacto na qualidade das respostas**

Erros de OCR corrompem a semântica do texto e prejudicam tanto a etapa de embedding (similaridade vetorial degradada) quanto a geração (o LLM tenta "reparar" o texto, podendo introduzir informações incorretas).

**Estratégia de tratamento**

- Usar **Azure AI Document Intelligence** (antes Form Recognizer) para OCR, que é superior ao Tesseract em documentos corporativos e já está disponível via Azure AI Services da NovaTech.
- Implementar **pipeline de qualidade pós-OCR**: detecção de confiança por bloco, flagging de páginas com score < 80% para revisão humana.
- Adicionar metadado `"ocr_quality": "low|medium|high"` ao chunk; no retrieval, penalizar chunks de baixa qualidade no ranking.
- Estabelecer processo de curadoria: os ~800 PDFs devem ser triados para identificar quais são escaneados e priorizá-los para validação manual.

---

### 1.3 Wiki Confluence com Links Internos e Macros Customizadas

**Desafio no pipeline de RAG**

A Confluence exporta páginas em HTML com macros renderizadas como elementos DOM proprietários (ex.: `<ac:structured-macro ac:name="info">`). Um parser HTML genérico ignora ou corrompe o conteúdo dessas macros. Links internos entre páginas (`[Ver também: Política de Devolução]`) criam dependências de contexto que o chunking por página não captura — uma página pode ser compreensível apenas em conjunto com as páginas que referencia.

**Impacto na qualidade das respostas**

Procedimentos fragmentados em múltiplas páginas interligadas serão indexados como chunks isolados. O assistente pode responder com a etapa 1 de um processo sem saber que a etapa 2 está em outra página, gerando respostas incompletas.

**Estratégia de tratamento**

- Usar a **API REST do Confluence** para exportação (não exportação manual), que permite extrair conteúdo estruturado com resolução de macros.
- Implementar **graph de dependências**: rastrear links internos e, no momento da indexação, incluir um resumo da página referenciada como contexto embutido no chunk (`"contexto relacionado: [resumo da página X]"`).
- Considerar **parent-child chunking**: indexar a página completa como um "parent chunk" e seus parágrafos como "child chunks", usando o parent para enriquecer o contexto no retrieval.
- Remover ou normalizar macros customizadas no pré-processamento, convertendo seu conteúdo para texto plano.

---

### 1.4 Planilhas com Fórmulas Interdependentes

**Desafio no pipeline de RAG**

Planilhas Excel são documentos computacionais, não documentos de texto. As células de interesse (resultados de cálculo) dependem de fórmulas que referenciam outras células, outras abas e às vezes outros arquivos. Exportar a planilha como texto captura apenas os valores estáticos do último salvamento — se a planilha for atualizada mensalmente com novos valores, o índice RAG ficará desatualizado no intervalo entre atualizações.

**Impacto na qualidade das respostas**

Um atendente que pergunta "Qual o prazo de SLA para cliente Tier 1 em São Paulo?" pode receber o valor do mês anterior se a indexação não for disparada após cada atualização mensal. Pior: planilhas com fórmulas circulares ou condicionais complexas podem produzir valores incorretos quando exportadas sem contexto de execução.

**Estratégia de tratamento**

- Usar **openpyxl** ou **pandas** para ler os valores calculados (não as fórmulas) diretamente das células, garantindo que os dados indexados reflitam os resultados reais.
- Para cada planilha, gerar uma **representação textual normalizada por dimensão de negócio**: em vez de indexar a planilha inteira, extrair tabelas semânticas (`"SLA por cliente e região"`, `"Tabela de frete por faixa de peso"`).
- Implementar **trigger de re-indexação automática**: integrar ao SharePoint via Microsoft Graph API para detectar modificações nos arquivos e disparar re-indexação imediata.
- Documentar as dependências entre planilhas e criar um grafo de atualização para garantir que planilhas derivadas sejam re-indexadas quando suas fontes mudam.

---

## 2. Estimativa do Tamanho da Base em Tokens

### Premissas

| Fonte | Quantidade | Volume estimado |
|---|---|---|
| PDFs SharePoint | 800 documentos × 10 páginas | 8.000 páginas |
| Wiki Confluence | 400 páginas | — |
| Planilhas | 50 arquivos | — |

**Regra de conversão:** 1 página ≈ 500 palavras (média conservadora para documentos técnicos); 1 token ≈ 0,75 palavras → 1 token ≈ 0,75 palavras, ou seja, **1 palavra ≈ 1,33 tokens**.

### Cálculo

**PDFs:**
- 8.000 páginas × 500 palavras/página = 4.000.000 palavras
- 4.000.000 × 1,33 = **~5,3 milhões de tokens**

**Wiki Confluence:**
- 400 páginas × 1.500 palavras/página = 600.000 palavras
- 600.000 × 1,33 = **~800.000 tokens**

**Planilhas:**
- Estimativa conservadora: 50 planilhas × ~2.000 palavras equivalentes (dados tabulares serializados) = 100.000 palavras
- 100.000 × 1,33 = **~133.000 tokens**

### Total Estimado

| Fonte | Tokens estimados |
|---|---|
| PDFs SharePoint | ~5.300.000 |
| Wiki Confluence | ~800.000 |
| Planilhas | ~133.000 |
| **Total** | **~6.233.000 tokens** |

> **Nota:** ~6,2 milhões de tokens é equivalente a ~49 MB de texto puro. Este volume é adequado para uma solução RAG com banco vetorial (ex.: Azure AI Search ou Qdrant), sendo completamente inviável para abordagem de contexto longo integral (teria que passar 6M tokens por query — ~US$ 18 por pergunta com GPT-4o).

---

## 3. Estimativa de Latência P50/P95

### Componentes do Pipeline por Query

```
[Usuário digita pergunta]
       ↓
[1] Embedding da query           ~100–200ms   (Azure OpenAI text-embedding-3-small)
       ↓
[2] Busca vetorial (top-K)       ~50–150ms    (Azure AI Search, índice otimizado)
       ↓
[3] Re-ranking (opcional)        ~200–500ms   (cross-encoder ou Cohere Rerank)
       ↓
[4] Montagem do prompt           ~20–50ms     (CPU local)
       ↓
[5] Inferência LLM (GPT-4o)     ~1.500–4.000ms (depende do tamanho da resposta)
       ↓
[6] Pós-processamento + citação  ~50–100ms
       ↓
[Resposta entregue ao usuário]
```

### Estimativas de Latência

| Etapa | P50 | P95 |
|---|---|---|
| Embedding da query | 120ms | 250ms |
| Busca vetorial | 80ms | 180ms |
| Re-ranking (se habilitado) | 300ms | 600ms |
| Inferência GPT-4o | 2.000ms | 4.500ms |
| Overhead (rede, montagem) | 100ms | 200ms |
| **Total sem re-ranking** | **~2.300ms** | **~5.000ms** |
| **Total com re-ranking** | **~2.600ms** | **~5.700ms** |

### Comparação com a Meta do Projeto

A meta é reduzir de 12 minutos para menos de 2 minutos de busca por chamado. O pipeline proposto entrega respostas em **2–6 segundos**, o que é **20–600x mais rápido que a meta declarada**. A meta de 2 minutos inclui o tempo de leitura e validação da resposta pelo atendente, não apenas a geração — o que torna o objetivo alcançável com ampla margem.

> **Risco de latência:** O P95 de ~5-6 segundos pode ser percebido como lento em picos de carga. Recomendar **streaming da resposta** (token-by-token via SSE) para que o atendente veja a resposta sendo construída em tempo real, eliminando a percepção de espera.

---

## 4. Análise de Orçamento de Contexto

### Parâmetros

| Item | Tokens |
|---|---|
| Janela total do GPT-4o | 128.000 |
| System prompt + instruções | ~2.000 |
| Histórico de conversa (3 turnos) | ~1.500 |
| Resposta gerada (output reserve) | ~1.000 |
| **Disponível para chunks (contexto RAG)** | **~123.500 tokens** |

### Capacidade de Chunks

Com chunks de **500 tokens** cada:
- **123.500 ÷ 500 = ~247 chunks por query**

Na prática, 247 chunks é excessivo — o fenômeno **"lost in the middle"** demonstra que LLMs tendem a prestar atenção prioritária ao início e ao fim do contexto, com degradação significativa para informações posicionadas no meio de contextos longos. Estudos mostram queda de acurácia de até 20% para informações no meio de contextos > 20K tokens.

### Recomendação de Orçamento de Contexto

| Configuração | Chunks | Tokens RAG | Observação |
|---|---|---|---|
| Conservadora (alta precisão) | 5–8 | 2.500–4.000 | Ideal para perguntas simples e diretas |
| Balanceada (uso geral) | 10–15 | 5.000–7.500 | Boa cobertura sem degradação significativa |
| Agressiva (perguntas complexas) | 20–25 | 10.000–12.500 | Risco de "lost in the middle" aumenta |

**Recomendação:** usar **10–12 chunks** como padrão, com mecanismo de **compressão contextual** (summarization dos chunks menos relevantes) antes de incluí-los no prompt, mantendo os 3–5 mais relevantes em texto completo e os demais como resumos.

---

## 5. Estratégia de Chunking e Retrieval

### 5.1 Estratégia de Chunking Recomendada: Híbrida por Tipo de Conteúdo

O tipo de pergunta que os atendentes farão define a granularidade ideal do chunk:

| Tipo de pergunta | Exemplo | Granularidade ideal |
|---|---|---|
| Lookup de valor | "Qual o frete SP→RJ para 500kg?" | Chunk atômico = 1 tabela completa |
| Procedimento | "Como abrir uma reclamação de avaria?" | Chunk = seção de procedimento (300–600 tokens) |
| Política | "Qual o prazo de devolução para cliente Tier 2?" | Chunk = parágrafo de política + contexto |
| Comparação | "Qual a diferença entre SLA A e SLA B?" | Multi-chunk retrieval |

**Estratégia híbrida:**

1. **Chunking semântico por seção** (não por tamanho fixo): usar cabeçalhos e separadores naturais do documento para delimitar chunks. Uma seção de procedimento com 800 tokens é melhor que dois chunks de 400 tokens sem coerência semântica.

2. **Chunks atômicos para tabelas**: cada tabela = 1 chunk, independente do tamanho, com serialização estruturada.

3. **Chunk overlap de 10–15%**: para perguntas que envolvem transições entre seções, um overlap de ~50 tokens garante continuidade semântica.

4. **Metadados ricos**: cada chunk deve carregar `{fonte, seção, data_vigência, área_responsável, tipo_conteúdo}` para filtros no retrieval.

### 5.2 Estratégia de Retrieval Alternativa: RAG Híbrido com Re-ranking

O retrieval puramente vetorial (dense retrieval) falha em perguntas com termos muito específicos (códigos, siglas, nomes de contratos). A estratégia recomendada é **RAG Híbrido**:

```
Query do usuário
      ↓
┌─────────────────────┐    ┌─────────────────────┐
│  Dense Retrieval    │    │  Sparse Retrieval    │
│  (embeddings)       │    │  (BM25/keyword)      │
│  Top-20 chunks      │    │  Top-20 chunks       │
└─────────────────────┘    └─────────────────────┘
              ↓                        ↓
         ┌────────────────────────────────┐
         │   Reciprocal Rank Fusion (RRF) │
         │   Combina os dois rankings     │
         └────────────────────────────────┘
                        ↓
              ┌──────────────────┐
              │  Cross-encoder   │
              │  Re-ranking      │
              │  Top-10 → Top-5  │
              └──────────────────┘
                        ↓
              Prompt montado com Top-5
```

**Justificativa para o contexto NovaTech:**
- Atendentes usarão termos técnicos exatos ("Tabela de Frete Regional 2025", "SLA Tier 1") que BM25 localiza melhor que embeddings.
- Embeddings capturam intenção semântica para perguntas em linguagem natural.
- O re-ranking com cross-encoder (ex.: `ms-marco-MiniLM-L-6-v2`) elimina falsos positivos antes de enviar ao LLM.
- Azure AI Search suporta natiamente busca híbrida + RRF, simplificando a implementação.

### 5.3 Mitigação do "Lost in the Middle"

- Posicionar os chunks **mais relevantes no início e no final** do contexto RAG, com chunks de suporte no meio.
- Implementar **citação obrigatória**: instruir o LLM a citar a fonte de cada afirmação, o que força atenção aos chunks específicos e permite auditoria.
- Para perguntas sobre tabelas complexas, considerar um **pipeline de dois estágios**: primeiro identificar qual tabela é relevante, depois fazer uma query focada nessa tabela com o chunk completo no topo do contexto.

---

## 6. Síntese Arquitetural

```
SharePoint + Confluence + Rede    →   Connectors (Graph API + Confluence API)
          ↓
    Document Processing
    - OCR (Azure AI Document Intelligence)
    - Table Extraction (camelot/pdfplumber)
    - Macro Resolution (Confluence API)
    - Spreadsheet Normalization (pandas)
          ↓
    Chunking Híbrido por Tipo
          ↓
    Embedding (text-embedding-3-small)
          ↓
    Azure AI Search (índice vetorial + BM25)
          ↓
Query → Hybrid Retrieval → Re-ranking → GPT-4o → Resposta com Citação
          ↓
    Integração Microsoft Teams (Bot Framework)
```

---

## 7. Conclusão

O assistente é tecnicamente viável dentro do prazo de 3 meses, considerando que:

- A meta de latência (< 2 minutos) é amplamente superável (respostas em 2–6 segundos).
- O volume da base (~6,2M tokens) é compatível com RAG escalável em Azure AI Search.
- Os maiores riscos técnicos estão na **qualidade do pipeline de ingestão** (OCR, tabelas, macros), não na geração de respostas.
- A contradição entre versões de documentos é o risco de negócio mais crítico e requer um processo de governança antes do go-live.

O sucesso do projeto depende tanto da qualidade do pipeline de RAG quanto da resolução do problema de **governança documental** — sem um processo claro de versão canônica, o assistente poderá reproduzir as inconsistências que hoje geram frustração nos atendentes.
