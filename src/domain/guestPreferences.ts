import {
  isCurrencyCode,
  SOURCE_CURRENCIES,
  type CurrencyCode
} from "./currencies";

const STORAGE_KEY = "taglingo.guest-preferences.v1";

export interface GuestPreferences {
  sourceCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
}

const DEFAULT_PREFERENCES: GuestPreferences = {
  sourceCurrency: "JPY",
  targetCurrency: "USD"
};

function isSourceCurrency(value: unknown): value is CurrencyCode {
  return SOURCE_CURRENCIES.some(({ code }) => code === value);
}

function isGuestPreferences(value: unknown): value is GuestPreferences {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GuestPreferences>;
  return (
    isSourceCurrency(candidate.sourceCurrency) &&
    isCurrencyCode(candidate.targetCurrency)
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
