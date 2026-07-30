import type { Rectangle } from "../domain/geometry";

export interface OcrLineIdentity {
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
}

export interface OcrToken {
  text: string;
  confidence: number;
  line?: OcrLineIdentity;
  box: Rectangle;
}

export interface DetectedPrice {
  currency: "JPY";
  minorUnits: number;
  confidence: number;
  box: Rectangle;
}

const GROUPED_JPY_AMOUNT = String.raw`(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)`;
const JPY_PRICE_PATTERN = new RegExp(
  String.raw`^(?:¥(${GROUPED_JPY_AMOUNT})|(${GROUPED_JPY_AMOUNT})円)$`,
  "u"
);
const NEGATIVE_EVIDENCE_PATTERN =
  /(?:%|％|ポイント|商品番号|品番|型番|(?:^|\W)no\.?(?:\W|$))/iu;

function unionBoxes(tokens: OcrToken[]): Rectangle {
  const left = Math.min(...tokens.map(({ box }) => box.x));
  const top = Math.min(...tokens.map(({ box }) => box.y));
  const right = Math.max(...tokens.map(({ box }) => box.x + box.width));
  const bottom = Math.max(...tokens.map(({ box }) => box.y + box.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sharesLineAndGeometry(tokens: OcrToken[]): boolean {
  if (tokens.length < 2) {
    return true;
  }

  const [left, right] = tokens;
  const sameLine =
    (!left.line && !right.line) ||
    (left.line !== undefined &&
      right.line !== undefined &&
      left.line.blockIndex === right.line.blockIndex &&
      left.line.paragraphIndex === right.line.paragraphIndex &&
      left.line.lineIndex === right.line.lineIndex);
  const maximumHeight = Math.max(left.box.height, right.box.height);
  const horizontalGap = right.box.x - (left.box.x + left.box.width);
  const verticalOverlap =
    Math.min(
      left.box.y + left.box.height,
      right.box.y + right.box.height
    ) - Math.max(left.box.y, right.box.y);

  return (
    sameLine &&
    horizontalGap >= -maximumHeight * 0.25 &&
    horizontalGap <= maximumHeight * 1.5 &&
    verticalOverlap > 0
  );
}

export function localizeJpyPrices(tokens: OcrToken[]): DetectedPrice[] {
  const normalizedTokens = tokens.map((token) => ({
    ...token,
    text: token.text.normalize("NFKC").replaceAll(/\s/gu, "")
  }));
  const detections: DetectedPrice[] = [];

  for (let start = 0; start < normalizedTokens.length; start += 1) {
    for (const length of [1, 2]) {
      const priceTokens = normalizedTokens.slice(start, start + length);
      if (priceTokens.length !== length) {
        continue;
      }
      if (!sharesLineAndGeometry(priceTokens)) {
        continue;
      }

      const match = priceTokens
        .map(({ text }) => text)
        .join("")
        .match(JPY_PRICE_PATTERN);
      if (!match) {
        continue;
      }

      const evidence = normalizedTokens
        .slice(Math.max(0, start - 1), start + length + 1)
        .map(({ text }) => text)
        .join(" ");
      if (NEGATIVE_EVIDENCE_PATTERN.test(evidence)) {
        continue;
      }

      detections.push({
        currency: "JPY",
        minorUnits: Number.parseInt((match[1] ?? match[2]).replaceAll(",", ""), 10),
        confidence: Math.min(...priceTokens.map(({ confidence }) => confidence)),
        box: unionBoxes(priceTokens)
      });
    }
  }

  return detections;
}
