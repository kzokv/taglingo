// PROTOTYPE — Final camera-access policy agreed during Wayfinder.
// Open in development with ?prototype=camera-policy.
import { useMemo, useState } from "react";

import { SOURCE_CURRENCIES, type SourceCurrencyCode } from "../domain/currencies";
import "./CameraPolicyPrototype.css";

type ShopperKind = "guest" | "member";
type CameraScenario = "searching" | "clear" | "uncertain";
type ResultBehavior = "automatic" | "confirm";

const GUEST_CAMERA_CURRENCIES = new Set<SourceCurrencyCode>([
  "AUD",
  "EUR",
  "JPY",
  "TWD",
  "USD"
]);
const GUEST_USAGE_LIMIT = 10;
const PRICE_SAMPLES: Partial<Record<SourceCurrencyCode, string>> = {
  AUD: "$9.98",
  EUR: "€1,06",
  JPY: "￥4,142",
  TWD: "NT$30",
  USD: "$3.99"
};

function CameraStage({
  scenario,
  sourceCurrency
}: {
  scenario: CameraScenario;
  sourceCurrency: SourceCurrencyCode;
}) {
  const detected = scenario === "clear";
  const sample = PRICE_SAMPLES[sourceCurrency] ?? `${sourceCurrency} 4,142`;
  const status = detected
    ? `Focused · ${sample}`
    : scenario === "uncertain"
      ? "Nothing reliable yet"
      : "Searching…";

  return (
    <section className={`policy-camera scenario-${scenario}`} aria-label="Simulated camera">
      <div className="policy-camera-topline">
        <span>{sourceCurrency}</span>
        <span>Recognition stays on this device</span>
      </div>
      <div className="simulated-tag" aria-hidden="true">
        <small>SIMULATED TAG</small>
        <strong>{sample}</strong>
        <span>{sourceCurrency}</span>
      </div>
      <div className="policy-capture-guide">
        <i />
        <span>{status}</span>
      </div>
      {detected ? (
        <div className="detection-outline" aria-hidden="true">
          {sample}
        </div>
      ) : null}
    </section>
  );
}

function ScenarioButtons({
  scenario,
  onChange
}: {
  scenario: CameraScenario;
  onChange: (scenario: CameraScenario) => void;
}) {
  return (
    <div className="scenario-buttons" aria-label="Simulated recognition outcome">
      <span>Simulate recognition:</span>
      {(["searching", "clear", "uncertain"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={scenario === value ? "selected" : undefined}
          onClick={() => onChange(value)}
        >
          {value === "searching"
            ? "No price yet"
            : value === "clear"
              ? "Successful detection"
              : "Uncertain read"}
        </button>
      ))}
    </div>
  );
}

