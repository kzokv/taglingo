import {
  isCurrencyCode,
  SOURCE_CURRENCIES,
  type CurrencyCode,
  type SourceCurrencyCode
} from "./currencies";
import { hasExactKeys } from "./exactObject";

const STORAGE_KEY = "taglingo.guest-preferences.v1";

export interface GuestPreferences {
  sourceCurrency: SourceCurrencyCode;
  targetCurrency: CurrencyCode;
}

const DEFAULT_PREFERENCES: GuestPreferences = {
  sourceCurrency: "JPY",
  targetCurrency: "USD"
};

function isSourceCurrency(value: unknown): value is SourceCurrencyCode {
  return SOURCE_CURRENCIES.some(({ code }) => code === value);
}

function isGuestPreferences(value: unknown): value is GuestPreferences {
  if (!hasExactKeys(value, ["sourceCurrency", "targetCurrency"])) {
    return false;
  }

  const candidate = value;
  return (
    isSourceCurrency(candidate.sourceCurrency) &&
    isCurrencyCode(candidate.targetCurrency) &&
    candidate.sourceCurrency !== candidate.targetCurrency
  );
}

export function createGuestPreferenceStore(storage?: Storage) {
  return {
    load(): GuestPreferences {
      try {
        const rawPreferences = storage?.getItem(STORAGE_KEY);
        if (!rawPreferences) {
          return DEFAULT_PREFERENCES;
        }

        const preferences: unknown = JSON.parse(rawPreferences);
        return isGuestPreferences(preferences)
          ? preferences
          : DEFAULT_PREFERENCES;
      } catch {
        return DEFAULT_PREFERENCES;
      }
    },

    save(preferences: GuestPreferences): void {
      if (!isGuestPreferences(preferences)) {
        return;
      }

      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
      } catch {
        // A Guest can continue with in-memory preferences if storage is blocked.
      }
    }
  };
}
