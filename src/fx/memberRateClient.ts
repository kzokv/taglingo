import type { CurrencyCode, SourceCurrencyCode } from "../domain/currencies";
import {
  isGuestReferenceRate,
  type GuestReferenceRate
} from "./referenceRate";
import type { LoadGuestRate } from "./useGuestRate";
import {
  memberRequestHeaders,
  type GetMemberSessionToken
} from "../member/sessionToken";

interface PendingRate {
  source: SourceCurrencyCode;
  target: CurrencyCode;
  signal: AbortSignal;
  resolve(rate: GuestReferenceRate): void;
  reject(reason: unknown): void;
}

interface BatchRateResult {
  target?: unknown;
  rate?: unknown;
  error?: unknown;
}

export function createMemberRateLoader(
  userId: string,
  getSessionToken: GetMemberSessionToken
): LoadGuestRate {
  let pending: PendingRate[] = [];
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    const batch = pending;
    pending = [];
    const active = batch.filter(({ signal }) => !signal.aborted);
    batch
      .filter(({ signal }) => signal.aborted)
      .forEach(({ reject }) =>
        reject(new DOMException("The rate request was aborted.", "AbortError"))
      );
    const bySource = new Map<SourceCurrencyCode, PendingRate[]>();
    for (const item of active) {
      bySource.set(item.source, [
        ...(bySource.get(item.source) ?? []),
        item
      ]);
    }

    await Promise.all(
      [...bySource.entries()].map(async ([source, requests]) => {
        const targets = [...new Set(requests.map(({ target }) => target))];
        const query = new URLSearchParams({
          ownerId: userId,
          source,
          targets: targets.join(",")
        });
        let payload: unknown;
        try {
          const response = await fetch(`/api/member-fx?${query}`, {
            credentials: "same-origin",
            headers: await memberRequestHeaders(getSessionToken, {
              accept: "application/json"
            })
          });
          if (!response.ok) {
            throw new Error(
              "An entitled Approved Member Reference Rate is unavailable."
            );
          }
          payload = await response.json();
        } catch (error) {
          requests.forEach(({ signal, reject }) => {
            if (!signal.aborted) {
              reject(error);
            }
          });
          return;
        }
        const results =
          payload &&
          typeof payload === "object" &&
          "rates" in payload &&
          Array.isArray((payload as { rates: unknown }).rates)
            ? ((payload as { rates: BatchRateResult[] }).rates)
            : [];
        requests.forEach(({ target, signal, resolve, reject }) => {
          if (signal.aborted) {
            reject(
              new DOMException("The rate request was aborted.", "AbortError")
            );
            return;
          }
          const result = results.find(
            (candidate) => candidate.target === target
          );
          if (
            !result ||
            result.error !== undefined ||
            !isGuestReferenceRate(result.rate, source, target, false)
          ) {
            reject(
              new Error(
                "The Approved Member Reference Rate response was invalid."
              )
            );
            return;
          }
          resolve(result.rate);
        });
      })
    );
  };

  return (source, target, signal) =>
    new Promise<GuestReferenceRate>((resolve, reject) => {
      pending.push({
        source: source as SourceCurrencyCode,
        target,
        signal,
        resolve,
        reject
      });
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => void flush());
      }
    });
}
