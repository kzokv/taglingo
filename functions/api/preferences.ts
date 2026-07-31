import type { D1Database } from "../../src/fx/cloudflareInfrastructure";
import {
  createCloudflareClerkAuthenticator,
  type ClerkFunctionEnvironment
} from "../../src/member/cloudflareClerk";
import {
  createD1MemberPreferenceStore,
  createD1MembershipStore
} from "../../src/member/cloudflareMemberInfrastructure";
import { createMemberPreferencesHandler } from "../../src/member/memberPreferencesApi";

interface Environment extends ClerkFunctionEnvironment {
  DB: D1Database;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

function handlerFor(env: Environment) {
  return createMemberPreferencesHandler({
    authenticate: createCloudflareClerkAuthenticator(env),
    memberships: createD1MembershipStore(env.DB),
    preferences: createD1MemberPreferenceStore(env.DB)
  });
}

export async function onRequest({
  request,
  env
}: PagesContext): Promise<Response> {
  try {
    return await handlerFor(env)(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "service_unavailable",
          message: "Member preferences are temporarily unavailable."
        }
      },
      {
        status: 503,
        headers: { "cache-control": "private, no-store" }
      }
    );
  }
}
