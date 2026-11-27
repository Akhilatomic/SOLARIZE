# Agreement From Quotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Vendor–customer agreement (bank `bag`) and the MNRE Agreement (`mas`, `mag`) fill empty RTS-system and cost fields from the customer's quotation, with a quotation line / picker, all fields still editable.

**Architecture:** `api/bank.php get` also returns the customer's maker quotations; pure helpers in `assets/app24.js` (`K.pickQuote`, `K.quoteFacts`) choose a quotation and read its facts, and `K.defaults` for bag/mas/mag fills only values the profile left empty; `assets/app25.js` passes the chosen quotation in the context and shows the line / picker, saving a pick as `quote_id` with the agreement.

**Tech Stack:** PHP 8.3 + SQLite, vanilla JS (no build), Node `node:test`, PHP API tests.

**Spec:** `docs/superpowers/specs/2026-11-26-agreement-from-quotation-design.md`

## Global Constraints

- Profile first: a default that already has a value (customer, Plant details, tax bill, project) is never replaced by a quotation value.
- Quotation fills only: `capacity`, `module_make`, `module_wp`, `inv_make`, `inv_kw`, and `cost` (cost order: tax bill total > project cost > quotation `doc.price`), cost written `'Rs.' + Indian digits + ' + KSEB Charges.'` exactly as today.
- `module_model`, `module_eff`, `pay1/2/3` are not filled from the quotation.
- Which quotation: the saved pick (`quote_id` in the agreement's saved data) if it still exists, else the first `Accepted`, else the newest; only quotations with a maker `doc`.
- `bank get` returns `quotes` only when `can('quotes')`; at most 10, newest first (`ORDER BY updated DESC, id DESC`).
- Quotation values are never written into the profile (they are defaults, not typed overrides, so `K.fill` never sees them).
- Do not touch `api/quotemaker.php`, `api/core.php`, `assets/app2.js`, `app9.js`, `app11.js`, `app22.js`, `app23.js` (another branch is changing them).
- CSS prefix `.kd-q` (grep `assets/*.css` first); bump `index.html` `?v=` stamps for `assets/(app[0-9]*|quote|kseb)\.(js|css)`.
- Line copy: `Details from quotation {number} · {status}`; no quotation: `No quotation for this customer — fill the details by hand or in Plant details`.
- Commit identity `git -c user.name="Jasper Solar" -c user.email=gotjobinmilkwater@gmail.com`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push. Made-up test data only.

## Review Focus

1. A customer's quotation made before the quotation maker (no `doc`) → skipped, never offered (Task 2 test `bank get skips quotations without a maker doc`).
2. A maker quotation without `snap` (or empty lines) → facts are empty strings / price, no error (Task 1 test `quoteFacts without lines`).
3. The picked quotation was deleted later → falls back to Accepted / newest (Task 1 test `pickQuote falls back when the saved pick is gone`).
4. Profile values that are zero ("0", 0) count as empty, as today's `zero()` does (Task 1 test `zero profile values are filled from the quotation`).
5. A user without Quotations access → no picker, agreement exactly as today (Task 2 test `bank get without Quotations access has no quotes`; Task 3 UI check).

---

### Task 1: Pure rules in `assets/app24.js`

**Files:**
- Modify: `assets/app24.js` (helpers near `K.defaults`; the `bfr || bag || mag || mas` branch, `else` part for bag/mas/mag)
- Test: `tests/kseb.test.js`

**Interfaces:**
- Produces:
  - `K.pickQuote(quotes: Array<{id, number, status, doc}>, savedId: number|0) → quote|null` — `savedId` match, else first `status === 'Accepted'`, else `quotes[0]`, else null.
  - `K.quoteFacts(doc: object|null) → { kw: string, module_make: string, module_wp: string, inv_make: string, inv_kw: string, price: number }` — from `doc.snap` (`{panels: [...], inverter: [...]}`): kw = Σ inverter `kw_line ? kw : kw × qty` rounded to 0.1, as a string without trailing `.0` ('' when 0); `module_wp` = first panel line `wp` ('' when 0); `module_make` = first word of the first panel line's `label`, else of `details`, else of `name`; `inv_make` = the first inverter line's `title` (else `name`) with the words Inverter, Inverters, Microinverter, Micro, 3-Phase, Three-phase, Single-phase, Hybrid, String removed, trimmed; if nothing is left, the first word of `details` unless it is "Option", else ''; `inv_kw` = kw; `price` = number `doc.price` (0 when missing).
  - `K.defaults('bag'|'mas'|'mag', ctx)` reads `ctx.quote` (a doc object or null).

- [ ] **Step 1: Write the failing tests** in `tests/kseb.test.js` (made-up doc: snap `panels: [{ label: 'Waaree 600 TOPCon', details: 'Waaree Elite R Series DCR, 600+ Wp', wp: 600, qty: 6 }]`, `inverter: [{ title: 'SolarEdge 3-Phase Inverter', details: 'SolarEdge SE5K three-phase', kw: 5, qty: 1 }]`, `price: 330000`):
  - `quoteFacts reads plant kW, panel make and Wp, inverter make` → `{ kw: '5', module_make: 'Waaree', module_wp: '600', inv_make: 'SolarEdge', inv_kw: '5', price: 330000 }`
  - `quoteFacts: kw_line and per-unit kW` → inverter `{ title: 'Deye Micro Inverter', kw: 5, kw_line: 1, qty: 3 }` gives kw '5' and inv_make 'Deye'; `{ kw: 2, qty: 2 }` gives '4'
  - `quoteFacts: generic title` → `{ title: 'Microinverter', details: 'Option A · TSUN …' }` gives inv_make ''
  - `quoteFacts without lines` → `quoteFacts({ price: 1000 })` and `quoteFacts(null)` give empty strings and price 1000 / 0
  - `pickQuote falls back when the saved pick is gone` → list `[{id:3,status:'Draft'},{id:2,status:'Accepted'},{id:1,status:'Sent'}]`: saved 1 → id 1; saved 9 → id 2; no Accepted → id 3; `[]` → null
  - `agreement: profile wins, quotation fills empty` → with `LOAN` (plant has make ReNew, Wp 550, capacity 3): `KD.defaults('bag', {...LOAN, quote: doc})` keeps 'ReNew', '550', '3'; with `plant: {}` and `project: null, bill: null` it gives capacity '5', module_make 'Waaree', module_wp '600', inv_make 'SolarEdge', inv_kw '5', cost 'Rs.3,30,000 + KSEB Charges.'
  - `agreement: cost order bill > project > quotation` → bill present wins; no bill + project cost 2,20,000 wins; neither → quotation
  - `zero profile values are filled from the quotation` → plant `{ capacity: '0', panel_wattage: 0 }` → capacity '5', module_wp '600'
  - `mas and mag fill the same way` → same values as bag for the `plant: {}` context
- [ ] **Step 2: Run** `node --test tests/kseb.test.js` — expect the new tests to FAIL (`KD.quoteFacts is not a function`).
- [ ] **Step 3: Implement** `K.pickQuote`, `K.quoteFacts` and the fill in the bag/mas/mag defaults (fill after the existing `v = {...}` object is built: for each of the five keys, `if (!trim(v[k])) v[k] = facts[k]`; cost: when `amt` is 0 and `facts.price > 0`, use it).
- [ ] **Step 4: Run** `node --test tests/kseb.test.js` — all PASS (existing ones too).
- [ ] **Step 5: Commit** `git add assets/app24.js tests/kseb.test.js` then commit "Agreement: fill empty details from the quotation (rules)".

### Task 2: `bank get` returns the customer's quotations

**Files:**
- Modify: `api/bank.php` (`case 'get'`)
- Test: `tests/kseb_api_test.php` (bank section; it already saves a `bfr` around line 174)

**Interfaces:**
- Produces: `bank get` → `quotes: [{ id: int, number: string, date: string, status: string, doc: object }]` (doc = decoded `quotes.doc`; rows whose doc is empty or not a JSON object are left out; at most 10, newest first); `[]` without `can('quotes')`.

- [ ] **Step 1: Write the failing tests:** `bank get lists the customer's maker quotations newest first with their doc` (insert two maker quotations for a made-up customer through `qm save` or SQL, plus one old-style row with empty doc); `bank get skips quotations without a maker doc`; `bank get without Quotations access has no quotes` (a user whose role reads customers + loans but not quotes — use the role defaults in `api/lib.php`, or set that role's permissions the way existing tests do).
- [ ] **Step 2: Run** `bash tests/run_api.sh` — new checks FAIL.
- [ ] **Step 3: Implement** in `case 'get'`.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — exit 0.
- [ ] **Step 5: Commit** "Agreement: bank documents get the customer's quotations".

### Task 3: Quotation line and picker on the agreement tabs

**Files:**
- Modify: `assets/app25.js` (`kdCtx`, `kdPrep`, `kdDocHtml`, `kdOnInput` / `kdOnClick`, `kdSaveDoc`), `assets/kseb.css`, `index.html`
- Test: `node --check assets/app25.js`; browser check on a local copy

**Interfaces:**
- Consumes: `K.pickQuote`, `K.quoteFacts`, `K.defaults(…, ctx.quote)` (Task 1); `g.quotes` (Task 2).
- Produces: `KDS.qpick: {[doc]: id}`; `kdCtx(g, doc)` adds `quote` = the chosen quotation's `doc` for doc keys `bag`, `mas`, `mag` (null otherwise); the saved data of those docs carries `quote_id` when the user picked one.

- [ ] **Step 1: Implement** — `kdPrep` reads `saved.data.quote_id` into `KDS.qpick[d]` and builds defaults with `kdCtx(g, d)`; `kdDocHtml` shows, above the field groups of bag/mas/mag, one line `.kd-q` with the copy from Global Constraints (a `<select>` of `number · status · date` when `g.quotes.length > 1`); nothing when `g.quotes` is missing (no Quotations access); changing the select sets `KDS.qpick[doc]`, recomputes `KDS.defs[doc]` and the values of fields the user has not edited (same rule `kdProfileFilled` uses for clean docs), then `kdMarks(); kdLayout()`; `kdSaveDoc` adds `quote_id` to `data` when `KDS.qpick[doc]` is set. `kdState` counts a changed pick as unsaved.
- [ ] **Step 2: Run** `node --check assets/app25.js` and `node --test tests/kseb.test.js` — no errors, all PASS.
- [ ] **Step 3: Bump** the `index.html` stamps; commit "Agreement: quotation line and picker".
- [ ] **Step 4: Browser check** on a scratch copy (php -S on a `*.localhost` host; page runs inside the menu-tab iframe — query `iframe.contentDocument`; CSP blocks eval): a made-up customer with empty Plant details and two quotations (one Accepted) → the agreement shows the Accepted one's values; switching the picker changes them; a typed field survives the switch; Save + reload keeps the pick; Plant details filled → profile values win; the MNRE Agreement tab fills the same. Delete the scratch copy afterwards.
