import { useEffect, useState } from "react";

import type { CurrencyCode } from "../domain/currencies";
import {
  isIsoDate,
  isIsoTimestamp,
  isPositiveDecimalString,
  type GuestReferenceRate
} from "./referenceRate";

export type LoadGuestRate = (
  source: CurrencyCode,
  target: CurrencyCode,
  signal: AbortSignal
) => Promise<GuestReferenceRate>;

export type GuestRateView =
  | { phase: "loading"; rate: null; error: null }
  | { phase: "ready"; rate: GuestReferenceRate; error: null }
  | { phase: "error"; rate: null; error: string };

function isGuestReferenceRate(
  value: unknown,
  source: CurrencyCode,
  target: CurrencyCode
): value is GuestReferenceRate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<GuestReferenceRate>;
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
      candidate.state === "last-known-good") &&
    typeof candidate.attribution === "string"
  );
}

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
  if (!isGuestReferenceRate(payload, source, target)) {
    throw new Error("The Reference Rate response was invalid.");
  }
  return payload;
};

export function useGuestRate(
  source: CurrencyCode,
  target: CurrencyCode,
  loadGuestRate: LoadGuestRate
): GuestRateView {
  const [view, setView] = useState<GuestRateView>({
    phase: "loading",
    rate: null,
    error: null
  });

  useEffect(() => {
    let controller: AbortController | null = null;
    if (source === target) {
      setView({
        phase: "error",
        rate: null,
        error: "Choose a different Target Currency."
      });
      return;
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
        .catch(() => {
          if (!currentController.signal.aborted) {
            setView({
              phase: "error",
              rate: null,
              error:
                "A validated Reference Rate is unavailable. Try again later."
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
  }, [loadGuestRate, source, target]);

  return view;
}
