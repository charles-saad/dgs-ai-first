import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { CosmosClient } from "@azure/cosmos";
import { z } from "zod";
import { logger } from "../../shared/logger";

/**
 * Validação de input — substitui o "as any" da versão original.
 * Nenhum campo do corpo da requisição é confiado sem passar por aqui.
 */
const FeedbackInputSchema = z.object({
  queryId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  attendantEmail: z.string().email(),
});

/**
 * Cliente Cosmos instanciado uma única vez, no nível do módulo — evita
 * recriar a conexão a cada requisição (problema de performance da versão
 * original, que instanciava o client dentro do handler).
 */
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING ?? "");
const database = cosmosClient.database("novatech");
const feedbackContainer = database.container("feedbacks");

export async function feedbackHandler(request: HttpRequest): Promise<HttpResponseInit> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch (error) {
    logger.warn({ error }, "Corpo da requisição de feedback não é um JSON válido");
    return { status: 400, jsonBody: { error: "invalid_json" } };
  }

  const parsed = FeedbackInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "Validação de feedback falhou");
    return { status: 400, jsonBody: { error: "validation_failed", issues: parsed.error.issues } };
  }

  const { queryId, rating, comment, attendantEmail } = parsed.data;

  const feedback = {
    queryId,
    rating,
    comment,
    attendantEmail, // armazenado no Cosmos, mas NUNCA logado
    timestamp: new Date().toISOString(),
  };

  // Log estruturado via pino, sem dado pessoal (attendantEmail fica de fora do log).
  logger.info({ queryId, rating }, "Feedback recebido");

  try {
    await feedbackContainer.items.create(feedback);
  } catch (error) {
    // A versão original não tratava erro de persistência — uma falha no
    // Cosmos derrubaria a função sem resposta clara para o chamador.
    logger.error({ error, queryId }, "Falha ao persistir feedback no Cosmos DB");
    return { status: 500, jsonBody: { error: "persistence_failed" } };
  }

  return { status: 200, jsonBody: { status: "ok" } };
}

app.http("feedback", {
  methods: ["POST"],
  handler: feedbackHandler,
});
