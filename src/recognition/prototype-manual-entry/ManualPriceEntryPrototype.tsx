// PROTOTYPE: manual-entry availability, promotion, validation, and provenance.
// Switch with ?manualEntryPrototype=A|B|C; this never mounts in production.
import { FormEvent, useEffect, useMemo, useState } from "react";

import "../prototype-guided-camera/guided-camera-prototype.css";
import "./manual-entry-prototype.css";

type VariantKey = "A" | "B" | "C";
type Scenario = "ready" | "promoted" | "invalid" | "entered";

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: "A", name: "Adaptive composer" },
  { key: "B", name: "Floating action" },
  { key: "C", name: "Camera / Manual mode" }
];

const scenarios: Array<{ key: Scenario; label: string }> = [
  { key: "ready", label: "0 sec" },
  { key: "promoted", label: "5 sec" },
  { key: "invalid", label: "Invalid" },
  { key: "entered", label: "Entered" }
];

function initialVariant(): VariantKey {
  const candidate = new URLSearchParams(window.location.search).get(
    "manualEntryPrototype"
  );
  return variants.some(({ key }) => key === candidate)
    ? (candidate as VariantKey)
    : "A";
}

function initialScenario(): Scenario {
  const candidate = new URLSearchParams(window.location.search).get("scenario");
  return scenarios.some(({ key }) => key === candidate)
    ? (candidate as Scenario)
    : "promoted";
}

function updateQuery(variant: VariantKey, scenario: Scenario) {
  const query = new URLSearchParams(window.location.search);
  query.set("manualEntryPrototype", variant);
  query.set("scenario", scenario);
  window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
}

function ShelfScene() {
  return (
    <div className="gc-scene" aria-hidden="true">
      <div className="gc-shelf gc-shelf-top" />
      <div className="gc-product gc-product-a" />
      <div className="gc-product gc-product-b" />
      <div className="gc-product gc-product-c" />
      <div className="gc-tag gc-tag-main">
        <small>税込価格</small>
        <strong>58,980円</strong>
        <span>limited edition</span>
      </div>
      <div className="gc-tag gc-tag-side">
        <small>SALE</small>
        <strong>4,142円</strong>
      </div>
      <div className="gc-tag gc-tag-lower">
        <strong>980円</strong>
      </div>
      <div className="gc-shelf gc-shelf-bottom" />
    </div>
  );
}

function Header() {
  return (
    <header className="mp-header">
      <div className="gc-brand">
        <span>TL</span>
        <strong>TagLingo</strong>
      </div>
      <div className="gc-local"><i aria-hidden="true" /> Local preview</div>
    </header>
  );
}

function Camera({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <section className={`mp-camera ${dimmed ? "is-dimmed" : ""}`} aria-label="Camera preview">
      <ShelfScene />
      <div className="mp-capture-guide">
        <span>Searching</span>
        <strong>Place one price inside the Capture Guide</strong>
        <i className="mp-corner corner-one" />
        <i className="mp-corner corner-two" />
        <i className="mp-corner corner-three" />
        <i className="mp-corner corner-four" />
      </div>
      <p className="mp-camera-note">Camera recognition stays active while you enter a price.</p>
    </section>
  );
}

function SourceCurrency() {
  return (
    <div className="mp-source">
      <span>Source Currency</span>
      <strong>JPY · Japanese Yen</strong>
    </div>
  );
}

interface ComposerProps {
  error: boolean;
  promoted?: boolean;
  value: string;
  onValue: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}

function Composer({ error, promoted, value, onValue, onSubmit, onCancel }: ComposerProps) {
  return (
    <form className={`mp-composer ${promoted ? "is-promoted" : ""}`} onSubmit={onSubmit}>
      {promoted ? <span className="mp-timeout">Still searching · 5 seconds</span> : null}
      <div className="mp-composer-heading">
        <div>
          <small>Manual Price Entry</small>
          <h1>Enter the shelf price</h1>
        </div>
        {onCancel ? <button type="button" className="mp-text-button" onClick={onCancel}>Cancel</button> : null}
      </div>
      <SourceCurrency />
      <label className={error ? "has-error" : ""}>
        <span className="mp-field-code">JPY</span>
        <input
          aria-describedby="manual-price-help"
          aria-invalid={error}
          inputMode="decimal"
          placeholder="58,980"
          value={value}
          onChange={(event) => onValue(event.target.value)}
        />
      </label>
      <div id="manual-price-help" className={`mp-field-help ${error ? "is-error" : ""}`}>
        {error
          ? "That does not look like a JPY price. Try 58,980 or ¥58,980."
          : "JPY notation · 58,980, ¥58,980, or 58,980円"}
      </div>
      <button className="mp-primary" type="submit">Convert entered price</button>
      <p className="mp-privacy">Entered prices stay on this device and are not saved.</p>
    </form>
  );
}

function EnteredLedger({ onEdit }: { onEdit: () => void }) {
  return (
    <section className="mp-ledger">
      <div className="mp-ledger-title">
        <div>
          <span>Current conversion</span>
          <strong>Price ledger</strong>
        </div>
        <button type="button" onClick={onEdit}>Edit</button>
      </div>
      <article className="mp-entered-card">
        <div className="mp-provenance">
          <i aria-hidden="true">✎</i>
          <span><strong>Entered Price</strong><small>Entered manually · not camera-derived</small></span>
        </div>
        <div className="mp-conversion">
          <span><small>Source Currency</small><strong>JPY 58,980</strong></span>
          <b aria-hidden="true">→</b>
          <span><small>Target Currency</small><strong>TWD 12,430</strong></span>
        </div>
        <div className="mp-rate-note">Reference estimate · rate snapshot just now</div>
      </article>
      <button className="mp-camera-return" type="button">
        <span><small>Camera price found</small><strong>JPY 57,800</strong></span>
        <b>Use camera price</b>
      </button>
    </section>
  );
}

