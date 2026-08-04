import { describe, expect, it } from "vitest";

import {
  SOURCE_CURRENCIES,
  type SourceCurrencyCode
} from "../domain/currencies";
import { getCurrencyNotationRules } from "../domain/currencyNotation";
import { parseManualPriceEntry } from "../domain/manualPriceEntry";
import type { RecognizerObservation } from "./ocrRecognizer";
import {
  createPriceEvidenceConfiguration,
  fusePriceEvidence
} from "./priceEvidence";
import { UNIVERSAL_RECOGNITION_RUNTIME } from "./recognitionRuntime";

const line = { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 };
const configuration = (sourceCurrency: SourceCurrencyCode = "JPY") =>
  createPriceEvidenceConfiguration(
    sourceCurrency,
    UNIVERSAL_RECOGNITION_RUNTIME.rules
  );

function observation({
  text,
  evidenceKind = "text",
  confidence = 90,
  x,
  width,
  y = 20,
  height = 20,
  lineIndex = 0,
  preprocessingIdentity = "raw",
  frameIdentity = "frame-1"
}: {
  text: string;
  evidenceKind?: RecognizerObservation["evidenceKind"];
  confidence?: number;
  x: number;
  width: number;
  y?: number;
  height?: number;
  lineIndex?: number;
  preprocessingIdentity?: string;
  frameIdentity?: string;
}): RecognizerObservation {
  const box = { x, y, width, height };
  return {
    text,
    evidenceKind,
    confidence,
    line: { ...line, lineIndex },
    box,
    polygon: [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height }
    ],
    timing: { startedAtMs: 1, completedAtMs: 2, durationMs: 1 },
    passIdentity: {
      kind: "guide",
      frameIdentity,
      preprocessingIdentity
    }
  };
}

