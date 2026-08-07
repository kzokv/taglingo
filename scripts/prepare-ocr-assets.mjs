import {
  copyFile,
  mkdir,
  readdir,
  writeFile
} from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workerTarget = resolve(root, "public/ocr/tesseract-7.0.0");
const coreTarget = resolve(root, "public/ocr/tesseract-core-7.0.0");

await Promise.all([
  mkdir(workerTarget, { recursive: true }),
  mkdir(coreTarget, { recursive: true })
]);

const workerDiagnosticGuard = `(() => {
  const knownNonfatalDiagnostics = new Set([
    "Error in boxClipToRectangle: box outside rectangle",
    "Error in pixScanForForeground: invalid box"
  ]);
  const reportNativeError = console.error.bind(console);
  console.error = (...args) => {
    if (
      args.length === 1 &&
      typeof args[0] === "string" &&
      knownNonfatalDiagnostics.has(args[0])
    ) {
      return;
    }
    reportNativeError(...args);
  };
})();
/* TagLingo Tesseract runtime follows. */
importScripts(
  self.location.origin + "/ocr/tesseract-7.0.0/worker.min.js"
);
`;

await Promise.all([
  copyFile(
    resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
    resolve(workerTarget, "worker.min.js")
  ),
  writeFile(
    resolve(workerTarget, "worker.taglingo.v1.min.js"),
    workerDiagnosticGuard
  ),
  copyFile(
    resolve(root, "node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt"),
    resolve(workerTarget, "worker.min.js.LICENSE.txt")
  ),
  copyFile(
    resolve(root, "node_modules/tesseract.js/dist/worker.min.js.map"),
    resolve(workerTarget, "worker.min.js.map")
  )
]);

const coreSource = resolve(root, "node_modules/tesseract.js-core");
const coreFiles = (await readdir(coreSource)).filter(
  (name) =>
    name === "LICENSE" ||
    /^tesseract-core(?:-(?:relaxedsimd|simd))?-lstm\.wasm(?:\.js)?$/u.test(
      name
    )
);

await Promise.all(
  coreFiles.map((name) =>
    copyFile(resolve(coreSource, name), resolve(coreTarget, name))
  )
);
