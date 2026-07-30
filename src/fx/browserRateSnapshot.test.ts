import { describe, expect, it, vi } from "vitest";

import type { GuestReferenceRate } from "./referenceRate";
import {
  RATE_SNAPSHOT_STORAGE_KEY,
  createBrowserRateSnapshotStore,
  createOfflineGuestRateLoader
} from "./browserRateSnapshot";

const RATE: GuestReferenceRate = {
  source: "JPY",
  target: "USD",
  direction: "source-to-target",
  value: "0.0067123",
  provider: "Frankfurter",
  method: "daily-blend",
  providerPublishedDate: "2026-07-23",
  fetchedAt: "2026-07-30T10:00:00.000Z",
  state: "fresh",
  attribution: "Frankfurter · ECB, BOJ"
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
}

describe("browser Rate Snapshots", () => {
  it("refreshes online and stores only the validated active FX payload", async () => {
    const storage = createStorage();
    const store = createBrowserRateSnapshotStore(storage);
    const onlineRate = {
      ...RATE,
      providerPublishedDate: "2026-07-30",
      accountId: "must-not-persist",
      detectedPrice: 4142
    };
    const loadOnline = vi.fn().mockResolvedValue(onlineRate);
    const load = createOfflineGuestRateLoader({
      loadOnline,
      store,
      now: () => new Date("2026-07-30T18:00:00.000Z")
    });

    await expect(
      load("JPY", "USD", new AbortController().signal)
    ).resolves.toEqual(onlineRate);

    const serialized = storage.getItem(RATE_SNAPSHOT_STORAGE_KEY);
    expect(serialized).toContain('"providerPublishedDate":"2026-07-30"');
    expect(serialized).not.toContain("accountId");
    expect(serialized).not.toContain("detectedPrice");
  });

  it("starts offline with a clearly marked snapshot through calendar day seven", async () => {
    const storage = createStorage();
    const store = createBrowserRateSnapshotStore(storage);
    store.save(RATE);
    const load = createOfflineGuestRateLoader({
      loadOnline: vi.fn().mockRejectedValue(new TypeError("offline")),
      store,
      now: () => new Date("2026-07-30T23:59:59.999Z")
    });

    await expect(
      load("JPY", "USD", new AbortController().signal)
    ).resolves.toEqual({
      ...RATE,
      state: "offline"
    });
  });

  it("stops an old conversion on calendar day eight even with a newer fetch time", async () => {
    const storage = createStorage();
    const store = createBrowserRateSnapshotStore(storage);
    store.save({
      ...RATE,
      fetchedAt: "2026-07-31T00:00:00.000Z"
    });
    const load = createOfflineGuestRateLoader({
      loadOnline: vi.fn().mockResolvedValue({
        ...RATE,
        fetchedAt: "2026-07-31T00:00:00.000Z",
        state: "cached"
      }),
      store,
      now: () => new Date("2026-07-31T00:00:00.000Z")
    });

    await expect(
      load("JPY", "USD", new AbortController().signal)
    ).rejects.toMatchObject({
      reason: "expired"
    });
  });

  it("does not let a stale service-worker response replace a newer eligible snapshot", async () => {
    const storage = createStorage();
    const store = createBrowserRateSnapshotStore(storage);
    store.save({
      ...RATE,
      value: "0.0068",
      providerPublishedDate: "2026-07-29"
    });
    const load = createOfflineGuestRateLoader({
      loadOnline: vi.fn().mockResolvedValue({
        ...RATE,
        providerPublishedDate: "2026-07-20",
        fetchedAt: "2026-07-30T23:59:59.000Z",
        state: "cached"
      }),
      store,
      now: () => new Date("2026-07-30T12:00:00.000Z")
    });

    await expect(
      load("JPY", "USD", new AbortController().signal)
    ).resolves.toMatchObject({
      value: "0.0068",
      providerPublishedDate: "2026-07-29",
      state: "offline"
    });
  });

  it("ignores a malformed target without erasing another valid pair", async () => {
    const storage = createStorage();
    storage.setItem(
      RATE_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: {
          "JPY/USD": { ...RATE, value: "not-a-decimal" },
          "JPY/EUR": {
            ...RATE,
            target: "EUR",
            value: "0.0058"
          }
        }
      })
    );
    const store = createBrowserRateSnapshotStore(storage);
    const load = createOfflineGuestRateLoader({
      loadOnline: vi.fn().mockRejectedValue(new TypeError("offline")),
      store,
      now: () => new Date("2026-07-30T12:00:00.000Z")
    });

    await expect(
      load("JPY", "USD", new AbortController().signal)
    ).rejects.toMatchObject({
      reason: "unavailable"
    });
    await expect(
      load("JPY", "EUR", new AbortController().signal)
    ).resolves.toMatchObject({
      target: "EUR",
      value: "0.0058",
      state: "offline"
    });
  });

  it("retains only the declared active pairs and rejects synthesized offline records", () => {
    const storage = createStorage();
    storage.setItem(
      RATE_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        records: {
          "JPY/USD": RATE,
          "JPY/EUR": {
            ...RATE,
            target: "EUR",
            state: "offline"
          },
          "AUD/USD": {
            ...RATE,
            source: "AUD"
          }
        }
      })
    );
    const store = createBrowserRateSnapshotStore(storage);

    store.retainActivePairs([
      { source: "JPY", target: "USD" },
      { source: "JPY", target: "EUR" }
    ]);

    expect(
      store.find("JPY", "USD", new Date("2026-07-30T12:00:00.000Z")).status
    ).toBe("eligible");
    expect(
      store.find("JPY", "EUR", new Date("2026-07-30T12:00:00.000Z")).status
    ).toBe("missing");
    expect(
      store.find("AUD", "USD", new Date("2026-07-30T12:00:00.000Z")).status
    ).toBe("missing");
    expect(storage.getItem(RATE_SNAPSHOT_STORAGE_KEY)).not.toContain(
      '"AUD/USD"'
    );
  });
});
