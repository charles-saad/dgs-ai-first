# Plano Explicativo — Cenário 3 (Desenvolvedor)

## O que este plano cobre

Este plano organiza a execução dos **2 exercícios do papel Desenvolvedor** no Cenário-Âncora 3
(Fase de Governança e Validação): **3.1 — Structured output e verificações determinísticas**
e **3.2 — Revisão crítica de código gerado por IA**.

## Como interpreto a tarefa

O cenário descreve um fluxo de trabalho específico: usar o **GitHub Copilot** para gerar
código e usar o **Claude** para revisar criticamente o que foi gerado. Como esta conversa
acontece inteiramente comigo (Claude), eu não tenho acesso ao GitHub Copilot real nem ao seu
ambiente local (`C:\Users\...\novatech-assistant`). Por isso, decidi o seguinte, de forma
transparente:

- **No exercício 3.1**, eu simulo o papel do Copilot gerando uma primeira versão plausível
  (com os defeitos típicos que o exercício pede para você caçar) e depois faço a revisão
  crítica de fato — apontando os problemas e corrigindo. O entregável final mostra as duas
  versões e a justificativa da mudança, exatamente como pedido nos critérios de avaliação.
- **No exercício 3.2**, o código "gerado pelo Copilot" já foi fornecido pelo enunciado
  (está no Anexo do cenário). O que eu **não posso fazer por você** é a parte que mais peso
  tem na nota (D4 — Pensamento Crítico): a regra de corte do exercício é explícita —
  *"Exercício 'humano primeiro' sem análise própria (ou idêntica ao output da IA) → D4 ≤ 1"*.
  Eu vou entregar uma análise própria estruturada como ponto de partida, mas **recomendo
  fortemente que você a leia, refaça com suas palavras e só then valide com o Claude** antes
  de submeter — caso contrário, um avaliador (humano ou IA) pode identificar que a "análise
  própria" é idêntica à revisão posterior e isso zera essa dimensão.

## Estrutura do entregável

```
novatech-assistant/
├── plano-explicativo-cenario3-dev.md   (este arquivo)
├── Specification.md                     (spec dos 2 exercícios)
├── src/
│   ├── services/
│   │   ├── schemas/
│   │   │   └── assistant-response.schema.ts
│   │   └── response-validator.ts
│   ├── functions/
│   │   └── feedback/
│   │       └── handler.ts               (versão corrigida, pós-revisão)
│   └── shared/
│       └── logger.ts
├── docs/
│   ├── revisao-codigo-3.1.md            (code review do response-validator)
│   └── revisao-critica-3.2.md           (análise própria + Claude + comparação)
└── avaliacao-final-3.1-3.2.md           (autoavaliação contra avaliacao-desenvolvedor.md)
```

## Sequência de execução

1. **3.1 — Schema Zod** (`assistant-response.schema.ts`): campos obrigatórios
   `answer`, `source_document`, `confidence_score`.
2. **3.1 — response-validator.ts**: valida o schema e aplica os 2 guardrails do enunciado
   (source_document obrigatório; carga perigosa + devolução sem negativa = bloqueio).
   Falhas retornam uma resposta padrão segura e **bloqueiam de fato** (não apenas logam —
   essa é uma regra de corte explícita do framework de avaliação).
3. **3.1 — Code review**: gero uma primeira versão "ingênua", listo os defeitos reais
   (campos extras aceitos pelo schema, regex frágil, etc.) e entrego a versão corrigida.
4. **3.2 — Revisão crítica do feedback handler**: análise própria → revisão Claude →
   comparação honesta → reescrita seguindo o AGENTS.md (Zod, pino, import estático,
   sem logar e-mail do atendente).
5. **Autoavaliação**: aplico a skill `avaliacao-desenvolvedor.md` + `avaliacao-foundation.md`
   ao que foi produzido, com scores por dimensão e classificação final.

## O que fica fora de escopo (por design do exercício reduzido)

Conforme a nota de calibração da skill do papel: não implemento lookup table de valores
numéricos, não cubro mais que os 2 guardrails pedidos, e não construo o loop completo de
HITL (apenas o ponto de bloqueio determinístico que o exercício pede).
