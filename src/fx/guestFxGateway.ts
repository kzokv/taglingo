import {
  isCurrencyCode,
  SOURCE_CURRENCIES,
  type CurrencyCode
} from "../domain/currencies";
import {
  isIsoDate,
  type GuestReferenceRate,
  type RateRecord
} from "./referenceRate";

export type { GuestReferenceRate, RateRecord } from "./referenceRate";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const FRANKFURTER_ORIGIN = "https://api.frankfurter.dev";

export interface RateRecordStore {
  find(
    source: CurrencyCode,
    target: CurrencyCode
  ): Promise<RateRecord | null>;
  claimRevalidation(
    source: CurrencyCode,
    target: CurrencyCode,
    at: Date
  ): Promise<boolean>;
  save(record: RateRecord): Promise<void>;
}

export interface GuestActor {
  key: string;
  setCookie?: string;
}

export interface GuestFxHandlerDependencies {
  store: RateRecordStore;
  providerFetch: typeof fetch;
  consumeGuestLimit: (
    actorKey: string,
    ipAddress: string,
    at: Date
  ) => Promise<boolean>;
  resolveGuestActor: (request: Request) => Promise<GuestActor>;
  now?: () => Date;
  frankfurterOrigin?: string;
  rateLimitLabel?: "Guest" | "Approved Member";
}

interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
  providers?: Array<{
    key: string;
    date: string;
    rate: number;
    excluded?: boolean;
  }>;
}

