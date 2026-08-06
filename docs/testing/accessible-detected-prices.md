# Accessible Detected Price verification

Run these scenarios with deterministic multi-price recognition data. Automated
component coverage supplements, but does not replace, the physical assistive-
technology checks below.

## Keyboard-only desktop

1. Start with no stable Detected Prices. Confirm the heading reads “Detected
   Prices — none available” and no empty control appears.
2. Introduce two stable Detected Prices with the same amount in different grid
   positions. Tab through one native button per price and confirm the visual
   Detection Outlines cannot receive focus.
3. Confirm the buttons are ordered top-to-bottom, then left-to-right. Move their
   geometry without changing membership and confirm keyboard order and current
   focus remain stable.
4. Press Enter on one price and Space on the other. Confirm each becomes the
   Focused Price, only that button reports current state, and selecting it again
   does not toggle focus off.
5. While focus is on a price button, expire it through the third covered miss.
   Confirm focus moves to the newly Focused Price button. Repeat with the final
   price and confirm focus moves to the stable none-available heading.
6. Repeat expiry while keyboard focus is outside the list. Confirm background
   recognition does not move focus.
7. Collapse the in-preview rail and confirm its Detected Price count and current
   Focused Price remain visible. Drag it with a pointer, expand its complete
   list, and confirm Escape, Close, and completed selection dismiss the modal
   sheet and return focus to the rail's expand control.
8. While the complete list is open, confirm the Camera Workspace behind it is
   inert, focus begins on the current Focused Price (or the list heading when
   there is none), and Tab and Shift+Tab remain within the sheet.
9. Select a Held Detected Price from the rail, then choose “Clear held prices.”
   Confirm the held outline and rail item disappear, the affected Explicit Focus
   Lock is released, automatic focus resumes, and recognition continues without
   restarting the camera.

## VoiceOver on iOS Safari

1. Discover the list by heading and navigate its duplicate-amount buttons.
   Confirm each name contains ordinal/count, localized Source Currency amount,
   and a coarse 3×3-grid position without coordinates.
2. Activate each button and confirm only Focused Price changes are announced.
3. Exercise geometry movement, membership reordering, explicitly Focused Price
   expiry, and the zero-price state. Confirm ordinary recognition passes, geometry
   changes, and routine count churn remain silent.
4. When the currently visited button expires, confirm VoiceOver lands on the
   newly Focused Price or the none-available heading according to availability.
5. Expand the modal list and confirm the background is unavailable to semantic
   navigation until the sheet is dismissed. Confirm initial focus and focus
   return match the keyboard scenario.
6. Confirm Candidate Outlines, Detection Outlines, and expanded outline hit
   regions are absent from the accessibility tree; only the semantic price
   buttons expose price selection.

## TalkBack on Android Chrome

Repeat the VoiceOver scenarios with swipe navigation and double-tap activation.
Confirm duplicate amounts remain distinguishable by ordinal and position,
selection never presents toggle semantics, and removal follows the same focus
and announcement rules.

## Touch overlap

1. Use two small fresh Detection Outlines whose approximately 44×44 CSS-pixel
   hit regions overlap. Confirm a tap inside one visible outline selects that
   outline even when the other center is nearer.
2. Tap the overlapping expanded area outside both visible outlines and confirm
   the nearest outline center wins deterministically.
3. Confirm the rail remains an unambiguous, full-size alternative for both
   Detected Prices.
