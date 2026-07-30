# TagLingo

TagLingo helps a shopper understand a displayed price by recognizing it and translating its value into familiar currencies.

## Language

**Detected Price**:
A price candidate recognized on a visible price tag.
_Avoid_: Scanned price, OCR result

**Focused Price**:
The detected price currently selected for conversion.
_Avoid_: Active price, primary price

**Source Currency**:
The currency in which a detected price is denominated.
_Avoid_: Input currency, scanned currency

**Target Currency**:
A currency into which the focused price is converted for the user.
_Avoid_: Output currency, destination currency

**Guest**:
A visitor who can use TagLingo without an approved account.
_Avoid_: Anonymous user, demo user

**Approved Member**:
A signed-in person whose request to use TagLingo's member capabilities has been approved.
_Avoid_: Full user, registered user

**Reference Rate**:
A published exchange relationship used to estimate the value of one currency in another.
_Avoid_: Live rate, payment rate

**Rate Snapshot**:
A set of Reference Rates that share one effective date.
_Avoid_: Cached rates, rate response
