# PROTOTYPE — Camera reliability benchmark gate

This throwaway prototype asks whether a proposed real-world corpus and scoring
rule give useful evidence for granting one Source Currency Camera-supported
status. It scores the shopper-visible outcome: a correct Focused Price that
stabilizes within five seconds with an aligned Detection Outline, while any
incorrect Focused Price is an immediate safety failure.

Run it with:

```sh
npm run prototype:camera-benchmark
```

The prototype does not run OCR or persist fixtures. It exposes the consequences
of corpus size and outcome counts so the benchmark contract can be decided
before a measurement harness is built.
