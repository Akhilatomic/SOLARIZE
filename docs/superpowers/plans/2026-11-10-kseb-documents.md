# KSEB documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the KSEB documentation page into tabs that make ready-to-print PDFs (Work Completion Report on the letterhead, Annexure 1 on KSEB's own form) filled from the customer profile.

**Architecture:** A pure JS module `KD` (definitions, defaults, saving rule, text layout, PDF writing with pdf-lib) shared by the browser and Node tests; a small PHP module `kseb` that returns the customer/plant data and stores per-customer overrides in `gen_docs` and company defaults in `settings`; a page `pgKseb` with tabs, customer picker, form and live preview. The PDF is the original template PDF with text drawn on top.

**Tech Stack:** PHP 8.3 + SQLite (no build step), plain browser JS, pdf-lib 1.17.1 (vendored, MIT), Node `node:test`, PyMuPDF for the one-time template preparation.

**Spec:** `docs/superpowers/specs/2026-11-10-kseb-documents-design.md`

## Global Constraints

- PDF engine: pdf-lib 1.17.1 at `assets/vendor/pdf-lib-1.17.1.min.js`, loaded only by the KSEB page. Fonts: pdf-lib StandardFonts only (Times-Roman, Times-Bold, Helvetica, Helvetica-Bold); every drawn string passes through `KD.ansi()` first.
- Templates in `assets/kseb/`: `letterhead.pdf` (595.92 × 841.92 pt), `annexure-1.pdf` (595.32 × 841.92 pt, the two FreeText annotations "ROOF-TOP" and "30 DAYS" removed, nothing else changed), plus `letterhead.png` / `annexure-1.png` at 150 dpi.
- Storage: `gen_docs` rows with `kind` = `kseb_wcr` / `kseb_an1`, `number` = `''`; company defaults in `settings` key `kseb_defaults` via `kv_set`. **No SCHEMA_VERSION bump.**
- Permissions: view + download = `checklist` read and `customers` read; save overrides / save defaults = `checklist` write.
- Default company values (exact): vendor_name `M/S JASPER SOLAR SOLUTIONS`, vendor_address `Jasper Building Anad Bank Junction Nedumangad Thiruvananthapuram`, vendor_email `info@jasper.solar`, vendor_phone `0960 552 5552`, sign_name `Er Akhil ST`, sign_designation `PROPRIETOR`, sign_phone `0960 552 5552`.
- Dates are stored `YYYY-MM-DD` and printed `DD-MM-YYYY`.
- CSS classes start with `.kd` (checked: no `.kd` in app.css/app2.css/quote.css). Monochrome line icons (`<i class="i i-…">`), no emoji.
- Every POST to api.php needs header `X-Solarize: 1`; `get` is already on the GET whitelist in api.php.
- No `//` comment inside a one-line statement (use `/* */`). Lint: `php -l`, `node --check`.
- Commit identity: `git -c user.name="Jasper Solar" -c user.email=gotjobinmilkwater@gmail.com commit …`. Do not push.

## Review Focus

- A customer with no plant record and no project: every default is `''` (no "undefined", no " KW" on an empty capacity), the page shows the "Still empty" list, and the PDF still downloads. → Task 2 test `defaults for a bare customer`.
- Profile text outside WinAnsi (Malayalam typed into an address, `₹`, U+202F, smart quotes, emoji): download never throws, unsupported characters are replaced. → Task 2 test `ansi` + Task 3 test `buildPdf survives non-WinAnsi text`.
- Very long address / ten inverter serials: text shrinks, never reaches the footer or the signature space; beyond the minimum size `overflow` is true and the UI refuses the download with a message. → Task 3 tests `wcr shrinks long text` and `wcr overflow`.
- A role with `checklist` read but not write (Sales): can view and download; Save / Save-as-default hidden; download does not try to save (no 403 toast). → Task 4 test `sales cannot save` + Task 5 manual step.
- Switching customer or tab while a request is in flight: a late response for the previous customer must not paint over the current one. → Task 5 uses a load token; manual step.

---

### Task 1: Templates and pdf-lib

**Files:**
- Create: `tools/kseb_templates.py`
- Create: `assets/kseb/letterhead.pdf`, `assets/kseb/letterhead.png`, `assets/kseb/annexure-1.pdf`, `assets/kseb/annexure-1.png`
- Create: `assets/vendor/pdf-lib-1.17.1.min.js`

