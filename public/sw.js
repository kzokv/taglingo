self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("taglingo-offline-v1")
      .then(async (cache) => {
        await cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          "/ocr/tesseract-7.0.0/worker.min.js",
          "/ocr/tessdata_fast-4.1.0/manifest.json",
          "/ocr/tessdata_fast-4.1.0/eng.traineddata.gz",
          "/ocr/tessdata_fast-4.1.0/jpn.traineddata.gz",
          "/ocr/tesseract-core-7.0.0/tesseract-core-lstm.wasm",
          "/ocr/tesseract-core-7.0.0/tesseract-core-lstm.wasm.js",
          "/ocr/tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm",
          "/ocr/tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js",
          "/ocr/tesseract-core-7.0.0/tesseract-core-simd-lstm.wasm",
          "/ocr/tesseract-core-7.0.0/tesseract-core-simd-lstm.wasm.js"
        ]);
        const shell = await cache.match("/");
        const markup = shell ? await shell.text() : "";
        const builtAssets = [
          ...markup.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/gu)
        ].map((match) => match[1]);
        if (builtAssets.length > 0) {
          await cache.addAll([...new Set(builtAssets)]);
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("taglingo-") &&
                name !== "taglingo-offline-v1"
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (
    request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith("/api/")
  ) {
    return;
  }

  const isNavigation =
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html");
  event.respondWith(
    caches.open("taglingo-offline-v1").then(async (cache) => {
      if (isNavigation) {
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put("/", response.clone());
          }
          return response;
        } catch {
          const shell = await cache.match("/");
          if (shell) {
            return shell;
          }
          throw new Error("The offline application shell is unavailable.");
        }
      }

      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (
        response.ok &&
        (requestUrl.pathname.startsWith("/assets/") ||
          requestUrl.pathname.startsWith("/ocr/"))
      ) {
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
