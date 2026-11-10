# Quotation Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quotation maker inside Solarize (Quotations menu) that builds the company's branded 4–6 page PMSGY quotation from a product catalogue and reusable templates, with a live preview and a one-click PDF download.

**Architecture:** PHP API module `api/quotemaker.php` (catalogue, templates, quotation settings, saving quotations into the existing `quotes` table with a JSON `doc`), seeded from the 27 example PDFs. Front end in plain JS: a pure calculation file (Node-testable), a page renderer that draws A4 HTML pages (used for both preview and PDF), the maker screen, and the admin products/settings screen. PDF = html2canvas + jsPDF in the browser.

**Tech Stack:** PHP 8.3 + SQLite (PDO), vanilla JS (no build step), html2canvas 1.4.1 + jsPDF 2.5.1 (vendored), Poppins TTF (vendored), Python 3 + PyMuPDF (one-time asset extraction, dev only), Node `node:test` and PHP CLI for tests.

**Spec:** `docs/superpowers/specs/2026-11-10-quotation-maker-design.md`

## Global Constraints

- No build step; every script is a plain `<script>` in `index.html`, loaded before `assets/app13.js` (boot). CSP allows scripts/fonts only from `'self'` → vendor files live in `assets/vendor/`, fonts in `assets/fonts/`.
- `SCHEMA_VERSION` 25 → **26** in `api/lib.php`; migrations go in `migrate()`.
- New GET actions must be added to the GET whitelist in `api.php` (else 405 "POST required").
- Uploads only via `sec_upload($fl, ['image'], 5)`; every delete path calls `trash_put()` first.
- CSS: maker UI classes start with `.qm`, document page classes with `.qp`; nothing else new. Monochrome line icons (`<i class="i i-…">`), no emoji.
- Never put a `//` comment inside a one-line statement (it swallows the rest of the line); use `/* */`.
- Document look: font **Poppins** 400/500/600/700; navy **#1E2638**, red **#D8363D**, grey **#6B7280**; A4 portrait.
- Subsidy on DC kWp: ₹30,000/kW for the first 2 kW, ₹18,000/kW for the next 1 kW, cap ₹78,000 — read from `S.subsidy_rates` (`per_kw_first2`, `third_kw`, `cap`).
- KSEB charges defaults: feasibility ₹1,000; registration **₹1,000 per kW of plant size**, label "Registration fee (₹1,000 per kW, 80% refundable)"; stamp paper ₹300.
- Loan defaults: margin 10 %, interest 6.00 % a year, tenures 60 / 84 / 120 months, 1,300 units per kWp a year, ₹7 per unit.
- Payment schedule defaults: "₹1,180 · Feasibility payment"; "70% · Before material readiness, for dispatch of major components (PV modules, inverter and mounting structure) to site"; "30% · After installation".
- Quote number format `JSS/PMSGY/{YYYY}/{NNNN}`, next number **144**; valid for **5** days; pill text "PM SURYA GHAR (PMSGY) · ON-GRID".
- Permissions: open maker = `need('quotes')`; save quotation / new template = `need('quotes', true)`; update/delete template = its creator or admin; products & quotation settings = admin only; rates leave the server only when `can('finance')`.
- Package price (gross amount) is typed by the user, never computed. Rates are only a guide.
- Quotations without `doc` (made before this feature) keep opening in the old editor `pgQuote()`.

## Review Focus