**Interfaces:**
- Produces: the four template files above (paths used by Task 3 `KD.PAGES`) and the global `PDFLib` (browser) / `require('../assets/vendor/pdf-lib-1.17.1.min.js')` (Node).

- [ ] **Step 1: Write `tools/kseb_templates.py <letterhead.pdf> <form1.pdf> <outdir>`** (run with `python -I`). It copies the letterhead PDF unchanged to `<outdir>/letterhead.pdf`; opens the Form 1 PDF, deletes every FreeText annotation whose text is `ROOF-TOP` or `30 DAYS` (`page.annots()` + `page.delete_annot`), refuses (exit 1) if any other annotation exists, saves `<outdir>/annexure-1.pdf` with `garbage=3, deflate=True`; renders page 0 of both outputs at 150 dpi to `letterhead.png` / `annexure-1.png`. Then it verifies and prints: annexure has 0 annotations; its `page.get_text("rawdict")` span count and every span bbox equal the original's (annotations are not page text, so they must match exactly); `page.get_drawings()` count equals the original's.

- [ ] **Step 2: Run it**

Source files (names contain U+202F, pass them via a glob):
```bash
cd /d/SOLARIZE && python -I tools/kseb_templates.py "C:/Users/gotjo/Downloads/Jasper-Solar-Letterhead_2.pdf" "$(python -I -c "import glob;print(glob.glob('D:/GDrive/jasper/aneesh r a/kseb/doc/Form 1*.pdf')[0])")" assets/kseb
```
Expected: prints `annots 0`, `spans equal True`, `drawings equal True`; four files exist in `assets/kseb/`.

- [ ] **Step 3: Look at both PNGs** (Read tool). Annexure: rows 5–6 right column now empty, everything else identical to the original form. Letterhead: unchanged.

- [ ] **Step 4: Vendor pdf-lib.** In a scratch dir: `npm pack pdf-lib@1.17.1`, extract, copy `package/dist/pdf-lib.min.js` to `assets/vendor/pdf-lib-1.17.1.min.js`.

Verify: `node -e "const P=require('./assets/vendor/pdf-lib-1.17.1.min.js');console.log(typeof P.PDFDocument.load, Object.keys(P.StandardFonts).includes('TimesRomanBold'))"` → `function true`.

- [ ] **Step 5: Commit** `tools/kseb_templates.py assets/kseb assets/vendor/pdf-lib-1.17.1.min.js` — "KSEB docs: letterhead + Annexure 1 templates, vendor pdf-lib 1.17.1".

---

### Task 2: `KD` data layer — defaults, saving rule, text clean-up

**Files:**
- Create: `assets/app24.js` (browser global `KD`; `if (typeof module !== 'undefined') module.exports = KD;` — same pattern as `assets/app20.js`)
- Test: `tests/kseb.test.js`

**Interfaces:**
- Produces:
  - `KD.DOCS` — `{ wcr: Doc, an1: Doc }`, `Doc = { key, tab, file, page: 'letterhead'|'an1', groups: [{ g, fields: [{ k, l, t?: 'date'|'area', share?: true }] }] }`. `tab`: `Work completion report` / `Annexure 1`. `file` (download name prefix): `Work Completion Report` / `Annexure 1`. `share: true` marks the seven company-default keys.
  - WCR keys: `ref, date, vendor_name, vendor_address, vendor_email, vendor_phone, cust_name, cust_address, cust_phone, consumer_no, section, capacity, phase, pv_make, pv_type, pv_watt, inv_make, inv_capacity, inv_serial, sign_name, sign_designation, sign_phone`.
  - AN1 keys: `name, consumer_no, category, phone, email, address, load, capacity, other, mount, days, place, date`.
  - `KD.defaults(docKey, ctx) -> {key: string}` with `ctx = { customer, plant, project, defaults, today }` (any of the first four may be null/{}).
  - `KD.values(docKey, ctx, saved) -> {key: string}` = defaults overlaid with `saved` (known keys only).
  - `KD.overrides(docKey, values, defaults) -> {key: string}` = keys whose trimmed value differs from the default, **plus `date` always**.
  - `KD.empty(docKey, values) -> string[]` labels of empty fields, excluding `ref`.
  - `KD.ansi(s) -> string`, `KD.dmy('2026-11-06') -> '06-11-2026'` (anything else → `''`), `KD.invCapacity(cap, count) -> string`, `KD.joinAddr(customer) -> string`.

