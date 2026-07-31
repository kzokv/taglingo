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
  const loadReferenceRate = vi.fn().mockResolvedValue(
    Response.json({
      source: "JPY",
      target: "TWD",
      direction: "source-to-target",
      value: "0.22",
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
    `https://taglingo.example/api/member-fx?ownerId=user_member&source=JPY&target=${target}`,
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
