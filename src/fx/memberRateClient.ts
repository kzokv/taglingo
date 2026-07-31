import type { LoadGuestRate } from "./useGuestRate";
import { isGuestReferenceRate } from "./referenceRate";

export function createMemberRateLoader(userId: string): LoadGuestRate {
  return async (source, target, signal) => {
    const query = new URLSearchParams({
      ownerId: userId,
      source,
      target
    });
    const response = await fetch(`/api/member-fx?${query}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal
    });
    if (!response.ok) {
      throw new Error("An entitled Approved Member Reference Rate is unavailable.");
    }
    const payload: unknown = await response.json();
    if (!isGuestReferenceRate(payload, source, target, false)) {
      throw new Error("The Approved Member Reference Rate response was invalid.");
    }
    return payload;
  };
}
