import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/prepare-ocr-assets.mjs"], {
    cwd: process.cwd()
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("installable application metadata", () => {
  it("reopens the cached shell and required JPY OCR assets offline", async () => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>();
    const cachedResponses = new Map<string, Response>();
    const cache = {
      addAll: async (urls: string[]) => {
        for (const url of urls) {
          cachedResponses.set(
            new URL(url, "https://taglingo.test").href,
            new Response(
              url === "/"
                ? '<script type="module" src="/assets/app-version.js"></script>'
                : url
            )
          );
        }
      },
      match: async (request: Request | string) =>
        cachedResponses.get(
          typeof request === "string"
            ? new URL(request, "https://taglingo.test").href
            : request.url
        )?.clone(),
      put: async (request: Request | string, response: Response) => {
        cachedResponses.set(
          typeof request === "string"
            ? new URL(request, "https://taglingo.test").href
            : request.url,
          response
        );
      }
    };
    const context = {
      URL,
      Request,
      Response,
      caches: {
        open: async () => cache,
        keys: async () => ["taglingo-old", "taglingo-shell-v1"],
        delete: async () => true
      },
      fetch: vi.fn().mockRejectedValue(new TypeError("offline")),
      self: {
        addEventListener: (
          type: string,
          listener: (event: Record<string, unknown>) => void
        ) => listeners.set(type, listener),
        clients: { claim: async () => undefined },
        location: { origin: "https://taglingo.test" },
        skipWaiting: async () => undefined
      }
    };
    vm.runInNewContext(
      readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8"),
      context
    );

    let installed: Promise<unknown> | undefined;
    listeners.get("install")?.({
      waitUntil: (promise: Promise<unknown>) => {
        installed = promise;
      }
    });
    await installed;

    expect(
      cachedResponses.has("https://taglingo.test/ocr/tesseract-7.0.0/worker.min.js")
    ).toBe(true);
    expect(
      cachedResponses.has(
        "https://taglingo.test/ocr/tessdata_fast-4.1.0/jpn.traineddata.gz"
      )
    ).toBe(true);
    expect(
      cachedResponses.has("https://taglingo.test/assets/app-version.js")
    ).toBe(true);

    const fetchOffline = async (path: string) => {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request: new Request(`https://taglingo.test${path}`),
        respondWith: (promise: Promise<Response>) => {
          response = promise;
        }
      });
      return response;
    };
    const activeJpyProfileAssets = [
      "/ocr/tesseract-7.0.0/worker.min.js",
      "/ocr/tessdata_fast-4.1.0/jpn.traineddata.gz",
      "/ocr/tessdata_fast-4.1.0/eng.traineddata.gz",
      "/ocr/tesseract-core-7.0.0/tesseract-core-lstm.wasm",
      "/ocr/tesseract-core-7.0.0/tesseract-core-lstm.wasm.js",
      "/ocr/tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm",
      "/ocr/tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js",
      "/ocr/tesseract-core-7.0.0/tesseract-core-simd-lstm.wasm",
      "/ocr/tesseract-core-7.0.0/tesseract-core-simd-lstm.wasm.js"
    ];
    for (const asset of activeJpyProfileAssets) {
      await expect(fetchOffline(asset)).resolves.toBeInstanceOf(Response);
    }

    let offlineResponse: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: new Request("https://taglingo.test/scanner", {
        headers: { accept: "text/html" }
      }),
      respondWith: (promise: Promise<Response>) => {
        offlineResponse = promise;
      }
    });

    await expect(offlineResponse).resolves.toBeInstanceOf(Response);
    await expect((await offlineResponse)?.text()).resolves.toContain(
      "/assets/app-version.js"
    );
  });

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
