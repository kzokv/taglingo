import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";

import type {
  CameraWorkspaceAccessStatus,
  CameraWorkspaceSaveStatus
} from "./cameraWorkspace";
import {
  formatCurrencyMinorUnits,
  searchTargetCurrencies,
  SOURCE_CURRENCIES,
  type CurrencyAmount,
  type CurrencyCode,
  type SourceCurrencyCode
} from "../domain/currencies";
import {
  getManualPriceEntryGuidance,
  parseManualPriceEntry,
  type EnteredPrice
} from "../domain/manualPriceEntry";
import type { GuestRateView, GuestRateViews } from "../fx/useGuestRate";
import { convertWithReferenceRate } from "../fx/referenceRate";
import type {
  FocusedPriceBehavior,
  ManualEntryPromotion
} from "../member/memberPreferencesApi";
import type { RecognitionHealthPreferences } from "../recognitionHealth/recognitionHealth";

export interface ExperiencePreferences {
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
  manualEntryPromotion: ManualEntryPromotion;
  focusedPriceBehavior: FocusedPriceBehavior;
}

type MemberAccessStatus = CameraWorkspaceAccessStatus;
type MemberSaveStatus = CameraWorkspaceSaveStatus;
export const CHECKING_MEMBER_ACCESS_LABEL = "Checking member access";

export function TagLingoMark() {
  return (
    <div className="brand" aria-label="TagLingo">
      <span className="brand-mark" aria-hidden="true">
        TL
      </span>
      <span>TagLingo</span>
    </div>
  );
}

