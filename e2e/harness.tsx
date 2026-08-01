import { createRoot } from "react-dom/client";

import App from "../src/App";
import type { CurrencyCode } from "../src/domain/currencies";
import type { GuestReferenceRate } from "../src/fx/referenceRate";
import type { MemberPreferences } from "../src/member/memberPreferencesApi";

function fixtureRate(target: CurrencyCode): GuestReferenceRate {
  return {
    source: "JPY",
    target,
    direction: "source-to-target",
    value:
      target === "USD" ? "0.0067123" : target === "TWD" ? "0.22" : "0.0058",
    provider: "Frankfurter",
    method: "daily-blend",
    providerPublishedDate: "2026-07-30",
    fetchedAt: "2026-07-30T10:00:00.000Z",
    state: "fresh",
    attribution: "Frankfurter · deterministic browser fixture"
  };
}

const loadRate = async (_source: CurrencyCode, target: CurrencyCode) =>
  fixtureRate(target);
const memberPreferences: MemberPreferences = {
  ownerId: "user_browser_fixture",
  sourceCurrency: "JPY",
  targetCurrencies: ["USD", "TWD", "EUR"]
};
const memberMode =
  new URLSearchParams(window.location.search).get("mode") === "member";

createRoot(document.getElementById("root")!).render(
  memberMode ? (
    <App
      memberSession={{
        userId: memberPreferences.ownerId,
        getSessionToken: async () => "deterministic-session-token"
      }}
      loadMemberPreferences={async () => memberPreferences}
      saveMemberPreferences={async (preferences) => preferences}
      loadGuestRate={loadRate}
      admission={
        <section aria-label="Fixture account">
          <button type="button">Sign out fixture account</button>
        </section>
      }
    />
  ) : (
    <App
      loadGuestRate={loadRate}
      admission={
        <section aria-label="Fixture member admission">
          <button type="button">Request fixture member access</button>
        </section>
      }
    />
  )
);
