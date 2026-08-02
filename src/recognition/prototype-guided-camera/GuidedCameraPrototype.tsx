// PROTOTYPE: three guided-camera interaction variants on the existing route,
// switchable with ?guidedCameraPrototype=A|B|C and never mounted in production.
import { useEffect, useMemo, useState } from "react";

import "./guided-camera-prototype.css";

type VariantKey = "A" | "B" | "C";
type Scenario = "searching" | "stabilizing" | "focused" | "multiple";
type PriceId = "main" | "lower" | "side";

interface PriceFixture {
  id: PriceId;
  amount: string;
  converted: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const variants: Array<{ key: VariantKey; name: string }> = [
  { key: "A", name: "Guide as status" },
  { key: "B", name: "Focus card + rail" },
  { key: "C", name: "Choose-price tray" }
];

const fixtures: PriceFixture[] = [
  {
    id: "main",
    amount: "JPY 58,980",
    converted: "TWD 12,430",
    x: 31,
    y: 34,
    width: 38,
    height: 11
  },
  {
    id: "side",
    amount: "JPY 4,142",
    converted: "TWD 873",
    x: 67,
    y: 53,
    width: 25,
    height: 9
  },
  {
    id: "lower",
    amount: "JPY 980",
    converted: "TWD 207",
    x: 13,
    y: 67,
    width: 23,
    height: 9
  }
];

const scenarioCopy: Record<
  Scenario,
  { state: string; instruction: string; detail: string }
> = {
  searching: {
    state: "Searching",
    instruction: "Place one price inside the Capture Guide",
    detail: "Move closer or improve the light if the price stays unclear."
  },
  stabilizing: {
    state: "Stabilizing",
    instruction: "Hold steady",
    detail: "TagLingo is checking the same price again before showing it."
  },
  focused: {
    state: "Focused",
    instruction: "Price confirmed",
    detail: "The stronger Detection Outline is the price being converted."
  },
  multiple: {
    state: "Focused · 3 found",
    instruction: "Tap another Detection Outline to convert it",
    detail: "The nearest stable price is focused; the others remain selectable."
  }
};

function updateQuery(variant: VariantKey, scenario: Scenario) {
  const query = new URLSearchParams(window.location.search);
  query.set("guidedCameraPrototype", variant);
  query.set("scenario", scenario);
  window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
}

function initialVariant(): VariantKey {
  const candidate = new URLSearchParams(window.location.search).get(
    "guidedCameraPrototype"
  );
  return variants.some(({ key }) => key === candidate)
    ? (candidate as VariantKey)
    : "A";
}

function initialScenario(): Scenario {
  const candidate = new URLSearchParams(window.location.search).get("scenario");
  return ["searching", "stabilizing", "focused", "multiple"].includes(
    candidate ?? ""
  )
    ? (candidate as Scenario)
    : "multiple";
}

function PrototypeHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`gc-header ${compact ? "gc-header-compact" : ""}`}>
      <div className="gc-brand">
        <span>TL</span>
        <strong>TagLingo</strong>
      </div>
      <div className="gc-local">
        <i aria-hidden="true" /> Local preview
      </div>
    </header>
  );
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

function visibleFixtures(scenario: Scenario) {
  if (scenario === "searching" || scenario === "stabilizing") {
    return [];
  }
  if (scenario === "multiple") {
    return fixtures;
  }
  return [fixtures[0]];
}

function DetectionOutlines({
  scenario,
  selected,
  onSelect,
  numbered = false
}: {
  scenario: Scenario;
  selected: PriceId;
  onSelect: (price: PriceId) => void;
  numbered?: boolean;
}) {
  return (
    <>
      {visibleFixtures(scenario).map((fixture, index) => {
        const focused = scenario !== "stabilizing" && fixture.id === selected;
        return (
          <button
            key={fixture.id}
            className={`gc-detection ${focused ? "is-focused" : ""} ${
              scenario === "stabilizing" ? "is-stabilizing" : ""
            }`}
            style={{
              left: `${fixture.x}%`,
              top: `${fixture.y}%`,
              width: `${fixture.width}%`,
              height: `${fixture.height}%`
            }}
            type="button"
            disabled={scenario === "stabilizing"}
            aria-label={`${focused ? "Focused Price" : "Detected Price"}: ${fixture.amount}`}
            onClick={() => onSelect(fixture.id)}
          >
            <span>{numbered ? index + 1 : focused ? "Focused" : "Detected"}</span>
          </button>
        );
      })}
    </>
  );
}