Default rules (from the spec): WCR `cust_address` and AN1 `address` = `KD.joinAddr` (address, district, pincode joined with `, `, skipping a part already contained case-insensitively in the address); `capacity` = plant.capacity, else project.kw, + ` KW` (WCR) / ` kWp` (AN1) only when the source is a bare number; `phase` `Single phase`→`Single`, `Three phase`→`Three`, else as stored; `pv_watt` + ` Wp` when numeric; `inv_capacity` = `KD.invCapacity(plant.inverter_capacity, plant.inverter_count)`; `inv_serial` = non-empty `plant.inverters[].serial` joined `, `; `load` = sanctioned_load + ` kW` when numeric; `category` = customer.tariff; `other` `NO`; `mount` `ROOF-TOP`; `days` `30 DAYS`; `place` = customer.district; `date` = ctx.today; `ref` `''`; vendor/sign keys from `ctx.defaults`.

- [ ] **Step 1: Write the failing tests** in `tests/kseb.test.js` (`node:test`, `assert/strict`, `const KD = require('../assets/app24.js')`). Fixture `RAJ`: customer `{ name: 'RAJKUMAR M', phone: '9495833804', email: '', address: 'MIZPAH, PARANKIMAMVILA, KUZHICHANI, VATTAVILA P O', district: 'Thiruvananthapuram', pincode: '695541', consumer_no: '1145389020951', kseb_section: 'Udiyankulangara', sanctioned_load: 1.24, phase: 'Single phase', tariff: 'LT-1A Domestic' }`, plant `{ capacity: '5', panel_make: 'Renew Photovoltaics Private Limited', panel_type: 'Bifacial Mono perc', panel_wattage: '550', inverter_make: 'Solar Edge', inverter_capacity: '5', inverter_count: '1', inverters: [{ serial: 'ST3923-075063C35-EC' }, { serial: '' }] }`, the seven company defaults, `today: '2026-11-10'`.
  - `wcr defaults from the profile`: `capacity === '5 KW'`, `phase === 'Single'`, `pv_watt === '550 Wp'`, `inv_capacity === '5 KW'`, `inv_serial === 'ST3923-075063C35-EC'`, `cust_address === 'MIZPAH, PARANKIMAMVILA, KUZHICHANI, VATTAVILA P O, Thiruvananthapuram, 695541'`, `consumer_no === '1145389020951'`, `section === 'Udiyankulangara'`, `sign_name === 'Er Akhil ST'`, `date === '2026-11-10'`, `ref === ''`.
  - `an1 defaults`: `load === '1.24 kW'`, `capacity === '5 kWp'`, `category === 'LT-1A Domestic'`, `other === 'NO'`, `mount === 'ROOF-TOP'`, `days === '30 DAYS'`, `place === 'Thiruvananthapuram'`.
  - `invCapacity`: `('5','1') === '5 KW'`, `('5','') === '5 KW'`, `('5','2') === '2 × 5 KW (10 KW)'`, `('0.6','4') === '4 × 0.6 KW (2.4 KW)'`, `('','2') === ''`, `('5 kW','1') === '5 kW'`.
  - `capacity falls back to the project`: plant `{}`, project `{ kw: 3 }` → wcr `capacity === '3 KW'`.
  - `joinAddr skips repeated parts`: address `'X House, Nedumangad, Thiruvananthapuram'`, district `'Thiruvananthapuram'`, pincode `''` → `'X House, Nedumangad, Thiruvananthapuram'`.
  - `defaults for a bare customer`: customer `{ name: 'A' }`, plant/project null → no value contains `undefined`, `capacity === ''`, `inv_capacity === ''`, `pv_watt === ''`; `KD.empty('wcr', v)` includes `'EB consumer number'` and not `'Ref No.'`.
  - `saving rule`: values = defaults with `cust_phone` changed → `overrides` deep-equals `{ cust_phone: '<new>', date: '2026-11-10' }`; `values('wcr', ctx, { cust_phone: 'x', bogus: 'y' })` has `cust_phone === 'x'` and no `bogus`.
  - `ansi`: `'Rs ₹5'`→`'Rs Rs.5'`; `'a\u202Fb\u00A0c'`→`'a b c'`; `'“q” ‘s’ – —'`→`'"q" \'s\' - -'`; `'2 × 5'` unchanged; `'മലയാളം X'`→`'? X'` (each run of unsupported characters becomes one `?`); `'😀'`→`'?'`.
  - `dmy`: `'2026-11-06'`→`'06-11-2026'`, `''`→`''`.

