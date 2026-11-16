# Menu tabs — design and plan (2026-11-16)

## What the owner asked

"Open each menu in a separate tab like a web browser, so at the same time a user can work on
separate menus."

Today the CRM draws one page at a time into `<main id="main">`. Opening another menu throws the
current page away: a half-typed form, the filters, the scroll position and any open window are lost.

## Goal

- Pages open in tabs on a tab bar at the top (where the page title was); a new tab is opened
  with a right click, like a browser.
- Switching tabs keeps each page exactly as it was left: typed text, filters, scroll, open windows.
- Tabs can be closed (× or middle click). Open tabs come back after a reload of the browser page.

Not in this change: dragging tabs to reorder, tabs on phones.

Must not happen: double alerts (new-lead pop-up, sounds, desktop notifications) because several
pages are alive; more background requests for tabs nobody is looking at.

## Approaches

1. **One page-frame per tab (chosen).** The outer window keeps the side menu, top bar, bell,
   attendance button and all alerts. Each tab is an `<iframe>` that loads the same CRM
   (`index.html?tab=<menu>#/<page>`) with its own menu and top bar hidden. Each tab is a complete,
   separate copy of the app, so nothing a page does can disturb another tab. No page code changes.
   Cost: every tab starts the app once (scripts come from the browser cache; one start-up request)
   and uses memory, so the number of tabs is capped at 8.
2. Keep every page's HTML alive in one document and swap them. Rejected: the pages share
   element ids (`#main`, 430 `$('#id')` lookups), module-level state and timers that check
   `location.hash`; a slow page finishing in the background would paint over the tab in front.
   It would need changes across all 42 scripts and would break in ways that are hard to test.
3. Tabs that only remember the address and redraw the page on every switch. Rejected: typed work
   is still lost, which is the whole point of the request.

## How it behaves (revised the same day on the owner's message: "when click right button - open in new tab - auto close inactive tabs after 5 minutes")

- Tabs work like a web browser. A tab can show any page; the same menu may be open in two tabs.
- Side menu, normal click: the page opens in the tab in front (a click on the entry already shown
  draws the page again). If a window is open in that tab, it asks before leaving.
- Side menu, right click: a small menu "Open in new tab". Ctrl / Shift + click and the middle
  button do the same. Right click on a link inside a page offers the same.
- Links inside a page open in the same tab, as in a browser.
- A tab that has not been in front for 5 minutes closes by itself (checked every 30 s;
  `TABR.IDLE_MS`). Never the tab in front, and never a tab with an open window, a running upload
  or something typed on its page since it was drawn.
- Bell, new-lead pop-up, toasts and desktop notifications live in the outer window and open their
  target in the tab in front.
- The address bar follows the tab in front, so a reload or a bookmark opens the same page.
- Closing a tab by hand (x or middle click) asks first when it has an open window or a running
  upload. Closing the last tab opens Dashboard.
- At most 8 tabs; a 9th is refused with a toast.
- Reload: the tab list is restored from `sessionStorage`; only the tab in front loads, the others
  load when first clicked.
- Phones (<= 820 px wide at start-up): no tabs, the CRM works as before.
- Account menu has "Open menus in tabs" on / off (per browser, `localStorage.mtabsOff`), my call,
  as a way back if a browser misbehaves.

## Background jobs

A tab frame behaves like a browser tab in the background: `document.hidden` is overridden in the
frame to be true while its tab is not in front, and `visibilitychange` is fired on switch. All
existing polls already skip hidden documents and refresh when shown again.

Only in the outer window: Meta auto-sync, lead reminders, new-lead pop-up / sound, calendar
reminders, bell alerts (toast, sound, desktop), attendance button and its warning, WhatsApp and
email menu badges, side-menu live feed, idle countdown window.

In a tab frame: the feeds the pages read (new leads feed, discussions, notifications without
alerts, presence rings, feasibility pills, own attendance record), each only while its tab is in
front; activity in a frame counts for the idle timer (shared `localStorage`) and presence.
Signed out while a frame is open → the outer window reloads to the sign-in page.

## Code

- `assets/app43.js` (new, loaded before `app13.js`): pure rules `TABR` (Node-tested in
  `tests/tabs.test.js`), outer-window controller `window.TABS`, frame side `window.TABFRAME`
  + `bootFrame()`. CSS prefix `.mt-` (free in all style sheets) at the end of `app2.css`.
- `assets/app.js`: `FRAME` flag; `boot()` (frame start, sign-out in a frame); `shell()` (tab bar,
  on/off entry, no auto-hide menu in a frame); `route()` (outer window hands the address to
  `TABS`; a frame tells the outer window which page it shows).
- Small `FRAME` guards: `startMeta` / `alertNew` (app3.js), `refreshNotifs` / `startDisc`
  (app9.js), `presBeat` (app17.js), `pnWatch` / `startHr` (app8.js).
- `index.html`: new script tag, new `?v=` stamp. No server change, no schema change.

## Plan

1. `TABR` rules + `tests/tabs.test.js`.
2. Outer window: tab bar, frame stack, open / switch / close / restore, address-bar sync.
3. Frame side: hidden chrome, visibility override, hand-over of other menus' links, quiet jobs.
4. CSS.
5. Browser test on a scratch copy (open, switch with typed text kept, cross-menu link, close,
   reload, off switch, phone width), then `node --test tests/*.test.js` and `bash tests/run_api.sh`.
6. Commit on branch `menu-tabs`; merge to `main` and push only on the owner's go.