interface VariantProps {
  scenario: Scenario;
  value: string;
  setValue: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  setScenario: (scenario: Scenario) => void;
}

function VariantA({ scenario, value, setValue, submit, setScenario }: VariantProps) {
  const open = scenario !== "ready";
  return (
    <main className="mp-shell mp-variant-a">
      <Header />
      <Camera />
      <section className={`mp-adaptive-sheet ${open ? "is-open" : ""}`}>
        <div className="mp-sheet-handle" />
        {scenario === "entered" ? (
          <EnteredLedger onEdit={() => setScenario("promoted")} />
        ) : open ? (
          <Composer
            error={scenario === "invalid"}
            promoted={scenario === "promoted"}
            value={value}
            onValue={setValue}
            onSubmit={submit}
            onCancel={() => setScenario("ready")}
          />
        ) : (
          <button className="mp-inline-trigger" type="button" onClick={() => setScenario("promoted")}>
            <span><i aria-hidden="true">✎</i><b>Enter price manually</b></span>
            <small>Available anytime</small>
          </button>
        )}
      </section>
    </main>
  );
}

function VariantB({ scenario, value, setValue, submit, setScenario }: VariantProps) {
  const open = scenario === "promoted" || scenario === "invalid";
  return (
    <main className="mp-shell mp-variant-b">
      <Header />
      <Camera dimmed={open} />
      {scenario === "entered" ? (
        <div className="mp-floating-ledger"><EnteredLedger onEdit={() => setScenario("promoted")} /></div>
      ) : open ? (
        <aside className="mp-peek-sheet">
          <div className="mp-sheet-handle" />
          <Composer
            error={scenario === "invalid"}
            promoted={scenario === "promoted"}
            value={value}
            onValue={setValue}
            onSubmit={submit}
            onCancel={() => setScenario("ready")}
          />
        </aside>
      ) : (
        <button className="mp-floating-trigger" type="button" onClick={() => setScenario("promoted")}>
          <i aria-hidden="true">✎</i><span><b>Enter price</b><small>Manually</small></span>
        </button>
      )}
    </main>
  );
}

function VariantC({ scenario, value, setValue, submit, setScenario }: VariantProps) {
  const manual = scenario !== "ready";
  return (
    <main className="mp-shell mp-variant-c">
      <Header />
      <div className="mp-mode-switch" role="group" aria-label="Price source mode">
        <button className={!manual ? "is-active" : ""} type="button" onClick={() => setScenario("ready")}>Camera</button>
        <button className={manual ? "is-active" : ""} type="button" onClick={() => setScenario("promoted")}>Manual</button>
      </div>
      {!manual ? (
        <Camera />
      ) : (
        <section className="mp-manual-mode">
          <div className="mp-manual-mode-intro"><span>Manual mode</span><h1>Type the price you see</h1><p>The camera is paused while Manual mode is open.</p></div>
          {scenario === "entered" ? (
            <EnteredLedger onEdit={() => setScenario("promoted")} />
          ) : (
            <Composer
              error={scenario === "invalid"}
              value={value}
              onValue={setValue}
              onSubmit={submit}
            />
          )}
        </section>
      )}
    </main>
  );
}

function ScenarioControls({ scenario, onChange }: { scenario: Scenario; onChange: (scenario: Scenario) => void }) {
  return (
    <nav className="mp-scenarios" aria-label="Prototype scenario">
      {scenarios.map(({ key, label }) => (
        <button key={key} type="button" className={scenario === key ? "is-active" : ""} onClick={() => onChange(key)}>{label}</button>
      ))}
    </nav>
  );
}

function VariantSwitcher({ variant, onChange }: { variant: VariantKey; onChange: (variant: VariantKey) => void }) {
  const index = variants.findIndex(({ key }) => key === variant);
  const cycle = (direction: -1 | 1) => onChange(variants[(index + direction + variants.length) % variants.length].key);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, button, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  return (
    <nav className="mp-switcher" aria-label="Prototype variant">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
      <span><b>{variants[index].key}</b> — {variants[index].name}</span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    </nav>
  );
}

export function ManualPriceEntryPrototype() {
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [value, setValue] = useState("58,980");
  const changeScenario = (next: Scenario) => {
    setScenario(next);
    setValue(next === "invalid" ? "58.98O" : "58,980");
    updateQuery(variant, next);
  };
  const changeVariant = (next: VariantKey) => {
    setVariant(next);
    updateQuery(next, scenario);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = value
      .trim()
      .replace(/^(?:JPY|[¥￥])\s*/i, "")
      .replace(/\s*(?:JPY|円)$/i, "")
      .trim();
    const valid = /^(?:\d{1,3}(?:,\d{3})*|\d+)$/.test(amount);
    changeScenario(valid ? "entered" : "invalid");
  };
  const screen = useMemo(() => {
    const props = { scenario, value, setValue, submit, setScenario: changeScenario };
    if (variant === "B") return <VariantB {...props} />;
    if (variant === "C") return <VariantC {...props} />;
    return <VariantA {...props} />;
  }, [scenario, value, variant]);
  return (
    <div className="mp-prototype-root">
      {screen}
      <ScenarioControls scenario={scenario} onChange={changeScenario} />
      <VariantSwitcher variant={variant} onChange={changeVariant} />
    </div>
  );
}
