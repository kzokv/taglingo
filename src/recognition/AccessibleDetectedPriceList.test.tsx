import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DetectedPriceIdentity,
  TrackedDetectedPrice
} from "./focusTracker";
import { AccessibleDetectedPriceList } from "./AccessibleDetectedPriceList";

const identity = (value: string) => value as DetectedPriceIdentity;

function price(
  value: string,
  minorUnits: number,
  box: TrackedDetectedPrice["box"]
): TrackedDetectedPrice {
  return {
    identity: identity(value),
    currency: "JPY",
    minorUnits,
    confidence: 96,
    state: "fresh",
    box
  };
}

const previewSize = { width: 300, height: 300 };

function expandRail(): void {
  fireEvent.click(
    screen.getByRole("button", { name: "Show Detected Price controls" })
  );
}

describe("Accessible Detected Price list", () => {
  beforeEach(() => window.localStorage.clear());

  it("exposes one native button per price with localized names and current semantics", () => {
    const upperRight = price("upper-right", 4142, {
      x: 230,
      y: 20,
      width: 30,
      height: 30
    });
    const lowerLeft = price("lower-left", 4142, {
      x: 20,
      y: 230,
      width: 30,
      height: 30
    });
    const selectDetectedPrice = vi.fn();

    render(
      <AccessibleDetectedPriceList
        detectedPrices={[lowerLeft, upperRight]}
        focusedPrice={upperRight}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expandRail();

    const list = screen.getByRole("list", { name: "Detected Prices" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Price 1 of 2, JPY 4,142, upper right",
      "Price 2 of 2, JPY 4,142, lower left"
    ]);
    expect(buttons[0]).toHaveAttribute("aria-current", "true");
    expect(buttons[1]).not.toHaveAttribute("aria-current");
    expect(buttons[0]).not.toHaveAttribute("aria-pressed");

    fireEvent.click(buttons[1]);
    expect(selectDetectedPrice).toHaveBeenCalledWith(lowerLeft.identity);
  });

  it("keeps identity order through geometry updates and recalculates it only for membership changes", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const second = price("second", 2000, {
      x: 20,
      y: 220,
      width: 30,
      height: 30
    });
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[second, first]}
        focusedPrice={first}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expandRail();
    const list = screen.getByRole("list", { name: "Detected Prices" });
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("1,000"),
      expect.stringContaining("2,000")
    ]);

    const movedFirst = { ...first, box: { ...first.box, y: 240 } };
    const movedSecond = { ...second, box: { ...second.box, y: 10 } };
    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[movedSecond, movedFirst]}
        focusedPrice={movedFirst}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("1,000"),
      expect.stringContaining("2,000")
    ]);

    const newPrice = price("new", 3000, {
      x: 20,
      y: 120,
      width: 30,
      height: 30
    });
    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[movedFirst, newPrice, movedSecond]}
        focusedPrice={movedFirst}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("2,000"),
      expect.stringContaining("3,000"),
      expect.stringContaining("1,000")
    ]);
  });

  it("moves focus only when the removed price control held it", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const second = price("second", 2000, {
      x: 20,
      y: 220,
      width: 30,
      height: 30
    });
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[first, second]}
        focusedPrice={second}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expandRail();
    const secondButton = screen.getByRole("button", {
      name: /jpy 2,000/i
    });
    secondButton.focus();

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[first]}
        focusedPrice={first}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /jpy 1,000/i })).toHaveFocus();

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[]}
        focusedPrice={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("heading", {
        name: "Detected Prices — none available"
      })
    ).toHaveFocus();
  });

  it("does not move focus when background removal affects another control", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const outside = document.createElement("button");
    outside.textContent = "Outside control";
    document.body.append(outside);
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[first]}
        focusedPrice={first}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    outside.focus();

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[]}
        focusedPrice={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );

    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("announces only approved semantic transitions", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const second = price("second", 2000, {
      x: 220,
      y: 220,
      width: 30,
      height: 30
    });
    const selectDetectedPrice = vi.fn();
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[]}
        focusedPrice={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    const status = screen.getByRole("status", {
      name: "Detected Price updates"
    });
    expect(status).toBeEmptyDOMElement();

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[first, second]}
        focusedPrice={first}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expect(status).toHaveTextContent("2 Detected Prices available");

    const geometryUpdate = { ...first, box: { ...first.box, x: 30 } };
    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[geometryUpdate, second]}
        focusedPrice={geometryUpdate}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expect(status).toHaveTextContent("2 Detected Prices available");

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[geometryUpdate, second]}
        focusedPrice={second}
        explicitlyFocusedPriceIdentity={second.identity}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expect(status).toHaveTextContent(
      "Focused Price changed to Price 2 of 2, JPY 2,000, lower right"
    );

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[geometryUpdate]}
        focusedPrice={geometryUpdate}
        explicitlyFocusedPriceIdentity={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expect(status).toHaveTextContent(
      "Explicitly Focused Price expired. Focused Price changed to Price 1 of 1, JPY 1,000, upper left"
    );

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[]}
        focusedPrice={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={selectDetectedPrice}
      />
    );
    expect(status).toHaveTextContent("No Detected Prices available");
  });

  it("announces expiry after the already-Focused Price is explicitly focused", () => {
    const focusedPrice = price("focused", 4142, {
      x: 120,
      y: 120,
      width: 30,
      height: 30
    });
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[focusedPrice]}
        focusedPrice={focusedPrice}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    expandRail();
    fireEvent.click(screen.getByRole("button", { name: /jpy 4,142/i }));

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[]}
        focusedPrice={null}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("status", { name: "Detected Price updates" })
    ).toHaveTextContent(
      "Explicitly Focused Price expired. No Detected Prices available"
    );
  });

  it("does not move modal focus when recognition adds another Detected Price", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const second = price("second", 2000, {
      x: 220,
      y: 220,
      width: 30,
      height: 30
    });
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[first]}
        focusedPrice={first}
        modalOpen
        locale="en-US"
        previewSize={previewSize}
        onModalOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const close = screen.getByRole("button", {
      name: "Close Detected Prices"
    });
    close.focus();

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[first, second]}
        focusedPrice={first}
        modalOpen
        locale="en-US"
        previewSize={previewSize}
        onModalOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(close).toHaveFocus();
  });

  it("moves focus to the stable recognition control when the open sheet empties", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const Fixture = ({ detectedPrices }: { detectedPrices: TrackedDetectedPrice[] }) => (
      <div>
        <button className="recognition-status-toggle" type="button">
          Recognition status
        </button>
        <AccessibleDetectedPriceList
          detectedPrices={detectedPrices}
          focusedPrice={detectedPrices[0] ?? null}
          modalOpen
          locale="en-US"
          previewSize={previewSize}
          onModalOpenChange={vi.fn()}
          onSelect={vi.fn()}
        />
      </div>
    );
    const { rerender } = render(<Fixture detectedPrices={[first]} />);
    screen.getByRole("button", { name: "Close Detected Prices" }).focus();

    rerender(<Fixture detectedPrices={[]} />);

    expect(
      screen.getByRole("button", { name: "Recognition status" })
    ).toHaveFocus();
  });

  it("does not announce an expired lock after automatic focus was resumed", () => {
    const first = price("first", 1000, {
      x: 20,
      y: 20,
      width: 30,
      height: 30
    });
    const second = price("second", 2000, {
      x: 220,
      y: 220,
      width: 30,
      height: 30
    });
    const { rerender } = render(
      <AccessibleDetectedPriceList
        detectedPrices={[first, second]}
        focusedPrice={second}
        explicitlyFocusedPriceIdentity={null}
        selectionEvent={{
          identity: second.identity,
          renewed: false,
          revision: 1
        }}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );
    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[first, second]}
        focusedPrice={second}
        explicitlyFocusedPriceIdentity={null}
        selectionEvent={{
          identity: second.identity,
          renewed: false,
          revision: 1
        }}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );

    rerender(
      <AccessibleDetectedPriceList
        detectedPrices={[first]}
        focusedPrice={first}
        explicitlyFocusedPriceIdentity={null}
        selectionEvent={{
          identity: second.identity,
          renewed: false,
          revision: 1
        }}
        locale="en-US"
        previewSize={previewSize}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("status", { name: "Detected Price updates" })
    ).toHaveTextContent(
      "Focused Price changed to Price 1 of 1, JPY 1,000, upper left"
    );
  });
});