export default function CameraPolicyPrototype() {
  const [shopper, setShopper] = useState<ShopperKind>("guest");
  const [sourceCurrency, setSourceCurrency] =
    useState<SourceCurrencyCode>("JPY");
  const [scenario, setScenario] = useState<CameraScenario>("clear");
  const [guestUsages, setGuestUsages] = useState(8);
  const [sessionCharged, setSessionCharged] = useState(false);
  const [fallbackSeconds, setFallbackSeconds] = useState(5);
  const [resultBehavior, setResultBehavior] =
    useState<ResultBehavior>("automatic");

  const guestCurrencyAllowed = GUEST_CAMERA_CURRENCIES.has(sourceCurrency);
  const quotaAvailable = guestUsages < GUEST_USAGE_LIMIT;
  const cameraAvailable =
    shopper === "member" || (guestCurrencyAllowed && quotaAvailable);
  const remaining = Math.max(0, GUEST_USAGE_LIMIT - guestUsages);
  const detectionVisible = cameraAvailable && scenario === "clear";
  const effectiveFallbackSeconds = shopper === "guest" ? 5 : fallbackSeconds;
  const priceSample =
    PRICE_SAMPLES[sourceCurrency] ?? `${sourceCurrency} 4,142`;

  const cameraMessage = useMemo(() => {
    if (shopper === "member") {
      return "Camera recognition is available for every Source Currency.";
    }
    if (!guestCurrencyAllowed) {
      return `${sourceCurrency} remains available through unlimited Manual Price Entry.`;
    }
    if (!quotaAvailable) {
      return "Camera refreshes when the next successful usage leaves the rolling hour.";
    }
    return `${remaining} successful camera usages remain in this browser.`;
  }, [guestCurrencyAllowed, quotaAvailable, remaining, shopper, sourceCurrency]);

  const beginNewSession = () => {
    setSessionCharged(false);
    setScenario("searching");
  };

  const simulateScenario = (next: CameraScenario) => {
    setScenario(next);
    if (
      shopper === "guest" &&
      next === "clear" &&
      cameraAvailable &&
      !sessionCharged
    ) {
      setGuestUsages((current) => Math.min(GUEST_USAGE_LIMIT, current + 1));
      setSessionCharged(true);
    }
  };

  return (
    <main className="camera-policy-prototype">
      <header className="policy-header">
        <div>
          <span className="prototype-label">FINAL POLICY PROTOTYPE</span>
          <h1>One camera, clear access rules</h1>
          <p>
            Recognition rules stay fixed. Membership changes access and experience
            settings—not what counts as a price.
          </p>
        </div>
        <div className="shopper-switcher" aria-label="Shopper type">
          {(["guest", "member"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={shopper === kind ? "selected" : undefined}
              onClick={() => setShopper(kind)}
            >
              {kind === "guest" ? "Guest" : "Approved Member"}
            </button>
          ))}
        </div>
      </header>

      <div className="policy-layout">
        <section className="policy-controls">
          <label>
            Source Currency
            <select
              value={sourceCurrency}
              onChange={(event) =>
                setSourceCurrency(event.target.value as SourceCurrencyCode)
              }
            >
              {SOURCE_CURRENCIES.map((currency) => {
                const guestManualOnly =
                  shopper === "guest" &&
                  !GUEST_CAMERA_CURRENCIES.has(currency.code);
                return (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currency.name}
                    {guestManualOnly ? " · Manual only for Guests" : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <div className={`availability-card ${cameraAvailable ? "available" : "limited"}`}>
            <span>{cameraAvailable ? "Camera available" : "Camera unavailable"}</span>
            <strong>
              {shopper === "member"
                ? `All ${SOURCE_CURRENCIES.length} currencies · unlimited`
                : `${remaining} of ${GUEST_USAGE_LIMIT} successful usages left`}
            </strong>
            <p>{cameraMessage}</p>
            <button type="button" disabled={!cameraAvailable} onClick={beginNewSession}>
              Start a new camera session
            </button>
            <button type="button" className="manual-button">
              Enter price manually · unlimited
            </button>
          </div>

          {shopper === "guest" ? (
            <aside className="guest-rule-card">
              <strong>Guest camera currencies</strong>
              <span>USD · AUD · JPY · TWD · EUR</span>
              <p>
                A usage is charged only when a session produces its first Focused
                Price. Failed sessions and later prices in that session are free.
              </p>
              <button type="button" onClick={() => setGuestUsages(0)}>
                Simulate hourly refresh
              </button>
            </aside>
          ) : (
            <section className="settings-card">
              <div>
                <span>Member settings</span>
                <h2>Adjust the experience</h2>
              </div>
              <label>
                Show Manual Price Entry
                <select
                  value={fallbackSeconds}
                  onChange={(event) =>
                    setFallbackSeconds(Number(event.target.value))
                  }
                >
                  <option value={3}>After 3 seconds</option>
                  <option value={5}>After 5 seconds</option>
                  <option value={10}>After 10 seconds</option>
                  <option value={30}>Only when I ask</option>
                </select>
              </label>
              <label>
                When a Focused Price appears
                <select
                  value={resultBehavior}
                  onChange={(event) =>
                    setResultBehavior(event.target.value as ResultBehavior)
                  }
                >
                  <option value="automatic">Convert automatically</option>
                  <option value="confirm">Ask before using it</option>
                </select>
              </label>
              <div className="locked-rule">
                <strong>Recognition rules are fixed</strong>
                <span>
                  Currency notation · confidence · evidence · stability cannot be
                  changed by a shopper.
                </span>
              </div>
            </section>
          )}
        </section>

        <section className="camera-column">
          {cameraAvailable ? (
            <CameraStage scenario={scenario} sourceCurrency={sourceCurrency} />
          ) : (
            <div className="camera-disabled">
              <span>Camera button disabled</span>
              <strong>Manual Price Entry is still ready</strong>
              <p>{cameraMessage}</p>
            </div>
          )}

          {cameraAvailable ? (
            <ScenarioButtons scenario={scenario} onChange={simulateScenario} />
          ) : null}

          <section className="result-card">
            <span>
              {detectionVisible
                ? resultBehavior === "confirm" && shopper === "member"
                  ? "Focused Price · waiting for confirmation"
                  : "Focused Price · converted automatically"
                : `Manual fallback appears after ${effectiveFallbackSeconds} seconds`}
            </span>
            <strong>{detectionVisible ? priceSample : "—"}</strong>
            <p>
              Recognition uses the same universal runtime and fixed notation rules
              for Guests and Approved Members.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
