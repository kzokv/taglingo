import { createClerkClient } from "@clerk/backend";

import type { D1Database } from "../../src/fx/cloudflareInfrastructure";
import { createClerkSessionAuthenticator } from "../../src/member/clerkSession";
import {
  createD1MemberPreferenceStore,
  createD1MembershipStore
} from "../../src/member/cloudflareMemberInfrastructure";
import { createMemberPreferencesHandler } from "../../src/member/memberPreferencesApi";

interface Environment {
  DB: D1Database;
  CLERK_AUTHORIZED_PARTIES: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

function authorizedParties(value: string): string[] {
  const parties = value
    .split(",")
    .map((party) => party.trim())
    .filter(Boolean);
  if (parties.length === 0) {
    throw new Error("CLERK_AUTHORIZED_PARTIES must not be empty.");
  }
  return parties;
}

function handlerFor(env: Environment) {
  const clerk = createClerkClient({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY
  });
  return createMemberPreferencesHandler({
    authenticate: createClerkSessionAuthenticator(
      {
        authenticateRequest: (request, options) =>
          clerk.authenticateRequest(request, options)
      },
      {
        publishableKey: env.CLERK_PUBLISHABLE_KEY,
        authorizedParties: authorizedParties(
          env.CLERK_AUTHORIZED_PARTIES
        )
      }
    ),
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