- [ ] **Step 2: Run** `node --test tests/kseb.test.js` → FAIL (`Cannot find module '../assets/app24.js'`).

- [ ] **Step 3: Implement** the data layer in `assets/app24.js` (ES5-style like app20.js is fine; no DOM, no network). WinAnsi set for `ansi`: printable ASCII 0x20–0x7E, Latin-1 0xA0–0xFF, and `€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ`; map `₹`→`Rs.`, U+202F/U+00A0/U+2009/tabs → space, curly quotes → straight, en/em dash → `-`; anything else → `?` (runs collapsed); newlines kept.

- [ ] **Step 4: Run** `node --test tests/kseb.test.js` → all pass; `node --check assets/app24.js`.

- [ ] **Step 5: Commit** `assets/app24.js tests/kseb.test.js` — "KSEB docs: document definitions, profile defaults, saving rule".

---

### Task 3: `KD` layout and PDF writing

**Files:**
- Modify: `assets/app24.js`
- Test: `tests/kseb.test.js`

**Interfaces:**
- Consumes: Task 2 `KD.DOCS`, `KD.ansi`, `KD.dmy`; Task 1 templates and pdf-lib.
- Produces:
  - `KD.PAGES = { letterhead: { pdf: 'assets/kseb/letterhead.pdf', png: 'assets/kseb/letterhead.png', w: 595.92, h: 841.92 }, an1: { pdf: 'assets/kseb/annexure-1.pdf', png: 'assets/kseb/annexure-1.png', w: 595.32, h: 841.92 } }`
  - `KD.FONTS = { T: 'TimesRoman', TB: 'TimesRomanBold', H: 'Helvetica', HB: 'HelveticaBold' }` (keys of `PDFLib.StandardFonts`).
  - `KD.measurer(PDFLib) -> Promise<measure>`; `measure(text, f, size) -> width in pt` (pdf-lib `font.widthOfTextAtSize`, one embedded font per key, cached).
  - `KD.wrap(text, width, f, size, measure) -> string[]` (splits on `\n` first, then words; a word wider than `width` is broken by characters).
  - `KD.layout(docKey, values, measure) -> { ops: [{ t, x, y, f, s }], size, overflow }` — `x` left edge and `y` baseline, both in pt from the page's top-left; alignment already resolved into `x`; every `t` already `KD.ansi`-clean; `size` = body size used.
  - `KD.buildPdf(PDFLib, templateBytes, ops) -> Promise<Uint8Array>` — loads the template, draws every op on page 0 with `page.drawText(t, { x, y: pageHeight - y, size: s, font, color: rgb(0,0,0) })`, returns `doc.save()`.

