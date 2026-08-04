import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMemberPreferencesClient,
  loadMemberPreferencesFromApi,
  saveMemberPreferencesToApi
} from "./memberPreferencesClient";
import { DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS } from "./memberPreferencesApi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("member preference client", () => {
  it("attaches the current Clerk session token to protected reads and writes", async () => {
    const preferences = {
      ownerId: "user_member",
      sourceCurrency: "JPY" as const,
      targetCurrencies: ["TWD" as const],
      ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ preferences }))
      .mockResolvedValueOnce(Response.json({ preferences }));
    const client = createMemberPreferencesClient(async () => "session-token");

    await expect(
      client.load("user_member", new AbortController().signal)
    ).resolves.toEqual(preferences);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: {
        accept: "application/json",
        authorization: "Bearer session-token"
      }
    });

    await expect(
      client.save(preferences, new AbortController().signal)
    ).resolves.toEqual(preferences);
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: {
        accept: "application/json",
        authorization: "Bearer session-token",
        "content-type": "application/json"
      }
    });
  });

  it("loads synchronized preferences through the same-origin protected endpoint", async () => {
    const preferences = {
      ownerId: "user_member",
      sourceCurrency: "JPY" as const,
      targetCurrencies: ["USD" as const, "TWD" as const],
      manualEntryPromotion: "only-on-request" as const,
      focusedPriceBehavior: "confirm" as const
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ preferences }));
    const controller = new AbortController();

    await expect(
      loadMemberPreferencesFromApi("user_member", controller.signal)
    ).resolves.toEqual(preferences);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/preferences?ownerId=user_member",
      {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal
      }
    );
  });

  it("saves no more identity than the stable Clerk owner ID in the preference contract", async () => {
    const preferences = {
      ownerId: "user_member",
      sourceCurrency: "JPY" as const,
      targetCurrencies: ["USD" as const, "TWD" as const, "EUR" as const],
      manualEntryPromotion: "after-10-seconds" as const,
      focusedPriceBehavior: "automatic" as const
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ preferences }));

    await expect(
      saveMemberPreferencesToApi(preferences, new AbortController().signal)
    ).resolves.toEqual(preferences);
    const request = fetchSpy.mock.calls[0];
    expect(request[0]).toBe("/api/preferences?ownerId=user_member");
    expect(request[1]).toMatchObject({
      method: "PUT",
      credentials: "same-origin"
    });
    expect(JSON.parse(String(request[1]?.body))).toEqual(preferences);
  });

  it("classifies inactive membership without collapsing every authorization failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { code: "inactive_membership" } },
        { status: 403 }
      )
    );

    await expect(
      loadMemberPreferencesFromApi(
        "user_inactive",
        new AbortController().signal
      )
    ).rejects.toEqual(
      expect.objectContaining({
        kind: "inactive-membership"
      })
    );
  });

  it("keeps a cross-account denial distinct from inactive membership", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { code: "cross_account" } },
        { status: 403 }
      )
    );

    await expect(
      loadMemberPreferencesFromApi(
        "user_member",
        new AbortController().signal
      )
    ).rejects.toEqual(
      expect.objectContaining({
        kind: "forbidden"
      })
    );
  });

  it("reports an HTML development fallback as unavailable member access", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>TagLingo</title>", {
        headers: { "content-type": "text/html" },
        status: 200
      })
    );

    await expect(
      loadMemberPreferencesFromApi(
        "user_member",
        new AbortController().signal
      )
    ).rejects.toEqual(
      expect.objectContaining({
        kind: "unavailable"
      })
    );
  });

  it("rejects invalid full synchronized experience settings instead of treating them as legacy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        preferences: {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"],
          manualEntryPromotion: "unsupported",
          focusedPriceBehavior: null
        }
      })
    );

    await expect(
      loadMemberPreferencesFromApi(
        "user_member",
        new AbortController().signal
      )
    ).rejects.toEqual(expect.objectContaining({ kind: "unavailable" }));
  });

  it("migrates an exact legacy three-key response to safe defaults", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        preferences: {
          ownerId: "user_member",
          sourceCurrency: "JPY",
          targetCurrencies: ["USD"]
        }
      })
    );

    await expect(
      loadMemberPreferencesFromApi(
        "user_member",
        new AbortController().signal
      )
    ).resolves.toEqual({
      ownerId: "user_member",
      sourceCurrency: "JPY",
      targetCurrencies: ["USD"],
      ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
    });
  });
});
