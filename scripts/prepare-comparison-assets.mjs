import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const publicRoot = resolve(root, "public");
const provenance = JSON.parse(
  await readFile(
    resolve(publicRoot, "ocr/comparison/jpy-provenance.v1.json"),
    "utf8"
  )
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verify(target, expectedHash) {
  const bytes = await readFile(target);
  if (sha256(bytes) !== expectedHash) {
    throw new Error(`Frozen comparison asset hash mismatch: ${target}`);
  }
}

async function prepareAsset(asset) {
  const target = resolve(publicRoot, asset.path.slice(1));
  await mkdir(dirname(target), { recursive: true });
  if (asset.packagePath) {
    await copyFile(resolve(root, "node_modules", asset.packagePath), target);
  } else if (asset.sourceUrl) {
    let bytes;
    try {
      bytes = await readFile(target);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      const response = await fetch(asset.sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Could not download frozen comparison asset: ${asset.path}`
        );
      }
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(target, bytes);
    }
  } else {
    return;
  }
  await verify(target, asset.sha256);
}

const generatedAssets = Object.values(provenance.assets).filter(
  (asset) => asset.packagePath || asset.sourceUrl
);
await Promise.all(generatedAssets.map(prepareAsset));

for (const directory of [
  "ocr/paddleocr-js-0.4.2",
  "ocr/onnxruntime-web-1.24.3"
]) {
  const targetDirectory = resolve(publicRoot, directory);
  const expected = new Set(
    generatedAssets
      .map((asset) => asset.path)
      .filter((path) => path.startsWith(`/${directory}/`))
      .map((path) => path.slice(path.lastIndexOf("/") + 1))
  );
  for (const file of await readdir(targetDirectory)) {
    if (!expected.has(file)) {
      await unlink(resolve(targetDirectory, file));
    }
  }
}