Geometry (pt, top-left origin):
- **WCR** (letterhead): Ref value H 9 at x 70, baseline 185; Date value H 9 at x 432, baseline 185 (printed `KD.dmy`). Body from y 200; text column x 60–536. Body size `s` tries 12 → 9 in 0.5 steps; line height 1.3·s. Order as the spec table: title `WORK COMPLETION REPORT` HB s+2 centred; `VENDOR DATA`, `CUSTOMER DATA` HB s centred; `Label: value` lines T s, left at 60, wrapped lines continue at x 60; `SPECIFICATION` TB s+1 centred; `SPV Module` / `Inverter` TB s at x 60; their `Make : …`, `Type : …`, `Each Module Watt: …`, `Make :…`, `Capacity : …`, `Serial No: …` lines T s centred on x 298 (wrapped within 360 pt). Signature block H min(s, 11), right-aligned at x 536, four lines `For <vendor_name without a leading "M/S ">`, `Name: …`, `Designation: …`, `Phone: …`, last baseline at 740. A size fits when the last body line's baseline ≤ (signature block's first baseline − 60 − s). If 9 does not fit: lay out at 9 and return `overflow: true`.
- **AN1** (form): value cells x 369.5–553.8 with 5 pt padding; rows r1 155.7–233.7 (six lines `Name: …`, `Consumer No: …`, `Category: …`, `Phone: …`, `Email: …`, `Address: …`), r2 233.7–256.1 `load`, r3 256.1–285.5 `capacity`, r4 285.5–343.8 `other`, r5 343.8–380.3 `mount`, r6 380.3–402 `days`. Font H, each cell independently tries 10.5 → 6 in 0.5 steps, line height 1.2·s, block vertically centred in the cell, left-aligned. A cell that does not fit at 6 → `overflow: true`. Place and Date values H 10.5 placed 6 pt right of the Malayalam labels `സ്ഥലം :` / `തീയതി :` in the row 402–446 (measure those label bboxes and baselines from `assets/kseb/annexure-1.pdf` with PyMuPDF and write the numbers into the code); date printed `KD.dmy`.

- [ ] **Step 1: Write the failing tests** (append to `tests/kseb.test.js`; real metrics via `const PDFLib = require('../assets/vendor/pdf-lib-1.17.1.min.js'); const measure = await KD.measurer(PDFLib);`):
  - `wrap`: fake measure `(t, f, s) => t.length * s * 0.5` (so width 40 at size 10 holds 8 characters); `KD.wrap('aaa bbb ccc', 40, 'T', 10, fake)` deep-equals `['aaa bbb', 'ccc']`; `KD.wrap('x'.repeat(20), 40, 'T', 10, fake)` → `['xxxxxxxx', 'xxxxxxxx', 'xxxx']`; `KD.wrap('a\nb', 40, 'T', 10, fake)` → `['a', 'b']`.
  - `wcr layout fits the RAJ sample`: `overflow === false`, `size >= 11`; every op has `60 <= x` and `x + measure(t,f,s) <= 536.5`, `y > 180`, `y <= 740`; an op with `t === 'WORK COMPLETION REPORT'` exists; ops include `'Name: Er Akhil ST'` and the date op `t === '10-11-2026'` at x 432.
  - `wcr shrinks long text`: `cust_address` = the RAJ address repeated 4 times, `inv_serial` = ten 19-character serials → `overflow === false`, `size < 12`, last body baseline ≤ signature first baseline − 60 − size.
  - `wcr overflow`: `cust_address` = 'word '.repeat(600) → `overflow === true`.
  - `an1 values stay inside their cells`: for the RAJ values every op of rows r1–r6 has `x >= 374.5`, `x + width <= 548.8`, and its `y` within that row's top/bottom; `ROOF-TOP` and `30 DAYS` ops exist with `s === 10.5`.
  - `buildPdf writes on the template`: bytes of `assets/kseb/annexure-1.pdf` + RAJ ops → result loads with `PDFLib.PDFDocument.load`, 1 page, width 595.32 ± 0.01, and `result.length > template length`.
  - `buildPdf survives non-WinAnsi text`: RAJ wcr values with `cust_address = 'വീട് ₹ “x” \u202F 😀'` → layout + buildPdf on letterhead resolves (no throw).

- [ ] **Step 2: Run** `node --test tests/kseb.test.js` → new tests FAIL (`KD.layout is not a function`).

- [ ] **Step 3: Implement** `KD.PAGES`, `KD.FONTS`, `KD.measurer`, `KD.wrap`, `KD.layout`, `KD.buildPdf` in `assets/app24.js`.

- [ ] **Step 4: Run** `node --test tests/kseb.test.js` → all pass.

- [ ] **Step 5: Visual check.** Write a scratch Node script (outside the repo, in the session scratchpad) that builds both PDFs for RAJ with real metrics and writes them to the scratchpad; render each with `python -I -c` PyMuPDF at 110 dpi; Read the PNGs next to `D:\GDrive\jasper\raj kumar m\wc.pdf` (rendered) and the original Form 1 PNG. Expected: WCR text order and wording match the sample, nothing touches the letterhead header/footer, ~60 pt blank above the signature lines; Annexure text inside the right column, Malayalam unchanged. Fix geometry numbers if not.

