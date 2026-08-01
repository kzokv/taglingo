import type { CurrencyCode } from "../domain/currencies";
import { hasExactKeys } from "../domain/exactObject";

export interface RateRecord {
  source: CurrencyCode;
  target: CurrencyCode;
  value: string;
  provider: "Frankfurter";
  method: "daily-blend";
  providerPublishedDate: string;
  fetchedAt: string;
  attribution: string;
  etag: string | null;
}

export interface GuestReferenceRate {
  source: CurrencyCode;
  target: CurrencyCode;
  direction: "source-to-target";
  value: string;
  provider: "Frankfurter";
  method: "daily-blend";
  providerPublishedDate: string;
  fetchedAt: string;
  state: "fresh" | "cached" | "last-known-good" | "offline";
  attribution: string;
}

export function isGuestReferenceRate(
  value: unknown,
  source: CurrencyCode,
  target: CurrencyCode,
  allowOffline = true
): value is GuestReferenceRate {
  if (
    !hasExactKeys(value, [
      "source",
      "target",
      "direction",
      "value",
      "provider",
      "method",
      "providerPublishedDate",
      "fetchedAt",
      "state",
      "attribution"
    ])
  ) {
    return false;
  }
  const candidate = value;
  return (
    candidate.source === source &&
    candidate.target === target &&
    candidate.direction === "source-to-target" &&
    isPositiveDecimalString(candidate.value) &&
    candidate.provider === "Frankfurter" &&
    candidate.method === "daily-blend" &&
    isIsoDate(candidate.providerPublishedDate) &&
    isIsoTimestamp(candidate.fetchedAt) &&
    (candidate.state === "fresh" ||
      candidate.state === "cached" ||
      candidate.state === "last-known-good" ||
      (allowOffline && candidate.state === "offline")) &&
    typeof candidate.attribution === "string" &&
    candidate.attribution.trim().length > 0
  );
}

export function isPositiveDecimalString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
