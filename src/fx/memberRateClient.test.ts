import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemberRateLoader } from "./memberRateClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Approved Member rate client", () => {
  it("attaches the current Clerk session token", async () => {
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

    await createMemberRateLoader(
      "user_member",
      async () => "session-token"
    )("JPY", "TWD", new AbortController().signal);

    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: {
        accept: "application/json",
        authorization: "Bearer session-token"
      }
    });
  });

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
      createMemberRateLoader(
        "user_member",
        async () => "session-token"
      )(
        "JPY",
        "TWD",
        controller.signal
      )
    ).resolves.toEqual(rate);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/member-fx?ownerId=user_member&source=JPY&targets=TWD",
      {
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          authorization: "Bearer session-token"
        }
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
    const load = createMemberRateLoader(
      "user_member",
      async () => "session-token"
    );
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

  it.each([
    [401, "unauthenticated"],
    [403, "unauthorized"],
    [429, "quota"]
  ])("preserves actionable HTTP %s failures", async (status, reason) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: { code: "controlled_failure" } }, { status })
    );

    await expect(
      createMemberRateLoader(
        "user_member",
        async () => "session-token"
      )("JPY", "TWD", new AbortController().signal)
    ).rejects.toMatchObject({ reason });
  });
});
