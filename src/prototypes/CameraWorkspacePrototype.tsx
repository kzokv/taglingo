// PROTOTYPE — Three single-viewport Camera Workspace variants, switchable via
// ?variant=, on the development-only ?prototype=camera-workspace surface.
// HITL VERDICT (#93) — Variant B, “Edge controls,” selected as clean, simple,
// and flexible. Preserve the prototype as evidence; rewrite the winner for production.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

import type { CurrencyCode } from "../domain/currencies";
import "./CameraWorkspacePrototype.css";

type VariantKey = "A" | "B" | "C";
type TimingKey = "warm" | "cold" | "slow";
type ViewportKey = "normal" | "small";
type RecognitionPhase = "searching" | "tentative" | "stable";
type FocusMode = "automatic" | "explicit";

interface PriceCandidate {
  id: string;
  value: number;
  label: string;
  position: string;
}

const VARIANTS: Record<VariantKey, { name: string; description: string }> = {
  A: {
    name: "Preview dock",
    description: "Camera-first with a bottom control dock"
  },
  B: {
    name: "Edge controls",
    description: "Controls hug the preview instead of forming a sheet"
  },
  C: {
    name: "Price console",
    description: "Focused result and evidence lead the hierarchy"
  }
};

const TIMINGS: Record<
  TimingKey,
  { label: string; tentativeMs: number; stableMs: number }
> = {
  warm: { label: "Warm · 0.45s", tentativeMs: 120, stableMs: 450 },
  cold: { label: "Cold · 1.4s", tentativeMs: 480, stableMs: 1400 },
  slow: { label: "Slow · 3.4s", tentativeMs: 1200, stableMs: 3400 }
};

const CURRENCIES: ReadonlyArray<{
  code: CurrencyCode;
  name: string;
  symbol: string;
}> = [
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN¥" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" }
];

const PRICES: readonly PriceCandidate[] = [
  { id: "sale", value: 980, label: "¥980", position: "price-sale" },
  { id: "center", value: 1280, label: "¥1,280", position: "price-center" },
  { id: "pack", value: 1450, label: "¥1,450", position: "price-pack" }
];

const RATES: Partial<Record<CurrencyCode, number>> = {
  JPY: 1,
  TWD: 0.224,
  USD: 0.00672,
  EUR: 0.00582,
  KRW: 9.34,
  CNY: 0.0483,
  GBP: 0.00505,
  AUD: 0.0103
};

function isVariant(value: string | null): value is VariantKey {
  return value === "A" || value === "B" || value === "C";
}

function isTiming(value: string | null): value is TimingKey {
  return value === "warm" || value === "cold" || value === "slow";
}

function isViewport(value: string | null): value is ViewportKey {
  return value === "normal" || value === "small";
}

function setPrototypeParam(name: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState(null, "", url);
}

function formatAmount(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" || currency === "KRW" ? 0 : 2
  }).format(value);
}

function convertAmount(
  value: number,
  source: CurrencyCode,
  target: CurrencyCode
) {
  const sourceRate = RATES[source] ?? 1;
  const targetRate = RATES[target] ?? 1;
  return (value / sourceRate) * targetRate;
}

