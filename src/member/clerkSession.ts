import type { AuthenticationResult } from "./memberPreferencesApi";

interface ClerkRequestState {
  isAuthenticated: boolean;
  reason?: string | null;
  toAuth(): {
    userId?: string | null;
    sessionId?: string | null;
  } | null;
}

interface ClerkAuthenticationClient {
  authenticateRequest(
    request: Request,
    options: {
      acceptsToken: "session_token";
      authorizedParties: string[];
      publishableKey: string;
    }
  ): Promise<ClerkRequestState>;
}

interface ClerkSessionOptions {
  publishableKey: string;
  authorizedParties: string[];
}

const missingSessionReasons = new Set([
  "client-uat-but-no-session-token",
  "dev-browser-missing",
  "session-token-and-uat-missing",
  "session-token-missing"
]);

export function createClerkSessionAuthenticator(
  clerk: ClerkAuthenticationClient,
  options: ClerkSessionOptions
) {
  return async (request: Request): Promise<AuthenticationResult> => {
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: options.authorizedParties,
      publishableKey: options.publishableKey
    });
    if (!state.isAuthenticated) {
      return {
        kind: missingSessionReasons.has(state.reason ?? "")
          ? "unauthenticated"
          : "invalid-session"
      };
    }
    const auth = state.toAuth();
    if (!auth?.userId || !auth.sessionId) {
      return { kind: "invalid-session" };
    }
    return {
      kind: "authenticated",
      userId: auth.userId,
      sessionId: auth.sessionId
    };
  };
}
