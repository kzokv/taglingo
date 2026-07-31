import { describe, expect, it, vi } from "vitest";

import {
  createMemberPreferencesHandler,
  type MemberPreferenceStore,
  type MembershipStore
} from "./memberPreferencesApi";

function request(
  method = "GET",
  body?: unknown,
  ownerId = "user_member"
) {
  return new Request(
    `https://taglingo.example/api/preferences?ownerId=${ownerId}`,
    {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );
}

function dependencies() {
  const memberships: MembershipStore = {
    findStatus: vi.fn().mockResolvedValue("active")
  };
  const preferences: MemberPreferenceStore = {
    find: vi.fn(),
    save: vi.fn()
  };
  return { memberships, preferences };
}

describe("member preference API", () => {
  it("rejects a missing Clerk session before reading membership or preferences", async () => {
    const { memberships, preferences } = dependencies();
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
      memberships,
      preferences
    });

    const response = await handle(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthenticated",
        message: "Sign in with an Approved Member account."
      }
    });
    expect(memberships.findStatus).not.toHaveBeenCalled();
    expect(preferences.find).not.toHaveBeenCalled();
  });

  it("distinguishes a malformed or invalid Clerk session", async () => {
    const { memberships, preferences } = dependencies();
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({ kind: "invalid-session" }),
      memberships,
      preferences
    });

    const response = await handle(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_session" }
    });
    expect(memberships.findStatus).not.toHaveBeenCalled();
    expect(preferences.find).not.toHaveBeenCalled();
  });

  it("denies a signed-in user without an active TagLingo membership", async () => {
    const { memberships, preferences } = dependencies();
    vi.mocked(memberships.findStatus).mockResolvedValue("suspended");
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      memberships,
      preferences
    });

    const response = await handle(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "inactive_membership" }
    });
    expect(memberships.findStatus).toHaveBeenCalledWith("user_member");
    expect(preferences.find).not.toHaveBeenCalled();
  });

  it("rejects cross-account access before reading privileged preferences", async () => {
    const { memberships, preferences } = dependencies();
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      memberships,
      preferences
    });

    const response = await handle(request("GET", undefined, "user_other"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "cross_account" }
    });
    expect(preferences.find).not.toHaveBeenCalled();
  });

  it("returns only the authenticated member's saved preferences", async () => {
    const { memberships, preferences } = dependencies();
    vi.mocked(preferences.find).mockResolvedValue({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD", "TWD", "EUR"]
    });
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      memberships,
      preferences
    });

    const response = await handle(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preferences: {
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: ["USD", "TWD", "EUR"]
      }
    });
    expect(preferences.find).toHaveBeenCalledWith("user_member");
  });

  it("saves one to three distinct Target Currencies under the authenticated Clerk user ID", async () => {
    const { memberships, preferences } = dependencies();
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      memberships,
      preferences
    });
    const memberPreferences = {
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD", "TWD", "EUR"]
    };

    const response = await handle(request("PUT", memberPreferences));

    expect(response.status).toBe(200);
    expect(preferences.save).toHaveBeenCalledWith(memberPreferences);
    await expect(response.json()).resolves.toEqual({
      preferences: memberPreferences
    });
  });

  it.each([
    ["duplicate targets", ["USD", "USD"]],
    ["too many targets", ["USD", "TWD", "EUR", "GBP"]],
    ["Source Currency repeated as a target", ["JPY"]]
  ])("rejects malformed member preferences with %s", async (_case, targets) => {
    const { memberships, preferences } = dependencies();
    const handle = createMemberPreferencesHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      memberships,
      preferences
    });

    const response = await handle(
      request("PUT", {
        ownerId: "user_member",
        sourceCurrency: "JPY",
        targetCurrencies: targets
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "malformed_request" }
    });
    expect(preferences.save).not.toHaveBeenCalled();
  });
});
