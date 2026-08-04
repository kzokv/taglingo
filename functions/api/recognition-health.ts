import type { D1Database } from "../../src/fx/cloudflareInfrastructure";
import {
  createCloudflareClerkAuthenticator,
  type ClerkFunctionEnvironment
} from "../../src/member/cloudflareClerk";
import { createD1MembershipStore } from "../../src/member/cloudflareMemberInfrastructure";
import { createD1RecognitionHealthAggregateStore } from "../../src/recognitionHealth/cloudflareRecognitionHealth";
import { createRecognitionHealthHandler } from "../../src/recognitionHealth/recognitionHealthApi";

interface Environment extends ClerkFunctionEnvironment {
  DB: D1Database;
  RECOGNITION_HEALTH_INGESTION_ENABLED?: string;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

function handlerFor(env: Environment) {
  const memberships = createD1MembershipStore(env.DB);
  const identifyOperator = async (request: Request): Promise<string | null> => {
    const authentication = await createCloudflareClerkAuthenticator(env)(
      request
    );
    if (authentication.kind !== "authenticated") return null;
    const membership = await memberships.find(authentication.userId);
    return membership?.status === "active" &&
      membership.role === "administrator"
      ? authentication.userId
      : null;
  };
  const store = createD1RecognitionHealthAggregateStore(env.DB);
  return createRecognitionHealthHandler({
    aggregates: store,
    governance: store,
    identifyOperator,
    authorizeMaintenance: async (request) =>
      (await identifyOperator(request)) !== null,
    ingestionEnabled: () =>
      env.RECOGNITION_HEALTH_INGESTION_ENABLED !== "false"
  });
}

export async function onRequest({
  request,
  env
}: PagesContext): Promise<Response> {
  try {
    return await handlerFor(env)(request);
  } catch {
    // Deliberately omit request data and error details from application logs.
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store" }
    });
  }
}
