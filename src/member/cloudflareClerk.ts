import { createClerkClient } from "@clerk/backend";

import { createClerkSessionAuthenticator } from "./clerkSession";

export interface ClerkFunctionEnvironment {
  CLERK_AUTHORIZED_PARTIES: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
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

export function createCloudflareClerkAuthenticator(
  env: ClerkFunctionEnvironment
) {
  const clerk = createClerkClient({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY
  });
  return createClerkSessionAuthenticator(
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
  );
}