function PriceResult({ selected }: { selected: PriceId }) {
  const price = fixtures.find(({ id }) => id === selected) ?? fixtures[0];
  return (
    <div className="gc-price-result">
      <span>Focused Price</span>
      <strong>{price.amount}</strong>
      <i aria-hidden="true">→</i>
      <div>
        <small>Target Currency</small>
        <b>{price.converted}</b>
      </div>
    </div>
  );
}

function VariantA({
  scenario,
  selected,
  onSelect
}: VariantProps) {
  const copy = scenarioCopy[scenario];
  return (
    <main className="gc-shell gc-variant-a">
      <PrototypeHeader />
      <section className="gc-preview" aria-label="Prototype camera preview">
        <ShelfScene />
        <div className={`gc-capture-guide gc-guide-${scenario}`}>
          <div className="gc-guide-label">
            <span>{copy.state}</span>
            <strong>{copy.instruction}</strong>
          </div>
          <i className="gc-guide-corner corner-one" />
          <i className="gc-guide-corner corner-two" />
          <i className="gc-guide-corner corner-three" />
          <i className="gc-guide-corner corner-four" />
          <div className="gc-guide-center" />
        </div>
        <DetectionOutlines
          scenario={scenario}
          selected={selected}
          onSelect={onSelect}
        />
        <p className="gc-inview-help">{copy.detail}</p>
      </section>
      <section className="gc-a-dock">
        {scenario === "focused" || scenario === "multiple" ? (
          <>
            <PriceResult selected={selected} />
            {scenario === "multiple" ? (
              <div className="gc-a-nearby">
                <div>
                  <strong>Other Detected Prices</strong>
                  <span>Your selection stays focused</span>
                </div>
                <div className="gc-a-nearby-list">
                  {fixtures.map((price) => (
                    <button
                      key={price.id}
                      className={selected === price.id ? "is-selected" : ""}
                      type="button"
                      onClick={() => onSelect(price.id)}
                    >
                      <span>{price.amount}</span>
                      <small>{selected === price.id ? "Focused" : "Choose"}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="gc-waiting-result">
            <span>{copy.state}</span>
            <p>{copy.detail}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function VariantB({
  scenario,
  selected,
  onSelect
}: VariantProps) {
  const copy = scenarioCopy[scenario];
  const current = fixtures.find(({ id }) => id === selected) ?? fixtures[0];
  return (
    <main className="gc-shell gc-variant-b">
      <PrototypeHeader compact />
      <section className="gc-preview gc-preview-b" aria-label="Prototype camera preview">
        <ShelfScene />
        <div className="gc-focus-band">
          <span>Capture Guide · fast recognition region</span>
        </div>
        <DetectionOutlines
          scenario={scenario}
          selected={selected}
          onSelect={onSelect}
          numbered
        />
        <div className="gc-b-status">
          <span className={`gc-state-light state-${scenario}`} />
          <div>
            <strong>{copy.state}</strong>
            <p>{copy.instruction}</p>
          </div>
        </div>
        {scenario === "focused" || scenario === "multiple" ? (
          <aside className="gc-focus-card">
            <span>Now converting</span>
            <strong>{current.amount}</strong>
            <b>{current.converted}</b>
            <small>Reference estimate</small>
          </aside>
        ) : null}
      </section>
      <section className="gc-nearby-rail">
        <div>
          <span>Nearby prices</span>
          <small>{scenario === "multiple" ? "Tap to focus" : "Waiting for stable prices"}</small>
        </div>
        <div className="gc-price-pills">
          {(scenario === "multiple" ? fixtures : []).map((price, index) => (
            <button
              key={price.id}
              className={selected === price.id ? "is-selected" : ""}
              type="button"
              onClick={() => onSelect(price.id)}
            >
              <i>{index + 1}</i>
              <span>{price.amount}</span>
            </button>
          ))}
          {scenario !== "multiple" ? <p>{copy.detail}</p> : null}
        </div>
      </section>
    </main>
  );
}

function VariantC({
  scenario,
  selected,
  onSelect
}: VariantProps) {
  const copy = scenarioCopy[scenario];
  const choosing = scenario === "multiple";
  return (
    <main className="gc-shell gc-variant-c">
      <PrototypeHeader compact />
      <div className="gc-steps" aria-label="Recognition progress">
        <span className="is-done">1 · Frame</span>
        <span className={scenario !== "searching" ? "is-done" : ""}>2 · Hold</span>
        <span className={scenario === "focused" || choosing ? "is-current" : ""}>
          3 · {choosing ? "Choose" : "Confirm"}
        </span>
      </div>
      <section className={`gc-preview gc-preview-c ${choosing ? "is-choosing" : ""}`}>
        <ShelfScene />
        <div className="gc-wide-guide">
          <span>Capture Guide</span>
          <strong>{copy.instruction}</strong>
        </div>
        <DetectionOutlines
          scenario={scenario}
          selected={selected}
          onSelect={onSelect}
          numbered
        />
      </section>
      <section className={`gc-choice-sheet ${choosing ? "is-open" : ""}`}>
        <div className="gc-choice-handle" />
        {choosing ? (
          <>
            <div className="gc-choice-heading">
              <div>
                <span>3 Detected Prices</span>
                <h1>Which price do you mean?</h1>
              </div>
              <small>Tap an outline or a price below</small>
            </div>
            <div className="gc-choice-grid">
              {fixtures.map((price, index) => (
                <button
                  key={price.id}
                  className={selected === price.id ? "is-selected" : ""}
                  type="button"
                  onClick={() => onSelect(price.id)}
                >
                  <i>{index + 1}</i>
                  <span>
                    <strong>{price.amount}</strong>
                    <small>{price.converted}</small>
                  </span>
                  <b>{selected === price.id ? "Focused" : "Choose"}</b>
                </button>
              ))}
            </div>
          </>
        ) : scenario === "focused" ? (
          <>
            <span className="gc-confirmed-label">Focused</span>
            <PriceResult selected={selected} />
            <p>Tap another stable Detection Outline whenever more prices appear.</p>
          </>
        ) : (
          <div className="gc-c-progress">
            <span>{copy.state}</span>
            <h1>{copy.instruction}</h1>
            <p>{copy.detail}</p>
          </div>
        )}
      </section>
    </main>
  );
}

interface VariantProps {
  scenario: Scenario;
  selected: PriceId;
  onSelect: (price: PriceId) => void;
}

function ScenarioControls({
  scenario,
  onChange
}: {
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
}) {
  const options: Array<{ key: Scenario; label: string }> = [
    { key: "searching", label: "Searching" },
    { key: "stabilizing", label: "Stabilizing" },
    { key: "focused", label: "Focused" },
    { key: "multiple", label: "3 prices" }
  ];
  return (
    <nav className="gc-scenario-controls" aria-label="Prototype scenario">
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={scenario === key ? "is-active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function PrototypeSwitcher({
  variant,
  onChange
}: {
  variant: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const currentIndex = variants.findIndex(({ key }) => key === variant);
  const cycle = (direction: -1 | 1) => {
    const nextIndex =
      (currentIndex + direction + variants.length) % variants.length;
    onChange(variants[nextIndex].key);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.matches("input, textarea, select, button, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        cycle(-1);
      }
      if (event.key === "ArrowRight") {
        cycle(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const label = variants[currentIndex];
  return (
    <nav className="gc-prototype-switcher" aria-label="Prototype variant">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>
        ←
      </button>
      <span>
        <b>{label.key}</b> — {label.name}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>
        →
      </button>
    </nav>
  );
}

export function GuidedCameraPrototype() {
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [selected, setSelected] = useState<PriceId>("main");

  const screen = useMemo(() => {
    const props = { scenario, selected, onSelect: setSelected };
    if (variant === "B") {
      return <VariantB {...props} />;
    }
    if (variant === "C") {
      return <VariantC {...props} />;
    }
    return <VariantA {...props} />;
  }, [scenario, selected, variant]);

  const changeVariant = (next: VariantKey) => {
    setVariant(next);
    updateQuery(next, scenario);
  };
  const changeScenario = (next: Scenario) => {
    setScenario(next);
    setSelected("main");
    updateQuery(variant, next);
  };

  return (
    <div className="gc-prototype-root">
      {screen}
      <ScenarioControls scenario={scenario} onChange={changeScenario} />
      <PrototypeSwitcher variant={variant} onChange={changeVariant} />
    </div>
  );
}
