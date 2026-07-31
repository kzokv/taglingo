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
      .mockResolvedValue(
        Response.json({ rates: [{ target: "TWD", rate }] })
      );
    const controller = new AbortController();

    await expect(
      createMemberRateLoader("user_member")(
        "JPY",
        "TWD",
        controller.signal
      )
    ).resolves.toEqual(rate);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/member-fx?ownerId=user_member&source=JPY&targets=TWD",
      {
        credentials: "same-origin",
        headers: { accept: "application/json" }
      }
    );
  });

  it("batches one to three Target Currencies into one protected request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        rates: [
          {
            target: "USD",
            rate: {
              source: "JPY",
              target: "USD",
              direction: "source-to-target",
              value: "0.0067",
              provider: "Frankfurter",
              method: "daily-blend",
              providerPublishedDate: "2026-07-30",
              fetchedAt: "2026-07-30T10:00:00.000Z",
              state: "cached",
              attribution: "Frankfurter"
            }
          },
          {
            target: "TWD",
            rate: {
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
            }
          }
        ]
      })
    );
    const load = createMemberRateLoader("user_member");
    const signal = new AbortController().signal;

    await Promise.all([
      load("JPY", "USD", signal),
      load("JPY", "TWD", signal)
    ]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "/api/member-fx?ownerId=user_member&source=JPY&targets=USD%2CTWD"
    );
  });
});
