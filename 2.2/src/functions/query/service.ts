import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { getEnv, isAzureConfigured } from '../../shared/config';
import { Logger } from '../../shared/logger';

export interface SearchResult {
  source_document: string;
  snippet: string;
  score: number;
}

export interface QueryDependencies {
  search: (question: string, limit: number) => Promise<SearchResult[]>;
  completion: (prompt: string, citations: SearchResult[]) => Promise<string>;
  logger: Logger;
}

const SYSTEM_PROMPT_PATH = path.resolve(process.cwd(), 'prompts', 'system-prompt.md');
const SYSTEM_PROMPT_BUDGET_CHARS = 4000;
const CHUNK_CONTEXT_BUDGET_CHARS = 8000;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function loadSystemPrompt(): string {
  if (existsSync(SYSTEM_PROMPT_PATH)) {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim();
  }

  return 'Use apenas a documentação fornecida e cite a fonte mais relevante.';
}

function buildPrompt(question: string, citations: SearchResult[], systemPrompt: string): string {
  const systemSection = truncateText(systemPrompt, SYSTEM_PROMPT_BUDGET_CHARS);
  const contextSection = truncateText(
    citations.map((citation) => `- ${citation.source_document}: ${citation.snippet}`).join('\n'),
    CHUNK_CONTEXT_BUDGET_CHARS,
  );

  return [
    'System prompt:',
    systemSection,
    '',
    'Contexto relevante:',
    contextSection || 'Nenhum contexto relevante encontrado.',
    '',
    `Pergunta do usuário: ${question}`,
    '',
    'Responda com base apenas no contexto acima e cite a fonte mais relevante.',
  ].join('\n');
}

async function withRetry<T>(operationName: string, operation: () => Promise<T>, logger: Logger, maxAttempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = 100 * 2 ** (attempt - 1);
      logger.warn('query.execution.retry', {
        operation: operationName,
        attempt,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function searchLocalFiles(question: string, limit: number): SearchResult[] {
  const workspaceRoot = process.cwd();
  const candidates = [path.join(workspaceRoot, 'docs', 'novatech'), path.join(workspaceRoot, 'data', 'retrieval-corpus')];
  const results: SearchResult[] = [];
  const query = normalize(question);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    const entries = readdirSync(candidate, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const fullPath = path.join(candidate, entry.name);
      const text = readFileSync(fullPath, 'utf8');
      const normalized = normalize(text);
      if (!normalized.includes(query)) {
        continue;
      }
      results.push({
        source_document: path.relative(workspaceRoot, fullPath).replace(/\\/g, '/'),
        snippet: text.split(/\r?\n/).find((line: string) => line.trim().length > 0) ?? text.slice(0, 180),
        score: 0.9,
      });
      if (results.length >= limit) {
        break;
      }
    }
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

async function searchAzure(question: string, limit: number): Promise<SearchResult[]> {
  const endpoint = getEnv('AZURE_SEARCH_ENDPOINT');
  const index = getEnv('AZURE_SEARCH_INDEX');
  const apiKey = getEnv('AZURE_SEARCH_API_KEY');

  if (!endpoint || !index || !apiKey) {
    return searchLocalFiles(question, limit);
  }

  const response = await fetch(`${endpoint}/indexes/${index}/docs/search?api-version=2024-07-01`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({ search: question, top: limit }),
  });

  if (!response.ok) {
    return searchLocalFiles(question, limit);
  }

  const payload = await response.json();
  const hits = Array.isArray(payload.value) ? payload.value : [];
  return hits.slice(0, limit).map((hit: Record<string, unknown>, indexValue: number) => ({
    source_document: String(hit.source_document ?? hit.metadata_storage_name ?? `doc-${indexValue + 1}`),
    snippet: String(hit.snippet ?? hit.content ?? ''),
    score: Number(hit.score ?? 0.9),
  }));
}

async function completeAzure(prompt: string, citations: SearchResult[]): Promise<string> {
  const endpoint = getEnv('AZURE_OPENAI_ENDPOINT');
  const deployment = getEnv('AZURE_OPENAI_DEPLOYMENT');
  const apiKey = getEnv('AZURE_OPENAI_API_KEY');

  if (!endpoint || !deployment || !apiKey || !isAzureConfigured()) {
    return `Resposta baseada em ${citations.length > 0 ? citations[0].source_document : 'documentação interna'}: ${prompt}`;
  }

  const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'Responda de forma objetiva e cite a fonte quando possível.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    return `Resposta baseada em ${citations.length > 0 ? citations[0].source_document : 'documentação interna'}: ${prompt}`;
  }

  const payload = await response.json();
  return String(payload.choices?.[0]?.message?.content ?? 'Resposta indisponível no momento.');
}

export async function executeQuery(question: string, deps: Partial<QueryDependencies> = {}): Promise<{ answer: string; citations: SearchResult[] }> {
  const logger = deps.logger ?? { info: () => undefined, warn: () => undefined, error: () => undefined };
  const search = deps.search ?? searchAzure;
  const completion = deps.completion ?? completeAzure;
  const systemPrompt = loadSystemPrompt();

  logger.info('query.execution.started', { question, systemPromptPath: SYSTEM_PROMPT_PATH });
  const citations = await withRetry('search', () => search(question, 5), logger);
  const prompt = buildPrompt(question, citations, systemPrompt);
  const answer = await withRetry('completion', () => completion(prompt, citations), logger);
  logger.info('query.execution.completed', { citationsCount: citations.length, promptLength: prompt.length });
  return { answer, citations };
}