- [ ] **Step 6: Commit** `assets/app24.js tests/kseb.test.js` — "KSEB docs: page layout and PDF writing".

---

### Task 4: Server module `kseb`

**Files:**
- Create: `api/kseb.php`
- Modify: `api.php` (add `require __DIR__ . '/api/kseb.php';` after `gen.php`, and `case 'kseb': handle_kseb($a);` in the switch)
- Create: `tests/kseb_api_test.php` (same harness style as `tests/qm_api_test.php`: `chk`, `actor`, `call`)
- Modify: `tests/run_api.sh` (after `qm_api_test.php`, run `kseb_api_test.php` against the same server and data folder; exit 1 if either fails)

**Interfaces:**
- Consumes: `need`, `can`, `row`, `rows`, `q`, `out`, `fail`, `body`, `kv_set`, `audit`, `mask_customer`, `plant_get`, `gen_clean` (all existing).
- Produces (HTTP, module `kseb`):
  - `GET kseb/get&customer_id=N` → `{ customer, plant, project: {id,title,kw,stage}|null, defaults: {7 keys}, saved: { wcr: {data, issued_on, updated, updated_by}|null, an1: …|null } }`. Needs `checklist` + `customers` read. Unknown customer → 404.
  - `POST kseb/save {customer_id, doc: 'wcr'|'an1', data: {…}}` → `{ ok: true, saved: {data, issued_on, updated, updated_by} }`. Needs `checklist` write. Unknown doc → 400 `Unknown document`. `issued_on` = `data.date` when `YYYY-MM-DD`, else today. Upsert into `gen_docs(customer_id, kind='kseb_'.doc, number='', issued_on, data, updated_by)`. Audit `kseb_doc`, entity `customers`, detail `wcr`/`an1`.
  - `POST kseb/defaults_save {data: {…}}` → `{ ok: true, defaults }`. Needs `checklist` write. Keeps only the seven keys, trimmed, ≤ 200 chars. `kv_set('kseb_defaults', …)`. Audit `kseb_defaults`.
  - PHP: `const KSEB_DOCS = ['wcr', 'an1']; const KSEB_DEFAULTS = [ seven keys => exact values ]; function kseb_defaults(): array; function handle_kseb($a)`.

- [ ] **Step 1: Write the failing test** `tests/kseb_api_test.php`: sign in as the admin the qm test created (`auth/setup` with `boss` / `Sunny2026pass`, falling back to `auth/login` with the same credentials when setup is refused), create sales user `kseller` (role `sales`); admin creates customer via `customers/save` (`name`, `phone`, `consumer_no`, `kseb_section`, `sanctioned_load`, `phase`, `district`) and `plant/save` with capacity 5 and one inverter serial. Checks:
  - `get as admin`: 200, `customer.name` matches, `plant.capacity === '5'`, `defaults.sign_name === 'Er Akhil ST'`, `defaults.vendor_phone === '0960 552 5552'`, `saved.wcr === null`.
  - `get works over GET` (no body) and `save over GET` → 405.
  - `save as admin`: `{doc:'wcr', data:{cust_phone:'999', date:'2026-11-06'}}` → 200; next `get` → `saved.wcr.data.cust_phone === '999'`, `saved.wcr.issued_on === '2026-11-06'`; save again with `{date:'bad'}` → `issued_on` = today (`date('Y-m-d')`), still one row (second get shows one record, `data` has no `cust_phone`).
  - `unknown doc` → 400; `unknown customer` get → 404; `anon get` → 401.
  - `sales can read`: `get` → 200; `sales cannot save` → 403; `sales cannot save defaults` → 403.
  - `defaults_save as admin`: `{data:{sign_name:'Er X', bogus:'y'}}` → `defaults.sign_name === 'Er X'`, no `bogus`, other six unchanged.
- [ ] **Step 2: Run** `bash tests/run_api.sh` → kseb checks FAIL (`Unknown module`).
- [ ] **Step 3: Implement** `api/kseb.php` and wire `api.php`; `php -l` both.
- [ ] **Step 4: Run** `bash tests/run_api.sh` → both suites pass (`… passed, 0 failed` twice).
- [ ] **Step 5: Commit** `api/kseb.php api.php tests/kseb_api_test.php tests/run_api.sh` — "KSEB docs: kseb API (customer data, per-customer overrides, company defaults)".

