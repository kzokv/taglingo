# PROTOTYPE — recognition architecture

Question: which on-device pipeline structure keeps price evidence local, rejects
markerless or unstable numerals, supports split amount/currency recognition and
multiple stable Detection Outlines, and preserves an explicit Focused Price
without requiring two heavy OCR engines in production?

Run:

```sh
npm run prototype:recognition-architecture
```

The terminal compares three deliberately different structures against identical
observation frames. It uses synthetic OCR observations rather than claiming
engine accuracy; physical-device accuracy and performance remain benchmark work.

- **A — Evidence-gated single engine:** separate amount and currency-marker
  evidence, geometrically fused; one engine selected per Source Currency.
- **B — Monolithic line parser:** only complete price lines advance; simplest,
  but cannot recover markers emitted as a separate line or polygon.
- **C — Dual-engine consensus:** both engines must agree; safest-looking, but
  duplicates model/runtime memory and still fails when engines segment evidence
  differently.

The pure state model is in `architectureModel.mjs`; `prototype.mjs` is only the
throwaway terminal shell.

The winning model also treats engine selection as a versioned profile keyed by
Source Currency and physical mobile platform. A profile fixes its engine/model
assets, preprocessing, evidence thresholds, and benchmark pointer. If no profile
passes, camera recognition is unavailable and Manual Price Entry remains.
