import { describe, expect, it } from "vitest";

import { SOURCE_CURRENCIES } from "./currencies";
import {
  GUEST_CAMERA_CURRENCIES,
  isGuestCameraCurrency,
  resolveFoundationCameraAccess
} from "./cameraAccess";

describe("foundation camera access", () => {
  it.each(SOURCE_CURRENCIES)(
    "allows an Approved Member to use the shared runtime for $code",
    ({ code }) => {
      expect(
        resolveFoundationCameraAccess({
          sourceCurrency: code,
          isApprovedMember: true
        })
      ).toBe(true);
    }
  );

  it.each(SOURCE_CURRENCIES)(
    "applies the Guest Camera Currency policy to $code",
    ({ code }) => {
      expect(
        resolveFoundationCameraAccess({
          sourceCurrency: code,
          isApprovedMember: false,
          guestCameraAllowanceAvailable: true
        })
      ).toBe(isGuestCameraCurrency(code));
    }
  );

  it("exposes the one shared Guest Camera Currency predicate", () => {
    expect(SOURCE_CURRENCIES.filter(({ code }) => isGuestCameraCurrency(code)))
      .toEqual(SOURCE_CURRENCIES.filter(({ code }) =>
        ["USD", "AUD", "JPY", "TWD", "EUR"].includes(code)
      ));
  });

  it.each(GUEST_CAMERA_CURRENCIES)(
    "closes Guest $code camera access when the rolling allowance is exhausted",
    (sourceCurrency) => {
      expect(
        resolveFoundationCameraAccess({
          sourceCurrency,
          isApprovedMember: false,
          guestCameraAllowanceAvailable: false
        })
      ).toBe(false);
    }
  );
});