function guestGatewayJsonResponse(
  body: unknown,
  status: number,
  setCookie?: string
): Response {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8"
  });
  if (setCookie) {
    headers.set("set-cookie", setCookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isSourceCurrency(value: string | null): value is CurrencyCode {
  return SOURCE_CURRENCIES.some(({ code }) => code === value);
}

function parsePair(request: Request):
  | { source: CurrencyCode; target: CurrencyCode }
  | null {
  if (request.method !== "GET" || request.url.length > 512) {
    return null;
  }

  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== 2 ||
    !keys.includes("source") ||
    !keys.includes("target")
  ) {
    return null;
  }

  const source = url.searchParams.get("source");
  const target = url.searchParams.get("target");
  if (
    !isSourceCurrency(source) ||
    !isCurrencyCode(target) ||
    source === target
  ) {
    return null;
  }
  return { source, target };
}

function toPlainDecimal(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const text = String(value);
  if (!/[eE]/.test(text)) {
    return text;
  }

  const [coefficient, exponentText] = text.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const [integer, fraction = ""] = coefficient.split(".");
  const digits = `${integer.replace("-", "")}${fraction}`;
  const decimalPosition = integer.replace("-", "").length + exponent;
  const sign = value < 0 ? "-" : "";
  if (decimalPosition <= 0) {
    return `${sign}0.${"0".repeat(-decimalPosition)}${digits}`;
  }
  if (decimalPosition >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(
    decimalPosition
  )}`;
}

function parseProviderRate(
  payload: unknown,
  source: CurrencyCode,
  target: CurrencyCode,
  fetchedAt: string,
  etag: string | null
): RateRecord | null {
  if (!Array.isArray(payload) || payload.length !== 1) {
    return null;
  }
  const candidate = payload[0] as Partial<FrankfurterRate>;
  const value =
    typeof candidate.rate === "number"
      ? toPlainDecimal(candidate.rate)
      : null;
  if (
    candidate.base !== source ||
    candidate.quote !== target ||
    !isIsoDate(candidate.date) ||
    !value ||
    (candidate.providers !== undefined &&
      (!Array.isArray(candidate.providers) ||
        candidate.providers.some(
          (provider) =>
            !provider ||
            typeof provider !== "object" ||
            typeof provider.key !== "string" ||
            !provider.key.trim() ||
            !isIsoDate(provider.date) ||
            typeof provider.rate !== "number" ||
            !toPlainDecimal(provider.rate) ||
            (provider.excluded !== undefined &&
              typeof provider.excluded !== "boolean")
        )))
  ) {
    return null;
  }

  const providers = candidate.providers
    ?.filter((provider) => !provider.excluded)
    .map((provider) => provider.key.trim());
  return {
    source,
    target,
    value,
    provider: "Frankfurter",
    method: "daily-blend",
    providerPublishedDate: candidate.date,
    fetchedAt,
    attribution:
      providers?.length
        ? `Frankfurter · ${providers.join(", ")}`
        : "Frankfurter",
    etag
  };
}

function toGuestReferenceRate(
  record: RateRecord,
  state: GuestReferenceRate["state"]
): GuestReferenceRate {
  return {
    source: record.source,
    target: record.target,
    direction: "source-to-target",
    value: record.value,
    provider: record.provider,
    method: record.method,
    providerPublishedDate: record.providerPublishedDate,
    fetchedAt: record.fetchedAt,
    state,
    attribution: record.attribution
  };
}

function isFresh(record: RateRecord, now: Date): boolean {
  const age = now.getTime() - new Date(record.fetchedAt).getTime();
  return (
    Number.isFinite(age) &&
    age >= 0 &&
    age < SIX_HOURS_MS &&
    isLastKnownGoodEligible(record, now)
  );
}

function isLastKnownGoodEligible(record: RateRecord, now: Date): boolean {
  if (!isIsoDate(record.providerPublishedDate)) {
    return false;
  }
  const publishedAt = Date.parse(
    `${record.providerPublishedDate}T00:00:00.000Z`
  );
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const age = today - publishedAt;
  return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
}

export function createGuestFxHandler({
  store,
  providerFetch,
  consumeGuestLimit,
  resolveGuestActor,
  now = () => new Date(),
  frankfurterOrigin = FRANKFURTER_ORIGIN,
  rateLimitLabel = "Guest"
}: GuestFxHandlerDependencies) {
  const revalidations = new Map<
    string,
    Promise<{
      record: RateRecord;
      state: "fresh" | "cached";
    } | null>
  >();

  return async (request: Request): Promise<Response> => {
    const pair = parsePair(request);
    if (!pair) {
      return guestGatewayJsonResponse(
        {
          error:
            "Use GET with one valid Source Currency and one distinct Target Currency."
        },
        400
      );
    }

    const actor = await resolveGuestActor(request);
    const ipAddress = request.headers.get("cf-connecting-ip") ?? "unknown";
    const requestedAt = now();
    if (!(await consumeGuestLimit(actor.key, ipAddress, requestedAt))) {
      return guestGatewayJsonResponse(
        {
          error: `${rateLimitLabel} Reference Rate limit exceeded. Try again shortly.`
        },
        429,
        actor.setCookie
      );
    }

    const stored = await store.find(pair.source, pair.target);
    if (stored && isFresh(stored, requestedAt)) {
      return guestGatewayJsonResponse(
        toGuestReferenceRate(stored, "cached"),
        200,
        actor.setCookie
      );
    }

    const pairKey = `${pair.source}/${pair.target}`;
    let revalidation = revalidations.get(pairKey);
    if (!revalidation) {
      revalidation = (async () => {
        if (
          !(await store.claimRevalidation(
            pair.source,
            pair.target,
            requestedAt
          ))
        ) {
          return null;
        }
        const providerUrl = new URL(
          "/v2/rates",
          frankfurterOrigin.endsWith("/")
            ? frankfurterOrigin
            : `${frankfurterOrigin}/`
        );
        providerUrl.searchParams.set("base", pair.source);
        providerUrl.searchParams.set("quotes", pair.target);
        providerUrl.searchParams.set("expand", "providers");
        let providerResponse: Response;
        try {
          providerResponse = await providerFetch(providerUrl.toString(), {
            headers: {
              accept: "application/json",
              ...(stored?.etag ? { "if-none-match": stored.etag } : {})
            }
          });
        } catch {
          return null;
        }

        if (
          providerResponse.status === 304 &&
          stored &&
          isLastKnownGoodEligible(stored, requestedAt)
        ) {
          const revalidated = {
            ...stored,
            fetchedAt: requestedAt.toISOString()
          };
          await store.save(revalidated);
          return { record: revalidated, state: "cached" as const };
        }
        if (!providerResponse.ok) {
          return null;
        }

        let payload: unknown;
        try {
          payload = await providerResponse.json();
        } catch {
          return null;
        }
        const record = parseProviderRate(
          payload,
          pair.source,
          pair.target,
          requestedAt.toISOString(),
          providerResponse.headers.get("etag")
        );
        if (!record || !isLastKnownGoodEligible(record, requestedAt)) {
          return null;
        }
        await store.save(record);
        return { record, state: "fresh" as const };
      })();
      revalidations.set(pairKey, revalidation);
      const clearRevalidation = () => {
        if (revalidations.get(pairKey) === revalidation) {
          revalidations.delete(pairKey);
        }
      };
      void revalidation.then(clearRevalidation, clearRevalidation);
    }

    const result = await revalidation;
    if (result) {
      return guestGatewayJsonResponse(
        toGuestReferenceRate(result.record, result.state),
        200,
        actor.setCookie
      );
    }
    if (stored && isLastKnownGoodEligible(stored, requestedAt)) {
      return guestGatewayJsonResponse(
        toGuestReferenceRate(stored, "last-known-good"),
        200,
        actor.setCookie
      );
    }
    return guestGatewayJsonResponse(
      { error: "A validated Reference Rate is unavailable." },
      502,
      actor.setCookie
    );
  };
}
