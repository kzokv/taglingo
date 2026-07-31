import { useCallback, useEffect, useState } from "react";

import type { CurrencyCode } from "../domain/currencies";
import { GuestRateLoadError } from "./browserRateSnapshot";
import {
  isGuestReferenceRate,
  type GuestReferenceRate
} from "./referenceRate";

export type LoadGuestRate = (
  source: CurrencyCode,
  target: CurrencyCode,
  signal: AbortSignal
) => Promise<GuestReferenceRate>;

type GuestRateState =
  | { phase: "loading"; rate: null; error: null }
  | { phase: "ready"; rate: GuestReferenceRate; error: null }
  | {
      phase: "error";
      rate: null;
      error: string;
      reason: "expired" | "unavailable";
    };

export type GuestRateView = GuestRateState & { retry: () => void };

export const loadGuestRateFromGateway: LoadGuestRate = async (
  source,
  target,
  signal
) => {
  const query = new URLSearchParams({ source, target });
  const response = await fetch(`/api/fx?${query}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw new Error("A validated Reference Rate is unavailable.");
  }
  const payload: unknown = await response.json();
  if (!isGuestReferenceRate(payload, source, target, false)) {
    throw new Error("The Reference Rate response was invalid.");
  }
  return payload;
};

export function useGuestRate(
  source: CurrencyCode,
  target: CurrencyCode,
  loadGuestRate: LoadGuestRate
): GuestRateView {
  const [view, setView] = useState<GuestRateState>({
    phase: "loading",
    rate: null,
    error: null
  });
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  useEffect(() => {
    let controller: AbortController | null = null;
    if (source === target) {
      setView({
        phase: "error",
        rate: null,
        error: "Choose a different Target Currency.",
        reason: "unavailable"
      });
      return undefined;
    }

    const load = () => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      setView({ phase: "loading", rate: null, error: null });
      void loadGuestRate(source, target, currentController.signal)
        .then((rate) => {
          if (!currentController.signal.aborted) {
            setView({ phase: "ready", rate, error: null });
          }
        })
        .catch((error: unknown) => {
          if (!currentController.signal.aborted) {
            const expired =
              error instanceof GuestRateLoadError &&
              error.reason === "expired";
            setView({
              phase: "error",
              rate: null,
              error: expired
                ? "The Rate Snapshot expired after seven days. Reconnect to refresh it."
                : "A validated Reference Rate is unavailable. Reconnect and try again.",
              reason: expired ? "expired" : "unavailable"
            });
          }
        });
    };
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };
    load();
    document.addEventListener("visibilitychange", refreshOnResume);

    return () => {
      document.removeEventListener("visibilitychange", refreshOnResume);
      controller?.abort();
    };
  }, [loadGuestRate, retryCount, source, target]);

  return { ...view, retry };
}