---

### Task 5: KSEB documentation page

**Files:**
- Create: `assets/app25.js` (`pgKseb`), `assets/kseb.css`
- Modify: `assets/app.js:127` (`kseb: () => pgOverview('kseb')` → `kseb: pgKseb`)
- Modify: `assets/app2.js:69-75` (`pgOverview(kind, box = $('#main'))`, render into `box`)
- Modify: `index.html` (`<link rel="stylesheet" href="assets/kseb.css?v=…">` after quote.css; `<script src="assets/app24.js?v=…">` and `app25.js` before `app13.js`)

**Interfaces:**
- Consumes: Task 2/3 `KD.*`; Task 4 `kseb/get`, `kseb/save`, `kseb/defaults_save`; existing `api`, `list`, `$`, `$$`, `esc`, `toast`, `canW`, `canR`, `today`, `tabsBar`/`bindTabs` style (`.tabs`), `TAB`, `pgOverview`.
- Produces: `async function pgKseb(id)`; `const kdLibs = () => Promise` (loads `assets/vendor/pdf-lib-1.17.1.min.js` once, like `qpLibs` in app21.js).

Behaviour (from the spec):
- Tabs `Work completion report · Annexure 1 · Checklist`, current in `TAB.kseb` (default `wcr`). Checklist → `pgOverview('kseb', box)`.
- Doc tabs: customer search box (name / phone / consumer no. over `list('customers')`, first 20 matches in a dropdown); choosing sets `location.hash = '#/kseb/' + id`; with no id, a hint "Pick a customer". The chosen customer's name shows with an "Open customer profile" link (`#/customers/<id>`).
- Load token: each load increments a counter; a response whose token is stale is dropped.
- Left: fields per `KD.DOCS[doc].groups`; `KD.values(doc, ctx, saved.data)`; an edited field (value ≠ default) shows an "edited" mark and a reset button; Date field has a "Today" button; `KD.empty` list shown as "Still empty: …".
- Right: preview — `<div class="kd-page">` sized `w × h` px with the template PNG as background and one absolutely positioned `<span>` per op (`left: x`, `top: y - 0.8·s`, `font: s px Times New Roman / Arial`, bold for TB/HB, `white-space: pre`), the page scaled with `transform: scale(boxWidth / w)`; re-layout on input (debounced 120 ms). If `overflow`, a red notice "Too much text to fit — shorten the longest field" and Download is disabled.
- Buttons: **Download PDF** (if `canW('checklist')`: `kseb/save` with `KD.overrides` first; then `KD.buildPdf` with the fetched template bytes; download as `<file> - <customer name>.pdf` via a blob link), **Save** (only `canW('checklist')`), **Save as default** under the vendor/signatory group of WCR (only `canW('checklist')`; posts the `share` keys).
- Phone (≤ 820 px): preview below the form, with a "Show preview" toggle.

- [ ] **Step 1: Implement** `assets/app25.js`, `assets/kseb.css`, the app.js route, the `pgOverview` box parameter, and the index.html tags (use the current `?v=1794306190` value for the new tags; the deploy bump happens later).
- [ ] **Step 2: Lint** `node --check assets/app25.js assets/app2.js assets/app.js` → no output.
- [ ] **Step 3: Run the app locally** (`php -S localhost:8080 -t <scratch copy>` as in tests/run_api.sh, never on the real `data/`): create admin, a customer with RAJ's details and plant details, open `#/kseb`. Check in the browser pane: tabs switch; picking the customer fills both forms; editing a field shows the mark and reset works; preview updates; Download PDF saves a file (check `kseb/get` shows the saved date afterwards); Checklist tab shows the old table and its rows open the project; a fresh customer with no plant shows "Still empty". Sign in as a Sales user: Save buttons hidden, Download works without an error toast. Console has no errors.
- [ ] **Step 4: Run all tests** `node --test tests/` and `bash tests/run_api.sh` → pass.
- [ ] **Step 5: Commit** `assets/app25.js assets/kseb.css assets/app.js assets/app2.js index.html` — "KSEB docs: tabbed page with Work Completion Report and Annexure 1".
