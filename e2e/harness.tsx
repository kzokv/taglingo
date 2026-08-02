import { createRoot } from "react-dom/client";

import App from "../src/App";
import type { CurrencyCode } from "../src/domain/currencies";
import type { GuestReferenceRate } from "../src/fx/referenceRate";
import type { MemberPreferences } from "../src/member/memberPreferencesApi";
import type { CreateRecognizer } from "../src/recognition/useCameraRecognition";

function fixtureRate(
  source: CurrencyCode,
  target: CurrencyCode
): GuestReferenceRate {
  return {
    source,
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

const loadRate = async (source: CurrencyCode, target: CurrencyCode) =>
  fixtureRate(source, target);
const createFixtureRecognizer: CreateRecognizer = (_source, onProgress) => ({
  async prepare() {
    onProgress(1, "deterministic browser fixture ready");
  },
  async recognize(_image, pass = "focused") {
    return [
      {
        text: "4,142円",
        confidence: 96,
        box:
          pass === "discovery"
            ? { x: 880, y: 446, width: 160, height: 80 }
            : { x: 592, y: 111, width: 160, height: 80 }
      }
    ];
  },
  async terminate() {}
});
const memberPreferences: MemberPreferences = {
  ownerId: "user_browser_fixture",
  sourceCurrency: "JPY",
  targetCurrencies: ["USD", "TWD", "EUR"]
};
const memberMode =
  new URLSearchParams(window.location.search).get("mode") === "member";
const resolveFixtureCameraSupport = (sourceCurrency: CurrencyCode) =>
  sourceCurrency === "JPY";

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
      createRecognizer={createFixtureRecognizer}
      resolveCameraSupport={resolveFixtureCameraSupport}
      admission={
        <section aria-label="Fixture account">
          <button type="button">Sign out fixture account</button>
        </section>
      }
    />
  ) : (
    <App
      loadGuestRate={loadRate}
      createRecognizer={createFixtureRecognizer}
      resolveCameraSupport={resolveFixtureCameraSupport}
      admission={
        <section aria-label="Fixture member admission">
          <button type="button">Request fixture member access</button>
        </section>
      }
    />
  )
);
