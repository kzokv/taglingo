import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { JPY_COMPARISON_PROFILES } from "./recognition/comparisonProfiles";
import {
  recognitionRuntimeAssets,
  UNIVERSAL_RECOGNITION_RUNTIME
} from "./recognition/recognitionRuntime";

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/prepare-ocr-assets.mjs"], {
    cwd: process.cwd()
  });
  execFileSync(process.execPath, ["scripts/prepare-comparison-assets.mjs"], {
    cwd: process.cwd()
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("installable application metadata", () => {
  it("lazily caches the universal OCR runtime for later offline use", async () => {
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
    ).toBe(false);
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
    const universalRuntimeAssets = recognitionRuntimeAssets(
      UNIVERSAL_RECOGNITION_RUNTIME
    ).map(({ path }) => path);
    context.fetch.mockResolvedValue(new Response("language model"));
    for (const asset of universalRuntimeAssets) {
      await fetchOffline(asset);
    }
    context.fetch.mockRejectedValue(new TypeError("offline"));

    for (const asset of universalRuntimeAssets) {
      await expect(fetchOffline(asset)).resolves.toBeInstanceOf(Response);
    }
    expect(
      cachedResponses.has(
        "https://taglingo.test/ocr/tessdata_fast-4.1.0/chi_sim.traineddata.gz"
      )
    ).toBe(true);

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
    const expectedLanguageHashes = {
      "chi_sim.traineddata.gz":
        "7d4b727797dac9c3668dd09769c07aec3c29fef88b0e980e187f61394cedc823",
      "chi_tra.traineddata.gz":
        "730d84d5263d9ca6c1db04af24eb37c8e750c94e6419d22e506dd3d7453f9d19",
      "eng.traineddata.gz":
        "afa9b778b3bfe580362a0b61308d08389c77dd3052c29a35270c827d7e75165c",
      "jpn.traineddata.gz":
        "daaef8801a960881fb7232653e3edb5964c568f8f3900452b2df142a2b237e45",
      "kor.traineddata.gz":
        "4c3a46d02d0faa699a0010b67e02692800a212d60c5cfca5d51a275bd2e107a9"
    };
    for (const [file, expectedHash] of Object.entries(
      expectedLanguageHashes
    )) {
      expect(sha256(resolve(ocrRoot, "tessdata_fast-4.1.0", file))).toBe(
        expectedHash
      );
    }
  });

  it("self-hosts the pinned PaddleOCR.js worker, WASM runtime, and model archives", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    const ocrRoot = resolve(process.cwd(), "public/ocr");

    expect(packageJson.dependencies["@paddleocr/paddleocr-js"]).toBe("0.4.2");
    expect(packageJson.dependencies["onnxruntime-web"]).toBe("1.24.3");
    expect(packageJson.dependencies["@techstark/opencv-js"]).toBeUndefined();
    expect(
      sha256(
        resolve(
          ocrRoot,
          "paddleocr-js-0.4.2/worker-entry-C9UNuyOJ.js"
        )
      )
    ).toBe("477db3f009c118823a5f9ebe15f1e96c1c464165715ba28a9884290f61addf52");
    expect(
      sha256(
        resolve(
          ocrRoot,
          "onnxruntime-web-1.24.3/ort-wasm-simd-threaded.wasm"
        )
      )
    ).toBe("be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17");
    expect(
      sha256(
        resolve(ocrRoot, "paddleocr/PP-OCRv6_small_rec_onnx_infer.tar")
      )
    ).toBe("d267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1");
    expect(
      sha256(
        resolve(ocrRoot, "paddleocr/PP-OCRv5_mobile_rec_onnx_infer.tar")
      )
    ).toBe("f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c");

    for (const profile of JPY_COMPARISON_PROFILES) {
      for (const asset of profile.assets) {
        const path = resolve(process.cwd(), "public", asset.path.slice(1));
        expect(existsSync(path), asset.path).toBe(true);
        expect(sha256(path), asset.path).toBe(asset.hash.slice("sha256:".length));
        expect(readFileSync(path).byteLength, asset.path).toBe(
          asset.storageBytes
        );
      }
    }
  });

  it("installs the same-origin guard in the actual Paddle camera worker", async () => {
    const workerPath = resolve(
      process.cwd(),
      "public/ocr/comparison/paddle-worker-same-origin.v1.js"
    );
    const workerSource = readFileSync(workerPath, "utf8").replace(
      /await import\([^;]+;/u,
      ""
    );
    const nativeFetch = vi.fn().mockResolvedValue(new Response("asset"));
    const workerScope = {
      fetch: nativeFetch,
      location: { origin: "https://taglingo.test" }
    };

    vm.runInNewContext(workerSource, {
      Error,
      Promise,
      Request,
      URL,
      self: workerScope
    });

    await workerScope.fetch("/ocr/model.tar");
    await expect(
      workerScope.fetch("https://cdn.example.com/camera-derived-frame")
    ).rejects.toThrow(/third-party/i);
    expect(nativeFetch).toHaveBeenCalledOnce();
    expect(nativeFetch).toHaveBeenCalledWith("/ocr/model.tar", undefined);
  });
});
