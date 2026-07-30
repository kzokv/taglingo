import {
  createD1GuestRateLimiter,
  createD1RateRecordStore,
  createSignedGuestActorResolver,
  type D1Database
} from "../../src/fx/cloudflareInfrastructure";
import { createGuestFxHandler } from "../../src/fx/guestFxGateway";

interface Environment {
  DB: D1Database;
  GUEST_ACTOR_SECRET: string;
}

interface PagesContext {
  request: Request;
  env: Environment;
}

let configured:
  | {
      database: D1Database;
      secret: string;
      handle: (request: Request) => Promise<Response>;
    }
  | undefined;

function handlerFor(env: Environment) {
  if (
    !configured ||
    configured.database !== env.DB ||
    configured.secret !== env.GUEST_ACTOR_SECRET
  ) {
    configured = {
      database: env.DB,
      secret: env.GUEST_ACTOR_SECRET,
      handle: createGuestFxHandler({
        store: createD1RateRecordStore(env.DB),
        providerFetch: fetch,
        consumeGuestLimit: createD1GuestRateLimiter(env.DB),
        resolveGuestActor: createSignedGuestActorResolver(
          env.GUEST_ACTOR_SECRET
        )
      })
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
      { error: "The Reference Rate service is temporarily unavailable." },
      {
        status: 503,
        headers: {
          "cache-control": "private, no-store"
        }
      }
    );
  }
}
