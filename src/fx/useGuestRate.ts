import { useCallback, useEffect, useRef, useState } from "react";

import type { CurrencyCode } from "../domain/currencies";
import {
  GuestRateLoadError,
  type ReferenceRateFailureReason
} from "./browserRateSnapshot";
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
      reason: ReferenceRateFailureReason;
    };

interface GuestRateSnapshot {
  source: CurrencyCode;
  refreshKey: unknown;
  state: GuestRateState;
}

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
    if (response.status === 429) {
      throw new GuestRateLoadError("quota");
    }
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
  loadGuestRate: LoadGuestRate,
  refreshKey: unknown = 0
): GuestRateViews {
  const targetKey = targets.join(",");
  const [views, setViews] = useState<
    Partial<Record<CurrencyCode, GuestRateSnapshot>>
  >({});
  const controllers = useRef(
    new Map<CurrencyCode, AbortController>()
  );
  const publishView = useCallback(
    (target: CurrencyCode, state: GuestRateState) => {
      setViews((current) => ({
        ...current,
        [target]: { source, refreshKey, state }
      }));
    },
    [refreshKey, source]
  );
  const loadTarget = useCallback(
    (target: CurrencyCode) => {
      controllers.current.get(target)?.abort();
      if (source === target) {
        publishView(target, {
          phase: "error",
          rate: null,
          error: "Choose a different Target Currency.",
          reason: "unavailable"
        });
        return;
      }
      const controller = new AbortController();
      controllers.current.set(target, controller);
      publishView(target, { phase: "loading", rate: null, error: null });
      void loadGuestRate(source, target, controller.signal)
        .then((rate) => {
          if (!controller.signal.aborted) {
            publishView(target, { phase: "ready", rate, error: null });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            const reason =
              error instanceof GuestRateLoadError
                ? error.reason
                : "unavailable";
            const errorMessage = {
              expired:
                "The Rate Snapshot expired after seven days. Reconnect to refresh it.",
              quota:
                "The Reference Rate request limit reached its safe quota. Wait briefly, then try again.",
              unauthenticated:
                "Your account session expired. Sign in again before retrying this Reference Rate.",
              unauthorized:
                "Approved Member access no longer authorizes this Reference Rate. Continue with Guest settings or contact the owner.",
              unavailable:
                "A validated Reference Rate is unavailable. Reconnect and try again."
            } satisfies Record<typeof reason, string>;
            publishView(target, {
              phase: "error",
              rate: null,
              error: errorMessage[reason],
              reason
            });
          }
        });
    },
    [loadGuestRate, publishView, source]
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
  }, [loadTarget, refreshKey, targetKey]);

  return Object.fromEntries(
    targets.map((target) => {
      const snapshot = views[target];
      const state =
        snapshot &&
        snapshot.source === source &&
        Object.is(snapshot.refreshKey, refreshKey)
          ? snapshot.state
          : {
              phase: "loading" as const,
              rate: null,
              error: null
            };
      return [
        target,
        {
          ...state,
          retry: () => loadTarget(target)
        }
      ];
    })
  );
}
