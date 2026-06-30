# Specification.md — Cenário 3 / Papel Desenvolvedor

## Contexto

O assistente de IA da NovaTech apresenta 12% de respostas incorretas em testes internos.
Duas causas raiz endereçadas nesta especificação:

1. Respostas em texto livre não garantem a presença de campos obrigatórios (ex: fonte).
2. Não há verificação determinística que impeça o assistente de afirmar que devolução de
   carga perigosa é possível (contradizendo a POL-001, seção 3.2).

Em paralelo, um módulo de feedback gerado por IA (Copilot) viola regras do `AGENTS.md`
do projeto (ausência de validação Zod, logging incorreto, import dinâmico, dado pessoal
logado) e precisa de revisão antes do merge.

---

## Exercício 3.1 — Structured Output + Verificações Determinísticas

### Requisitos

| ID | Requisito | Fonte |
|----|-----------|-------|
| R1 | Toda resposta do assistente deve ser validada contra um schema Zod com campos `answer` (string), `source_document` (string), `confidence_score` (number 0–1) | Cenário 3, conceito de structured output |
| R2 | Resposta sem `source_document` preenchido deve ser **rejeitada** e substituída por uma mensagem padrão segura | Guardrail 1 (cenário 3) |
| R3 | Resposta que menciona "carga perigosa" e "devolução" no mesmo texto, sem conter uma negativa explícita, deve ser **bloqueada** | Guardrail 2 (cenário 3) + POL-001 seção 3.2 |
| R4 | Falhas de validação devem ser logadas com o motivo, para auditoria | Boa prática de harness |
| R5 | O schema deve rejeitar campos não previstos (`.strict()`), para não permitir que o modelo injete dados não controlados na resposta | Identificado na code review |

### Fora de escopo (explícito)
- Lookup table de valores numéricos (multiplicadores de frete, SLAs).
- Guardrails adicionais além dos 2 pedidos.
- Loop de HITL completo (apenas o ponto de bloqueio determinístico).

### Design

```
Resposta crua do LLM (json)
        │
        ▼
[1] Validação de schema (Zod, .strict())  ──falha──▶ rejeita: "schema_validation_failed"
        │ sucesso
        ▼
[2] Guardrail 1: source_document não vazio ──falha──▶ rejeita: "missing_source_document"
        │ sucesso
        ▼
[3] Guardrail 2: "carga perigosa" + "devolução"
    sem negativa explícita                  ──falha──▶ rejeita: "dangerous_cargo_return_without_negation"
        │ sucesso
        ▼
   Resposta aprovada, segue para o usuário
```

Critério de design importante: os 3 passos são **determinísticos** (código, não prompt).
O prompt continua responsável por gerar uma resposta de boa qualidade (parte probabilística);
o código garante que, **mesmo se o modelo falhar**, a resposta nunca passa adiante sem
validação. Essa é a distinção central pedida no critério "Probabilístico vs determinístico".

### Critérios de aceite
- Schema rejeita objetos com campos extras.
- Guardrail 1 bloqueia de fato (retorna fallback), não apenas loga.
- Guardrail 2 cobre variações de plural/flexão verbal ("carga perigosa" / "cargas perigosas",
  "devolução" / "devolver" / "devolvida"), não apenas a forma literal.
- Toda rejeição é logada com motivo categorizado.

---

## Exercício 3.2 — Revisão Crítica do Módulo de Feedback

### Requisitos

| ID | Requisito | Fonte |
|----|-----------|-------|
| R6 | Input da requisição HTTP deve ser validado com Zod antes de qualquer uso | AGENTS.md |
| R7 | Logging deve usar `pino`, nunca `console.log` | AGENTS.md |
| R8 | Imports devem ser estáticos no topo do arquivo, nunca `require` dinâmico | AGENTS.md |
| R9 | Dados pessoais (e-mail, nome) nunca devem ser logados | AGENTS.md |
| R10 | Falhas de persistência (Cosmos DB) devem ser tratadas, não propagadas sem controle | Boa prática (identificado na revisão) |

### Critérios de aceite
- Código reescrito passa por todas as violações listadas no enunciado (armadilhas obrigatórias):
  `as any` sem Zod, `console.log`, `require` dinâmico, `attendantEmail` logado.
- Existe registro da análise própria, da revisão do Claude, e de uma comparação honesta
  entre as duas (não "concordamos em tudo" genérico).

---

## Rastreabilidade com cenários anteriores

- **Cenário 1 (RAG):** o Guardrail 2 (3.1) opera sobre o mesmo domínio de regra coberto pela
  POL-001 seção 3.2, já usada como fonte de verdade nos exercícios de retrieval do cenário 1.
- **Cenário 2 (AGENTS.md / guardrails):** os requisitos R6–R9 do exercício 3.2 vêm diretamente
  do `AGENTS.md` produzido pelo time no cenário 2; este exercício é a primeira aplicação real
  dessas regras a um código gerado por IA.
