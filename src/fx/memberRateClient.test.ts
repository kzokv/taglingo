import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemberRateLoader } from "./memberRateClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Approved Member rate client", () => {
  it("uses the protected owner-scoped FX endpoint", async () => {
    const rate = {
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
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(rate));
    const controller = new AbortController();

    await expect(
      createMemberRateLoader("user_member")(
        "JPY",
        "TWD",
        controller.signal
      )
    ).resolves.toEqual(rate);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/member-fx?ownerId=user_member&source=JPY&target=TWD",
      {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal
      }
    );
  });
});
