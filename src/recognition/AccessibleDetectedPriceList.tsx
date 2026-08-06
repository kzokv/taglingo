import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";

import { currencyFractionDigits } from "../domain/currencies";
import type {
  DetectedPriceIdentity,
  TrackedDetectedPrice
} from "./focusTracker";

interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

interface DetectedPriceTransition {
  readonly count: number;
  readonly focusedIdentity: DetectedPriceIdentity | null;
  readonly explicitlyFocusedIdentity: DetectedPriceIdentity | null;
  readonly identities: ReadonlySet<DetectedPriceIdentity>;
}

export interface ExplicitPriceSelectionEvent {
  readonly identity: DetectedPriceIdentity;
  readonly renewed: boolean;
  readonly revision: number;
}

export interface ClearHeldPricesEvent {
  readonly clearedCount: number;
  readonly resumedAutomaticFocus: boolean;
  readonly revision: number;
}

function sortTopToBottomThenLeftToRight(
  left: TrackedDetectedPrice,
  right: TrackedDetectedPrice
): number {
  return (
    left.box.y - right.box.y ||
    left.box.x - right.box.x ||
    left.identity.localeCompare(right.identity)
  );
}

function hasSameMembership(
  left: readonly DetectedPriceIdentity[],
  right: readonly DetectedPriceIdentity[]
): boolean {
  return (
    left.length === right.length &&
    left.every((identity, index) => identity === right[index])
  );
}

function formatSourceCurrencyAmount(
  price: TrackedDetectedPrice,
  locale?: string
): string {
  const fractionDigits = currencyFractionDigits(price.currency);
  const amount = price.minorUnits / 10 ** fractionDigits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
    currencyDisplay: "code",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })
    .format(amount)
    .replaceAll(/\s/gu, " ");
}

function coarseGridPosition(
  price: TrackedDetectedPrice,
  previewSize: PreviewSize
): string {
  const centerX = price.box.x + price.box.width / 2;
  const centerY = price.box.y + price.box.height / 2;
  const column = Math.min(
    2,
    Math.max(0, Math.floor((centerX / Math.max(previewSize.width, 1)) * 3))
  );
  const row = Math.min(
    2,
    Math.max(0, Math.floor((centerY / Math.max(previewSize.height, 1)) * 3))
  );
  const rows = ["upper", "center", "lower"] as const;
  const columns = ["left", "center", "right"] as const;

  if (row === 1 && column === 1) {
    return "center";
  }
  return `${rows[row]} ${columns[column]}`;
}

