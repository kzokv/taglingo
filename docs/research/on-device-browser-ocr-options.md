# On-device browser OCR options for TagLingo

Research date: 2026-08-02
Issue: [#35 — Research viable on-device browser OCR engines](https://github.com/kzokv/taglingo/issues/35)

## Decision

Prototype **the official PaddleOCR.js SDK with PP-OCRv6_small** as the first challenger for Japanese price capture. Keep **Tesseract.js 7** as the control, and include **PP-OCRv5 mobile** as a lower-payload Paddle comparison. Do not load Paddle and Tesseract together in the production path unless physical-device measurements justify the duplicated runtime and model memory.

This is a prototype recommendation, not a release decision. The full PaddleOCR.js stack has no published physical iOS Safari or Android Chrome support matrix or camera benchmark. It must pass TagLingo's agreed [issue #36 benchmark gate](https://github.com/kzokv/taglingo/issues/36#issuecomment-5150456698) on actual phones, including zero incorrect Focused Prices, before adoption.

PaddleOCR.js is the strongest challenger because it is an official browser SDK, runs detection and recognition through ONNX Runtime Web and OpenCV.js, accepts browser image/canvas inputs, supports a dedicated worker, and returns line polygons, text, confidence, and timing measurements. That is a better fit for TagLingo's selectable Detection Outlines than recognition-only alternatives. [SDK README](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md), [architecture](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/docs/architecture.md)

PP-OCRv6 small is the correct first built-in model tier for the supplied Japanese case. Paddle documents Japanese support for the small and medium tiers; tiny excludes Japanese. The tiny model dictionary contains `¥` but not `円`, so its much smaller payload does not make it a valid substitute for the supplied `JPY 58,980円` fixture. [PP-OCRv6 language table](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md), [tiny recognition configuration](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx/blob/main/inference.yml)

## Audited shortlist

| Option | Browser-local and mobile evidence | Script and geometry fit | License / maintenance | Recommendation |
| --- | --- | --- | --- | --- |
| **PaddleOCR.js + PP-OCRv6 small** | Official SDK supports main-thread and worker execution with self-hostable model and WASM paths. Its ONNX Runtime dependency documents WASM support on Chrome/Edge Android, Chrome/Edge iOS, and Safari iOS/macOS; WebGPU is not supported on iOS or Safari. This dependency evidence does **not** prove the complete SDK on physical phones. [ORT matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) | Small supports Japanese, Chinese, English, and 46 Latin-script languages. SDK output includes line polygons, text, and score. Exact price parsing and currency-symbol recall remain benchmark questions. | SDK, models, and OpenCV are Apache-2.0; ONNX Runtime is MIT. The official SDK is young: it first shipped in PaddleOCR 3.5.0 in April 2026 and its package is currently 0.4.2. [3.5.0 release](https://github.com/PaddlePaddle/PaddleOCR/releases/tag/v3.5.0), [package manifest](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/package.json), [ORT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) | **Prototype first.** Best fit for the JPY challenger and outline geometry, subject to physical-device proof. |
| **PaddleOCR.js + PP-OCRv5 mobile** | Same SDK/runtime caveats as v6 small. | Paddle documents Chinese, Traditional Chinese, English, and Japanese support. SDK supplies geometry. [model table](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md) | Same runtime licenses. Official model repositories are Apache-2.0. | **Include as lower-payload comparison.** Do not assume its older recognition model is more accurate. |
| **Tesseract.js 7** | Established browser worker/WASM integration; TagLingo already self-hosts its assets. The official performance guide says initialization/cache state materially affects results, workers consume substantial memory, and workers should be reused. [README](https://github.com/naptha/tesseract.js), [performance guide](https://github.com/naptha/tesseract.js/blob/master/docs/performance.md) | Broad language packs and word/line bounding data. Tesseract.js wraps the Tesseract core and explicitly does not change its recognition model. [project scope](https://github.com/naptha/tesseract.js#project-scope), [API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) | Apache-2.0; mature and already integrated. [license](https://github.com/naptha/tesseract.js/blob/master/LICENSE.md) | **Keep as control.** Test bounded preprocessing variants, but do not infer general accuracy from one fixture. |
| **Direct ONNX Runtime Web + OCR models** | ORT's WASM backend covers the required browser families and assets can be self-hosted. Threads require WebAssembly thread support and cross-origin isolation; setting one thread avoids that requirement. [environment flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) | ORT is an inference runtime, not an OCR pipeline. TagLingo would own preprocessing, detector/recognizer coordination, decoding, thresholds, and geometry mapping. | MIT and actively maintained, but creates materially more TagLingo-owned computer-vision code. Custom builds can reduce the shipped operator/runtime set. [deployment guide](https://onnxruntime.ai/docs/tutorials/web/deploy.html) | **Escape hatch.** Use only if the official SDK's packaging or behavior blocks the prototype. |
| **Legacy Paddle.js OCR** | The legacy support table lists desktop Safari and several phone browsers but not iOS Safari. [browser table](https://github.com/PaddlePaddle/Paddle.js#browserplatforms-coverage) | OCR package documents Chinese, English, and numbers, not Japanese; it returns text-region points. [OCR README](https://github.com/PaddlePaddle/Paddle.js/tree/master/packages/paddlejs-models/ocr) | Repository is Apache-2.0. It is an older, separate stack now overlapped by the official PaddleOCR.js SDK. Exact per-model/package notices were not fully audited. | **Reject for new work.** Missing Japanese contract and weaker target-browser evidence. |
| **Transformers.js + TrOCR** | Transformers.js runs locally in browsers through ORT and supports TrOCR. [repository](https://github.com/huggingface/transformers.js) | TrOCR recognizes an already-cropped text line; it does not provide scene-text detection or price geometry. No Japanese support contract was found for the inspected printed checkpoint. [TrOCR docs](https://huggingface.co/docs/transformers/en/model_doc/trocr) | Transformers.js is Apache-2.0. The inspected browser-converted model repository exposes no license metadata, so model licensing is unresolved. | **Reject for this use case.** Incomplete pipeline, larger practical payload, and unresolved Japanese/model-license evidence. |
| **Shape Detection API `TextDetector`** | Text detection is an optional draft capability, not a dependable cross-browser contract. The current Shape Detection draft moved text to a separate informative specification because it is not stable across platforms or character sets. [Shape Detection draft](https://wicg.github.io/shape-detection-api/) | The current `TextDetector` draft specifies detection of **Latin-1** text, which excludes Japanese. It can return bounding boxes and corner points only where implemented. [`TextDetector` draft](https://wicg.github.io/shape-detection-api/text.html) | No shipped model dependency, but availability and output are browser/OS dependent. | **Exclude from production.** The proposed character contract alone disqualifies it for JPY. |
| **Canvas / OpenCV.js preprocessing** | Both can run locally. OpenCV.js is a WASM-capable image-processing library, not OCR. [setup guide](https://docs.opencv.org/4.10.0/d4/da1/tutorial_js_setup.html) | Can generate grayscale, scale, contrast, adaptive/Otsu threshold, morphology, and crop variants for any OCR engine. [thresholding guide](https://docs.opencv.org/master/d7/dd0/tutorial_js_thresholding.html) | OpenCV is Apache-2.0. PaddleOCR.js already depends on an OpenCV.js package, so avoid loading a second copy. [SDK manifest](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/package.json), [OpenCV license](https://github.com/opencv/opencv/blob/4.x/LICENSE) | **Use as an experiment dimension.** Start with cheap Canvas/ImageData variants for Tesseract; reuse Paddle's dependency where applicable. |

## Payload inventory

These are **raw published or installed asset sizes**, not compressed network transfer, cached storage, or peak runtime memory. They exclude the TagLingo app bundle. The Paddle totals also exclude small configuration files and source maps. A production prototype must measure actual cold/warm transfer and memory.

| Candidate | Audited raw assets | Approximate baseline |
| --- | --- | --- |
| Current TagLingo Tesseract JPY profile | Installed `jpn` + `eng` gzip language files: 3,509,958 bytes; selected LSTM WASM core: about 2,855,000 bytes; worker: 111,307 bytes. Wrapper/glue excluded. | **~6.48 MB** plus wrapper/glue |
| PaddleOCR.js + PP-OCRv6 small | Official model repositories: 10.1 MB detector + 21.5 MB recognizer. Published SDK worker entry: 11.34 MB. ORT 1.22 CPU SIMD/threaded WASM: 11.21 MB. | **~54.2 MB** |
| PaddleOCR.js + PP-OCRv5 mobile | Official model repositories total about 21.5 MB. Same audited SDK worker and CPU WASM assets as above. | **~44.1 MB** |
| PaddleOCR.js + PP-OCRv6 tiny | Official model repositories: 2.03 MB detector + 4.65 MB recognizer, plus the same runtime baseline. | **~29.2 MB**, but not Japanese-capable |
| Transformers.js + converted TrOCR small printed | Quantized browser ONNX encoder 23.1 MB + merged decoder 40.5 MB; tokenizer assets about 5.85 MB. ORT/runtime and a scene detector excluded. [browser ONNX files](https://huggingface.co/Xenova/trocr-small-printed/tree/main/onnx) | **~69.5 MB** before runtime and detector |

Paddle model sizes come from the official manifests for [v6 small detection](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/tree/main), [v6 small recognition](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/tree/main), [v6 tiny detection](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx/tree/main), and [v6 tiny recognition](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx/tree/main). SDK and ORT artifact sizes were audited from the npm 0.4.2 and 1.22.0 package manifests. Tesseract sizes were measured from TagLingo's installed, pinned 7.0.0 assets.

## Prototype constraints

1. **Preserve the recognizer seam.** Normalize each engine's text, confidence, timing, and processed-image-relative geometry. The OCR engine must not decide whether an observation becomes a Focused Price.
2. **Self-host every asset.** Set explicit same-origin Paddle model URLs and ORT `wasmPaths`. Verify in a browser trace that frames, pixels, OCR text, and detected amounts cause no external requests. The SDK documents host responsibility for runtime paths and headers. [runtime responsibilities](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
3. **Treat iPhone as WASM-first.** ORT documents no iOS/Safari WebGPU support. Test single-threaded WASM before making cross-origin isolation a deployment requirement; threaded WASM requires COOP/COEP-compatible isolation and can affect third-party integrations.
4. **Own rotation and screen preprocessing.** PaddleOCR.js currently warns that document preprocessing and text-line orientation configuration are ignored. Explicitly test crop orientation, scaling, contrast/threshold variants, and moiré rather than assuming parity with Python/native pipelines. [SDK configuration](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/src/pipelines/ocr/config.ts)
5. **Map real polygons.** Run the frequent pass on the exact Capture Guide crop, map returned polygons back to preview coordinates, and measure outline alignment. Use full-frame discovery less frequently.
6. **Fuse amount and currency evidence geometrically.** Associate digits, punctuation, and known source-currency markers using polygon proximity/alignment before applying the strict currency parser. Do not lower a global threshold or accept arbitrary markerless numbers to make one fixture pass.
7. **Keep Manual Price Entry.** No candidate has evidence sufficient to remove the fallback.

## Required benchmark

Use the corpus and acceptance rules already agreed in [issue #36](https://github.com/kzokv/taglingo/issues/36#issuecomment-5150456698): 120 positive scenes per currency/platform block plus 179 negative scenes, on current iOS Safari on an iPhone 16 Pro and current Android Chrome on a representative physical device.

At minimum compare:

- current Tesseract.js 7 with bounded Canvas preprocessing variants;
- PaddleOCR.js with PP-OCRv6_small;
- PaddleOCR.js with PP-OCRv5 mobile;
- PP-OCRv6 tiny only for non-Japanese profiles.

Record exact parsed currency/minor units, incorrect Focused Prices, time to first stable result, p50/p95 pass duration, cold and warm initialization/download time, polygon alignment, peak memory where observable, and sustained thermal behavior. A candidate passes only with at least 108/120 positives overall, at least 36/40 in every stratum, and zero incorrect Focused Prices across all 299 positive and negative scenes, using the issue #36 definitions.

## Unresolved evidence gaps

- Paddle publishes no complete PaddleOCR.js support matrix or physical camera benchmark for current iOS Safari and Android Chrome. ORT's matrix covers only one dependency; OpenCV, workers, bundling, camera-frame throughput, and device memory still require proof.
- No trustworthy primary-source mobile-browser latency, memory, thermal, or sustained-frame measurements were found for PP-OCRv6 small, PP-OCRv5 mobile, or Tesseract.js 7. Paddle's vendor speed claims use other hardware/runtimes and are not TagLingo evidence.
- Exact cold compressed transfer, Cache Storage behavior, initialization memory, and peak per-frame memory for each Paddle model/SDK combination remain unmeasured.
- Paddle polygon accuracy after TagLingo cropping, rotation, scaling, and preview-coordinate mapping remains unmeasured.
- The current JPY fixture result should be treated as a TagLingo-local observation, not evidence of general Tesseract inferiority; this research did not independently reproduce broader engine accuracy.
- The inspected browser TrOCR conversion has no exposed model-license metadata and no Japanese support contract. It should not advance without both.
- Exact per-package/per-model license notices in legacy Paddle.js were not fully audited. The repository-level Apache-2.0 license is insufficient reason to revive that path.

## Conclusion

Advance **PaddleOCR.js + PP-OCRv6_small** to a bounded physical-device prototype, compare **PP-OCRv5 mobile** for payload/latency, and retain **Tesseract.js 7** as the control. Keep direct ORT Web as an implementation escape hatch. Reject legacy Paddle.js, TrOCR, and `TextDetector` for the current product contract. Treat preprocessing as a measured complement, not a substitute for recognition evidence or the safety gate.
