# Skill: Error Handling

**Camada:** Foundation  
**Frase-ativação:** "Como tratar e retornar erros neste projeto"  
**Pré-requisito de:** todas as skills Domain e Artifact deste projeto  
**Depende de:** [`typescript-conventions.md`](./typescript-conventions.md)  
**Criado por:** Tech Lead  
**Última revisão:** 2026-06-12

---

## Contexto

Todo handler deste projeto devolve JSON em caso de erro. O contrato é simples e fixo: `{ "error": "<mensagem legível>" }`. Stack traces nunca são expostos — nem em dev, nem em prod. Erros são diferenciados por status code, não por campos adicionais no body.

O Copilot frequentemente gera: catch sem narrowing (`error: any`), retorno de `error.stack` no body, status 500 para erros de validação, e `throw` de strings em vez de `Error`. Cada seção abaixo endereça um desses casos.

---

## Contrato de resposta de erro

```typescript
// ✅ DO — body de erro sempre neste formato
{ "error": "Mensagem legível para o cliente." }

// ❌ DON'T — nunca expor internals
{ "error": error.stack }
{ "message": "Internal Server Error", "code": 500, "trace": "..." }
{ "success": false, "details": error }
```

| Status | Quando usar | Exemplo de mensagem |
|--------|-------------|---------------------|
| `400` | Input inválido (Zod, campo ausente, formato errado) | `"A pergunta não pode estar em branco."` |
| `405` | Método HTTP não permitido | `"Método não permitido."` |
| `500` | Erro interno (falha em API externa, exception não prevista) | `"Erro interno. Tente novamente."` |

> Mensagens de erro de validação do Zod devem usar `error.errors[0]?.message` — as mensagens já estão configuradas em pt-BR nos schemas.

---

## Regras obrigatórias

### 1. Catch sem `any` — narrowing obrigatório

```typescript
// ✅ DO
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('query.request.failed', { requestId, error: message });
  return {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Erro interno. Tente novamente.' }),
  };
}

// ❌ DON'T
} catch (error: any) {
  return { status: 500, body: JSON.stringify({ error: error.message }) };
}
```

> `catch (error: any)` é rejeitado pelo `strict: true`. A mensagem de `error.message` nunca vai para o body — pode conter detalhes de implementação ou segredos de config.

---

### 2. ZodError separado de erros internos

```typescript
// ✅ DO
import { ZodError } from 'zod';

} catch (error) {
  if (error instanceof ZodError) {
    logger.warn('query.request.invalid', { requestId, error: error.message });
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.errors[0]?.message ?? 'Input inválido.' }),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error('query.request.failed', { requestId, error: message });
  return {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Erro interno. Tente novamente.' }),
  };
}

// ❌ DON'T — tudo como 500
} catch (error) {
  return { status: 500, body: JSON.stringify({ error: 'Something went wrong' }) };
}
```

---

### 3. Nunca fazer `throw` de string — sempre `new Error(...)`

```typescript
// ✅ DO
if (!endpoint) {
  throw new Error('AZURE_SEARCH_ENDPOINT não configurado.');
}

// ❌ DON'T
throw 'endpoint not configured';
throw { code: 'MISSING_ENV', message: 'endpoint not configured' };
```

> `throw` de string faz o `catch (error)` receber um `string`, não um `Error`. O narrowing `error instanceof Error` retorna `false` e `String(error)` produz a string literal — aceitável mas perde o stack trace.

---

### 4. `header Content-Type: application/json` em todas as respostas de erro

```typescript
// ✅ DO
return {
  status: 400,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'A pergunta não pode estar em branco.' }),
};

// ❌ DON'T — sem Content-Type
return { status: 400, body: JSON.stringify({ error: '...' }) };
```

> Sem `Content-Type`, clientes que fazem parse automático de JSON (fetch, axios) podem falhar em respostas de erro mesmo com body JSON válido.

---

## Anti-padrões recorrentes do Copilot

| Anti-padrão | Por que falha aqui | Correção |
|-------------|-------------------|----------|
| `catch (error: any)` | Viola strict mode; desativa narrowing | `catch (error)` + `error instanceof Error` |
| `body: error.stack` | Expõe internals de implementação | `body: JSON.stringify({ error: 'Erro interno. Tente novamente.' })` |
| `status: 500` para `ZodError` | Confunde cliente — é erro de input, não de servidor | `status: 400` + mensagem do `error.errors[0]` |
| `throw 'mensagem'` | String em catch não é `instanceof Error` | `throw new Error('mensagem')` |
| Sem `Content-Type` em erro | Parse automático pode falhar no cliente | `headers: { 'Content-Type': 'application/json' }` |
| Mensagem de erro em inglês | NovaTech é pt-BR; atendentes veem erros na UI | Mensagens em português nos schemas Zod e nos retornos manuais |