function SemanticPriceList({
  orderedPrices,
  accessibleNames,
  focusedIdentity,
  previewSize,
  locale,
  buttonRefs,
  onFocusIdentity,
  onBlurIdentity,
  onSelect
}: {
  orderedPrices: readonly TrackedDetectedPrice[];
  accessibleNames: ReadonlyMap<DetectedPriceIdentity, string>;
  focusedIdentity: DetectedPriceIdentity | null;
  previewSize: PreviewSize;
  locale?: string;
  buttonRefs?: MutableRefObject<Map<DetectedPriceIdentity, HTMLButtonElement>>;
  onFocusIdentity?: (identity: DetectedPriceIdentity) => void;
  onBlurIdentity?: (identity: DetectedPriceIdentity) => void;
  onSelect: (identity: DetectedPriceIdentity) => void;
}) {
  return (
    <ul aria-label="Detected Prices">
      {orderedPrices.map((price) => {
        const isFocused = price.identity === focusedIdentity;
        return (
          <li key={price.identity}>
            <button
              ref={(button) => {
                if (!buttonRefs) return;
                if (button) {
                  buttonRefs.current.set(price.identity, button);
                } else {
                  buttonRefs.current.delete(price.identity);
                }
              }}
              type="button"
              aria-label={accessibleNames.get(price.identity)}
              aria-current={isFocused ? "true" : undefined}
              onFocus={() => onFocusIdentity?.(price.identity)}
              onBlur={() => onBlurIdentity?.(price.identity)}
              onClick={() => onSelect(price.identity)}
            >
              <span>
                <strong>{formatSourceCurrencyAmount(price, locale)}</strong>
                <small>{coarseGridPosition(price, previewSize)}</small>
              </span>
              {isFocused ? <em>Focused</em> : <span>Select</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AccessibleDetectedPriceList({
  detectedPrices,
  focusedPrice,
  explicitlyFocusedPriceIdentity,
  previewSize,
  locale,
  selectionEvent,
  clearHeldPricesEvent,
  modalOpen,
  onModalOpenChange,
  onSelect,
  onClearHeldPrices
}: {
  detectedPrices: readonly TrackedDetectedPrice[];
  focusedPrice: TrackedDetectedPrice | null;
  explicitlyFocusedPriceIdentity?: DetectedPriceIdentity | null;
  previewSize: PreviewSize;
  locale?: string;
  selectionEvent?: ExplicitPriceSelectionEvent | null;
  clearHeldPricesEvent?: ClearHeldPricesEvent | null;
  modalOpen?: boolean;
  onModalOpenChange?: (open: boolean) => void;
  onSelect: (identity: DetectedPriceIdentity) => void;
  onClearHeldPrices?: () => void;
}) {
  const headingId = useId();
  const dialogHeadingId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [uncontrolledModalOpen, setUncontrolledModalOpen] = useState(false);
  const isModalOpen = modalOpen ?? uncontrolledModalOpen;
  const [railOffset, setRailOffset] = useState({ x: 0, y: 0 });
  const railRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    railBounds: DOMRect;
    previewBounds: DOMRect;
  } | null>(null);
  const currentMembership = detectedPrices
    .map(({ identity }) => identity)
    .sort();
  const buttonRefs = useRef(
    new Map<DetectedPriceIdentity, HTMLButtonElement>()
  );
  const modalButtonRefs = useRef(
    new Map<DetectedPriceIdentity, HTMLButtonElement>()
  );
  const keyboardFocusedControlIdentity =
    useRef<DetectedPriceIdentity | null>(null);
  const orderedMembership = useRef<{
    sourceIdentities: DetectedPriceIdentity[];
    identities: DetectedPriceIdentity[];
    revision: object;
  }>({ sourceIdentities: [], identities: [], revision: {} });
  if (
    !hasSameMembership(
      orderedMembership.current.sourceIdentities,
      currentMembership
    )
  ) {
    orderedMembership.current = {
      sourceIdentities: currentMembership,
      identities: [...detectedPrices]
        .sort(sortTopToBottomThenLeftToRight)
        .map(({ identity }) => identity),
      revision: {}
    };
  }
  const membershipRevision = orderedMembership.current.revision;

  const pricesByIdentity = new Map(
    detectedPrices.map((price) => [price.identity, price])
  );
  const orderedPrices = orderedMembership.current.identities.flatMap(
    (identity) => {
      const price = pricesByIdentity.get(identity);
      return price ? [price] : [];
    }
  );
  const accessibleNames = new Map(
    orderedPrices.map((price, index) => [
      price.identity,
      `Price ${index + 1} of ${orderedPrices.length}, ${formatSourceCurrencyAmount(
        price,
        locale
      )}, ${coarseGridPosition(price, previewSize)}`
    ])
  );

  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusAfterClose = useRef(false);
  useLayoutEffect(() => {
    const previousFocusedControl = keyboardFocusedControlIdentity.current;
    if (previousFocusedControl && !pricesByIdentity.has(previousFocusedControl)) {
      keyboardFocusedControlIdentity.current = null;
      if (focusedPrice) {
        const focusedControl = isModalOpen
          ? modalButtonRefs.current.get(focusedPrice.identity)
          : buttonRefs.current.get(focusedPrice.identity);
        focusedControl?.focus();
      } else {
        (isModalOpen ? dialogHeadingRef.current : headingRef.current)?.focus();
      }
    }
  }, [isModalOpen, membershipRevision]);

  const previousModalOpen = useRef(false);
  useLayoutEffect(() => {
    const opened = isModalOpen && !previousModalOpen.current;
    const closed = !isModalOpen && previousModalOpen.current;
    previousModalOpen.current = isModalOpen;
    if (opened) {
      if (focusedPrice) {
        modalButtonRefs.current.get(focusedPrice.identity)?.focus();
      } else {
        dialogHeadingRef.current?.focus();
      }
      return;
    }
    if (closed && returnFocusAfterClose.current) {
      returnFocusAfterClose.current = false;
      expandButtonRef.current?.focus();
    }
  }, [isModalOpen]);

  const [announcement, setAnnouncement] = useState("");
  const localExplicitFocus = useRef<DetectedPriceIdentity | null>(null);
  const currentExplicitFocus =
    explicitlyFocusedPriceIdentity === undefined
      ? localExplicitFocus.current
      : explicitlyFocusedPriceIdentity;
  const pendingSelectionIdentity = useRef<DetectedPriceIdentity | null>(null);
  const pendingClearRevision = useRef<number | null>(null);

  useEffect(() => {
    if (!selectionEvent) return;
    const accessibleName = accessibleNames.get(selectionEvent.identity);
    if (!accessibleName) return;
    localExplicitFocus.current = selectionEvent.identity;
    pendingSelectionIdentity.current = selectionEvent.identity;
    setAnnouncement(
      selectionEvent.renewed
        ? `Explicit Focus Lock renewed for ${accessibleName}.`
        : `Focused and locked ${accessibleName}.`
    );
  }, [selectionEvent?.revision]);

  useEffect(() => {
    if (!clearHeldPricesEvent) return;
    pendingClearRevision.current = clearHeldPricesEvent.revision;
    const count = clearHeldPricesEvent.clearedCount;
    setAnnouncement(
      `${count.toLocaleString()} held ${
        count === 1 ? "Detected Price" : "Detected Prices"
      } cleared.${
        clearHeldPricesEvent.resumedAutomaticFocus
          ? " Automatic focus resumed."
          : ""
      }`
    );
  }, [clearHeldPricesEvent?.revision]);

  const previousTransition = useRef<DetectedPriceTransition>({
    count: 0,
    focusedIdentity: null,
    explicitlyFocusedIdentity: null,
    identities: new Set()
  });
  const focusedIdentity = focusedPrice?.identity ?? null;
  useEffect(() => {
    const previous = previousTransition.current;
    const identities = new Set(detectedPrices.map(({ identity }) => identity));
    const expiringExplicitFocus =
      previous.explicitlyFocusedIdentity ?? currentExplicitFocus;
    const explicitlyFocusedPriceExpired = Boolean(
      expiringExplicitFocus &&
        previous.identities.has(expiringExplicitFocus) &&
        !identities.has(expiringExplicitFocus)
    );
    const selectionHandledThisTransition =
      pendingSelectionIdentity.current !== null &&
      pendingSelectionIdentity.current === focusedIdentity;
    const clearHandledThisTransition =
      clearHeldPricesEvent !== undefined &&
      pendingClearRevision.current === clearHeldPricesEvent?.revision;
    let nextAnnouncement: string | null = null;

    if (clearHandledThisTransition || selectionHandledThisTransition) {
      pendingClearRevision.current = null;
      pendingSelectionIdentity.current = null;
    } else if (previous.count === 0 && detectedPrices.length > 0) {
      nextAnnouncement = `${detectedPrices.length} ${
        detectedPrices.length === 1 ? "Detected Price" : "Detected Prices"
      } available.`;
    } else if (explicitlyFocusedPriceExpired) {
      nextAnnouncement = focusedPrice
        ? `Explicitly Focused Price expired. Focused Price changed to ${accessibleNames.get(
            focusedPrice.identity
          )}.`
        : "Explicitly Focused Price expired. No Detected Prices available.";
    } else if (previous.count > 0 && detectedPrices.length === 0) {
      nextAnnouncement = "No Detected Prices available.";
    } else if (
      previous.focusedIdentity !== focusedIdentity &&
      focusedPrice
    ) {
      nextAnnouncement = `Focused Price changed to ${accessibleNames.get(
        focusedPrice.identity
      )}.`;
    }

    if (nextAnnouncement) {
      setAnnouncement(nextAnnouncement);
    }
    if (explicitlyFocusedPriceExpired) {
      localExplicitFocus.current = null;
    }
    previousTransition.current = {
      count: detectedPrices.length,
      focusedIdentity,
      explicitlyFocusedIdentity: explicitlyFocusedPriceExpired
        ? null
        : currentExplicitFocus,
      identities
    };
  }, [
    explicitlyFocusedPriceIdentity,
    focusedIdentity,
    membershipRevision,
    selectionEvent?.revision,
    clearHeldPricesEvent?.revision
  ]);

  const heading =
    detectedPrices.length === 0
      ? "Detected Prices — none available"
      : "Detected Prices";
  const heldPriceCount = detectedPrices.filter(
    ({ state }) => state === "held"
  ).length;

  const setModalState = (open: boolean) => {
    setUncontrolledModalOpen(open);
    onModalOpenChange?.(open);
  };
  const closeModal = () => {
    returnFocusAfterClose.current = true;
    setModalState(false);
  };
  const selectIdentity = (
    identity: DetectedPriceIdentity,
    dismissModal = false
  ) => {
    if (selectionEvent === undefined) {
      const accessibleName = accessibleNames.get(identity);
      const renewed = currentExplicitFocus === identity;
      localExplicitFocus.current = identity;
      pendingSelectionIdentity.current = identity;
      if (accessibleName) {
        setAnnouncement(
          renewed
            ? `Explicit Focus Lock renewed for ${accessibleName}.`
            : `Focused and locked ${accessibleName}.`
        );
      }
    }
    onSelect(identity);
    if (dismissModal) closeModal();
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const preview = rail?.parentElement;
    if (!rail || !preview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: railOffset.x,
      originY: railOffset.y,
      railBounds: rail.getBoundingClientRect(),
      previewBounds: preview.getBoundingClientRect()
    };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const requestedX = event.clientX - current.startX;
    const requestedY = event.clientY - current.startY;
    const minX = current.previewBounds.left - current.railBounds.left;
    const maxX = current.previewBounds.right - current.railBounds.right;
    const minY = current.previewBounds.top - current.railBounds.top;
    const maxY = current.previewBounds.bottom - current.railBounds.bottom;
    setRailOffset({
      x:
        current.originX + Math.min(maxX, Math.max(minX, requestedX)),
      y:
        current.originY + Math.min(maxY, Math.max(minY, requestedY))
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? [])];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const modal = isModalOpen
    ? createPortal(
        <div
          className="detected-prices-sheet-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            ref={dialogRef}
            className="detected-prices-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogHeadingId}
            onKeyDown={trapDialogFocus}
          >
            <div className="detected-prices-sheet-heading">
              <h2
                id={dialogHeadingId}
                ref={dialogHeadingRef}
                tabIndex={-1}
              >
                All Detected Prices
              </h2>
              <button type="button" onClick={closeModal}>
                Close Detected Prices
              </button>
            </div>
            {orderedPrices.length > 0 ? (
              <SemanticPriceList
                orderedPrices={orderedPrices}
                accessibleNames={accessibleNames}
                focusedIdentity={focusedIdentity}
                previewSize={previewSize}
                locale={locale}
                buttonRefs={modalButtonRefs}
                onFocusIdentity={(identity) => {
                  keyboardFocusedControlIdentity.current = identity;
                }}
                onBlurIdentity={(identity) => {
                  if (keyboardFocusedControlIdentity.current === identity) {
                    keyboardFocusedControlIdentity.current = null;
                  }
                }}
                onSelect={(identity) => selectIdentity(identity, true)}
              />
            ) : (
              <p>No Detected Prices available.</p>
            )}
            {heldPriceCount > 0 && onClearHeldPrices ? (
              <button
                className="clear-held-prices"
                type="button"
                onClick={onClearHeldPrices}
              >
                Clear held prices
              </button>
            ) : null}
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <section
        ref={railRef}
        className={`accessible-price-list detected-prices-rail${
          collapsed ? " is-collapsed" : ""
        }`}
        style={{
          transform: `translate(${railOffset.x.toString()}px, ${railOffset.y.toString()}px)`
        }}
        aria-label="Detected Prices rail"
      >
        <div
          className="detected-prices-drag-handle"
          data-detected-prices-drag-handle=""
          aria-hidden="true"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span />
        </div>
        <div className="detected-prices-rail-heading">
          <div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>
              {heading}
            </h2>
            <p>
              {detectedPrices.length.toLocaleString()} Detected {detectedPrices.length === 1 ? "Price" : "Prices"}
            </p>
          </div>
          <button
            type="button"
            aria-label={
              collapsed
                ? "Show Detected Price controls"
                : "Collapse Detected Prices rail"
            }
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
          </button>
        </div>
        <p className="detected-prices-focused-summary">
          <strong>Focused</strong>{" "}
          {focusedPrice
            ? formatSourceCurrencyAmount(focusedPrice, locale)
            : "None"}
        </p>
        <button
          ref={expandButtonRef}
          className="expand-detected-prices"
          type="button"
          onClick={() => setModalState(true)}
          aria-haspopup="dialog"
          aria-expanded={isModalOpen}
        >
          Expand Detected Prices
        </button>
        {!collapsed && orderedPrices.length > 0 ? (
          <SemanticPriceList
            orderedPrices={orderedPrices}
            accessibleNames={accessibleNames}
            focusedIdentity={focusedIdentity}
            previewSize={previewSize}
            locale={locale}
            buttonRefs={buttonRefs}
            onFocusIdentity={(identity) => {
              keyboardFocusedControlIdentity.current = identity;
            }}
            onBlurIdentity={(identity) => {
              if (keyboardFocusedControlIdentity.current === identity) {
                keyboardFocusedControlIdentity.current = null;
              }
            }}
            onSelect={selectIdentity}
          />
        ) : null}
        {!collapsed && heldPriceCount > 0 && onClearHeldPrices ? (
          <button
            className="clear-held-prices"
            type="button"
            onClick={onClearHeldPrices}
          >
            Clear held prices
          </button>
        ) : null}
        <div
          className="visually-hidden"
          role="status"
          aria-label="Detected Price updates"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </div>
      </section>
      {modal}
    </>
  );
}
