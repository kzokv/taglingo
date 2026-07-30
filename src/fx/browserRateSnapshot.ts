import type { CurrencyCode } from "../domain/currencies";
import {
  isGuestReferenceRate,
  type GuestReferenceRate
} from "./referenceRate";

export const RATE_SNAPSHOT_STORAGE_KEY = "taglingo.rate-snapshot.v1";

const MAX_SNAPSHOT_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type SnapshotStatus =
  | { status: "eligible"; rate: GuestReferenceRate }
  | { status: "expired" }
  | { status: "missing" };

interface SnapshotEnvelope {
  version: 1;
  records: Record<string, unknown>;
}

export interface BrowserRateSnapshotStore {
  retainActivePairs(
    pairs: readonly {
      source: CurrencyCode;
      target: CurrencyCode;
    }[]
  ): void;
  find(
    source: CurrencyCode,
    target: CurrencyCode,
    now: Date
  ): SnapshotStatus;
  save(rate: GuestReferenceRate): void;
}

export class GuestRateLoadError extends Error {
  constructor(
    public readonly reason: "expired" | "unavailable",
    options?: ErrorOptions
  ) {
    super(
      reason === "expired"
        ? "The Rate Snapshot expired after seven days."
        : "A validated Reference Rate is unavailable.",
      options
    );
    this.name = "GuestRateLoadError";
  }
}

function pairKey(source: CurrencyCode, target: CurrencyCode): string {
  return `${source}/${target}`;
}

function readEnvelope(storage: Storage | undefined): SnapshotEnvelope {
  if (!storage) {
    return { version: 1, records: {} };
  }
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(RATE_SNAPSHOT_STORAGE_KEY) ?? ""
    );
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, records: {} };
    }
    const candidate = parsed as Partial<SnapshotEnvelope>;
    if (
      candidate.version !== 1 ||
      !candidate.records ||
      typeof candidate.records !== "object" ||
      Array.isArray(candidate.records)
    ) {
      return { version: 1, records: {} };
    }
    return {
      version: 1,
      records: candidate.records
    };
  } catch {
    return { version: 1, records: {} };
  }
}

function snapshotStatus(
  rate: GuestReferenceRate,
  now: Date
): SnapshotStatus {
  const publishedAt = Date.parse(
    `${rate.providerPublishedDate}T00:00:00.000Z`
  );
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const age = today - publishedAt;
  if (!Number.isFinite(age) || age < 0) {
    return { status: "missing" };
  }
  return age <= MAX_SNAPSHOT_AGE_DAYS * DAY_MS
    ? { status: "eligible", rate }
    : { status: "expired" };
}

function storableRate(rate: GuestReferenceRate): GuestReferenceRate {
  return {
    source: rate.source,
    target: rate.target,
    direction: "source-to-target",
    value: rate.value,
    provider: rate.provider,
    method: rate.method,
    providerPublishedDate: rate.providerPublishedDate,
    fetchedAt: rate.fetchedAt,
    state: rate.state,
    attribution: rate.attribution
  };
}

function writeEnvelope(
  storage: Storage | undefined,
  envelope: SnapshotEnvelope
): void {
  try {
    storage?.setItem(RATE_SNAPSHOT_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage can be unavailable or full; the online result remains usable.
  }
}

export function createBrowserRateSnapshotStore(
  storage: Storage | undefined
): BrowserRateSnapshotStore {
  return {
    retainActivePairs(pairs) {
      const envelope = readEnvelope(storage);
      const activeKeys = new Set(
        pairs.map(({ source, target }) => pairKey(source, target))
      );
      envelope.records = Object.fromEntries(
        Object.entries(envelope.records).filter(([key]) => activeKeys.has(key))
      );
      writeEnvelope(storage, envelope);
    },

    find(source, target, now) {
      const candidate = readEnvelope(storage).records[pairKey(source, target)];
      if (!isGuestReferenceRate(candidate, source, target, false)) {
        return { status: "missing" };
      }
      return snapshotStatus(candidate, now);
    },

    save(rate) {
      if (!isGuestReferenceRate(rate, rate.source, rate.target, false)) {
        return;
      }
      const envelope = readEnvelope(storage);
      envelope.records[pairKey(rate.source, rate.target)] = storableRate(rate);
      writeEnvelope(storage, envelope);
    }
  };
}

export function createOfflineGuestRateLoader({
  loadOnline,
  store,
  now = () => new Date()
}: {
  loadOnline: (
    source: CurrencyCode,
    target: CurrencyCode,
    signal: AbortSignal
  ) => Promise<GuestReferenceRate>;
  store: BrowserRateSnapshotStore;
  now?: () => Date;
}) {
  return async (
    source: CurrencyCode,
    target: CurrencyCode,
    signal: AbortSignal
  ): Promise<GuestReferenceRate> => {
    try {
      const rate = await loadOnline(source, target, signal);
      if (!isGuestReferenceRate(rate, source, target, false)) {
        throw new GuestRateLoadError("unavailable");
      }
      const onlineStatus = snapshotStatus(rate, now());
      if (onlineStatus.status === "missing") {
        throw new GuestRateLoadError("unavailable");
      }
      if (onlineStatus.status === "expired") {
        throw new GuestRateLoadError("expired");
      }
      store.save(rate);
      return rate;
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason ?? error;
      }
      const cached = store.find(source, target, now());
      if (cached.status === "eligible") {
        return { ...cached.rate, state: "offline" };
      }
      if (
        cached.status === "expired" ||
        (error instanceof GuestRateLoadError && error.reason === "expired")
      ) {
        throw new GuestRateLoadError("expired", { cause: error });
      }
      throw new GuestRateLoadError("unavailable", { cause: error });
    }
  };
}
