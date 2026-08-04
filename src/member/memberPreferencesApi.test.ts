import { describe, expect, it, vi } from "vitest";

import { SOURCE_CURRENCIES } from "../domain/currencies";
import {
  createMemberPreferencesHandler,
  DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS,
  normalizeMemberPreferences,
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
    find: vi.fn().mockResolvedValue({ status: "active", role: "member" })
  };
  const preferences: MemberPreferenceStore = {
    find: vi.fn(),
    save: vi.fn()
  };
  return { memberships, preferences };
}

describe("member preference API", () => {
  it("normalizes only the exact legacy three-key contract", () => {
    expect(
      normalizeMemberPreferences(
        {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"]
        },
        "user_member"
      )
    ).toEqual({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD"],
      ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
    });
    expect(
      normalizeMemberPreferences(
        {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "unsupported",
          focusedPriceBehavior: "automatic"
        },
        "user_member"
      )
    ).toBeNull();
  });

  it("returns null when the persistence boundary yields an invalid full row", async () => {
    const { memberships, preferences } = dependencies();
    vi.mocked(preferences.find).mockResolvedValue({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD"],
      manualEntryPromotion: "unsupported",
      focusedPriceBehavior: "automatic"
    } as never);
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
    await expect(response.json()).resolves.toEqual({ preferences: null });
  });

  it("accepts every Source Currency without changing Target limits", async () => {
    for (const { code } of SOURCE_CURRENCIES) {
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
      const targets = code === "USD" ? ["EUR"] : ["USD"];

      const response = await handle(
        request("PUT", {
          ownerId: "user_member",
          sourceCurrency: code,
          targetCurrencies: targets,
          ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
        })
      );

      expect(response.status, code).toBe(200);
      expect(preferences.save).toHaveBeenCalledWith({
        ownerId: "user_member",
        sourceCurrency: code,
        targetCurrencies: targets,
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      });
    }
  });

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
    expect(memberships.find).not.toHaveBeenCalled();
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
    expect(memberships.find).not.toHaveBeenCalled();
    expect(preferences.find).not.toHaveBeenCalled();
  });

  it("denies a signed-in user without an active TagLingo membership", async () => {
    const { memberships, preferences } = dependencies();
    vi.mocked(memberships.find).mockResolvedValue({
      status: "suspended",
      role: "member"
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "inactive_membership" }
    });
    expect(memberships.find).toHaveBeenCalledWith("user_member");
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
      targetCurrencies: ["USD", "TWD", "EUR"],
      manualEntryPromotion: "after-3-seconds",
      focusedPriceBehavior: "confirm"
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
        targetCurrencies: ["USD", "TWD", "EUR"],
        manualEntryPromotion: "after-3-seconds",
        focusedPriceBehavior: "confirm"
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
      targetCurrencies: ["USD", "TWD", "EUR"],
      manualEntryPromotion: "after-10-seconds" as const,
      focusedPriceBehavior: "automatic" as const
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
        targetCurrencies: targets,
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "malformed_request" }
    });
    expect(preferences.save).not.toHaveBeenCalled();
  });

  it.each([
    ["camera frames", { cameraFrame: "data:image/jpeg;base64,secret" }],
    ["OCR text", { ocrText: "4,142円" }],
    ["Detected Prices", { detectedPrices: [{ minorUnits: 4142 }] }],
    ["unnecessary identity", { email: "shopper@example.com" }]
  ])("rejects %s at the member persistence boundary", async (_case, extra) => {
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
        targetCurrencies: ["USD"],
        ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS,
        ...extra
      })
    );

    expect(response.status).toBe(400);
    expect(preferences.save).not.toHaveBeenCalled();
  });

  it.each([
    ["missing settings", {}],
    [
      "invalid Manual Price Entry promotion",
      {
        manualEntryPromotion: "after-4-seconds",
        focusedPriceBehavior: "automatic"
      }
    ],
    [
      "invalid Focused Price behavior",
      {
        manualEntryPromotion: "after-5-seconds",
        focusedPriceBehavior: "always-trust"
      }
    ]
  ])("rejects %s as a closed preference contract", async (_case, settings) => {
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
        targetCurrencies: ["USD"],
        ...settings
      })
    );

    expect(response.status).toBe(400);
    expect(preferences.save).not.toHaveBeenCalled();
  });
});