export function CurrencySettings({
  preferences,
  onChange,
  isApprovedMember,
  memberAccessStatus = isApprovedMember ? "approved" : "guest",
  compact = false,
  sourceCurrencyDisabled = false
}: {
  preferences: ExperiencePreferences;
  onChange: (preferences: ExperiencePreferences) => void;
  isApprovedMember: boolean;
  memberAccessStatus?: MemberAccessStatus;
  compact?: boolean;
  sourceCurrencyDisabled?: boolean;
}) {
  const [isTargetPickerOpen, setIsTargetPickerOpen] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const targetPickerRef = useRef<HTMLDivElement>(null);
  const targetTriggerRef = useRef<HTMLButtonElement>(null);
  const targetListId = useId();
  const matches = searchTargetCurrencies(targetQuery).filter(
    ({ code }) => code !== preferences.sourceCurrency
  );
  const maxTargets = isApprovedMember ? 3 : 1;
  const accessLabel = isApprovedMember
    ? "Approved Member · up to 3"
    : memberAccessStatus === "loading"
      ? CHECKING_MEMBER_ACCESS_LABEL
      : memberAccessStatus === "unavailable"
        ? "Signed in · access unavailable"
        : memberAccessStatus === "inactive"
          ? "Signed in · Guest limits"
          : memberAccessStatus === "guest-choice"
            ? "Signed in · Guest limits"
            : "Guest · 1";

  useEffect(() => {
    if (!isTargetPickerOpen) {
      return undefined;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!targetPickerRef.current?.contains(event.target as Node)) {
        setIsTargetPickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTargetPickerOpen(false);
        targetTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isTargetPickerOpen]);

  const updateSource = (event: ChangeEvent<HTMLSelectElement>) => {
    const sourceCurrency = event.target.value as SourceCurrencyCode;
    const targetCurrencies = preferences.targetCurrencies.map((target) =>
      target === sourceCurrency ? preferences.sourceCurrency : target
    );
    onChange({ ...preferences, sourceCurrency, targetCurrencies });
  };
  const toggleTarget = (target: CurrencyCode) => {
    const isSelected = preferences.targetCurrencies.includes(target);
    if (isSelected) {
      if (preferences.targetCurrencies.length === 1) {
        return;
      }
      onChange({
        ...preferences,
        targetCurrencies: preferences.targetCurrencies.filter(
          (selected) => selected !== target
        )
      });
      return;
    }
    onChange({
      ...preferences,
      targetCurrencies:
        maxTargets === 1
          ? [target]
          : [...preferences.targetCurrencies, target]
    });
  };

  return (
    <div className={compact ? "currency-grid compact" : "currency-grid"}>
      <label className="field">
        <span>Source Currency</span>
        <select
          name={compact ? "cameraSourceCurrency" : "sourceCurrency"}
          value={preferences.sourceCurrency}
          disabled={sourceCurrencyDisabled}
          onChange={updateSource}
        >
          {SOURCE_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </label>

      <div className="target-currency-picker field" ref={targetPickerRef}>
        <span>
          Target Currency <em>{accessLabel}</em>
        </span>
        <button
          ref={targetTriggerRef}
          className="target-currency-trigger"
          type="button"
          aria-label={`Target Currencies: ${preferences.targetCurrencies.length} selected · ${preferences.targetCurrencies.join(" · ")}`}
          aria-haspopup="listbox"
          aria-expanded={isTargetPickerOpen}
          aria-controls={isTargetPickerOpen ? targetListId : undefined}
          onClick={() => setIsTargetPickerOpen((open) => !open)}
        >
          <strong>{preferences.targetCurrencies.length} selected</strong>
          <small>{preferences.targetCurrencies.join(" · ")}</small>
          <span aria-hidden="true">⌄</span>
        </button>
        {isTargetPickerOpen ? (
          <div className="target-currency-popover">
            <div className="target-currency-heading">
              <div>
                <strong>Choose Target Currencies</strong>
                <span>
                  {preferences.targetCurrencies.length} of {maxTargets} selected
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTargetPickerOpen(false);
                  targetTriggerRef.current?.focus();
                }}
              >
                Done
              </button>
            </div>
            <label className="target-currency-search">
              <span className="visually-hidden">Search Target Currencies</span>
              <input
                name={compact ? "cameraTargetCurrencySearch" : "targetCurrencySearch"}
                type="search"
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder="Search code, currency, or alias"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div
              id={targetListId}
              className="target-currency-list"
              role="listbox"
              aria-label="Target Currencies"
              aria-multiselectable={isApprovedMember}
            >
              {matches.map((currency) => {
                const isSelected = preferences.targetCurrencies.includes(
                  currency.code
                );
                const isDisabled =
                  (isSelected && preferences.targetCurrencies.length === 1) ||
                  (!isSelected &&
                    maxTargets > 1 &&
                    preferences.targetCurrencies.length >= maxTargets);
                return (
                  <button
                    key={currency.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled}
                    disabled={isDisabled}
                    onClick={() => toggleTarget(currency.code)}
                  >
                    <span className="target-currency-name">
                      <strong>{currency.code}</strong>
                      <small>{currency.name}</small>
                    </span>
                    <span className="target-currency-check" aria-hidden="true">
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
              {matches.length === 0 ? (
                <p className="target-currency-empty">No matching currency</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecognitionExperienceSettings({
  preferences,
  onChange,
  compact = false
}: {
  preferences: ExperiencePreferences;
  onChange: (preferences: ExperiencePreferences) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`recognition-experience-settings ${compact ? "compact" : ""}`}
      aria-label="Recognition Experience Settings"
    >
      <div>
        <strong>Recognition Experience Settings</strong>
        <p>These choices synchronize across your Approved Member devices.</p>
      </div>
      <div className="recognition-experience-fields">
        <label className="field">
          <span>Show Manual Price Entry</span>
          <select
            name={compact ? "cameraManualEntryPromotion" : "manualEntryPromotion"}
            value={preferences.manualEntryPromotion}
            onChange={(event) =>
              onChange({
                ...preferences,
                manualEntryPromotion: event.target.value as ManualEntryPromotion
              })
            }
          >
            <option value="after-3-seconds">After 3 seconds</option>
            <option value="after-5-seconds">After 5 seconds</option>
            <option value="after-10-seconds">After 10 seconds</option>
            <option value="only-on-request">Only when I ask</option>
          </select>
        </label>
        <label className="field">
          <span>When a Focused Price appears</span>
          <select
            name={compact ? "cameraFocusedPriceBehavior" : "focusedPriceBehavior"}
            value={preferences.focusedPriceBehavior}
            onChange={(event) =>
              onChange({
                ...preferences,
                focusedPriceBehavior: event.target.value as FocusedPriceBehavior
              })
            }
          >
            <option value="automatic">Convert automatically</option>
            <option value="confirm">Ask before using it</option>
          </select>
        </label>
      </div>
      <p className="fixed-recognition-rules">
        Recognition rules stay fixed. Confidence, evidence, notation, geometry,
        preprocessing, and stability are not shopper-editable.
      </p>
    </section>
  );
}


export function ManualPriceComposer({
  sourceCurrency,
  enteredPrice,
  expanded,
  compact = false,
  onEnteredPriceChange,
  onExpandedChange
}: {
  sourceCurrency: SourceCurrencyCode;
  enteredPrice: EnteredPrice | null;
  expanded: boolean;
  compact?: boolean;
  onEnteredPriceChange: (enteredPrice: EnteredPrice | null) => void;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const composerContentId = useId();
  const amountInputId = useId();
  const enteredPriceHeadingId = useId();
  const amountHelpId = useId();
  const entryGuidance = getManualPriceEntryGuidance(sourceCurrency);

  useEffect(() => {
    setAmount("");
    setError(null);
  }, [sourceCurrency]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseManualPriceEntry(sourceCurrency, amount);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onEnteredPriceChange(result.enteredPrice);
  };

  const reset = () => {
    setAmount("");
    setError(null);
    onEnteredPriceChange(null);
  };

  return (
    <section
      className={`manual-price-composer ${compact ? "compact-composer" : ""}`}
      aria-label="Manual Price Entry"
    >
      {onExpandedChange ? (
        <button
          className="manual-composer-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={composerContentId}
          aria-label={`${expanded ? "Close" : "Open"} Manual Price Entry`}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span aria-hidden="true">✎</span>
          <span>
            <strong>Manual Price Entry</strong>
            <small>
              {enteredPrice
                ? `Entered Price · ${enteredPrice.currency} ${enteredPrice.displayAmount}`
                : `${sourceCurrency} · Available anytime`}
            </small>
          </span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      ) : null}

      {expanded ? (
        <div id={composerContentId} className="manual-composer-content">
          <form className="manual-entry-form" onSubmit={submit}>
            <label htmlFor={amountInputId}>
              <span>{sourceCurrency} amount</span>
            </label>
            <div
              className={
                error ? "manual-amount-field has-error" : "manual-amount-field"
              }
            >
              <span aria-hidden="true">{sourceCurrency}</span>
              <input
                id={amountInputId}
                name="manualPriceAmount"
                inputMode="decimal"
                autoComplete="off"
                maxLength={32}
                value={amount}
                aria-describedby={amountHelpId}
                aria-invalid={Boolean(error)}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={entryGuidance.placeholder}
              />
            </div>
            <p
              id={amountHelpId}
              className={error ? "manual-entry-help error" : "manual-entry-help"}
            >
              {error ?? entryGuidance.message}
            </p>
            <button className="primary-button" type="submit">
              Convert Entered Price <span aria-hidden="true">→</span>
            </button>
          </form>

          {enteredPrice ? (
            <section
              className="entered-price-card"
              role="region"
              aria-labelledby={enteredPriceHeadingId}
            >
              <div>
                <span aria-hidden="true">✎</span>
                <div>
                  <h2 id={enteredPriceHeadingId}>Entered Price</h2>
                  <p>Entered manually · not camera-derived</p>
                </div>
              </div>
              <strong>
                {enteredPrice.currency} {enteredPrice.displayAmount}
              </strong>
              <button className="text-button" type="button" onClick={reset}>
                Enter another price
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}



function ConversionRow({
  price,
  sourceCurrency,
  targetCurrency,
  guestRate,
  emptyMessage,
  collapsibleReferenceRateDetails
}: {
  price: CurrencyAmount | null;
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  guestRate: GuestRateView;
  emptyMessage: string;
  collapsibleReferenceRateDetails: boolean;
}) {
  if (guestRate.phase === "loading") {
    return (
      <div className="conversion-card" role="status">
        <strong>Loading Reference Rate…</strong>
      </div>
    );
  }
  if (guestRate.phase === "error") {
    const retryLabel =
      guestRate.reason === "quota"
        ? "Try Reference Rate again"
        : guestRate.reason === "unauthenticated"
          ? "Retry after sign in"
          : guestRate.reason === "unauthorized"
            ? "Try authorized Reference Rate again"
            : "Reconnect and retry";
    return (
      <div className="conversion-card conversion-error" role="alert">
        <strong>Conversion unavailable</strong>
        <p>{guestRate.error}</p>
        <button className="text-button" type="button" onClick={guestRate.retry}>
          {retryLabel}
        </button>
      </div>
    );
  }
  if (
    price === null ||
    price.currency !== sourceCurrency
  ) {
    return (
      <div className="conversion-card" role="status">
        <strong>Reference Rate ready</strong>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const convertedMinorUnits = convertWithReferenceRate(
    price,
    guestRate.rate
  );
  const formatted = formatCurrencyMinorUnits(
    convertedMinorUnits,
    targetCurrency
  );

  const referenceRateDetails = (
    <>
      <dl>
        <div>
          <dt>Reference Rate</dt>
          <dd>
            1 {sourceCurrency} = {guestRate.rate.value} {targetCurrency}
          </dd>
        </div>
        <div>
          <dt>Effective date</dt>
          <dd>Effective {guestRate.rate.providerPublishedDate}</dd>
        </div>
      </dl>
      <p className="rate-attribution">{guestRate.rate.attribution}</p>
      {guestRate.rate.state === "offline" ? (
        <p className="offline-snapshot-state" role="status">
          Offline · Rate Snapshot
        </p>
      ) : null}
      <p className="rate-disclaimer">
        Reference estimate; your payment rate may differ.
      </p>
    </>
  );

  return (
    <section
      className="conversion-card"
      aria-label={`${targetCurrency} conversion`}
    >
      <div className="conversion-heading">
        <span>Target Currency</span>
        <strong>
          {targetCurrency} {formatted}
        </strong>
      </div>
      {collapsibleReferenceRateDetails ? (
        <details className="reference-rate-details">
          <summary>About this estimate</summary>
          {referenceRateDetails}
        </details>
      ) : (
        referenceRateDetails
      )}
    </section>
  );
}

export function ConversionLedger({
  price,
  sourceCurrency,
  targetCurrencies,
  isApprovedMember,
  rates,
  emptyMessage = "Point at a price to see the conversion.",
  onContinueAsGuest,
  collapsibleReferenceRateDetails = false
}: {
  price: CurrencyAmount | null;
  sourceCurrency: CurrencyCode;
  targetCurrencies: CurrencyCode[];
  isApprovedMember: boolean;
  rates: GuestRateViews;
  emptyMessage?: string;
  onContinueAsGuest: () => void;
  collapsibleReferenceRateDetails?: boolean;
}) {
  const accessFailure = targetCurrencies
    .map((targetCurrency) => rates[targetCurrency])
    .find(
      (rate) =>
        rate?.phase === "error" &&
        (rate.reason === "unauthenticated" || rate.reason === "unauthorized")
    );
  return (
    <section
      className="conversion-ledger"
      aria-label={
        isApprovedMember ? "Approved Member conversions" : "Guest conversion"
      }
    >
      {accessFailure?.phase === "error" ? (
        <div className="conversion-card conversion-error" role="alert">
          <strong>Approved Member Reference Rates unavailable</strong>
          <p>{accessFailure.error}</p>
          <button
            className="text-button"
            type="button"
            onClick={onContinueAsGuest}
          >
            Continue as Guest
          </button>
        </div>
      ) : null}
      {targetCurrencies.map((targetCurrency) => (
        rates[targetCurrency]?.phase === "error" &&
        (rates[targetCurrency].reason === "unauthenticated" ||
          rates[targetCurrency].reason === "unauthorized") ? null : (
          <ConversionRow
            key={targetCurrency}
            price={price}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            guestRate={
              rates[targetCurrency] ?? {
                phase: "loading",
                rate: null,
                error: null,
                retry: () => undefined
              }
            }
            emptyMessage={emptyMessage}
            collapsibleReferenceRateDetails={collapsibleReferenceRateDetails}
          />
        )
      ))}
    </section>
  );
}


function RecognitionHealthDisclosure() {
  return (
    <div className="recognition-health-disclosure">
      <p>One future camera session may share only:</p>
      <ul>
        <li>app release and summary schema version;</li>
        <li>coarse platform family and Source Currency;</li>
        <li>bucketed readiness, first-detection, and first-focus timing;</li>
        <li>
          bucketed recognition pass, miss, focus-change, and stable-detection
          counts; and
        </li>
        <li>a fixed terminal outcome and broad error family.</li>
      </ul>
      <p>
        No account or stable identifier, camera or price content, coordinates,
        exact time, URL, referrer, locale, membership state, Target Currency,
        message, or stack is included.
      </p>
    </div>
  );
}

export function RecognitionHealthPrivacy({
  preferences,
  invitation,
  settingsOpen,
  onChange,
  onDismissInvitation,
  onCloseSettings
}: {
  preferences: RecognitionHealthPreferences;
  invitation: boolean;
  settingsOpen: boolean;
  onChange: (enabled: boolean) => void;
  onDismissInvitation: () => void;
  onCloseSettings: () => void;
}) {
  if (!invitation && !settingsOpen) return null;
  return (
    <section
      className="recognition-health-card"
      aria-label={
        settingsOpen
          ? "Privacy settings"
          : "Anonymous recognition health invitation"
      }
    >
      <div className="recognition-health-heading">
        <div>
          <span>
            {settingsOpen ? "Privacy settings" : "Optional privacy choice"}
          </span>
          <h2>Share anonymous recognition health</h2>
        </div>
        {settingsOpen ? (
          <button
            className="text-button"
            type="button"
            onClick={onCloseSettings}
          >
            Close settings
          </button>
        ) : null}
      </div>
      <RecognitionHealthDisclosure />
      {settingsOpen ? (
        <>
          <label className="recognition-health-toggle">
            <input
              type="checkbox"
              checked={preferences.sharingEnabled}
              onChange={(event) => onChange(event.target.checked)}
            />
            <span>Share for future camera sessions</span>
          </label>
          <p>
            This choice stays only in this browser and is independent of camera
            access. Prior anonymous contributions cannot be isolated; they remain
            only in thresholded aggregates until expiry.
          </p>
        </>
      ) : (
        <div className="recognition-health-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => onChange(true)}
          >
            Share future summaries
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onDismissInvitation}
          >
            Not now
          </button>
        </div>
      )}
    </section>
  );
}

export function MemberStatusPanel({
  accessStatus,
  saveStatus,
  onRetryAccess,
  onRetrySave
}: {
  accessStatus: MemberAccessStatus;
  saveStatus: MemberSaveStatus;
  onRetryAccess: () => void;
  onRetrySave: () => void;
}) {
  if (accessStatus === "inactive") {
    return (
      <div className="account-status" role="status">
        <strong>Signed in with Guest limits</strong>
        <p>
          An active membership is not available. Continue scanning as a Guest
          or ask the owner to review access.
        </p>
      </div>
    );
  }
  if (accessStatus === "guest-choice") {
    return (
      <div className="account-status" role="status">
        <strong>Using Guest mode</strong>
        <p>
          The account remains signed in, but scanning now uses one Target
          Currency and browser-local preferences.
        </p>
      </div>
    );
  }
  if (accessStatus === "unavailable") {
    return (
      <div className="account-status account-error" role="alert">
        <strong>Could not verify Approved Member access</strong>
        <p>Check the connection or account session, then try again.</p>
        <button className="text-button" type="button" onClick={onRetryAccess}>
          Retry member access
        </button>
      </div>
    );
  }
  if (saveStatus === "error") {
    return (
      <div className="account-status account-error" role="alert">
        <strong>Member settings were not saved</strong>
        <p>
          Your choices remain visible here, but protected Reference Rates wait
          until D1 synchronization succeeds.
        </p>
        <button className="text-button" type="button" onClick={onRetrySave}>
          Retry saving settings
        </button>
      </div>
    );
  }
  if (saveStatus === "saving") {
    return (
      <div className="account-status" role="status">
        Saving member settings…
      </div>
    );
  }
  return null;
}
