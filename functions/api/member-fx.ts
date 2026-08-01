import {
  createD1MemberRateLimiter,
  createD1RateRecordStore,
  type D1Database
} from "../../src/fx/cloudflareInfrastructure";
import { createGuestFxHandler } from "../../src/fx/guestFxGateway";
import { createMemberFxHandler } from "../../src/fx/memberFxGateway";
import {
  createCloudflareClerkAuthenticator,
  type ClerkFunctionEnvironment
} from "../../src/member/cloudflareClerk";
import {
  createD1MemberPreferenceStore,
  createD1MembershipStore
} from "../../src/member/cloudflareMemberInfrastructure";

interface Environment extends ClerkFunctionEnvironment {
  DB: D1Database;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

function buildHandler(env: Environment) {
  const consumeMemberLimit = createD1MemberRateLimiter(env.DB);
  const loadValidatedRate = createGuestFxHandler({
    store: createD1RateRecordStore(env.DB),
    providerFetch: fetch,
    consumeGuestLimit: consumeMemberLimit,
    resolveGuestActor: async (request) => {
      const userId = request.headers.get("x-taglingo-member-id");
      if (!userId) {
        throw new Error("The internal Approved Member identity is missing.");
      }
      return { key: userId };
    },
    rateLimitLabel: "Approved Member"
  });
  const preferences = createD1MemberPreferenceStore(env.DB);
  return createMemberFxHandler({
    authenticate: createCloudflareClerkAuthenticator(env),
    memberships: createD1MembershipStore(env.DB),
    preferences,
    loadReferenceRate: (source, target, userId, ipAddress) =>
      loadValidatedRate(
        new Request(
          `https://taglingo.internal/api/fx?${new URLSearchParams({
            source,
            target
          })}`,
          {
            headers: {
              "cf-connecting-ip": ipAddress,
              "x-taglingo-member-id": userId
            }
          }
        )
      )
  });
}

let configured:
  | {
      database: D1Database;
      secret: string;
      publishableKey: string;
      authorizedParties: string;
      handle: (request: Request) => Promise<Response>;
    }
  | undefined;

function handlerFor(env: Environment) {
  if (
    !configured ||
    configured.database !== env.DB ||
    configured.secret !== env.CLERK_SECRET_KEY ||
    configured.publishableKey !== env.CLERK_PUBLISHABLE_KEY ||
    configured.authorizedParties !== env.CLERK_AUTHORIZED_PARTIES
  ) {
    configured = {
      database: env.DB,
      secret: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      authorizedParties: env.CLERK_AUTHORIZED_PARTIES,
      handle: buildHandler(env)
    };
  }
  return configured.handle;
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
          message: "Approved Member Reference Rates are temporarily unavailable."
        }
      },
      {
        status: 503,
        headers: { "cache-control": "private, no-store" }
      }
    );
  }
}