function CurrencyPicker({
  label,
  mode,
  selected,
  source,
  onSelect
}: {
  label: string;
  mode: "single" | "multiple";
  selected: CurrencyCode[];
  source?: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const matches = CURRENCIES.filter(({ code, name }) =>
    `${code} ${name}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const display = selected
    .map((code) => CURRENCIES.find((currency) => currency.code === code)?.code)
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="workspace-currency-picker" ref={pickerRef}>
      <button
        type="button"
        className="workspace-currency-trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <strong>{display}</strong>
        <i aria-hidden="true">⌄</i>
      </button>
      {open ? (
        <div className="workspace-currency-menu">
          <label>
            <span className="visually-hidden">Search {label} currencies</span>
            <b aria-hidden="true">⌕</b>
            <input
              autoFocus
              value={query}
              placeholder={`Search ${label.toLowerCase()}`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="workspace-currency-options" role="listbox" aria-multiselectable={mode === "multiple"}>
            {matches.map((currency) => {
              const checked = selected.includes(currency.code);
              const disabled = currency.code === source;
              return (
                <button
                  key={currency.code}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={disabled}
                  onClick={() => {
                    onSelect(currency.code);
                    if (mode === "single") setOpen(false);
                  }}
                >
                  <span className="currency-symbol">{currency.symbol}</span>
                  <span>
                    <strong>{currency.code}</strong>
                    <small>{currency.name}</small>
                  </span>
                  <i aria-hidden="true">{checked ? "✓" : ""}</i>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CurrencyControls({
  source,
  targets,
  onSource,
  onTargets,
  onSwap
}: {
  source: CurrencyCode;
  targets: CurrencyCode[];
  onSource: (code: CurrencyCode) => void;
  onTargets: (targets: CurrencyCode[]) => void;
  onSwap: () => void;
}) {
  const toggleTarget = (code: CurrencyCode) => {
    const next = targets.includes(code)
      ? targets.filter((candidate) => candidate !== code)
      : [...targets, code];
    if (next.length > 0) onTargets(next.slice(-3));
  };

  return (
    <div className="workspace-currency-pair">
      <CurrencyPicker
        label="Source"
        mode="single"
        selected={[source]}
        onSelect={onSource}
      />
      <button
        type="button"
        className="workspace-swap"
        aria-label="Swap Source and first Target Currency"
        onClick={onSwap}
      >
        ⇄
      </button>
      <CurrencyPicker
        label="Targets"
        mode="multiple"
        selected={targets}
        source={source}
        onSelect={toggleTarget}
      />
    </div>
  );
}

function PhaseBadge({
  phase,
  timing,
  held
}: {
  phase: RecognitionPhase;
  timing: TimingKey;
  held: boolean;
}) {
  return (
    <div className={`workspace-phase phase-${phase} ${held ? "phase-held" : ""}`} role="status" aria-live="polite">
      <span aria-hidden="true" />
      <strong>
        {held
          ? phase === "tentative"
            ? "Checking · prices held"
            : "Prices held"
          : phase === "searching"
          ? "Looking for prices"
          : phase === "tentative"
            ? "Possible price"
            : "Prices ready"}
      </strong>
      <small>{TIMINGS[timing].label.split(" · ")[0]}</small>
    </div>
  );
}

function DetectionLayer({
  phase,
  hasDetections,
  held,
  focusedId,
  focusMode,
  onFocus,
  onResumeAutomatic
}: {
  phase: RecognitionPhase;
  hasDetections: boolean;
  held: boolean;
  focusedId: string | null;
  focusMode: FocusMode;
  onFocus: (id: string) => void;
  onResumeAutomatic: () => void;
}) {
  return (
    <div className={`workspace-detections phase-${phase}`}>
      <div className="capture-window" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <button
        type="button"
        className={`focus-target ${focusMode === "explicit" ? "target-paused" : ""}`}
        aria-label={focusMode === "explicit" ? "Resume automatic Focus Target" : "Automatic Focus Target active"}
        onClick={onResumeAutomatic}
      >
        <span />
      </button>
      {phase === "tentative" && !hasDetections ? (
        <div className="tentative-outline price-center" aria-hidden="true">
          <span>Maybe ¥1,280</span>
        </div>
      ) : null}
      {hasDetections
        ? PRICES.map((price) => (
            <button
              key={price.id}
              type="button"
              className={`stable-outline ${price.position} ${focusedId === price.id ? "is-focused" : ""} ${held ? "is-held" : ""}`}
              aria-label={`Focus detected price ${price.label}`}
              onClick={() => onFocus(price.id)}
            >
              <span>{price.label}</span>
            </button>
          ))
        : null}
    </div>
  );
}

function DetectedPriceRail({
  focusedId,
  hasDetections,
  held,
  onFocus,
  onClear,
  vertical = false,
  draggable = false,
  collapsible = false
}: {
  focusedId: string | null;
  hasDetections: boolean;
  held: boolean;
  onFocus: (id: string) => void;
  onClear: () => void;
  vertical?: boolean;
  draggable?: boolean;
  collapsible?: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  const getDragInsets = (containerWidth: number) =>
    containerWidth <= 340
      ? { top: 94, right: 6, bottom: 155, left: 6 }
      : { top: 118, right: 6, bottom: 205, left: 6 };

  const constrainOffset = (
    next: { x: number; y: number },
    current: { x: number; y: number }
  ) => {
    const rail = railRef.current;
    const container = rail?.parentElement;
    if (!rail || !container) return next;
    const railRect = rail.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const insets = getDragInsets(containerRect.width);
    const baseLeft = railRect.left - containerRect.left - current.x;
    const baseTop = railRect.top - containerRect.top - current.y;
    return {
      x: Math.min(
        containerRect.width - railRect.width - baseLeft - insets.right,
        Math.max(insets.left - baseLeft, next.x)
      ),
      y: Math.min(
        containerRect.height - railRect.height - baseTop - insets.bottom,
        Math.max(insets.top - baseTop, next.y)
      )
    };
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rail = railRef.current;
    const container = rail?.parentElement;
    if (!draggable || !rail || !container) return;
    const railRect = rail.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const insets = getDragInsets(containerRect.width);
    const baseLeft = railRect.left - containerRect.left - dragOffset.x;
    const baseTop = railRect.top - containerRect.top - dragOffset.y;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
      minX: insets.left - baseLeft,
      maxX: containerRect.width - railRect.width - baseLeft - insets.right,
      minY: insets.top - baseTop,
      maxY: containerRect.height - railRect.height - baseTop - insets.bottom
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDragOffset({
      x: Math.min(drag.maxX, Math.max(drag.minX, drag.originX + event.clientX - drag.startX)),
      y: Math.min(drag.maxY, Math.max(drag.minY, drag.originY + event.clientY - drag.startY))
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudgeRail = (x: number, y: number) => {
    setDragOffset((current) =>
      constrainOffset({ x: current.x + x, y: current.y + y }, current)
    );
  };

  useEffect(() => {
    if (!draggable || !collapsible) return;
    const resizeSettled = window.setTimeout(() => {
      setDragOffset((current) => constrainOffset(current, current));
    }, 180);
    return () => window.clearTimeout(resizeSettled);
  }, [collapsed, collapsible, draggable]);

  const focusedLabel =
    PRICES.find((price) => price.id === focusedId)?.label ?? "—";

  return (
    <div
      ref={railRef}
      className={`detected-price-rail ${vertical ? "rail-vertical" : ""} ${held ? "rail-held" : ""} ${draggable ? "rail-draggable" : ""} ${collapsible ? "rail-collapsible" : ""} ${collapsed ? "rail-collapsed" : ""}`}
      aria-label="Detected Prices"
      style={draggable ? { transform: `translate(${dragOffset.x}px, calc(-50% + ${dragOffset.y}px))` } : undefined}
    >
      {draggable ? (
        <button
          type="button"
          className="rail-drag-handle"
          aria-label="Drag Detected Prices. Arrow keys also move it; double tap resets it."
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          onPointerDown={beginDrag}
          onPointerMove={continueDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={() => { dragRef.current = null; }}
          onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
          onKeyDown={(event) => {
            const movement: Record<string, [number, number]> = {
              ArrowUp: [0, -12],
              ArrowDown: [0, 12],
              ArrowLeft: [-12, 0],
              ArrowRight: [12, 0]
            };
            const next = movement[event.key];
            if (!next) return;
            event.preventDefault();
            event.stopPropagation();
            nudgeRail(...next);
          }}
        >
          <i aria-hidden="true">⠿</i><span>Drag</span>
        </button>
      ) : null}
      {collapsible ? (
        <button
          type="button"
          className="rail-collapse"
          aria-label={collapsed ? "Expand Detected Prices" : "Collapse Detected Prices"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? "+" : "−"}
        </button>
      ) : null}
      <span className="rail-status-label">{held ? "Held" : "Detected"}</span>
      {collapsed ? (
        <button
          type="button"
          className="rail-collapsed-summary"
          aria-label={`${PRICES.length} Detected Prices. Focused Price ${focusedLabel}. Expand rail.`}
          onClick={() => setCollapsed(false)}
        >
          <strong>{hasDetections ? PRICES.length : 0}</strong>
          <small>{focusedLabel}</small>
        </button>
      ) : (
        <div className="rail-price-buttons">
          {hasDetections ? (
            PRICES.map((price) => (
              <button
                key={price.id}
                type="button"
                className={focusedId === price.id ? "selected" : undefined}
                onClick={() => onFocus(price.id)}
              >
                {price.label}
              </button>
            ))
          ) : (
            <i>—</i>
          )}
        </div>
      )}
      {hasDetections && !collapsed ? (
        <button type="button" className="rail-clear" aria-label="Clear Detected Prices" onClick={onClear}>×</button>
      ) : null}
    </div>
  );
}

function FocusConversionOverlay({
  focused,
  source,
  targets,
  focusMode,
  held,
  onDismiss
}: {
  focused: PriceCandidate | null;
  source: CurrencyCode;
  targets: CurrencyCode[];
  focusMode: FocusMode;
  held: boolean;
  onDismiss: () => void;
}) {
  if (!focused) return null;

  return (
    <section className={`focus-conversion-overlay focus-conversion-${focused.id} ${held ? "focus-conversion-held" : ""}`} aria-live="polite">
      <div>
        <span>{held ? "Held Focused Price" : focusMode === "explicit" ? "Explicit Focus Lock" : "Focused Price"}</span>
        <strong>{formatAmount(focused.value, source)}</strong>
      </div>
      <ul>
        {targets.map((target) => (
          <li key={target}>
            <small>{target}</small>
            <strong>{formatAmount(convertAmount(focused.value, source, target), target)}</strong>
          </li>
        ))}
      </ul>
      <button type="button" aria-label="Dismiss Focused Price" onClick={onDismiss}>×</button>
    </section>
  );
}

function ConversionResult({
  focused,
  source,
  targets,
  focusMode,
  compact = false
}: {
  focused: PriceCandidate | null;
  source: CurrencyCode;
  targets: CurrencyCode[];
  focusMode: FocusMode;
  compact?: boolean;
}) {
  return (
    <section className={`workspace-conversion ${compact ? "conversion-compact" : ""}`} aria-live="polite">
      <div>
        <span>{focusMode === "explicit" ? "Explicit Focus Lock" : "Focused Price"}</span>
        <strong>{focused ? formatAmount(focused.value, source) : "—"}</strong>
      </div>
      <ul>
        {focused
          ? targets.map((target) => (
              <li key={target}>
                <small>{target}</small>
                <strong>{formatAmount(convertAmount(focused.value, source, target), target)}</strong>
              </li>
            ))
          : <li className="awaiting-conversion">Conversion waits for a stable price</li>}
      </ul>
    </section>
  );
}

function ManualEntry({
  value,
  converted,
  source,
  targets,
  onChange,
  onCommit
}: {
  value: string;
  converted: number | null;
  source: CurrencyCode;
  targets: CurrencyCode[];
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCommit();
  };
  return (
    <form className="workspace-manual-entry" onSubmit={submit}>
      <label>
        <span>Manual Price Entry</span>
        <div>
          <b>{CURRENCIES.find((currency) => currency.code === source)?.symbol ?? source}</b>
          <input
            inputMode="decimal"
            value={value}
            placeholder="Enter price"
            aria-label="Manual Price Entry amount"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </label>
      <p>
        {converted === null ? (
          "Converts automatically"
        ) : (
          <>
            <span>Entered Price</span>
            {targets.map((target) => (
              <strong key={target}>{formatAmount(convertAmount(converted, source, target), target)}</strong>
            ))}
          </>
        )}
      </p>
    </form>
  );
}

function CameraScene({
  phase,
  timing,
  hasDetections,
  held,
  focusedId,
  focused,
  focusMode,
  source,
  targets,
  onFocus,
  onResumeAutomatic,
  onDismissFocus,
  children
}: {
  phase: RecognitionPhase;
  timing: TimingKey;
  hasDetections: boolean;
  held: boolean;
  focusedId: string | null;
  focused: PriceCandidate | null;
  focusMode: FocusMode;
  source: CurrencyCode;
  targets: CurrencyCode[];
  onFocus: (id: string) => void;
  onResumeAutomatic: () => void;
  onDismissFocus: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="workspace-camera" aria-label="Simulated camera preview">
      <div className="shelf-scene" aria-hidden="true">
        <div className="product product-left"><i />SPARKLING<small>YUZU</small></div>
        <div className="product product-center"><i />MATCHA<small>LATTE</small></div>
        <div className="product product-right"><i />HOJICHA<small>ROASTED</small></div>
        <div className="scene-price scene-sale">¥980</div>
        <div className="scene-price scene-center">¥1,280</div>
        <div className="scene-price scene-pack">¥1,450</div>
      </div>
      <PhaseBadge phase={phase} timing={timing} held={held} />
      <DetectionLayer
        phase={phase}
        hasDetections={hasDetections}
        held={held}
        focusedId={focusedId}
        focusMode={focusMode}
        onFocus={onFocus}
        onResumeAutomatic={onResumeAutomatic}
      />
      <FocusConversionOverlay
        focused={focused}
        source={source}
        targets={targets}
        focusMode={focusMode}
        held={held}
        onDismiss={onDismissFocus}
      />
      {children}
      <span className="device-private">● On-device</span>
    </section>
  );
}

interface VariantProps {
  phase: RecognitionPhase;
  timing: TimingKey;
  focused: PriceCandidate | null;
  hasDetections: boolean;
  held: boolean;
  focusMode: FocusMode;
  source: CurrencyCode;
  targets: CurrencyCode[];
  manualValue: string;
  manualConverted: number | null;
  onSource: (code: CurrencyCode) => void;
  onTargets: (targets: CurrencyCode[]) => void;
  onSwap: () => void;
  onFocus: (id: string) => void;
  onResumeAutomatic: () => void;
  onDismissFocus: () => void;
  onClearDetections: () => void;
  onManualChange: (value: string) => void;
  onManualCommit: () => void;
}

function WorkspaceHeader({ label }: { label?: string }) {
  return (
    <header className="workspace-header">
      <div className="workspace-brand"><i>TL</i><strong>TagLingo</strong></div>
      {label ? <span>{label}</span> : null}
      <button type="button" aria-label="Close Camera Workspace">×</button>
    </header>
  );
}

function VariantA(props: VariantProps) {
  return (
    <main className="camera-workspace variant-a">
      <WorkspaceHeader label="Camera Workspace" />
      <CameraScene
        phase={props.phase}
        timing={props.timing}
        hasDetections={props.hasDetections}
        held={props.held}
        focusedId={props.focused?.id ?? null}
        focused={props.focused}
        focusMode={props.focusMode}
        source={props.source}
        targets={props.targets}
        onFocus={props.onFocus}
        onResumeAutomatic={props.onResumeAutomatic}
        onDismissFocus={props.onDismissFocus}
      >
        <DetectedPriceRail
          focusedId={props.focused?.id ?? null}
          hasDetections={props.hasDetections}
          held={props.held}
          onFocus={props.onFocus}
          onClear={props.onClearDetections}
        />
      </CameraScene>
      <section className="workspace-bottom-dock">
        <ConversionResult focused={props.focused} source={props.source} targets={props.targets} focusMode={props.focusMode} compact />
        <CurrencyControls source={props.source} targets={props.targets} onSource={props.onSource} onTargets={props.onTargets} onSwap={props.onSwap} />
        <ManualEntry value={props.manualValue} converted={props.manualConverted} source={props.source} targets={props.targets} onChange={props.onManualChange} onCommit={props.onManualCommit} />
      </section>
    </main>
  );
}

function VariantB(props: VariantProps) {
  return (
    <main className="camera-workspace variant-b">
      <WorkspaceHeader />
      <div className="edge-currency-controls">
        <CurrencyControls source={props.source} targets={props.targets} onSource={props.onSource} onTargets={props.onTargets} onSwap={props.onSwap} />
      </div>
      <CameraScene
        phase={props.phase}
        timing={props.timing}
        hasDetections={props.hasDetections}
        held={props.held}
        focusedId={props.focused?.id ?? null}
        focused={props.focused}
        focusMode={props.focusMode}
        source={props.source}
        targets={props.targets}
        onFocus={props.onFocus}
        onResumeAutomatic={props.onResumeAutomatic}
        onDismissFocus={props.onDismissFocus}
      >
        <DetectedPriceRail vertical draggable collapsible focusedId={props.focused?.id ?? null} hasDetections={props.hasDetections} held={props.held} onFocus={props.onFocus} onClear={props.onClearDetections} />
      </CameraScene>
      <div className="edge-manual-control">
        <ManualEntry value={props.manualValue} converted={props.manualConverted} source={props.source} targets={props.targets} onChange={props.onManualChange} onCommit={props.onManualCommit} />
      </div>
    </main>
  );
}

function VariantC(props: VariantProps) {
  return (
    <main className="camera-workspace variant-c">
      <WorkspaceHeader label="Price console" />
      <section className="console-result">
        <ConversionResult focused={props.focused} source={props.source} targets={props.targets} focusMode={props.focusMode} />
      </section>
      <div className="console-camera-row">
        <CameraScene
          phase={props.phase}
          timing={props.timing}
          hasDetections={props.hasDetections}
          held={props.held}
          focusedId={props.focused?.id ?? null}
          focused={props.focused}
          focusMode={props.focusMode}
          source={props.source}
          targets={props.targets}
          onFocus={props.onFocus}
          onResumeAutomatic={props.onResumeAutomatic}
          onDismissFocus={props.onDismissFocus}
        />
        <DetectedPriceRail vertical focusedId={props.focused?.id ?? null} hasDetections={props.hasDetections} held={props.held} onFocus={props.onFocus} onClear={props.onClearDetections} />
      </div>
      <section className="console-controls">
        <CurrencyControls source={props.source} targets={props.targets} onSource={props.onSource} onTargets={props.onTargets} onSwap={props.onSwap} />
        <ManualEntry value={props.manualValue} converted={props.manualConverted} source={props.source} targets={props.targets} onChange={props.onManualChange} onCommit={props.onManualCommit} />
      </section>
    </main>
  );
}

function PrototypeSwitcher({
  current,
  onChange
}: {
  current: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const keys = Object.keys(VARIANTS) as VariantKey[];
  const cycle = (direction: -1 | 1) => {
    const currentIndex = keys.indexOf(current);
    onChange(keys[(currentIndex + direction + keys.length) % keys.length]);
  };

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  });

  if (import.meta.env.PROD) return null;

  return (
    <nav className="prototype-switcher" aria-label="Prototype variants">
      <button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
      <span><strong>{current} — {VARIANTS[current].name}</strong><small>{VARIANTS[current].description}</small></span>
      <button type="button" aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    </nav>
  );
}

function PrototypeLab({
  timing,
  viewport,
  onTiming,
  onViewport,
  onRun
}: {
  timing: TimingKey;
  viewport: ViewportKey;
  onTiming: (timing: TimingKey) => void;
  onViewport: (viewport: ViewportKey) => void;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  return (
    <aside className="prototype-lab">
      <button type="button" className="lab-summary" onClick={() => setOpen((current) => !current)}>
        <span>Prototype lab</span><strong>{TIMINGS[timing].label} · {viewport}</strong>
      </button>
      {open ? (
        <div className="lab-panel">
          <section>
            <span>Recognition delay</span>
            <div>
              {(Object.keys(TIMINGS) as TimingKey[]).map((key) => (
                <button key={key} type="button" className={timing === key ? "selected" : undefined} onClick={() => onTiming(key)}>{key}</button>
              ))}
            </div>
          </section>
          <section>
            <span>Viewport</span>
            <div>
              <button type="button" className={viewport === "normal" ? "selected" : undefined} onClick={() => onViewport("normal")}>390 × 844</button>
              <button type="button" className={viewport === "small" ? "selected" : undefined} onClick={() => onViewport("small")}>320 × 568</button>
            </div>
          </section>
          <button type="button" className="run-recognition" onClick={onRun}>↻ Move camera · run again</button>
          {viewport === "small" ? <p>Small-screen compromise: shorter preview, abbreviated labels, 38px controls. Every primary action stays visible.</p> : null}
        </div>
      ) : null}
    </aside>
  );
}

export default function CameraWorkspacePrototype() {
  const params = new URLSearchParams(window.location.search);
  const [variant, setVariantState] = useState<VariantKey>(() => {
    const requested = params.get("variant");
    return isVariant(requested) ? requested : "A";
  });
  const [timing, setTimingState] = useState<TimingKey>(() => {
    const requested = params.get("timing");
    return isTiming(requested) ? requested : "warm";
  });
  const [viewport, setViewportState] = useState<ViewportKey>(() => {
    const requested = params.get("size");
    return isViewport(requested) ? requested : "normal";
  });
  const [phase, setPhase] = useState<RecognitionPhase>("searching");
  const [scanRun, setScanRun] = useState(0);
  const [hasDetections, setHasDetections] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>("automatic");
  const [source, setSource] = useState<CurrencyCode>("JPY");
  const [targets, setTargets] = useState<CurrencyCode[]>(["TWD", "USD"]);
  const [manualValue, setManualValue] = useState("");
  const [manualConverted, setManualConverted] = useState<number | null>(null);
  const scanGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++scanGenerationRef.current;
    setPhase("searching");
    const tentative = window.setTimeout(
      () => {
        if (scanGenerationRef.current === generation) setPhase("tentative");
      },
      TIMINGS[timing].tentativeMs
    );
    const stable = window.setTimeout(() => {
      if (scanGenerationRef.current !== generation) return;
      setPhase("stable");
      setHasDetections(true);
      setFocusedId((current) => current ?? "center");
    }, TIMINGS[timing].stableMs);
    return () => {
      window.clearTimeout(tentative);
      window.clearTimeout(stable);
    };
  }, [scanRun, timing]);

  useEffect(() => {
    const normalized = Number(manualValue.replaceAll(",", "").trim());
    if (!manualValue.trim() || !Number.isFinite(normalized) || normalized <= 0) {
      setManualConverted(null);
      return;
    }
    const conversion = window.setTimeout(() => setManualConverted(normalized), 300);
    return () => window.clearTimeout(conversion);
  }, [manualValue]);

  const focused = useMemo(
    () => PRICES.find((price) => price.id === focusedId) ?? null,
    [focusedId]
  );

  const setVariant = (next: VariantKey) => {
    setVariantState(next);
    setPrototypeParam("variant", next);
  };
  const setTiming = (next: TimingKey) => {
    setTimingState(next);
    setPrototypeParam("timing", next);
  };
  const setViewport = (next: ViewportKey) => {
    setViewportState(next);
    setPrototypeParam("size", next);
  };
  const focusExplicitly = (id: string) => {
    if (!hasDetections) return;
    setFocusedId(id);
    setFocusMode("explicit");
  };
  const resumeAutomatic = () => {
    setFocusMode("automatic");
    if (hasDetections) setFocusedId("center");
  };
  const dismissFocus = () => {
    setFocusedId(null);
    setFocusMode("automatic");
  };
  const clearDetections = () => {
    scanGenerationRef.current += 1;
    setHasDetections(false);
    setFocusedId(null);
    setFocusMode("automatic");
    setPhase("searching");
  };
  const selectSource = (next: CurrencyCode) => {
    setSource(next);
    setTargets((current) => current.filter((code) => code !== next));
  };
  const swapCurrencies = () => {
    const nextSource = targets[0] ?? "TWD";
    setTargets((current) => [source, ...current.slice(1).filter((code) => code !== source)]);
    setSource(nextSource);
  };
  const commitManual = () => {
    const normalized = Number(manualValue.replaceAll(",", "").trim());
    if (Number.isFinite(normalized) && normalized > 0) setManualConverted(normalized);
  };

  const variantProps: VariantProps = {
    phase,
    timing,
    focused,
    hasDetections,
    held: hasDetections && phase !== "stable",
    focusMode,
    source,
    targets,
    manualValue,
    manualConverted,
    onSource: selectSource,
    onTargets: setTargets,
    onSwap: swapCurrencies,
    onFocus: focusExplicitly,
    onResumeAutomatic: resumeAutomatic,
    onDismissFocus: dismissFocus,
    onClearDetections: clearDetections,
    onManualChange: setManualValue,
    onManualCommit: commitManual
  };

  return (
    <div className="camera-workspace-prototype">
      <div className={`prototype-stage viewport-${viewport}`}>
        {variant === "A" ? <VariantA {...variantProps} /> : null}
        {variant === "B" ? <VariantB {...variantProps} /> : null}
        {variant === "C" ? <VariantC {...variantProps} /> : null}
      </div>
      <PrototypeLab
        timing={timing}
        viewport={viewport}
        onTiming={setTiming}
        onViewport={setViewport}
        onRun={() => setScanRun((current) => current + 1)}
      />
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </div>
  );
}