- A product edited or hidden after a quotation was saved → the saved quotation still shows exactly what was sent (quotes store a snapshot of every line; templates store product ids). Test in Task 3.
- Long custom wording or many extra components → item rows flow onto an extra "(continued)" page; nothing is cut off and "Page x of y" stays right. Test in Task 5.
- Names/addresses with Malayalam text, `&`, `<`, quotes → shown correctly in preview and PDF, never as HTML. Test in Task 5.
- A user without Finance permission → no `rate` field in any API response and no rates on screen. Test in Task 2.
- Two people saving new quotations at the same moment → two different numbers. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/qm_extract.py` (+ `tools/.htaccess` deny) | One-time: pull logos, item pictures, feature page and text dump from the example PDFs |
| `assets/quote/*.png|jpg` | Built-in item pictures, brand logos, feature page |
| `assets/fonts/Poppins-{Regular,Medium,SemiBold,Bold}.ttf` | Document font |
| `assets/vendor/html2canvas-1.4.1.min.js`, `assets/vendor/jspdf-2.5.1.umd.min.js` | PDF making, loaded only when downloading |
| `api/quotemaker.php` | `handle_qm($a)`: boot, products, uploads/images, settings, templates, quotation save |
| `api/qm_seed.php` | `qm_seed(PDO $db)`: starting catalogue + templates (exact wording from the PDFs) |
| `api/lib.php` | schema v26 tables, call seed |
| `api.php` | require module, route `qm`, GET whitelist |
| `assets/app20.js` | Pure calculations `QM.*` (also `module.exports` for Node) |
| `assets/app21.js` | Document pages: `qmPages()`, pagination, `qmDownloadPdf()` |
| `assets/app22.js` | Maker screen `pgQuoteMaker()` |
| `assets/app23.js` | Gear: Products & rates + Quotation settings |
| `assets/quote.css` | `.qm*` maker UI + `.qp*` A4 page styles + `@font-face` |
| `assets/app2.js` | `pgQuote()` hands new/maker quotations to `pgQuoteMaker()` |
| `index.html` | new scripts/CSS, `?v=` bump |
| `tests/.htaccess`, `tests/qm_calc.test.js`, `tests/qm_api_test.php`, `tests/run_api.sh` | Tests (web access denied) |

## Data shapes (shared by all tasks)

```text
qm_products(id INTEGER PK, code TEXT UNIQUE, cat TEXT, name TEXT, line TEXT, details TEXT,
  title TEXT DEFAULT '',            -- inverters: words for the quote title, e.g. "TSUN Microinverter"
  unit TEXT DEFAULT 'no', qty REAL DEFAULT 1, qty_note TEXT DEFAULT '',
  wp REAL DEFAULT 0, kw REAL DEFAULT 0, needs_opt INTEGER DEFAULT 0,
  warranty TEXT DEFAULT '[]',       -- [{"years":"12","label":"Panels product"}, …]
  brands TEXT DEFAULT '[]',         -- [{"label":"BOX","logos":["assets/quote/logo-havells.png", …]}] or [{"label":"","logos":[…]}]
  picture TEXT DEFAULT '', page TEXT DEFAULT '', rate REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, created, updated)
qm_templates(id INTEGER PK, name TEXT, data TEXT, created_by INTEGER, created, updated)
quotes.doc TEXT DEFAULT ''          -- new column
settings k='qm_settings'            -- JSON, merged over QM_DEFAULTS
settings k='qm_next'                -- next quote number (integer)
```

Image references are either built-in paths (`assets/quote/x.png`) or uploaded names (`qm-<hex>.<ext>`, served by `api.php?m=qm&a=img&f=<name>`).

Categories (`QM_CATS`, same order in PHP and JS):
`panels` Solar panels · `inverter` Inverter · `optimiser` Optimisers · `acdb` ACDB box · `dcdb` DCDB box · `dccable` DC cables · `accable` AC cables · `isolator` Isolator switch · `meter` Energy meter · `parts` Other electrical parts · `earthing` Earthing · `la` Lightning arrester · `structure` Mounting structure · `install` Installation.

Template `data` (and the setup part of a quotation `doc`):
```text
{ items: { <cat>: [ { pid: <product id>|null, qty: 4, qty_note: "", over: { name?, line?, details? },
                      custom?: { name, line, details, picture, brands } } ] },
  price: 170000, subsidy: null /* null = automatic */, loan: false,
  title: "", project: "" /* "" = automatic */, kseb: null, pay: null, terms: null, delivery: null /* null = from settings */ }
