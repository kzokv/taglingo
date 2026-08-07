import { copyFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workerTarget = resolve(root, "public/ocr/tesseract-7.0.0");
const coreTarget = resolve(root, "public/ocr/tesseract-core-7.0.0");

await Promise.all([
  mkdir(workerTarget, { recursive: true }),
  mkdir(coreTarget, { recursive: true })
]);

await Promise.all([
  copyFile(
    resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
    resolve(workerTarget, "worker.min.js")
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
