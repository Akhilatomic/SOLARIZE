# Glass sign-in, sign-in animation and loading screen

Date: 2026-11-27 · Design: `docs/design/login/measured-light-login.pdf` (3 plates) + `measured-light.md`, approved by the owner
("Yes, build it" after asking for glassmorphism).

## What gets built
- **Sign-in screen (plate I):** a sunrise scene (pale sky, red sun on the horizon, 12 rays — lit = the hour on a 12-hour clock —
  and a field of panels) behind frosted-glass panes: the sign-in card, the fields, the remembered-user chip and a time pill
  ("06:42 · THU 27 NOV", ticks every 30 s). Greeting by time of day (Good morning < 12:00, Good afternoon < 17:00, else Good
  evening). Remembered user chip with "Not you?". Caps Lock note under the password while typing. "Keep me signed in · 7 days"
  as a switch (same `lgRem` setting and `remember` flag). Solid dark Sign in button. "Forgot your password? Your admin can reset it."
- **Sign-in animation (plate II):** press (button settles), gather (button narrows to a circle, 120 ms), verify (12 dial ticks sweep
  while the request runs), admitted (dial turns red with a tick, ~300 ms), lift (card rises and fades, ~350 ms), arrival (the app
  rises in). Refused: the dial unwinds, the button comes back, the password field turns red with the server's message — no shake.
- **Loading screen (plate III):** while the CRM's scripts and first data load, the sun mark lights one ray every 80 ms with
  "Solarize · Preparing your dashboard" and a thin progress line — only after 300 ms, so fast loads show nothing.

## Claude's calls
- **Background:** the owner's uploaded login photo (Settings, `brand.bg` with its dim) stays when set — the glass sits on it; the
  sunrise scene is the default when no photo is set (told to the owner before approval).
- **Remembered user:** after a successful sign-in the username and display name are kept in this browser only
  (`localStorage` `lgLast`); "Not you?" forgets them and shows the username field. Not used for first-run setup.
- **Fonts:** greeting and wordmark in Poppins (`font-display: swap`, so text never waits for the font); everything else in the app's
  system font, so the arrival into the app has no font jump.
- **Speed:** success adds about 0.65 s (admitted + lift) after the server answers; nothing waits on animation before the request.
  `prefers-reduced-motion` turns all motion off. No new server calls.
- **Old screens:** the Android app's offline page (`appOffline`) keeps its current look.

## Files
`assets/app53.js` (pure `LG`: greeting, rays for the hour, initials, time-pill text, sunrise and mark SVG — Node-tested in
`tests/login.test.js`), `assets/app54.js` (the sign-in view, animation, remembered user, caps lock), `assets/login.css`
(prefix `.lgx`, plus `.bootl` for the loading screen), `index.html` (loading-screen markup inside `#app`, the new files, stamps),
`assets/app.js` (`loginView` hands over to `lgView`; the old `.lg` rules stay for `appOffline`).
