import type { D1Database } from "../../src/fx/cloudflareInfrastructure";
import { createD1RecognitionHealthAggregateStore } from "../../src/recognitionHealth/cloudflareRecognitionHealth";
import { createRecognitionHealthHandler } from "../../src/recognitionHealth/recognitionHealthApi";

interface Environment {
  DB: D1Database;
  RECOGNITION_HEALTH_INGESTION_ENABLED?: string;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

export async function onRequest({
  request,
  env
}: PagesContext): Promise<Response> {
  try {
    return await createRecognitionHealthHandler({
      aggregates: createD1RecognitionHealthAggregateStore(env.DB),
      ingestionEnabled: () =>
        env.RECOGNITION_HEALTH_INGESTION_ENABLED !== "false"
    })(request);
  } catch {
    // Deliberately omit request data and error details from application logs.
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store" }
    });
  }
}
