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

## TalkBack on Android Chrome

Repeat the VoiceOver scenarios with swipe navigation and double-tap activation.
Confirm duplicate amounts remain distinguishable by ordinal and position,
selection never presents toggle semantics, and removal follows the same focus
and announcement rules.
