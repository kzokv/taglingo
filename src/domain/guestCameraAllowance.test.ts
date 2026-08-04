import { describe, expect, it, vi } from "vitest";

import {
  createGuestCameraAllowanceStore,
  createWebLocksGuestCameraAllowanceLock,
  GUEST_CAMERA_ALLOWANCE_LOCK_NAME,
  type GuestCameraAllowanceLock
} from "./guestCameraAllowance";

function memoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set("taglingo.guest-camera-allowance.v1", initialValue);
  }
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

function exclusiveLock(): GuestCameraAllowanceLock {
  let tail = Promise.resolve();
  return {
    async runExclusive<T>(_name: string, transaction: () => T | Promise<T>) {
      const result = tail.then(transaction, transaction);
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    }
  };
}

describe("Guest Camera Allowance", () => {
  it("charges ten successful usages across currencies and browser reloads", async () => {
    let nowMs = Date.parse("2026-08-04T10:00:00.000Z");
    const storage = memoryStorage();
    const lock = exclusiveLock();
    const firstVisit = createGuestCameraAllowanceStore({
      storage,
      lock,
      now: () => nowMs
    });

    for (let usage = 0; usage < 6; usage += 1) {
      expect((await firstVisit.recordSuccessfulUsage()).charged).toBe(true);
      nowMs += 1_000;
    }

    const reloadedVisit = createGuestCameraAllowanceStore({
      storage,
      lock,
      now: () => nowMs
    });
    for (let usage = 0; usage < 4; usage += 1) {
      expect((await reloadedVisit.recordSuccessfulUsage()).charged).toBe(true);
      nowMs += 1_000;
    }

    expect(reloadedVisit.getSnapshot()).toMatchObject({
      used: 10,
      remaining: 0,
      isExhausted: true
    });
    expect((await reloadedVisit.recordSuccessfulUsage()).charged).toBe(false);
  });

  it("refreshes at the earliest successful timestamp in the rolling hour", async () => {
    let nowMs = Date.parse("2026-08-04T10:00:00.000Z");
    const store = createGuestCameraAllowanceStore({
      storage: memoryStorage(),
      lock: exclusiveLock(),
      now: () => nowMs
    });
    for (let usage = 0; usage < 10; usage += 1) {
      await store.recordSuccessfulUsage();
      nowMs += 1_000;
    }

    expect(store.getSnapshot().nextRefreshAtMs).toBe(
      Date.parse("2026-08-04T11:00:00.000Z")
    );
    nowMs = Date.parse("2026-08-04T10:59:59.999Z");
    expect(store.getSnapshot().remaining).toBe(0);
    nowMs = Date.parse("2026-08-04T11:00:00.000Z");
    expect(store.getSnapshot()).toMatchObject({
      used: 9,
      remaining: 1,
      isExhausted: false
    });
  });

  it.each([
    "not-json",
    JSON.stringify({ version: 1, successfulUsageTimestamps: ["bad"] }),
    JSON.stringify({
      version: 1,
      successfulUsageTimestamps: [Date.parse("2026-08-04T12:00:00.000Z")]
    })
  ])("fails open for corrupt or future-clock data: %s", async (stored) => {
    const store = createGuestCameraAllowanceStore({
      storage: memoryStorage(stored),
      lock: exclusiveLock(),
      now: () => Date.parse("2026-08-04T10:00:00.000Z")
    });

    expect(store.getSnapshot()).toMatchObject({
      used: 0,
      remaining: 10,
      isExhausted: false
    });
    expect((await store.recordSuccessfulUsage()).charged).toBe(true);
  });

  it("continues as a soft in-memory limit when browser storage is blocked", async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const store = createGuestCameraAllowanceStore({ storage, now: () => 1_000 });

    for (let usage = 0; usage < 10; usage += 1) {
      expect((await store.recordSuccessfulUsage()).charged).toBe(true);
    }
    expect((await store.recordSuccessfulUsage()).charged).toBe(false);
  });

  it("latches persistence unavailable after a write failure without clearing memory on a later null read", async () => {
    const storage = memoryStorage();
    const getItem = vi.spyOn(storage, "getItem");
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const store = createGuestCameraAllowanceStore({
      storage,
      lock: exclusiveLock(),
      now: () => 1_000
    });

    expect((await store.recordSuccessfulUsage()).charged).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ used: 1, remaining: 9 });
    expect((await store.recordSuccessfulUsage()).snapshot).toMatchObject({
      used: 2,
      remaining: 8
    });
    expect(getItem).toHaveBeenCalledTimes(2);
  });

  it("serializes two tabs at nine usages so exactly one receives the tenth charge", async () => {
    const nowMs = Date.parse("2026-08-04T10:00:00.000Z");
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        successfulUsageTimestamps: Array.from(
          { length: 9 },
          (_, index) => nowMs - index * 1_000
        )
      })
    );
    const lock = exclusiveLock();
    const firstTab = createGuestCameraAllowanceStore({
      storage,
      lock,
      now: () => nowMs
    });
    const secondTab = createGuestCameraAllowanceStore({
      storage,
      lock,
      now: () => nowMs
    });

    const results = await Promise.all([
      firstTab.recordSuccessfulUsage(),
      secondTab.recordSuccessfulUsage()
    ]);

    expect(results.map(({ charged }) => charged).sort()).toEqual([false, true]);
    expect(results.find(({ charged }) => !charged)).toMatchObject({
      denialReason: "exhausted",
      snapshot: { used: 10, remaining: 0, isExhausted: true }
    });
  });

  it("denies persistent charging when the exclusive lock is unavailable", async () => {
    const storage = memoryStorage();
    const store = createGuestCameraAllowanceStore({ storage, now: () => 1_000 });

    await expect(store.recordSuccessfulUsage()).resolves.toMatchObject({
      charged: false,
      denialReason: "lock-unavailable",
      snapshot: { used: 0, remaining: 10 }
    });
    expect(storage.length).toBe(0);
  });

  it("denies persistent charging when the exclusive lock fails", async () => {
    const storage = memoryStorage();
    const store = createGuestCameraAllowanceStore({
      storage,
      lock: {
        runExclusive: vi.fn().mockRejectedValue(new Error("lock failed"))
      },
      now: () => 1_000
    });

    await expect(store.recordSuccessfulUsage()).resolves.toMatchObject({
      charged: false,
      denialReason: "lock-failed",
      snapshot: { used: 0, remaining: 10 }
    });
    expect(storage.length).toBe(0);
  });

  it("adapts Web Locks with the stable exclusive transaction name", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        transaction: () => unknown
      ) => transaction()
    );
    const lock = createWebLocksGuestCameraAllowanceLock({
      request
    } as unknown as LockManager);
    const store = createGuestCameraAllowanceStore({
      storage: memoryStorage(),
      lock,
      now: () => 1_000
    });

    await expect(store.recordSuccessfulUsage()).resolves.toMatchObject({
      charged: true
    });
    expect(request).toHaveBeenCalledWith(
      GUEST_CAMERA_ALLOWANCE_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function)
    );
  });
});
