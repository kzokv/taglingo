import { describe, expect, it } from "vitest";

import { SOURCE_CURRENCIES } from "./currencies";
import { resolveFoundationCameraAccess } from "./cameraAccess";

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
    "keeps Guest $code camera access closed until the rolling allowance lands",
    ({ code }) => {
      expect(
        resolveFoundationCameraAccess({
          sourceCurrency: code,
          isApprovedMember: false
        })
      ).toBe(false);
    }
  );
});
