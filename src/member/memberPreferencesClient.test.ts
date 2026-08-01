import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadMemberPreferencesFromApi,
  saveMemberPreferencesToApi
} from "./memberPreferencesClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("member preference client", () => {
  it("loads synchronized preferences through the same-origin protected endpoint", async () => {
    const preferences = {
      ownerId: "user_member",
      sourceCurrency: "JPY" as const,
      targetCurrencies: ["USD" as const, "TWD" as const]
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
      targetCurrencies: ["USD" as const, "TWD" as const, "EUR" as const]
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
});
