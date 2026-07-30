import { expect, it, vi } from "vitest";

import { createNewestOnlyPipeline } from "./newestOnlyPipeline";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it("processes one crop at a time and replaces waiting work with the newest crop", async () => {
  const firstRecognition = deferred<string>();
  const recognize = vi
    .fn<(crop: string) => Promise<string>>()
    .mockReturnValueOnce(firstRecognition.promise)
    .mockResolvedValueOnce("result:third");
  const results: string[] = [];
  const pipeline = createNewestOnlyPipeline({ recognize, onResult: results.push.bind(results) });

  pipeline.submit("first");
  pipeline.submit("second");
  pipeline.submit("third");

  expect(recognize).toHaveBeenCalledTimes(1);
  firstRecognition.resolve("result:first");
  await pipeline.whenIdle();

  expect(recognize.mock.calls.map(([crop]) => crop)).toEqual(["first", "third"]);
  expect(results).toEqual(["result:first", "result:third"]);
});
