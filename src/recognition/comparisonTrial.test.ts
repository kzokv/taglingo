import { describe, expect, it, vi } from "vitest";

import {
  COMPARISON_PROFILE_LIMITS,
  JPY_COMPARISON_PROFILES
} from "./comparisonProfiles";
import { createComparisonTrial } from "./comparisonTrial";
import type { OcrRecognizer } from "./ocrRecognizer";
import { createSameOriginRecognitionFetch } from "./paddleOcrRecognizer";

function recognizer({ failPrepare = false } = {}): OcrRecognizer {
  return {
    prepare: vi.fn().mockImplementation(async () => {
      if (failPrepare) {
        throw new Error("profile failed");
      }
    }),
    recognize: vi.fn().mockResolvedValue([]),
    terminate: vi.fn().mockResolvedValue(undefined)
  };
}

describe("comparison trial lifecycle", () => {
  it("keeps only one profile resident and releases it at trial end", async () => {
    const resident = recognizer();
    const createRecognizer = vi.fn().mockReturnValue(resident);
    const trial = createComparisonTrial({ createRecognizer });

    const selected = await trial.start(JPY_COMPARISON_PROFILES[0]);

    expect(selected).toBe(resident);
    expect(createRecognizer).toHaveBeenCalledOnce();
    await expect(
      trial.start(JPY_COMPARISON_PROFILES[1])
    ).rejects.toThrow(/already resident/i);
    expect(createRecognizer).toHaveBeenCalledOnce();

    await trial.terminate();
    expect(resident.terminate).toHaveBeenCalledOnce();
  });

  it("latches a failed profile and never loads another engine in the same trial", async () => {
    const failed = recognizer({ failPrepare: true });
    const createRecognizer = vi.fn().mockReturnValue(failed);
    const trial = createComparisonTrial({ createRecognizer });

    await expect(trial.start(JPY_COMPARISON_PROFILES[0])).rejects.toThrow(
      "profile failed"
    );
    await expect(
      trial.start(JPY_COMPARISON_PROFILES[2])
    ).rejects.toThrow(/failed profile/i);
    expect(createRecognizer).toHaveBeenCalledOnce();
    expect(failed.terminate).toHaveBeenCalledOnce();
  });

  it("does not load a profile that exceeds a hard budget", async () => {
    const createRecognizer = vi.fn().mockReturnValue(recognizer());
    const trial = createComparisonTrial({ createRecognizer });
    const profile = JPY_COMPARISON_PROFILES[0];
    const overBudget = {
      ...profile,
      budget: {
        ...profile.budget,
        transferBytes:
          COMPARISON_PROFILE_LIMITS.maximumTransferBytes + 1
      }
    };

    await expect(trial.start(overBudget)).rejects.toThrow(/budget/i);
    expect(createRecognizer).not.toHaveBeenCalled();
  });
});

describe("camera-content network boundary", () => {
  it("allows same-origin recognition assets and blocks third-party requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("asset"));
    const guardedFetch = createSameOriginRecognitionFetch({
      origin: "https://taglingo.test",
      fetcher
    });

    await guardedFetch("/ocr/model.tar");
    await expect(
      guardedFetch("https://cdn.example.com/camera-derived-frame")
    ).rejects.toThrow(/third-party/i);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://taglingo.test/ocr/model.tar"),
      undefined
    );
  });
});
