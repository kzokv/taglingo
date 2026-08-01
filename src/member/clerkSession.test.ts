import { describe, expect, it, vi } from "vitest";

import { createClerkSessionAuthenticator } from "./clerkSession";

describe("Clerk member session adapter", () => {
  it("returns the stable Clerk user and session IDs from an authenticated request", async () => {
    const authenticateRequest = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({
        userId: "user_member",
        sessionId: "sess_member"
      })
    });
    const authenticate = createClerkSessionAuthenticator(
      { authenticateRequest },
      {
        publishableKey: "pk_test_example",
        authorizedParties: ["https://taglingo.example"]
      }
    );
    const request = new Request("https://taglingo.example/api/preferences");

    await expect(authenticate(request)).resolves.toEqual({
      kind: "authenticated",
      userId: "user_member",
      sessionId: "sess_member"
    });
    expect(authenticateRequest).toHaveBeenCalledWith(request, {
      acceptsToken: "session_token",
      authorizedParties: ["https://taglingo.example"],
      publishableKey: "pk_test_example"
    });
  });

  it.each([
    ["session-token-missing", "unauthenticated"],
    ["session-token-expired", "invalid-session"]
  ])("maps Clerk reason %s to %s", async (reason, kind) => {
    const authenticate = createClerkSessionAuthenticator(
      {
        authenticateRequest: vi.fn().mockResolvedValue({
          isAuthenticated: false,
          reason,
          toAuth: () => ({ userId: null, sessionId: null })
        })
      },
      {
        publishableKey: "pk_test_example",
        authorizedParties: ["https://taglingo.example"]
      }
    );

    await expect(
      authenticate(new Request("https://taglingo.example/api/preferences"))
    ).resolves.toEqual({ kind });
  });
});
