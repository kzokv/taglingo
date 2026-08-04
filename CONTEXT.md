# TagLingo

TagLingo helps a shopper understand a displayed price by recognizing it and translating its value into familiar currencies.

## Language

**Detected Price**:
A price candidate recognized on a visible price tag.
_Avoid_: Scanned price, OCR result

**Focused Price**:
The detected price currently selected for conversion.
_Avoid_: Active price, primary price

**Manual Price Entry**:
A shopper-provided price used when camera recognition is unavailable, unreliable, or slower than the shopper is willing to wait.
_Avoid_: Manual override, fallback price

**Entered Price**:
A price supplied through Manual Price Entry and explicitly distinguished from camera-derived evidence.
_Avoid_: Detected Price, Focused Price

**Capture Guide**:
The visible camera region that exactly matches the frequent recognition crop and guides shopper placement.
_Avoid_: Scan box, decorative reticle

**Detection Outline**:
The visible boundary around a stable Detected Price; the Focused Price uses a stronger treatment than other candidates.
_Avoid_: Highlight frame, OCR box

**Source Currency**:
The currency in which the shopper's Detected Price or Entered Price is denominated.
_Avoid_: Input currency, scanned currency

**Camera-supported Source Currency**:
A Source Currency with a recognition profile that has passed the product's reliability and performance gates for the shopper's physical platform.
_Avoid_: Supported currency, OCR language

**Target Currency**:
A currency into which the shopper's Focused Price or Entered Price is converted.
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

**Camera Qualification Candidate**:
A Source Currency included in the approved roadmap for earning Camera-supported status independently on each physical platform.
_Avoid_: Camera-supported Source Currency, experimental currency
