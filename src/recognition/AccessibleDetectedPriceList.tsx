import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";

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

export function AccessibleDetectedPriceList({
  detectedPrices,
  focusedPrice,
  explicitlyFocusedPriceIdentity,
  previewSize,
  locale,
  onSelect
}: {
  detectedPrices: readonly TrackedDetectedPrice[];
  focusedPrice: TrackedDetectedPrice | null;
  explicitlyFocusedPriceIdentity?: DetectedPriceIdentity | null;
  previewSize: PreviewSize;
  locale?: string;
  onSelect: (identity: DetectedPriceIdentity) => void;
}) {
  const headingId = useId();
  const currentMembership = detectedPrices
    .map(({ identity }) => identity)
    .sort();
  const buttonRefs = useRef(
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
  useLayoutEffect(() => {
    const previousFocusedControl = keyboardFocusedControlIdentity.current;
    if (previousFocusedControl && !pricesByIdentity.has(previousFocusedControl)) {
      keyboardFocusedControlIdentity.current = null;
      if (focusedPrice) {
        buttonRefs.current.get(focusedPrice.identity)?.focus();
      } else {
        headingRef.current?.focus();
      }
    }
  }, [membershipRevision]);

  const [announcement, setAnnouncement] = useState("");
  const localExplicitFocus = useRef<DetectedPriceIdentity | null>(null);
  const currentExplicitFocus =
    explicitlyFocusedPriceIdentity ?? localExplicitFocus.current;
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
    let nextAnnouncement: string | null = null;

    if (previous.count === 0 && detectedPrices.length > 0) {
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
  }, [explicitlyFocusedPriceIdentity, focusedIdentity, membershipRevision]);

  const heading =
    detectedPrices.length === 0
      ? "Detected Prices — none available"
      : "Detected Prices";

  return (
    <section className="accessible-price-list" aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>
        {heading}
      </h2>
      {orderedPrices.length > 0 ? (
        <ul aria-label="Detected Prices">
          {orderedPrices.map((price) => {
            const isFocused = price.identity === focusedIdentity;
            const accessibleName = accessibleNames.get(price.identity)!;
            return (
              <li key={price.identity}>
                <button
                  ref={(button) => {
                    if (button) {
                      buttonRefs.current.set(price.identity, button);
                    } else {
                      buttonRefs.current.delete(price.identity);
                    }
                  }}
                  type="button"
                  aria-label={accessibleName}
                  aria-current={isFocused ? "true" : undefined}
                  onFocus={() => {
                    keyboardFocusedControlIdentity.current = price.identity;
                  }}
                  onBlur={() => {
                    if (
                      keyboardFocusedControlIdentity.current === price.identity
                    ) {
                      keyboardFocusedControlIdentity.current = null;
                    }
                  }}
                  onClick={() => {
                    localExplicitFocus.current = price.identity;
                    onSelect(price.identity);
                  }}
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
      ) : null}
      <div
        className="visually-hidden"
        role="status"
        aria-label="Detected Price updates"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </section>
  );
}
