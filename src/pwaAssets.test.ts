import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/prepare-ocr-assets.mjs"], {
    cwd: process.cwd()
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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

  it("self-hosts pinned Tesseract.js 7 core, worker, and tessdata_fast assets", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    const ocrRoot = resolve(process.cwd(), "public/ocr");

    expect(packageJson.dependencies["tesseract.js"]).toBe("7.0.0");
    expect(packageJson.dependencies["tesseract.js-core"]).toBe("7.0.0");
    expect(
      existsSync(resolve(ocrRoot, "tesseract-7.0.0/worker.min.js"))
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          ocrRoot,
          "tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js"
        )
      )
    ).toBe(true);
    expect(
      sha256(resolve(ocrRoot, "tessdata_fast-4.1.0/jpn.traineddata.gz"))
    ).toBe("daaef8801a960881fb7232653e3edb5964c568f8f3900452b2df142a2b237e45");
  });
});
