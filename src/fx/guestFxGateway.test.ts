import { describe, expect, it, vi } from "vitest";

import {
  createGuestFxHandler,
  type RateRecord,
  type RateRecordStore
} from "./guestFxGateway";

function createMemoryStore(): RateRecordStore & {
  records: Map<string, RateRecord>;
  claimRevalidation: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  const records = new Map<string, RateRecord>();
  const revalidationClaims = new Set<string>();
  return {
    records,
    find: async (source, target) => records.get(`${source}/${target}`) ?? null,
    claimRevalidation: vi.fn(async (source, target) => {
      const key = `${source}/${target}`;
      if (revalidationClaims.has(key)) {
        return false;
      }
      revalidationClaims.add(key);
      return true;
    }),
    save: vi.fn(async (record: RateRecord) => {
      records.set(`${record.source}/${record.target}`, record);
    })
  };
}

describe("Guest FX Gateway", () => {
  it("validates and stores a dated Frankfurter Reference Rate, then serves D1-authoritative data for six hours", async () => {
    const store = createMemoryStore();
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            date: "2026-07-30",
            base: "JPY",
            quote: "USD",
            rate: 0.0067123,
            providers: [
              { key: "ECB", date: "2026-07-30", rate: 0.0067 },
              { key: "BOJ", date: "2026-07-30", rate: 0.00672 },
              {
                key: "OUTLIER",
                date: "2026-07-30",
                rate: 0.009,
                excluded: true
              }
            ]
          }
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json", etag: '"rate-1"' }
        }
      )
    );
    let now = new Date("2026-07-30T10:00:00.000Z");
    const handle = createGuestFxHandler({
      store,
      providerFetch,
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" }),
      now: () => now
    });

    const first = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD", {
        headers: { "cf-connecting-ip": "203.0.113.10" }
      })
    );

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      source: "JPY",
      target: "USD",
      direction: "source-to-target",
      value: "0.0067123",
      provider: "Frankfurter",
      method: "daily-blend",
      providerPublishedDate: "2026-07-30",
      fetchedAt: "2026-07-30T10:00:00.000Z",
      state: "fresh",
      attribution: "Frankfurter · ECB, BOJ"
    });
    expect(providerFetch).toHaveBeenCalledWith(
      "https://api.frankfurter.dev/v2/rates?base=JPY&quotes=USD&expand=providers",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" })
      })
    );
    expect(store.save).toHaveBeenCalledOnce();

    now = new Date("2026-07-30T15:59:59.000Z");
    const cached = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD", {
        headers: { "cf-connecting-ip": "203.0.113.10" }
      })
    );

    expect(cached.status).toBe(200);
    expect((await cached.json()).state).toBe("cached");
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it("revalidates a stale D1 record with an ETag without replacing its provider date", async () => {
    const store = createMemoryStore();
    store.records.set("JPY/USD", {
      source: "JPY",
      target: "USD",
      value: "0.0067123",
      provider: "Frankfurter",
      method: "daily-blend",
      providerPublishedDate: "2026-07-29",
      fetchedAt: "2026-07-30T03:00:00.000Z",
      attribution: "Frankfurter · ECB, BOJ",
      etag: '"rate-1"'
    });
    const providerFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304 }));
    const handle = createGuestFxHandler({
      store,
      providerFetch,
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" }),
      now: () => new Date("2026-07-30T10:00:00.000Z")
    });

    const response = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      value: "0.0067123",
      providerPublishedDate: "2026-07-29",
      fetchedAt: "2026-07-30T10:00:00.000Z",
      state: "cached"
    });
    expect(providerFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "if-none-match": '"rate-1"' })
      })
    );
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPublishedDate: "2026-07-29",
        fetchedAt: "2026-07-30T10:00:00.000Z"
      })
    );
  });

  it("rejects camera and Detected Price input before rate limiting or provider access", async () => {
    const consumeGuestLimit = vi.fn().mockResolvedValue(true);
    const providerFetch = vi.fn();
    const handle = createGuestFxHandler({
      store: createMemoryStore(),
      providerFetch,
      consumeGuestLimit,
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" })
    });

    const response = await handle(
      new Request(
        "https://taglingo.test/api/fx?source=JPY&target=USD&detectedPrice=4142"
      )
    );

    expect(response.status).toBe(400);
    expect(consumeGuestLimit).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("fails closed when the signed Guest actor and IP exceed their request limit", async () => {
    const providerFetch = vi.fn();
    const handle = createGuestFxHandler({
      store: createMemoryStore(),
      providerFetch,
      consumeGuestLimit: vi.fn().mockResolvedValue(false),
      resolveGuestActor: vi.fn().mockResolvedValue({
        key: "guest-1",
        setCookie: "taglingo_guest_actor=signed; Secure"
      })
    });

    const response = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD", {
        headers: { "cf-connecting-ip": "203.0.113.10" }
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("set-cookie")).toContain(
      "taglingo_guest_actor"
    );
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("uses an eligible last-known-good D1 record when Frankfurter returns the wrong pair", async () => {
    const store = createMemoryStore();
    store.records.set("JPY/USD", {
      source: "JPY",
      target: "USD",
      value: "0.0067",
      provider: "Frankfurter",
      method: "daily-blend",
      providerPublishedDate: "2026-07-29",
      fetchedAt: "2026-07-30T01:00:00.000Z",
      attribution: "Frankfurter",
      etag: null
    });
    const handle = createGuestFxHandler({
      store,
      providerFetch: vi.fn().mockResolvedValue(
        Response.json([
          {
            date: "2026-07-30",
            base: "USD",
            quote: "JPY",
            rate: 149.2
          }
        ])
      ),
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" }),
      now: () => new Date("2026-07-30T10:00:00.000Z")
    });

    const response = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      value: "0.0067",
      providerPublishedDate: "2026-07-29",
      state: "last-known-good"
    });
    expect(store.save).not.toHaveBeenCalled();
    expect(store.records.get("JPY/USD")?.value).toBe("0.0067");
  });

  it("returns a controlled error when Frankfurter cannot be reached", async () => {
    const handle = createGuestFxHandler({
      store: createMemoryStore(),
      providerFetch: vi.fn().mockRejectedValue(new TypeError("network down")),
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" })
    });

    const response = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A validated Reference Rate is unavailable."
    });
  });

  it("rejects malformed Frankfurter JSON without creating a D1 record", async () => {
    const store = createMemoryStore();
    const handle = createGuestFxHandler({
      store,
      providerFetch: vi.fn().mockResolvedValue(
        new Response("{not-json", {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      ),
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" })
    });

    const response = await handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );

    expect(response.status).toBe(502);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("single-flights concurrent revalidation for the same pair", async () => {
    const store = createMemoryStore();
    let releaseProvider!: (response: Response) => void;
    const providerFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releaseProvider = resolve;
        })
    );
    const handle = createGuestFxHandler({
      store,
      providerFetch,
      consumeGuestLimit: vi.fn().mockResolvedValue(true),
      resolveGuestActor: vi.fn().mockResolvedValue({ key: "guest-1" }),
      now: () => new Date("2026-07-30T10:00:00.000Z")
    });

    const first = handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );
    const second = handle(
      new Request("https://taglingo.test/api/fx?source=JPY&target=USD")
    );
    await vi.waitFor(() => expect(providerFetch).toHaveBeenCalledOnce());
    releaseProvider(
      Response.json([
        {
          date: "2026-07-30",
          base: "JPY",
          quote: "USD",
          rate: 0.0067
        }
      ])
    );

    const responses = await Promise.all([first, second]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(providerFetch).toHaveBeenCalledOnce();
  });
});
