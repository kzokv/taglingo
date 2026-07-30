import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const publicDirectory = resolve("public");
const source = resolve(publicDirectory, "icon.svg");

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  [192, 512].map((size) =>
    sharp(source)
      .resize(size, size)
      .png()
      .toFile(resolve(publicDirectory, `icon-${size}.png`))
  )
);
