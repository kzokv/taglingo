import { describe, expect, it } from "vitest";

import { localizeJpyPrices } from "./jpyPriceLocalization";

describe("Japanese price localization", () => {
  it("localizes 4,142円 to exact JPY minor units and token geometry", () => {
    expect(
      localizeJpyPrices([
        {
          text: "4,142円",
          confidence: 94,
          box: { x: 38, y: 22, width: 116, height: 34 }
        }
      ])
    ).toEqual([
      {
        currency: "JPY",
        minorUnits: 4142,
        confidence: 94,
        box: { x: 38, y: 22, width: 116, height: 34 }
      }
    ]);
  });

  it.each([
    {
      label: "ASCII yen prefix",
      tokens: [
        {
          text: "¥4,142",
          confidence: 91,
          box: { x: 10, y: 12, width: 90, height: 24 }
        }
      ],
      box: { x: 10, y: 12, width: 90, height: 24 }
    },
    {
      label: "full-width yen prefix split from the amount",
      tokens: [
        {
          text: "￥",
          confidence: 90,
          box: { x: 10, y: 12, width: 14, height: 24 }
        },
        {
          text: "4,142",
          confidence: 96,
          box: { x: 25, y: 12, width: 75, height: 24 }
        }
      ],
      box: { x: 10, y: 12, width: 90, height: 24 }
    },
    {
      label: "yen suffix split from the amount",
      tokens: [
        {
          text: "4,142",
          confidence: 96,
          box: { x: 10, y: 12, width: 75, height: 24 }
        },
        {
          text: "円",
          confidence: 92,
          box: { x: 86, y: 12, width: 14, height: 24 }
        }
      ],
      box: { x: 10, y: 12, width: 90, height: 24 }
    },
    {
      label: "full-width digits and grouping",
      tokens: [
        {
          text: "４，１４２円",
          confidence: 89,
          box: { x: 10, y: 12, width: 90, height: 24 }
        }
      ],
      box: { x: 10, y: 12, width: 90, height: 24 }
    }
  ])("normalizes $label as JPY 4,142", ({ tokens, box }) => {
    expect(localizeJpyPrices(tokens)).toEqual([
      {
        currency: "JPY",
        minorUnits: 4142,
        confidence: expect.any(Number),
        box
      }
    ]);
  });

  it.each([
    [
      "percentage",
      [
        {
          text: "4,142%",
          confidence: 95,
          box: { x: 0, y: 0, width: 80, height: 20 }
        }
      ]
    ],
    [
      "product number",
      [
        {
          text: "商品番号",
          confidence: 93,
          box: { x: 0, y: 0, width: 70, height: 20 }
        },
        {
          text: "4,142円",
          confidence: 95,
          box: { x: 74, y: 0, width: 80, height: 20 }
        }
      ]
    ],
    [
      "points balance",
      [
        {
          text: "4,142",
          confidence: 95,
          box: { x: 0, y: 0, width: 70, height: 20 }
        },
        {
          text: "ポイント",
          confidence: 92,
          box: { x: 74, y: 0, width: 75, height: 20 }
        }
      ]
    ]
  ])("rejects negative evidence: %s", (_label, tokens) => {
    expect(localizeJpyPrices(tokens)).toEqual([]);
  });

  it("does not join a numeric token and yen marker from different OCR lines", () => {
    expect(
      localizeJpyPrices([
        {
          text: "4,142",
          confidence: 95,
          line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 0 },
          box: { x: 20, y: 20, width: 70, height: 22 }
        },
        {
          text: "円",
          confidence: 92,
          line: { blockIndex: 0, paragraphIndex: 0, lineIndex: 1 },
          box: { x: 20, y: 80, width: 18, height: 22 }
        }
      ])
    ).toEqual([]);
  });
});
