import { hasExactKeys } from "./exactObject";

const STORAGE_KEY = "taglingo.guest-camera-allowance.v1";
export const GUEST_CAMERA_ALLOWANCE_LOCK_NAME =
  "taglingo.guest-camera-allowance.v1:charge";
export const GUEST_CAMERA_USAGE_LIMIT = 10;
export const GUEST_CAMERA_ROLLING_WINDOW_MS = 60 * 60 * 1_000;

interface StoredGuestCameraAllowance {
  version: 1;
  successfulUsageTimestamps: number[];
}

export interface GuestCameraAllowanceSnapshot {
  used: number;
  remaining: number;
  isExhausted: boolean;
  nextRefreshAtMs: number | null;
}

export interface GuestCameraAllowanceCharge {
  charged: boolean;
  snapshot: GuestCameraAllowanceSnapshot;
  denialReason?: "exhausted" | "lock-unavailable" | "lock-failed";
}

export interface GuestCameraAllowanceLock {
  runExclusive<T>(
    name: string,
    transaction: () => T | Promise<T>
  ): Promise<T>;
}

export function createWebLocksGuestCameraAllowanceLock(
  locks: LockManager | undefined
): GuestCameraAllowanceLock | undefined {
  if (!locks) {
    return undefined;
  }
  return {
    runExclusive<T>(name: string, transaction: () => T | Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        void locks
          .request(name, { mode: "exclusive" }, async () => {
            try {
              resolve(await transaction());
            } catch (error) {
              reject(error);
              throw error;
            }
          })
          .catch(reject);
      });
    }
  };
}

function validNow(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function parseStoredTimestamps(raw: string, nowMs: number): number[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !hasExactKeys(value, ["version", "successfulUsageTimestamps"]) ||
      value.version !== 1 ||
      !Array.isArray(value.successfulUsageTimestamps) ||
      value.successfulUsageTimestamps.length > GUEST_CAMERA_USAGE_LIMIT ||
      !value.successfulUsageTimestamps.every(
        (timestamp) =>
          typeof timestamp === "number" &&
          Number.isSafeInteger(timestamp) &&
          timestamp >= 0
      )
    ) {
      return null;
    }

    return value.successfulUsageTimestamps
      .filter(
        (timestamp) =>
          timestamp <= nowMs &&
          timestamp > nowMs - GUEST_CAMERA_ROLLING_WINDOW_MS
      )
      .sort((left, right) => left - right);
  } catch {
    return null;
  }
}

function snapshotFor(timestamps: readonly number[]): GuestCameraAllowanceSnapshot {
  const used = Math.min(timestamps.length, GUEST_CAMERA_USAGE_LIMIT);
  return {
    used,
    remaining: GUEST_CAMERA_USAGE_LIMIT - used,
    isExhausted: used >= GUEST_CAMERA_USAGE_LIMIT,
    nextRefreshAtMs:
      used >= GUEST_CAMERA_USAGE_LIMIT
        ? timestamps[0] + GUEST_CAMERA_ROLLING_WINDOW_MS
        : null
  };
}

export function createGuestCameraAllowanceStore({
  storage,
  lock,
  now = Date.now
}: {
  storage?: Storage;
  lock?: GuestCameraAllowanceLock;
  now?: () => number;
} = {}) {
  let inMemoryTimestamps: number[] = [];
  let persistenceAvailable = storage !== undefined;

  const pruneMemory = (nowMs: number) => {
    inMemoryTimestamps = inMemoryTimestamps.filter(
      (timestamp) =>
        timestamp <= nowMs &&
        timestamp > nowMs - GUEST_CAMERA_ROLLING_WINDOW_MS
    );
    return inMemoryTimestamps;
  };

  const read = (nowMs: number) => {
    if (!persistenceAvailable) {
      return pruneMemory(nowMs);
    }
    try {
      const raw = storage!.getItem(STORAGE_KEY);
      if (raw === null) {
        inMemoryTimestamps = [];
        return inMemoryTimestamps;
      }
      inMemoryTimestamps = parseStoredTimestamps(raw, nowMs) ?? [];
      return inMemoryTimestamps;
    } catch {
      persistenceAvailable = false;
      return pruneMemory(nowMs);
    }
  };

  const save = (timestamps: number[]) => {
    inMemoryTimestamps = timestamps;
    const stored: StoredGuestCameraAllowance = {
      version: 1,
      successfulUsageTimestamps: timestamps
    };
    if (!persistenceAvailable) {
      return;
    }
    try {
      storage!.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      persistenceAvailable = false;
      // This is intentionally a soft, browser-local product limit.
    }
  };

  return {
    getSnapshot(): GuestCameraAllowanceSnapshot {
      return snapshotFor(read(validNow(now())));
    },

    async recordSuccessfulUsage(): Promise<GuestCameraAllowanceCharge> {
      const preflightNowMs = validNow(now());
      const preflightTimestamps = read(preflightNowMs);

      const charge = (nowMs: number): GuestCameraAllowanceCharge => {
        const timestamps = read(nowMs);
        const current = snapshotFor(timestamps);
        if (current.isExhausted) {
          return {
            charged: false,
            denialReason: "exhausted",
            snapshot: current
          };
        }

        const nextTimestamps = [...timestamps, nowMs].sort(
          (left, right) => left - right
        );
        save(nextTimestamps);
        return { charged: true, snapshot: snapshotFor(nextTimestamps) };
      };

      if (!persistenceAvailable) {
        return charge(preflightNowMs);
      }
      if (!lock) {
        return {
          charged: false,
          denialReason: "lock-unavailable",
          snapshot: snapshotFor(preflightTimestamps)
        };
      }

      try {
        return await lock.runExclusive(
          GUEST_CAMERA_ALLOWANCE_LOCK_NAME,
          () => charge(validNow(now()))
        );
      } catch {
        const failedAtMs = validNow(now());
        return {
          charged: false,
          denialReason: "lock-failed",
          snapshot: snapshotFor(read(failedAtMs))
        };
      }
    }
  };
}

export type GuestCameraAllowanceStore = ReturnType<
  typeof createGuestCameraAllowanceStore
>;
