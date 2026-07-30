import {
  isCurrencyCode,
  SOURCE_CURRENCIES,
  type CurrencyCode
} from "../domain/currencies";
import type {
  GuestActor,
  RateRecordStore
} from "./guestFxGateway";
import {
  isIsoDate,
  isIsoTimestamp,
  isPositiveDecimalString,
  type RateRecord
} from "./referenceRate";

export interface D1Result {
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface RateRecordRow {
  source_currency: unknown;
  target_currency: unknown;
  decimal_value: unknown;
  provider: unknown;
  method: unknown;
  provider_published_date: unknown;
  fetched_at: unknown;
  attribution: unknown;
  etag: unknown;
}

const sourceCodes = new Set<string>(
  SOURCE_CURRENCIES.map(({ code }) => code)
);

function rowToRateRecord(row: RateRecordRow | null): RateRecord | null {
  if (
    !row ||
    typeof row.source_currency !== "string" ||
    !sourceCodes.has(row.source_currency) ||
    !isCurrencyCode(row.target_currency) ||
    row.source_currency === row.target_currency ||
    !isPositiveDecimalString(row.decimal_value) ||
    row.provider !== "Frankfurter" ||
    row.method !== "daily-blend" ||
    !isIsoDate(row.provider_published_date) ||
    !isIsoTimestamp(row.fetched_at) ||
    typeof row.attribution !== "string" ||
    !row.attribution.trim() ||
    (row.etag !== null && typeof row.etag !== "string")
  ) {
    return null;
  }

  return {
    source: row.source_currency as CurrencyCode,
    target: row.target_currency,
    value: row.decimal_value,
    provider: row.provider,
    method: row.method,
    providerPublishedDate: row.provider_published_date,
    fetchedAt: row.fetched_at,
    attribution: row.attribution,
    etag: row.etag
  };
}

export function createD1RateRecordStore(
  database: D1Database
): RateRecordStore {
  return {
    async find(source, target) {
      const row = await database
        .prepare(
          `SELECT source_currency, target_currency, decimal_value, provider,
                  method, provider_published_date, fetched_at, attribution, etag
             FROM fx_pair_records
            WHERE source_currency = ?1 AND target_currency = ?2`
        )
        .bind(source, target)
        .first<RateRecordRow>();
      return rowToRateRecord(row);
    },

    async claimRevalidation(source, target, at) {
      const leaseUntil = at.getTime() + 60_000;
      const claimed = await database
        .prepare(
          `INSERT INTO fx_revalidation_leases (
             source_currency, target_currency, lease_until
           ) VALUES (?1, ?2, ?3)
           ON CONFLICT(source_currency, target_currency) DO UPDATE SET
             lease_until = excluded.lease_until
           WHERE fx_revalidation_leases.lease_until <= ?4
           RETURNING lease_until`
        )
        .bind(source, target, leaseUntil, at.getTime())
        .first<{ lease_until: number }>();
      return claimed?.lease_until === leaseUntil;
    },

    async save(record) {
      const result = await database
        .prepare(
          `INSERT INTO fx_pair_records (
             source_currency, target_currency, decimal_value, provider, method,
             provider_published_date, fetched_at, attribution, etag
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT(source_currency, target_currency) DO UPDATE SET
             decimal_value = excluded.decimal_value,
             provider = excluded.provider,
             method = excluded.method,
             provider_published_date = excluded.provider_published_date,
             fetched_at = excluded.fetched_at,
             attribution = excluded.attribution,
             etag = excluded.etag`
        )
        .bind(
          record.source,
          record.target,
          record.value,
          record.provider,
          record.method,
          record.providerPublishedDate,
          record.fetchedAt,
          record.attribution,
          record.etag
        )
        .run();
      if (!result.success) {
        throw new Error("D1 did not persist the validated Reference Rate.");
      }
    }
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToBase64Url(new Uint8Array(hash));
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function safelyEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie");
  if (!cookies) {
    return null;
  }
  for (const entry of cookies.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) {
      return value.join("=") || null;
    }
  }
  return null;
}

const ACTOR_COOKIE = "taglingo_guest_actor";

export function createSignedGuestActorResolver(secret: string) {
  if (secret.length < 32) {
    throw new Error("GUEST_ACTOR_SECRET must contain at least 32 characters.");
  }

  return async (request: Request): Promise<GuestActor> => {
    const existing = cookieValue(request, ACTOR_COOKIE);
    if (existing) {
      const separator = existing.lastIndexOf(".");
      if (separator > 0) {
        const key = existing.slice(0, separator);
        const signature = existing.slice(separator + 1);
        const expected = await sign(key, secret);
        if (
          /^[0-9a-f-]{36}$/i.test(key) &&
          safelyEqual(signature, expected)
        ) {
          return { key };
        }
      }
    }

    const key = crypto.randomUUID();
    const signature = await sign(key, secret);
    return {
      key,
      setCookie: `${ACTOR_COOKIE}=${key}.${signature}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
    };
  };
}

export function createD1GuestRateLimiter(
  database: D1Database,
  {
    maxRequests = 30,
    windowMs = 60_000
  }: { maxRequests?: number; windowMs?: number } = {}
) {
  return async (
    actorKey: string,
    ipAddress: string,
    at: Date
  ): Promise<boolean> => {
    const bucketStart =
      Math.floor(at.getTime() / windowMs) * windowMs;
    const [actorHash, ipHash] = await Promise.all([
      digest(actorKey),
      digest(ipAddress)
    ]);
    const increment = (kind: "actor" | "ip", subjectHash: string) =>
      database
        .prepare(
          `INSERT INTO guest_fx_rate_limits (
             subject_kind, subject_hash, bucket_start, request_count
           ) VALUES (?1, ?2, ?3, 1)
           ON CONFLICT(subject_kind, subject_hash, bucket_start) DO UPDATE SET
             request_count = request_count + 1
           RETURNING request_count`
        )
        .bind(kind, subjectHash, bucketStart)
        .first<{ request_count: number }>();
    const [actorCount, ipCount] = await Promise.all([
      increment("actor", actorHash),
      increment("ip", ipHash)
    ]);
    return [actorCount, ipCount].every(
      (row) =>
        row !== null &&
        Number.isInteger(row.request_count) &&
        row.request_count <= maxRequests
    );
  };
}
