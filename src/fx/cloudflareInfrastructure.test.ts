import { describe, expect, it, vi } from "vitest";

import {
  createD1GuestRateLimiter,
  createD1MemberRateLimiter,
  createD1RateRecordStore,
  createSignedGuestActorResolver,
  type D1Database,
  type D1PreparedStatement
} from "./cloudflareInfrastructure";

function statement(overrides: Partial<D1PreparedStatement> = {}) {
  const result: D1PreparedStatement = {
    bind: vi.fn(() => result),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true }),
    ...overrides
  };
  return result;
}

describe("Cloudflare FX infrastructure", () => {
  it("maps validated pair records through the D1 RateRecordStore contract", async () => {
    const select = statement({
      first: vi.fn().mockResolvedValue({
        source_currency: "JPY",
        target_currency: "USD",
        decimal_value: "0.0067123",
        provider: "Frankfurter",
        method: "daily-blend",
        provider_published_date: "2026-07-30",
        fetched_at: "2026-07-30T10:00:00.000Z",
        attribution: "Frankfurter · ECB, BOJ",
        etag: '"rate-1"'
      })
    });
    const upsert = statement();
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(select)
        .mockReturnValueOnce(upsert)
    };
    const store = createD1RateRecordStore(database);

    const record = await store.find("JPY", "USD");
    expect(record).toEqual({
      source: "JPY",
      target: "USD",
      value: "0.0067123",
      provider: "Frankfurter",
      method: "daily-blend",
      providerPublishedDate: "2026-07-30",
      fetchedAt: "2026-07-30T10:00:00.000Z",
      attribution: "Frankfurter · ECB, BOJ",
      etag: '"rate-1"'
    });

    await store.save(record!);
    expect(select.bind).toHaveBeenCalledWith("JPY", "USD");
    expect(upsert.bind).toHaveBeenCalledWith(
      "JPY",
      "USD",
      "0.0067123",
      "Frankfurter",
      "daily-blend",
      "2026-07-30",
      "2026-07-30T10:00:00.000Z",
      "Frankfurter · ECB, BOJ",
      '"rate-1"'
    );
  });

  it("enforces independent signed-actor and IP counters", async () => {
    const actorCounter = statement({
      first: vi.fn().mockResolvedValue({ request_count: 3 })
    });
    const ipCounter = statement({
      first: vi.fn().mockResolvedValue({ request_count: 4 })
    });
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(actorCounter)
        .mockReturnValueOnce(ipCounter)
    };
    const consume = createD1GuestRateLimiter(database, {
      maxRequests: 3,
      windowMs: 60_000
    });

    await expect(
      consume(
        "signed-guest-id",
        "203.0.113.10",
        new Date("2026-07-30T10:00:30.000Z")
      )
    ).resolves.toBe(false);
    expect(actorCounter.bind).toHaveBeenCalledWith(
      "actor",
      expect.any(String),
      Date.parse("2026-07-30T10:00:00.000Z")
    );
    expect(ipCounter.bind).toHaveBeenCalledWith(
      "ip",
      expect.any(String),
      Date.parse("2026-07-30T10:00:00.000Z")
    );
  });

  it("keeps Approved Member rate-limit counters separate from Guest counters", async () => {
    const actorCounter = statement({
      first: vi.fn().mockResolvedValue({ request_count: 1 })
    });
    const ipCounter = statement({
      first: vi.fn().mockResolvedValue({ request_count: 1 })
    });
    const database: D1Database = {
      prepare: vi
        .fn()
        .mockReturnValueOnce(actorCounter)
        .mockReturnValueOnce(ipCounter)
    };

    await expect(
      createD1MemberRateLimiter(database)(
        "user_member",
        "203.0.113.10",
        new Date("2026-07-30T10:00:00.000Z")
      )
    ).resolves.toBe(true);
    expect(vi.mocked(database.prepare).mock.calls[0][0]).toContain(
      "member_fx_rate_limits"
    );
  });

  it("does not expose a malformed D1 row as a validated Reference Rate", async () => {
    const select = statement({
      first: vi.fn().mockResolvedValue({
        source_currency: "JPY",
        target_currency: "USD",
        decimal_value: "0.0067",
        provider: "Frankfurter",
        method: "daily-blend",
        provider_published_date: "2026-07-30",
        fetched_at: "not-a-timestamp",
        attribution: "Frankfurter",
        etag: null
      })
    });
    const database: D1Database = {
      prepare: vi.fn().mockReturnValue(select)
    };

    await expect(
      createD1RateRecordStore(database).find("JPY", "USD")
    ).resolves.toBeNull();
  });

  it("claims pair revalidation through a conditional D1 lease", async () => {
    const lease = statement({
      first: vi.fn().mockResolvedValue({ lease_until: 1_772_359_260_000 })
    });
    const database: D1Database = {
      prepare: vi.fn().mockReturnValue(lease)
    };
    const store = createD1RateRecordStore(database);

    await expect(
      store.claimRevalidation(
        "JPY",
        "USD",
        new Date("2026-03-01T10:00:00.000Z")
      )
    ).resolves.toBe(true);
    expect(lease.bind).toHaveBeenCalledWith(
      "JPY",
      "USD",
      1_772_359_260_000,
      1_772_359_200_000
    );
  });

  it("restores only a valid signed Guest actor cookie", async () => {
    const resolveActor = createSignedGuestActorResolver(
      "test-secret-with-at-least-thirty-two-characters"
    );

    const created = await resolveActor(
      new Request("https://taglingo.test/api/fx")
    );
    const cookie = created.setCookie!.split(";")[0];
    const restored = await resolveActor(
      new Request("https://taglingo.test/api/fx", {
        headers: { cookie }
      })
    );
    const forged = await resolveActor(
      new Request("https://taglingo.test/api/fx", {
        headers: { cookie: `${cookie.slice(0, -1)}x` }
      })
    );

    expect(restored).toEqual({ key: created.key });
    expect(forged.key).not.toBe(created.key);
    expect(forged.setCookie).toContain("HttpOnly; Secure; SameSite=Lax");
  });
});
