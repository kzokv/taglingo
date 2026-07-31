import { useCallback, useEffect, useRef, useState } from "react";

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
export type GuestRateViews = Partial<
  Record<CurrencyCode, GuestRateView>
>;

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
  return (
    useGuestRates(source, [target], loadGuestRate)[target] ?? {
      phase: "loading",
      rate: null,
      error: null,
      retry: () => undefined
    }
  );
}

export function useGuestRates(
  source: CurrencyCode,
  targets: CurrencyCode[],
  loadGuestRate: LoadGuestRate
): GuestRateViews {
  const targetKey = targets.join(",");
  const [views, setViews] = useState<
    Partial<Record<CurrencyCode, GuestRateState>>
  >({});
  const controllers = useRef(
    new Map<CurrencyCode, AbortController>()
  );
  const loadTarget = useCallback(
    (target: CurrencyCode) => {
      controllers.current.get(target)?.abort();
      if (source === target) {
        setViews((current) => ({
          ...current,
          [target]: {
            phase: "error",
            rate: null,
            error: "Choose a different Target Currency.",
            reason: "unavailable"
          }
        }));
        return;
      }
      const controller = new AbortController();
      controllers.current.set(target, controller);
      setViews((current) => ({
        ...current,
        [target]: { phase: "loading", rate: null, error: null }
      }));
      void loadGuestRate(source, target, controller.signal)
        .then((rate) => {
          if (!controller.signal.aborted) {
            setViews((current) => ({
              ...current,
              [target]: { phase: "ready", rate, error: null }
            }));
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            const expired =
              error instanceof GuestRateLoadError &&
              error.reason === "expired";
            setViews((current) => ({
              ...current,
              [target]: {
                phase: "error",
                rate: null,
                error: expired
                  ? "The Rate Snapshot expired after seven days. Reconnect to refresh it."
                  : "A validated Reference Rate is unavailable. Reconnect and try again.",
                reason: expired ? "expired" : "unavailable"
              }
            }));
          }
        });
    },
    [loadGuestRate, source]
  );

  useEffect(() => {
    const activeTargets = targetKey
      .split(",")
      .filter(Boolean) as CurrencyCode[];
    for (const [target, controller] of controllers.current) {
      if (!activeTargets.includes(target)) {
        controller.abort();
        controllers.current.delete(target);
      }
    }
    activeTargets.forEach(loadTarget);
    const refreshOnResume = () => {
      if (document.visibilityState === "visible") {
        activeTargets.forEach(loadTarget);
      }
    };
    document.addEventListener("visibilitychange", refreshOnResume);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnResume);
      controllers.current.forEach((controller) => controller.abort());
    };
  }, [loadTarget, targetKey]);

  return Object.fromEntries(
    targets.map((target) => [
      target,
      {
        ...(views[target] ?? {
          phase: "loading",
          rate: null,
          error: null
        }),
        retry: () => loadTarget(target)
      }
    ])
  );
}
