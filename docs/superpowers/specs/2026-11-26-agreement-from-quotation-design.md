# Vendor–customer agreement: details from the quotation

Date: 2026-11-26 · Status: short design for the owner's approval

## Why
Owner: "Vendor–customer agreement — auto update the details from profile or using quotation, with editable fields." The agreement is
made **before installation**, so Plant details and the tax bill are still empty and the RTS-system and cost lines print blank. The
customer's quotation already has most of them.

## What (approach A, picked by the owner)
- Applies to Bank documentation › Vendor–customer agreement (`bag`) and Compliance › MNRE Agreement (`mas`, `mag`: same fields).
- **Profile first, quotation for what is empty.** For each field the existing default (customer, Plant details, tax bill, project)
  wins when it has a value; an empty one is filled from the quotation:
  - `capacity` ← quotation plant kW (`QM.calc` plantKw: inverter kW × qty, or `kw_line`)
  - `module_make` ← the panel line's make, taken from its wording (first word of `label` / `details` / `name`, e.g. "Waaree",
    "ReNew", "Premier")
  - `module_wp` ← the panel line's `wp`
  - `inv_make` ← the inverter line's make (its `title` without "Inverter", "Microinverter", "3-Phase", "Hybrid"; generic titles fall
    back to the first word of `details`)
  - `inv_kw` ← quotation plant kW
  - `cost` ← tax bill total, else project cost, else the quotation price (`doc.price`), written "Rs.X + KSEB Charges." as today
  - `module_model`, `module_eff` and the payment split (60/30/10) stay as today: quotations do not carry them reliably (quotation
    payment rows are 70% / 30%).
- **Which quotation:** the customer's Accepted quotation, else the latest one (quotation-maker quotations only). A line at the top of
  the fields says "Details from quotation JS/QT/2026/0150 · Accepted"; with more than one quotation it is a picker. A pick is saved with
  the agreement (`quote_id` in its saved data) so a reprint uses the same quotation; no pick = follow Accepted / latest.
  No quotation: the line says so and the fields behave as today.
- **Editable as today:** every field stays editable; only typed changes are saved (overrides). When Plant details are filled after
  installation, those values take over by themselves. Filled-from-quotation values are never written into the profile (the existing
  "fill empty profile fields" on save only sends values that were typed).

## Approaches considered
- **A. Fill automatically from the quotation (picked).** No extra click; profile data stays clean. Makes come from product wording, so
  an odd one may need correcting.
- B. A "Fill from quotation" button that copies values into the fields as saved edits — explicit, but an extra click and the values
  stay frozen after real plant details arrive.
- C. Copy the quotation into Plant details — every paper benefits, but guessed values would sit in the profile as if installed.

## Build notes (Claude's calls)
- `api/bank.php` `get` also returns `quotes`: the customer's maker quotations (id, number, date, status, `doc`), newest first, at most
  10 — only when the user can read Quotations (`can('quotes')`); otherwise none and the agreement behaves as today.
- Pure helper in `assets/app24.js`: `KD.quoteFacts(doc)` → `{kw, module_make, module_wp, inv_make, price}` from `doc.snap` lines
  (uses `QM.calc` when present, else the same sums inline, so it stays Node-testable); `K.defaults` for bag/mas/mag takes
  `ctx.quote` (the chosen quotation's doc) and fills only empty values.
- `assets/app25.js`: `kdCtx` adds `quote`; the quotation line / picker shows on bag, mas and mag tabs; changing it re-runs the defaults.
- Not touched: files the signed-quotations build is changing (`api/quotemaker.php`, `api/core.php`, `assets/app2/9/11/22/23.js`).
- Tests: Node tests in `tests/kseb.test.js` (facts from a quotation doc, profile wins, quotation fills empty, cost order bill > project >
  quotation, no quotation = unchanged); API check that `bank get` returns `quotes` only with Quotations access. Bump `index.html` asset
  stamps.
