import { describe, expect, it } from "vitest";

import { createGuestPreferenceStore } from "./guestPreferences";

describe("Guest Preference Store", () => {
  it("restores the Guest's Source and single Target Currency", () => {
    const firstVisit = createGuestPreferenceStore(window.localStorage);
    firstVisit.save({ sourceCurrency: "JPY", targetCurrency: "TWD" });

    const reloadedVisit = createGuestPreferenceStore(window.localStorage);

    expect(reloadedVisit.load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "TWD"
    });
  });

  it("uses safe defaults when browser data is malformed", () => {
    window.localStorage.setItem(
      "taglingo.guest-preferences.v1",
      JSON.stringify({ sourceCurrency: "BTC", targetCurrency: ["USD", "EUR"] })
    );

    expect(createGuestPreferenceStore(window.localStorage).load()).toEqual({
      sourceCurrency: "JPY",
      targetCurrency: "USD"
    });
  });
});
