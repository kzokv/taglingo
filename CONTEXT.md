# TagLingo

TagLingo helps a shopper understand a displayed price by recognizing it and translating its value into familiar currencies.

## Language

**Detected Price**:
A corroborated amount and location recognized on a visible price tag. A single uncorroborated observation is represented only by a Candidate Outline and is not a Detected Price.
_Avoid_: Scanned price, OCR result

**Candidate Outline**:
A dotted amber, visual-only boundary labeled “Possible price” around one credible but uncorroborated camera observation. It exposes no amount, remains absent from the semantic Detected Prices surface, and cannot be focused, selected, or converted.
_Avoid_: Tentative Detected Price, Unstable Price, Candidate Price

**Fresh Detected Price**:
A Detected Price corroborated on the required distinct frame or reacquired within amount and geometry tolerance. Its Detection Outline reflects current evidence and may be focused, selected, or converted.
_Avoid_: New Price, Active Price

**Held Detected Price**:
A Detected Price retained with frozen geometry after one or two covered misses. Its Detection Outline is dashed and labeled “Held”; reacquisition restores the Fresh Detected Price while the third covered miss removes it.
_Avoid_: Stale Price, Cached Price, Missing Price

**Focused Price**:
The detected price currently selected for conversion.
_Avoid_: Active price, primary price

**Explicit Focus Lock**:
A shopper-controlled state created by selecting a Fresh Detection Outline or a Detected Price rail control. It keeps that Detected Price focused until the shopper selects another price, resumes automatic focus, clears the affected Held Detected Price, or the price is removed. Selecting the same price renews the lock.
_Avoid_: Pinned price, manual focus

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
The visible boundary around a Detected Price. A Fresh Detected Price uses a solid boundary, a Held Detected Price uses a dashed boundary, and the Focused Price uses a stronger treatment.
_Avoid_: Highlight frame, OCR box

**Source Currency**:
The currency in which the shopper's Detected Price or Entered Price is denominated.
_Avoid_: Input currency, scanned currency

**Camera Recognition**:
The browser-local attempt to produce Detected Prices using the shared Recognition Runtime and the explicitly selected Source Currency's Currency Notation Rules. The target product contract supports every Source Currency, subject to the shopper's camera entitlement; inability to produce a Detected Price is a session outcome handled through Manual Price Entry, not a currency capability classification. The current adapter remains narrower until the universal Recognition Runtime is implemented.
_Avoid_: Qualified camera, Beta camera

**Camera Usage**:
One Camera Recognition session that produces its first Focused Price. A session with no Focused Price consumes no usage, and further Detected or Focused Prices in the same session do not consume additional usage.
_Avoid_: OCR pass, camera frame, Detected Price

**Guest Camera Currency**:
One of USD, AUD, JPY, TWD, or EUR, for which a Guest may start Camera Recognition. Other Source Currencies remain available to the Guest through unlimited Manual Price Entry.
_Avoid_: Camera-supported Source Currency, Camera Qualification Candidate

**Guest Camera Allowance**:
Ten successful Camera Usages per browser in a rolling hour. The camera button remains disabled after the allowance is exhausted until the next usage expires; failed sessions do not consume the allowance, and Manual Price Entry remains unlimited.
_Avoid_: OCR quota, price limit

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

**Recognition Runtime**:
The browser-local recognition capability that turns camera imagery into text and location evidence across one or more writing systems. It does not decide which currency the text represents.
_Avoid_: Currency profile, currency recognizer

**Currency Notation Rules**:
The deterministic rules for interpreting recognized or entered text using the explicitly selected Source Currency, including compatible markers, separators, and fractional precision.
_Avoid_: OCR model, Recognition Runtime

**Recognition Experience Settings**:
Approved Member preferences that change interaction behavior, such as when Manual Price Entry appears and whether a Focused Price is used automatically or after confirmation. They synchronize across the member's devices and cannot change confidence, evidence, stability, Currency Notation Rules, or other recognition decisions. Guests use the fixed default experience, including Manual Price Entry promotion after five seconds without a Focused Price.
_Avoid_: Recognition thresholds, currency profile
