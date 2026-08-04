# Real-world recognition corpus

This directory contains legally redistributable real retail images used as
versioned recognition fixtures. It complements generated fixtures; it does not
represent physical-device qualification or a claim of population accuracy.

`manifest.json` binds each retained image to its provenance, license, hashes,
dimensions, selected Source Currency, expected price text, exact minor units,
acceptable image regions, reviewed browser outcome, and visual challenges. The
corpus contract test verifies those bindings and checks every annotation that
the current Currency Notation Rules support. The browser fixture suite records
the exact currently observed Detected Prices for known gaps so improvements or
regressions require review rather than silently changing the baseline.

An annotation may temporarily use `"parserAssertion": "pending"` only when the
real image exposes a documented notation gap. Pending annotations remain visible
test debt; they must not be counted as passing recognition evidence.

Do not add an image copied from a search result. Add only an asset whose
authoritative source grants retention and redistribution, record its attribution
in `ATTRIBUTION.md`, and pin both the upstream identity and retained file hash.