describe("Price Evidence Fusion", () => {
  it.each(SOURCE_CURRENCIES)(
    "applies $code Currency Notation Rules without changing the runtime",
    ({ code }) => {
      const marked = getCurrencyNotationRules(code).examples.marked;
      const expected = parseManualPriceEntry(code, marked);
      expect(expected.ok).toBe(true);
      if (!expected.ok) return;

      expect(
        fusePriceEvidence(configuration(code), [
          observation({ text: marked, confidence: 95, x: 10, width: 120 })
        ])[0]
      ).toMatchObject({
        currency: code,
        minorUnits: expected.enteredPrice.minorUnits
      });
    }
  );

  it("produces exact candidates from combined and split evidence", () => {
    const profile = configuration();

    expect(
      fusePriceEvidence(profile, [
        observation({ text: "¥1,234", confidence: 93, x: 10, width: 70 }),
        observation({ text: "4,142", confidence: 96, x: 120, width: 55 }),
        observation({
          text: "円",
          evidenceKind: "marker",
          confidence: 88,
          x: 180,
          width: 20
        })
      ])
    ).toEqual([
      {
        currency: "JPY",
        minorUnits: 1234,
        confidence: 93,
        box: { x: 10, y: 20, width: 70, height: 20 },
        polygon: [
          { x: 10, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 40 },
          { x: 10, y: 40 }
        ],
        frameIdentity: "frame-1",
        preprocessingIdentities: ["raw"]
      },
      {
        currency: "JPY",
        minorUnits: 4142,
        confidence: 88,
        box: { x: 120, y: 20, width: 80, height: 20 },
        polygon: [
          { x: 120, y: 20 },
          { x: 200, y: 20 },
          { x: 200, y: 40 },
          { x: 120, y: 40 }
        ],
        frameIdentity: "frame-1",
        preprocessingIdentities: ["raw"]
      }
    ]);
  });

  it("coalesces preprocessing variants from one camera frame", () => {
    const profile = configuration();
    const raw = [
      observation({ text: "4,142", confidence: 96, x: 20, width: 55 }),
      observation({
        text: "円",
        evidenceKind: "marker",
        confidence: 88,
        x: 80,
        width: 20
      })
    ];
    const contrast = raw.map((item) => ({
      ...item,
      confidence: item.confidence + 2,
      passIdentity: {
        ...item.passIdentity,
        preprocessingIdentity: "contrast"
      }
    }));

    expect(fusePriceEvidence(profile, [...raw, ...contrast])).toEqual([
      expect.objectContaining({
        currency: "JPY",
        minorUnits: 4142,
        confidence: 88,
        frameIdentity: "frame-1",
        preprocessingIdentities: ["contrast", "raw"]
      })
    ]);
  });

  it("enforces every profile threshold at its inclusive boundary", () => {
    const base = configuration();
    const profile = {
      ...base,
      thresholds: {
        textConfidence: 60,
        markerConfidence: 70,
        candidateConfidence: 60
      }
    };

    expect(
      fusePriceEvidence(profile, [
        observation({ text: "¥42", confidence: 70, x: 10, width: 50 }),
        observation({ text: "¥43", confidence: 69, x: 80, width: 50 })
      ]).map(({ minorUnits }) => minorUnits)
    ).toEqual([42]);
  });

  it.each([
    ["percentage", [observation({ text: "20% off", x: 105, width: 60 })]],
    ["points", [observation({ text: "20ポイント", x: 105, width: 75 })]],
    ["item number", [observation({ text: "item no. 4142", x: 105, width: 100 })]],
    ["model number", [observation({ text: "model 4142", x: 105, width: 90 })]],
    [
      "wrong currency",
      [observation({ text: "USD 4,142", x: 105, width: 85 })]
    ],
    [
      "conflicting reading",
      [
        observation({
          text: "¥4,147",
          confidence: 99,
          x: 20,
          width: 55,
          preprocessingIdentity: "contrast"
        })
      ]
    ]
  ])("rejects %s evidence regardless of confidence", (_label, extra) => {
    const profile = configuration();
    const valid = [
      observation({ text: "4,142", confidence: 99, x: 20, width: 55 }),
      observation({
        text: "円",
        evidenceKind: "marker",
        confidence: 99,
        x: 80,
        width: 20
      })
    ];

    expect(fusePriceEvidence(profile, [...valid, ...extra])).toEqual([]);
  });

  it("never borrows a marker from another preprocessing variant", () => {
    expect(
      fusePriceEvidence(configuration("USD"), [
        observation({ text: "USD", x: 10, width: 40 }),
        observation({ text: "12.34", x: 55, width: 55 }),
        observation({
          text: "JSD",
          x: 10,
          width: 40,
          preprocessingIdentity: "threshold"
        }),
        observation({
          text: "12.54",
          x: 55,
          width: 55,
          preprocessingIdentity: "threshold"
        })
      ])
    ).toEqual([
      expect.objectContaining({
        currency: "USD",
        minorUnits: 1234,
        preprocessingIdentities: ["raw"]
      })
    ]);
  });

  it("keeps adversarial frame and preprocessing identities in distinct passes", () => {
    const firstIdentity = {
      frameIdentity: "frame",
      preprocessingIdentity: "raw\u0000x"
    };
    const secondIdentity = {
      frameIdentity: "frame\u0000raw",
      preprocessingIdentity: "x"
    };

    expect(
      fusePriceEvidence(configuration("USD"), [
        observation({ text: "USD", x: 10, width: 40, ...firstIdentity }),
        observation({ text: "12.34", x: 55, width: 55, ...firstIdentity }),
        observation({ text: "EUR", x: 10, width: 40, ...secondIdentity }),
        observation({ text: "56,78", x: 55, width: 55, ...secondIdentity })
      ]).map(({ frameIdentity, minorUnits }) => ({ frameIdentity, minorUnits }))
    ).toEqual([
      { frameIdentity: "frame", minorUnits: 1234 }
    ]);
  });

  it("applies inclusive baseline, overlap, and gap rules relative to text height", () => {
    const base = configuration();
    const profile = {
      ...base,
      fusion: {
        ...base.fusion,
        maximumBaselineDeltaInTextHeights: 0.75
      }
    };
    const splitPair = (
      text: string,
      x: number,
      markerX: number,
      markerY: number
    ) => [
      observation({ text, x, y: 20, width: 40, lineIndex: x }),
      observation({
        text: "円",
        evidenceKind: "marker" as const,
        x: markerX,
        y: markerY,
        width: 10,
        lineIndex: x + 1
      })
    ];

    expect(
      fusePriceEvidence(profile, [
        ...splitPair("100", 0, 70, 20),
        ...splitPair("200", 200, 270.01, 20),
        ...splitPair("300", 400, 445, 35),
        ...splitPair("400", 600, 645, 35.01)
      ]).map(({ minorUnits }) => minorUnits)
    ).toEqual([100, 300]);
  });

  it("interprets ambiguous symbols only inside the selected profile with exact minor units", () => {
    const jpy = configuration();
    const cny = configuration("CNY");

    expect(
      fusePriceEvidence(jpy, [
        observation({ text: "¥1,234", x: 10, width: 70 })
      ])[0]?.minorUnits
    ).toBe(1234);
    expect(
      fusePriceEvidence(cny, [
        observation({ text: "¥1,234.05", x: 10, width: 90 })
      ])[0]?.minorUnits
    ).toBe(123405);
  });

  it.each(["4,142", "4,14円", "4,142.00円", "JPY円4,142"])(
    "rejects markerless or malformed fragment %s",
    (text) => {
      expect(
        fusePriceEvidence(configuration(), [
          observation({ text, confidence: 100, x: 10, width: 90 })
        ])
      ).toEqual([]);
    }
  );
});
