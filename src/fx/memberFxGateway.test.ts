import { describe, expect, it, vi } from "vitest";

import type {
  MemberPreferenceStore,
  MembershipStore
} from "../member/memberPreferencesApi";
import { createMemberFxHandler } from "./memberFxGateway";

function dependencies() {
  const memberships: MembershipStore = {
    find: vi.fn().mockResolvedValue({ status: "active", role: "member" })
  };
  const preferences: MemberPreferenceStore = {
    find: vi.fn().mockResolvedValue({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD", "TWD", "EUR"]
    }),
    save: vi.fn()
  };
  const loadReferenceRate = vi.fn(
    async (_source: string, target: string) =>
      Response.json({
        source: "JPY",
        target,
        direction: "source-to-target",
        value: target === "TWD" ? "0.22" : "0.0067",
        provider: "Frankfurter",
        method: "daily-blend",
        providerPublishedDate: "2026-07-30",
        fetchedAt: "2026-07-30T10:00:00.000Z",
        state: "cached",
        attribution: "Frankfurter"
      })
  );
  return { memberships, preferences, loadReferenceRate };
}

function request(target = "TWD") {
  return new Request(
    `https://taglingo.example/api/member-fx?ownerId=user_member&source=JPY&targets=${target}`,
    { headers: { "cf-connecting-ip": "203.0.113.10" } }
  );
}

describe("Approved Member FX Gateway", () => {
  it("loads a rate only after session, capability, ownership, and saved-target authorization", async () => {
    const deps = dependencies();
    const handle = createMemberFxHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      ...deps
    });

    const response = await handle(request());

    expect(response.status).toBe(200);
    expect(deps.memberships.find).toHaveBeenCalledWith("user_member");
    expect(deps.preferences.find).toHaveBeenCalledWith("user_member");
    expect(deps.loadReferenceRate).toHaveBeenCalledWith(
      "JPY",
      "TWD",
      "user_member",
      "203.0.113.10"
    );
    await expect(response.json()).resolves.toMatchObject({
      rates: [{ target: "TWD", rate: { value: "0.22" } }]
    });
  });

  it("batches all synchronized Target Currencies in one authorized request", async () => {
    const deps = dependencies();
    const handle = createMemberFxHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      ...deps
    });

    const response = await handle(request("USD,TWD,EUR"));

    expect(response.status).toBe(200);
    expect(deps.loadReferenceRate).toHaveBeenCalledTimes(3);
  });

  it("returns unaffected rates when one authorized target fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.loadReferenceRate).mockImplementation(
      async (_source, target) =>
        target === "TWD"
          ? Response.json({ error: "quota" }, { status: 429 })
          : Response.json({
              source: "JPY",
              target,
              direction: "source-to-target",
              value: "0.0067",
              provider: "Frankfurter",
              method: "daily-blend",
              providerPublishedDate: "2026-07-30",
              fetchedAt: "2026-07-30T10:00:00.000Z",
              state: "cached",
              attribution: "Frankfurter"
            })
    );
    const handle = createMemberFxHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      ...deps
    });

    const response = await handle(request("USD,TWD"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rates: [
        {
          target: "USD",
          rate: expect.objectContaining({ target: "USD", value: "0.0067" })
        },
        { target: "TWD", error: { status: 429 } }
      ]
    });
  });

  it("authenticates even a malformed protected request before rejecting it", async () => {
    const deps = dependencies();
    const authenticate = vi
      .fn()
      .mockResolvedValue({ kind: "unauthenticated" });
    const handle = createMemberFxHandler({ authenticate, ...deps });
    const malformed = new Request(
      "https://taglingo.example/api/member-fx?cameraFrame=secret"
    );

    const response = await handle(malformed);

    expect(response.status).toBe(401);
    expect(authenticate).toHaveBeenCalledWith(malformed);
    expect(deps.preferences.find).not.toHaveBeenCalled();
  });

  it("denies a target outside the member's synchronized one-to-three-target entitlement", async () => {
    const deps = dependencies();
    const handle = createMemberFxHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      ...deps
    });

    const response = await handle(request("GBP"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "target_not_entitled" }
    });
    expect(deps.loadReferenceRate).not.toHaveBeenCalled();
  });

  it("never reads saved targets for an inactive membership", async () => {
    const deps = dependencies();
    vi.mocked(deps.memberships.find).mockResolvedValue({
      status: "suspended",
      role: "member"
    });
    const handle = createMemberFxHandler({
      authenticate: vi.fn().mockResolvedValue({
        kind: "authenticated",
        userId: "user_member",
        sessionId: "sess_member"
      }),
      ...deps
    });

    const response = await handle(request());

    expect(response.status).toBe(403);
    expect(deps.preferences.find).not.toHaveBeenCalled();
    expect(deps.loadReferenceRate).not.toHaveBeenCalled();
  });
});