```
Quotation `doc` = template data + `{ template_id, customer: {name, address, consumer_no, email, mobile}, number, date, valid_days, sales: {name, phone, email}, snap: { <cat>: [ <resolved line: name, line, details, picture, brands, warranty, wp, kw, title, qty, qty_note, unit, page> ] } }`. `snap` is written on every save and is what the document prints for saved quotations.

---

### Task 1: Assets from the example PDFs

**Files:**
- Create: `tools/qm_extract.py`, `tools/.htaccess` (`Require all denied` + `Deny from all`), `assets/quote/*`, `assets/fonts/Poppins-*.ttf`, `assets/vendor/html2canvas-1.4.1.min.js`, `assets/vendor/jspdf-2.5.1.umd.min.js`

**Interfaces:**
- Produces: built-in files referenced by the seed (Task 2): `assets/quote/pic-<cat>[-variant].png` (item pictures: `pic-panels`, `pic-inverter-micro`, `pic-inverter-string`, `pic-inverter-solaredge`, `pic-optimiser`, `pic-acdb`, `pic-dcdb`, `pic-dccable`, `pic-accable`, `pic-isolator`, `pic-meter`, `pic-parts`, `pic-earthing`, `pic-la`, `pic-structure`, `pic-install`), `assets/quote/logo-<brand>.png` (premier, renew, tsun, deye, solaredge, havells, lt, vguard, abb, citel, eaton, microtek, finolex, sibass, corroshield, apollo, fischer, jsw …), `assets/quote/page-stormshield.jpg`, `assets/quote/jasper-logo.png` (cover/header logo), and a text dump `tools/out/text.txt` (wording source for Task 2).

- [ ] **Step 1:** Write `tools/qm_extract.py <pdf folder> <out folder>` with PyMuPDF: (a) every distinct embedded image (md5 of PNG bytes) → `out/img/<md5>_<w>x<h>.png`; (b) for each item row on pages 2–3, render the picture tile beside the item name (`page.get_pixmap(clip=rect, dpi=300)`, rect = the picture area under the item name in the ITEM column) → `out/pic/<pdf>-<item>.png`; (c) page 5 of `2kw-t sun micro inv premier hdg structure 1.7.pdf` → `out/page-stormshield.jpg` at 200 dpi, JPEG quality 85; (d) reading-order text of every page of every PDF → `out/text.txt`.
- [ ] **Step 2:** Run `python -I tools/qm_extract.py "C:\Users\gotjo\OneDrive\Desktop\office quotation" tools/out` (include `LOAN\LOAN\5kw*.pdf`). Expected: ≥34 images, pictures for every item name, one feature page.
- [ ] **Step 3:** Look at each extracted image and copy the ones listed under *Produces* into `assets/quote/` with those names (logos trimmed of empty margins; pictures ≤ 300 px wide). `tools/out/` stays out of git (add `tools/out/` to `.gitignore`).
- [ ] **Step 4:** Download Poppins Regular/Medium/SemiBold/Bold TTF from `https://github.com/google/fonts/raw/main/ofl/poppins/` and the two vendor files from cdnjs (`html2canvas/1.4.1/html2canvas.min.js`, `jspdf/2.5.1/jspdf.umd.min.js`). Check: `ls -la assets/fonts assets/vendor` shows 4 TTF (~150 KB each) and 2 JS files.
- [ ] **Step 5:** Commit `tools/qm_extract.py tools/.htaccess .gitignore assets/quote assets/fonts assets/vendor` — "Quotation maker: pictures, logos, font and PDF libraries".

### Task 2: Catalogue, settings and boot API (schema v26 + seed)

**Files:**
- Create: `api/quotemaker.php`, `api/qm_seed.php`, `tests/.htaccess`, `tests/qm_api_test.php`, `tests/run_api.sh`
- Modify: `api/lib.php` (SCHEMA_VERSION 26, tables, `quotes.doc` column, call `qm_seed($db)` when `qm_products` is empty), `api.php` (require, `case 'qm': handle_qm($a);`, whitelist `boot`, `img`)

**Interfaces:**
- Produces (HTTP, `api.php?m=qm&a=…`):
  - `boot` GET → `{ cats: [[key,label],…], products: [product…], templates: [{id,name,data,created_by,created_name,updated}], settings: {…QM_DEFAULTS merged}, admin: 0|1, finance: 0|1, next_number: "JSS/PMSGY/2026/0144" }`. Product objects carry decoded `warranty`/`brands` arrays; `rate` only when `finance`; hidden products included with `hidden:1` (admin needs them; the maker hides them).
  - `product_save` POST (admin) `{id?, cat, name, line, details, title, unit, qty, qty_note, wp, kw, needs_opt, warranty, brands, picture, page, rate, is_default, hidden}` → `{id}`; `is_default=1` clears other defaults in the same `cat`.
  - `upload` POST multipart `file` (admin) → `{ref: "qm-<24 hex>.<ext>"}` saved in `data/uploads/`.
  - `img` GET `f=<ref>` → image bytes (signed-in users; `basename()`; only `qm-` names), `Cache-Control: private, max-age=604800`.
  - `settings_save` POST (admin) `{settings:{…}}` → `{ok}`; stored under `qm_settings`.
- Produces (PHP): `const QM_CATS`, `const QM_DEFAULTS` (company header lines, footer line, bank block, pill, valid_days 5, number_format, delivery[3], pay[3], kseb {feas:1000, reg_per_kw:1000, stamp:300, reg_label}, loan {margin_pct:10, rate:6.0, months:[60,84,120], units_per_kwp:1300, tariff:7, texts}, terms[6]), `qm_settings(): array`, `qm_seed(PDO $db): void`.

- [ ] **Step 1: Write the failing API test** `tests/qm_api_test.php <base_url>` — runs against a fresh data folder; creates the first admin through `auth/setup`, a sales user through `admin/user_save`, then asserts:
```php
chk(count($boot['templates']) === 14, 'seed: 14 templates');                       // 12 + two 5 kW
chk(count(array_filter($boot['products'], fn($p) => $p['cat'] === 'panels')) >= 4, 'seed: panels');
chk($boot['settings']['kseb']['reg_per_kw'] === 1000 && $boot['settings']['loan']['rate'] == 6.0, 'defaults');
chk($boot['next_number'] === 'JSS/PMSGY/' . date('Y') . '/0144', 'next number');
chk(!array_key_exists('rate', $salesBoot['products'][0]), 'no rates without finance');   // sales role has no 'finance'
chk(call($sales, 'qm', 'product_save', [...])['_code'] === 403, 'sales cannot edit products');
chk(!empty(call($admin, 'qm', 'product_save', ['cat'=>'panels','name'=>'Waaree 580 Wp','wp'=>580,'rate'=>20000,'is_default'=>1])['id']), 'admin adds product');
// exactly one default panel afterwards
chk(call($anon, 'qm', 'img', null, '&f=qm-x.png')['_code'] === 401, 'images need sign-in');
```
- [ ] **Step 2:** `tests/run_api.sh`: copy the working tree (excluding `.git`, `data`, `*.zip`) to a temp folder, start `php -S localhost:8094` there in the background, run `php tests/qm_api_test.php http://localhost:8094`, stop the server, print `N passed, M failed`, exit non-zero on failures. Run it → FAIL (unknown module).
- [ ] **Step 3:** Implement schema v26 in `api/lib.php`, `api/qm_seed.php` and the four actions in `api/quotemaker.php`. Seed products with `code`s and **exact wording from `tools/out/text.txt`**: panels `pan-premier-600` (default; 600 Wp; "600+ Wp" wording), `pan-premier-600-mnre` (SolarEdge wording), `pan-renew-550`, `pan-renew-550-dg`; inverters `inv-tsun-2` (kw 2, title "TSUN Microinverter", default), `inv-tsun-3`, `inv-tsun-deye-2` (Option A/B wording, title "Microinverter", warranty "10–12 yrs · Microinverter · TSUN 12, Deye 10"), `inv-deye-2`, `inv-deye-1` (5 kW 2-2-1), `inv-se-3` (title "SolarEdge Inverter", needs_opt), `inv-se-5-3ph` (title "SolarEdge 3-Phase Inverter", needs_opt), `inv-premier-3` (title "String Inverter"); `opt-se-s`; `acdb-1ph`, `acdb-3ph`; `dcdb`; `dccable`; `accable`, `accable-3ph` (if the 5 kW 3-phase PDF differs); `iso-2p`, `iso-4p`; `meter-1ph`, `meter-3ph`; `parts`; `earthing` (qty 3, unit "earth pits"); `la`; structures `str-hdg` (page `assets/quote/page-stormshield.jpg`), `str-gi`, `str-gi-weld` (4-blocks wording), `str-apollo`; `install` (unit "plant"). Seed the 14 templates (name → products, quantities, price, loan): 2 kW TSUN·Premier·HDG ₹1,70,000; 2 kW TSUN·ReNew·GI welded ₹1,60,000; 2 kW TSUN·ReNew·HDG ₹1,60,000; 2 kW TSUN or Deye·ReNew·HDG ₹1,60,000; 2 kW TSUN or Deye·Premier·HDG ₹1,70,000; 2 kW TSUN or Deye·Premier·GI ₹1,70,000; 3 kW SolarEdge·Premier·HDG ₹2,30,000; 3 kW SolarEdge·ReNew·HDG ₹2,20,000; 3 kW String·Premier·GI ₹2,05,000; 3 kW TSUN·Premier·GI welded ₹2,25,000; 3 kW TSUN·Premier·HDG ₹2,30,000; 3 kW TSUN·ReNew·HDG ₹2,20,000; 5 kW Deye micro 2-2-1·ReNew·Apollo GI ₹3,46,300 (loan on); 5 kW SolarEdge 3-phase·ReNew·Apollo GI ₹3,36,300 (loan on). Quantities as in the PDFs (e.g. 4 panels for 2 kW Premier, 5 for 3 kW string, 6 for 3 kW TSUN/SolarEdge, 10 for 5 kW). Rates seeded as 0.
- [ ] **Step 4:** Run `bash tests/run_api.sh` → all PASS.
- [ ] **Step 5:** Commit — "Quotation maker: catalogue, settings, templates seed and API".

### Task 3: Templates and saving quotations

**Files:**
- Modify: `api/quotemaker.php`, `tests/qm_api_test.php`

**Interfaces:**
- Consumes: Task 2 tables and `qm_settings()`.
- Produces (HTTP):
  - `tpl_save` POST `{id?, name, data}` → `{id}`. New: `need('quotes', true)`, `created_by = uid()`. Update: creator or admin, else 403 "Only the person who made this template or an admin can change it".
  - `tpl_delete` POST `{id}` → `{ok}`; creator or admin; `trash_put('Quotation template', name, [['qm_templates','id=?',[id]]])` first.
  - `save` POST `{id?, customer_id?, lead_id?, status, subsidy, doc}` → `{id, number}`. `subsidy` is the number the client worked out with `QM.calc` (automatic or overridden). Requires `need('quotes', true)` and a customer or lead and `doc.price > 0` (else 400 "Enter the package price"). New quotations get the next number inside a transaction (`BEGIN IMMEDIATE`, read `qm_next`, write +1); existing keep theirs. Writes `quotes.doc` (JSON), `number`, `date`, `status`, `customer_id`, `lead_id`, `total = doc.price`, `subsidy`, `items='[]'`, `gst_rate=0`. Audit `quote_save`.
  - Existing `quotes/get` returns `doc` (decode it client-side).

- [ ] **Step 1: Add failing tests** to `tests/qm_api_test.php`:
```php
$t = call($sales, 'qm', 'tpl_save', ['name' => 'My 2 kW', 'data' => $tplData]); chk($t['id'] > 0, 'sales saves a template');
chk(call($sales2, 'qm', 'tpl_save', ['id' => $t['id'], 'name' => 'X', 'data' => $tplData])['_code'] === 403, 'other user cannot update it');
chk(!empty(call($admin, 'qm', 'tpl_save', ['id' => $t['id'], 'name' => 'My 2 kW v2', 'data' => $tplData])['id']), 'admin can');
chk(!empty(call($sales, 'qm', 'tpl_delete', ['id' => $t['id']])['ok']) && trashHas('Quotation template'), 'delete goes to Recycle bin');
$q1 = call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Draft', 'doc' => $doc]);
$q2 = call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Draft', 'doc' => $doc]);
chk($q1['number'] === 'JSS/PMSGY/' . date('Y') . '/0144' && $q2['number'] === 'JSS/PMSGY/' . date('Y') . '/0145', 'numbers run on');
chk(call($sales, 'qm', 'save', ['customer_id' => $cid, 'doc' => ['price' => 0] + $doc])['_code'] === 400, 'price required');
// snapshot: edit the product after saving; the saved quote still has the old wording
call($admin, 'qm', 'product_save', ['id' => $panelId, 'name' => 'Changed name'] + $panel);
chk(json_decode(call($sales, 'quotes', 'get', null, '&id=' . $q1['id'])['doc'], true)['snap']['panels'][0]['name'] === $panel['name'], 'saved quote keeps its snapshot');
chk(call($sales, 'quotes', 'list')[0]['total'] == $doc['price'], 'list shows the package price');
```
Also: two parallel `save` calls (curl_multi) → two different numbers.
- [ ] **Step 2:** `bash tests/run_api.sh` → new tests FAIL.
- [ ] **Step 3:** Implement the three actions.
- [ ] **Step 4:** `bash tests/run_api.sh` → all PASS.
- [ ] **Step 5:** Commit — "Quotation maker: templates and saving quotations".

### Task 4: Calculations (`assets/app20.js`)

**Files:**
- Create: `assets/app20.js`, `tests/qm_calc.test.js`

**Interfaces:**
- Produces (global `QM`, also `module.exports = QM` when `module` exists):
  - `QM.subsidy(kwp: number, rates: {per_kw_first2, third_kw, cap}) → number`
  - `QM.subsidyText(panelCount, panelWp, kwp, rates) → string` ("Worked out on the DC panel capacity (4 × 600 Wp = 2.4 kWp): ₹30,000 per kW for the first 2 kW, plus ₹18,000 per kW for the next 0.4 kW. Credited directly to the customer's bank account within 30 working days after commissioning.")
  - `QM.emi(principal, annualRatePct, months) → number` (rounded rupee)
  - `QM.resolve(setup, products) → {<cat>: [line]}` (template/quote setup + catalogue → printable lines; `over` fields win; `custom` lines as is; hidden products still resolve)
  - `QM.calc(doc, lines, settings, rates) → { panelCount, panelWp, dcKwp, plantKw, title, project, subsidy, subsidyAuto, net, kseb: {rows:[{label, amount}], total}, pay: [...], loan: {margin, loan, after, emis:[{months, before, after}], saving} | null, warranties: [{years, label}], pages: {loan: bool, feature: [paths]} }`
  - `QM.inr(n) → "1,70,000"` (Indian grouping, no symbol)

- [ ] **Step 1: Write the failing tests** (`node --test tests/qm_calc.test.js`, loads `../assets/app20.js` with `require`):
```js
const R = { per_kw_first2: 30000, third_kw: 18000, cap: 78000 };
assert.equal(QM.subsidy(2.4, R), 67200); assert.equal(QM.subsidy(2.2, R), 63600); assert.equal(QM.subsidy(3.3, R), 78000); assert.equal(QM.subsidy(5.5, R), 78000);
assert.equal(QM.emi(153000, 6, 60), 2958); assert.equal(QM.emi(85800, 6, 60), 1659); assert.equal(QM.emi(153000, 6, 84), 2235);
assert.equal(QM.emi(85800, 6, 84), 1253); assert.equal(QM.emi(153000, 6, 120), 1699); assert.equal(QM.emi(85800, 6, 120), 953);
// 2 kW TSUN · Premier · HDG template, price 170000, loan on:
assert.deepEqual([c.panelCount, c.panelWp, c.dcKwp, c.plantKw], [4, 600, 2.4, 2]);
assert.equal(c.title, '2 kW TSUN Microinverter Quotation'); assert.equal(c.project, '2 kW On-grid PMSGY');
assert.equal(c.subsidy, 67200); assert.equal(c.net, 102800);
assert.deepEqual(c.kseb.rows.map(r => r.amount), [1000, 2000, 300]); assert.equal(c.kseb.total, 3300);
assert.deepEqual([c.loan.margin, c.loan.loan, c.loan.after, c.loan.saving], [17000, 153000, 85800, 1820]);
assert.deepEqual(c.warranties.map(w => w.years), ['12', '30', '12', '1']);
assert.deepEqual(c.pages.feature, ['assets/quote/page-stormshield.jpg']);
// 5 kW Deye 2-2-1 (inverter lines 2 kW ×2 + 1 kW ×1) → plantKw 5, kseb registration 5000, total 6300
// subsidy override 70000 → subsidy 70000, net price-70000; QM.inr(170000) === '1,70,000'; QM.inr(102800) === '1,02,800'
```
- [ ] **Step 2:** Run `node --test tests/qm_calc.test.js` → FAIL (`QM` undefined).
- [ ] **Step 3:** Implement `assets/app20.js`. Title = `${plantKw} kW ${inverter.title} Quotation`; project = `${plantKw} kW On-grid PMSGY`; plantKw = Σ inverter `kw × qty`; dcKwp = Σ panel `wp × qty` / 1000 (one decimal); warranties in category order (panels, inverter, optimiser, meter …) from each line's `warranty`; feature pages = distinct `page` of chosen lines in category order.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit — "Quotation maker: calculations".

### Task 5: Document pages and PDF (`assets/app21.js`, `assets/quote.css`)

**Files:**
- Create: `assets/app21.js`, `assets/quote.css`
- Modify: `index.html` (link `assets/quote.css`; scripts `app20.js`–`app23.js` before `app13.js`)

**Interfaces:**
- Consumes: `QM.*` (Task 4); boot `settings` (Task 2).
- Produces:
  - `qmPagesHtml(doc, lines, calc, settings) → string[]` — HTML of each A4 page in order: cover · items (as many pages as needed) · loan (if `calc.loan`) · delivery, payment & terms · feature pages. Every text value passes through `esc()`. Page footer "Page x of y".
  - `qmMount(container, pages) → void` — renders pages into `container` as `.qp` elements (794 × 1123 px), then **paginates the item rows**: while an items page body overflows, move its last row to a new "What is included in your plant (continued)" page; renumber footers.
  - `qmImgUrl(ref) → string` (built-in path as is; `qm-…` → `api.php?m=qm&a=img&f=…`).
  - `qmDownloadPdf(container, fileName) → Promise<void>` — loads the two vendor scripts once (dynamic `<script src>`), renders each `.qp` with `html2canvas(el, {scale: 2, useCORS: false, backgroundColor: '#fff'})`, adds it as JPEG (quality 0.92) to a jsPDF A4 portrait page (595.28 × 841.89 pt); feature pages are added straight from their image. Saves `fileName`.

- [ ] **Step 1:** Implement page HTML + CSS reproducing the examples (cover, items table with picture / plain sentence + details / brand logos with labels / red quantity + grey note, loan page, delivery-payment-terms page, feature page). Reference images: render the example PDFs to PNG (`tools/out/ref/`) for side-by-side checks.
- [ ] **Step 2: Visual check** — in a scratch HTML page (or the maker once Task 6 exists) mount the "2 kW TSUN · Premier · HDG" template with customer "SHEREEF KUTTY" and compare with `2kw-t sun micro inv premier hdg structure 1.7.pdf` page by page (screenshot). Expected: same sections, order, wording, numbers; 5 pages; with loan on → 6 pages, loan page 4th.
- [ ] **Step 3: Edge checks** (browser console): (a) customer name `അനിൽ & "Sons" <b>x</b>` shows literally on the cover; (b) adding 8 extra custom components → an extra "(continued)" items page appears, no row is clipped, footers read 1…N of N; (c) loan off + GI structure → 4 pages.
- [ ] **Step 4: PDF check** — `qmDownloadPdf` on the 2 kW template produces a 5-page A4 PDF; open it with PyMuPDF: `page_count == 5`, page size 595×842, file size < 6 MB.
- [ ] **Step 5:** Commit — "Quotation maker: document pages and PDF".

### Task 6: Maker screen (`assets/app22.js`)

**Files:**
- Create: `assets/app22.js`
- Modify: `assets/app2.js` (`pgQuote(id)`: `id === 'new'` → `return pgQuoteMaker(null)`; existing quotation with `doc` → `return pgQuoteMaker(id, q)`; else the current editor), `assets/quote.css`

**Interfaces:**
- Consumes: boot (Task 2), `tpl_save` / `tpl_delete` / `save` (Task 3), `QM.*` (Task 4), `qmPagesHtml` / `qmMount` / `qmDownloadPdf` (Task 5).
- Produces: `pgQuoteMaker(id: number|null, q?: object) → Promise<void>`; `QMK` state `{ boot, doc, tab, dirty }`; `qmOpenSettings()` hook name used by the gear (implemented in Task 7).

- [ ] **Step 1:** Build the screen per the spec's "Maker (layout A)": template bar (picker grouped by name, Save as new template, Update template — disabled unless creator/admin, Delete template, Download PDF, gear only for admin), tabs (Customer · 14 categories, Optimisers only when the chosen inverter `needs_opt` · Price & loan), left editor / right preview (`.qm-split`; below 1100 px the preview becomes a "Preview" tab). `lead2quote` from sessionStorage pre-fills the customer/lead like today. Choosing a template copies its `data` into the doc (customer kept). Every change re-renders the preview (debounced 150 ms) via `qmMount`. *Download PDF* saves first (same checks as Save), then calls `qmDownloadPdf`. Leaving the page with unsaved changes asks for confirmation.
- [ ] **Step 2:** Customer tab: searchable picker over customers + leads (from `list('customers')`, `list('leads')`), fills name, address, consumer no., email, mobile (editable); number (shows `next_number` until saved), date, valid days, sales name (ME.name), phone/email (settings).
- [ ] **Step 3:** Item tabs: product cards (picture, name, details, warranty; rate only if `boot.finance`), click = choose; quantity stepper + quantity note; "Change wording for this quote" (inline fields → `over`); "Add another component" (catalogue product of this category or a free custom line); remove line.
- [ ] **Step 4:** Price & loan tab: package price (required), subsidy (auto shown; override field), "items add up to ₹X at your rates" (finance only), loan page on/off, KSEB rows, payment schedule, delivery texts, terms list, title/project/pill (blank = automatic).
- [ ] **Step 5: Browser check** (local server, seeded copy): New quotation → template "2 kW TSUN · Premier · HDG" → pick a customer → price ₹1,70,000 shown, preview 5 pages → Save → number JSS/PMSGY/YYYY/0144 appears in Quotations list with ₹1,70,000 → reopen → same content → Download PDF → file named `2 kW TSUN Microinverter Quotation - <CUSTOMER> - JSS-PMSGY-YYYY-0144.pdf`. Save as new template "Test" → appears in the picker; as another non-admin user "Update template" is disabled. An old quotation (no doc) still opens the old editor. No console errors.
- [ ] **Step 6:** Commit — "Quotation maker: maker screen".

### Task 7: Gear — Products & rates and Quotation settings (`assets/app23.js`)

**Files:**
- Create: `assets/app23.js`
- Modify: `assets/quote.css`

**Interfaces:**
- Consumes: `product_save`, `upload`, `settings_save` (Task 2); `QMK.boot` (Task 6).
- Produces: `qmOpenSettings() → void` (modal; on close refreshes `QMK.boot` and re-renders the maker).

- [ ] **Step 1:** Products & rates: category list (with counts) left; products right (picture, name, details, brands, warranty, rate, default star, Edit, Hide/Show). Add/Edit form with every product field from the data shape; picture, feature page and brand logos upload through `upload` (logo rows: label + one or more logos).
- [ ] **Step 2:** Quotation settings tab: number format + next number, valid days, company header lines, bank block, footer, pill, delivery texts, payment schedule, KSEB defaults (feasibility, ₹ per kW, stamp, label), loan figures and texts, terms list. Save → `settings_save`.
- [ ] **Step 3: Browser check:** as admin add "Waaree 580 Wp TOPCon" (580 Wp, rate 20,000, picture + logo uploaded) → appears as a card in the maker's Solar panels tab with its picture; mark default → new quotations start with it; hide → disappears from the maker but an existing template using it still renders. Change KSEB ₹ per kW to 1,200 → a 2 kW quote shows registration ₹2,400. As a sales user: no gear, no rates visible.
- [ ] **Step 4:** Commit — "Quotation maker: products, rates and settings".

### Task 8: Finish, regression and release

**Files:**
- Modify: `index.html` (`?v=` bump), `assets/app.js` (`MODS` label unchanged; nothing else unless needed)

- [ ] **Step 1:** Full regression on a seeded copy: `node --test tests/qm_calc.test.js`, `bash tests/run_api.sh` → all PASS; open every main page (dashboard, leads, customers, projects, quotations, warranty card, tax bill) → no console errors; Settings → User access unchanged.
- [ ] **Step 2:** Compare three generated PDFs (2 kW TSUN Premier HDG, 3 kW string GI, 5 kW SolarEdge 3-phase with loan) side by side with the originals; list any visible difference and fix it.
- [ ] **Step 3:** Bump `?v=` in `index.html`, lint (`php -l` on changed PHP, `node --check` on changed JS), commit "Quotation maker" and push to `main` (Hostinger deploys); poll the live site until the new `app22.js?v=` appears; confirm `api.php?m=auth&a=status` returns 200 (migration v26 ran).
