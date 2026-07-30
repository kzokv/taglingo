import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("installable application metadata", () => {
  it("publishes a standalone manifest with install icons", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "public/manifest.webmanifest"),
        "utf8"
      )
    ) as {
      display: string;
      start_url: string;
      icons: { sizes: string; purpose: string }[];
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({
          sizes: "512x512",
          purpose: "any maskable"
        })
      ])
    );
  });

  it("links the manifest and iPhone Home Screen metadata", () => {
    const index = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(index).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(index).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(index).toContain('rel="apple-touch-icon"');
  });
});
