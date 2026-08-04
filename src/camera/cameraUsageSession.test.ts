import { describe, expect, it, vi } from "vitest";

import { createCameraUsageSession } from "./cameraUsageSession";

describe("Camera Usage session", () => {
  it("charges atomically at its first Focused Price and never again", async () => {
    const charge = vi.fn(async () => true);
    const session = createCameraUsageSession(charge);

    await expect(session.observeFocusedPrice(false)).resolves.toBe(false);
    await expect(session.observeFocusedPrice(true)).resolves.toBe(true);
    await expect(session.observeFocusedPrice(false)).resolves.toBe(false);
    await expect(session.observeFocusedPrice(true)).resolves.toBe(false);
    expect(charge).toHaveBeenCalledOnce();
  });

  it("deduplicates the session while an asynchronous charge is pending", async () => {
    let resolveCharge!: (charged: boolean) => void;
    const charge = vi.fn(
      () => new Promise<boolean>((resolve) => (resolveCharge = resolve))
    );
    const session = createCameraUsageSession(charge);

    const first = session.observeFocusedPrice(true);
    await expect(session.observeFocusedPrice(true)).resolves.toBe(false);
    expect(charge).toHaveBeenCalledOnce();
    resolveCharge(false);
    await expect(first).resolves.toBe(false);
  });
});
