# Customer Profile in Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the customer profile into pages, one per set of source papers (KSEB bill first), each with its own Edit, showing in red only the details that documents need and that are already due.

**Architecture:** A pure page model (`assets/app28.js`, global `PFP`, Node-tested) lists every page, section ("keep this paper in hand"), field, the documents that use it and the pipeline step after which it is due. A new server action `profile/page_save` saves only one page's fields with per-field permission checks; plant saves become merges so no save blanks another page. The profile screen (`app11.js`) renders pages through `assets/app29.js`; Plant details stays `renderPlant` (app12.js) with the moved fields taken out.

**Tech Stack:** PHP 8.3 + SQLite (PDO), vanilla JS (no build), Node `node:test` for pure JS, PHP API tests over `php -S` (`tests/run_api.sh`).

**Spec:** `docs/superpowers/specs/2026-11-11-customer-profile-pages-design.md`

## Global Constraints

- Bump `SCHEMA_VERSION` in `api/lib.php` to 40; new columns come from the `$E['customers']` column list (migrate adds them).
- Every POST to `api.php` needs header `X-Solarize: 1`; new GET-only actions go in the api.php whitelist (this plan adds none).
- Bump every `?v=` stamp in `index.html` with `sed -i -E "s#(assets/(app[0-9]*|quote|kseb)\.(js|css))\?v=[0-9]+#\1?v=$(date +%s)#g" index.html`.
- CSS: new classes use the `.pp` prefix (checked free in app.css, app2.css, kseb.css, quote.css); Apple-like light theme, monochrome `i-*` line icons, works at ≤820 px.
- Never put `//` comments mid-line in one-line statements (use `/* */`).
- Test data is made up (no real customer names, numbers or addresses).
- Commit with `git -c user.name="Jasper Solar" -c user.email=gotjobinmilkwater@gmail.com commit …`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Run JS tests per file: `node --test tests/<name>.test.js` (the directory form fails on Windows). API: `bash tests/run_api.sh`.
- Consumer name label everywhere on page 1: **"Consumer name (exactly as on the KSEB bill — printed on every document)"**.

## Review Focus

1. A full-object `customers/save` (e.g. the Location modal `locModal`) by a user without `loans` write must not blank the loan columns it cannot see — test in Task 1.
2. Saving a page while the bank account / Aadhaar / PAN shows masked (`••••1234`) must keep the real number — test in Task 2.
3. A plant save from an older tab (no new keys, no moved keys in the body) must not blank them — test in Task 1.
4. A customer with no project, or a project whose stage is not in the pipeline list, counts only pages 1–2 as due — test in Task 3.
5. Typing a consumer no. on page 1 fills an empty section / sub division / division / circle but keeps ones already filled — test in Task 2.

## File Map

| File | Change |
|---|---|
| `api/lib.php` | new customer columns, `SCHEMA_VERSION` 40 |
| `api/plant.php` | new `PLANT_KEYS`, merge save, `plant_patch()` helper |
| `api/security.php` | `mask_customer()` masks Aadhaar/PAN, hides loan columns |
| `api/core.php` | customers update keeps masked / unseen columns |
| `api/profile.php` | `page_save` action, `PF_PAGES`, pipeline keys in the timeline |
| `assets/app28.js` (new) | pure page model `PFP` |
| `assets/app29.js` (new) | page view / edit UI `renderPfPage` |
| `assets/app11.js` | tabs, Overview "Details by page", header Edit |
| `assets/app12.js` | `PL_SECTIONS` trimmed, red marks on Plant details, roof type fallback |
| `assets/app.js` | short New customer form, list "Edit customer" opens page 1 |
| `assets/app2.css` | `.pp*` styles |
| `index.html` | script tags for app28/app29, stamps |
| `tests/pfp.test.js` (new), `tests/profile_pages_api_test.php` (new), `tests/run_api.sh` | tests |

---

### Task 1: New fields and saves that never blank other fields

**Files:**
- Modify: `api/lib.php:3` (SCHEMA_VERSION), `api/lib.php:10` (customers columns), migrate comment near the v39 note
- Modify: `api/plant.php` (PLANT_KEYS, `case 'save'`)
- Modify: `api/security.php` (`mask_customer`)
- Modify: `api/core.php` (customers branch of `case 'save'` update)
- Create: `tests/profile_pages_api_test.php`; Modify: `tests/run_api.sh` (run it with URL + DB path like `kseb_api_test.php`)

**Interfaces:**
- Produces: customers columns `pole_no, aadhaar_no, pan_no, loan_bank, loan_branch, loan_amount, loan_sanctioned_on` (all TEXT; `loan_amount` deliberately not in `NUMS` so blank stays blank); plant keys `applied_kw, approved_kw, approved_on, etoken_id, netmeter_on`; `function plant_patch(int $cid, array $kv): array` in plant.php (merges trimmed ≤120-char strings into the plant JSON for keys in `PLANT_KEYS`, keeps panels/inverters, writes the row, returns the new plant data); `const LOAN_COLS = ['loan_bank','loan_branch','loan_amount','loan_sanctioned_on']` in security.php.

- [ ] **Step 1: Write the failing tests** in `tests/profile_pages_api_test.php` (copy the `chk/actor/call` helpers and admin setup/login from `tests/kseb_api_test.php`; create users `pfeng` role `engineer`, `pfba` role `ba`):
  - `plant/save` with `{application_no:'NP-TEST-1', kseb_reg_no:'R1', applied_kw:'3'}`, then `plant/save` with only `{capacity:'3', panels:[], inverters:[]}` → `plant/get` still has `application_no === 'NP-TEST-1'`, `kseb_reg_no === 'R1'`, `applied_kw === '3'`.
  - admin `customers/save` with `aadhaar_no:'123412341234', pan_no:'ABCDE1234F', pole_no:'CM-1/2', loan_bank:'SBI', loan_amount:'200000'` → admin `customers/get` returns all five unchanged.
  - engineer `customers/get` → `aadhaar_no === '••••••••1234'` (mask_tail) and `pan_no === '••••••234F'`; `loan_bank` present (engineer reads loans).
  - engineer `customers/save` of the full object it got back plus `landmark:'Temple'` → admin `customers/get` still has the real `aadhaar_no`, `pan_no` and `loan_bank === 'SBI'`, `loan_amount === '200000'`, and `landmark === 'Temple'`.
  - BA adds its own customer via `customers/save` (owner = BA); admin sets `loan_bank` on it; BA `customers/get` has no `loan_bank` / `loan_amount` keys; BA `customers/save` of what it got back → admin still sees `loan_bank`.
- [ ] **Step 2: Run** `bash tests/run_api.sh` — Expected: the new file reports FAILs (columns missing / values blanked).
- [ ] **Step 3: Implement.** Columns + `SCHEMA_VERSION = 40` with a `/* v40: … */` note in migrate. Plant `save`: start from the stored data (`plant_get`) and overwrite only keys present in the body (`array_key_exists`); replace `panels`/`inverters` only when present (serial-duplicate check unchanged). `mask_customer`: unless `can_see_bank()`, `mask_tail` `aadhaar_no` and `pan_no` when non-empty; unless `can('loans')`, `unset` every `LOAN_COLS` key. Customers update in `core.php`: drop from `$v`/`$cols` `aadhaar_no`/`pan_no` whose value contains `•`, and all `LOAN_COLS` when `!can('loans', true)`.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — Expected: every suite `N passed, 0 failed`.
- [ ] **Step 5: Commit** `git add api/lib.php api/plant.php api/security.php api/core.php tests/profile_pages_api_test.php tests/run_api.sh` — "Profile: new fields; saves never blank fields they don't send".

### Task 2: Saving one page — `profile/page_save` and due data in the timeline

**Files:**
- Modify: `api/profile.php` (add `PF_PAGES`, `page_save`, progress `key`/`loan`, output `pipe`)
- Test: `tests/profile_pages_api_test.php`

**Interfaces:**
- Consumes: `plant_patch()` (Task 1), `kseb_autofill($v, $old)`, `lead_type_save('customers', $in, $cid)`, `mask_customer`, `strip_fin`, `PIPE`.
- Produces: `POST api.php?m=profile&a=page_save` body `{customer_id:int, page:'kseb'|'contact'|'reg'|'bank', data:{key:value}}` → `{ok:true, customer, plant, project}` (customer masked + strip_fin; project = latest project row through strip_fin, or null). Errors: unknown page 400; key not on the page 400 `"Not on this page: <key>"`; empty name 400 `"Name required"`; loan keys without `loans` write 403 `"No access to loan details"`; `subsidy_amount` without finance + projects write, or with no project, 403. Timeline (`GET api.php?m=profile&customer_id=`) gains `pipe: [PIPE keys in order]` and each `progress[]` entry gains `key` (PIPE key of its stage, or `''`) and `loan` (`'Yes'|'No'|''`).
- `PF_PAGES` (php, keys per store; `c` customers column, `p` plant key, `j` latest project column):
  - `kseb` c: name, consumer_no, kseb_section, kseb_subdivision, kseb_division, kseb_circle, tariff, phase, sanctioned_load, meter_no, transformer, pole_no, address, district, pincode, local_body, village_survey, premises
  - `contact` c: phone, alt_phone, email, aadhaar_no, pan_no, gst_no, lead_type, landmark, notes
  - `reg` p: application_no, application_date, applied_kw, etoken_id, approved_kw, approved_on, kseb_reg_no, spin, installed_on, inspected_on, netmeter_on, commissioned_on; j: subsidy_amount
  - `bank` c: bank_holder, bank_name, bank_branch, bank_account, bank_ifsc, jansamarth_id, loan_bank, loan_branch, loan_amount, loan_sanctioned_on (loan keys = `jansamarth_id` + `LOAN_COLS`)

- [ ] **Step 1: Write the failing tests** (same file):
  - admin page_save `kseb` `{consumer_no:'1146530000099'}` on a customer with empty section → customer `kseb_section` / division filled by the office lookup; then set `kseb_division:'Typed Div'` and save `{consumer_no:'1146530000099'}` again → `kseb_division === 'Typed Div'`.
  - page_save `kseb` `{name:''}` → 400; `{bogus:'x'}` → 400; page `zzz` → 400.
  - page_save `contact` `{phone:'9800000011'}` → other columns (e.g. `aadhaar_no`, `transformer`) unchanged.
  - engineer page_save `bank` `{bank_account:'••••••••5678', bank_ifsc:'SBIN0000002'}` → admin sees the real account unchanged and the new IFSC; engineer page_save `bank` `{loan_bank:'X'}` → 403; sales page_save `bank` `{loan_bank:'Canara'}` → 200.
  - page_save `reg` `{application_no:'NP-KLSEB26-00000001', etoken_id:'ET-1'}` on a customer with a project → `plant.application_no` and `projects.application_no` both equal it; sales page_save `reg` `{subsidy_amount:'78000'}` → 403; admin → 200 and project `subsidy_amount == 78000`.
  - timeline: `pipe[0] === 'customer'`, `progress[0].key === 'customer'` for a new project, `progress[0].loan` present.
- [ ] **Step 2: Run** `bash tests/run_api.sh` — Expected: FAIL (unknown action → timeline JSON, missing keys).
- [ ] **Step 3: Implement `page_save`** at the top of `handle_profile` (`if ($a === 'page_save') { … }` after `need('customers')`, before the timeline). Per key: c-keys need `can('customers', true)` (loan keys need `can('loans', true)` instead); skip values containing `•` for `bank_account`, `aadhaar_no`, `pan_no`; `sanctioned_load` → float; `lead_type` → `lead_type_save('customers', $data, $cid)`; when `consumer_no` or `kseb_section` is in the data run `kseb_autofill(array_merge($old, $c), $old)` and keep only its office fields that were empty before or follow the rule it already implements; `UPDATE customers SET … , updated=CURRENT_TIMESTAMP` for the sent c-keys only; p-keys via `plant_patch`; `application_no` also `UPDATE projects SET application_no=? WHERE id=<latest>` when a project exists; `subsidy_amount` → latest project (float). `audit('update','customers',$cid,'Profile page: '.$page)`. Timeline: add `key`/`loan` per progress entry and `pipe`.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — Expected: all suites pass.
- [ ] **Step 5: Commit** — "Profile: save one page at a time (profile/page_save)".

### Task 3: The page model (pure) — `PFP`

**Files:**
- Create: `assets/app28.js` (pattern: `var PFP = (function () { … })(); if (typeof module !== 'undefined') module.exports = PFP;`, like `assets/app24.js`)
- Test: `tests/pfp.test.js`

**Interfaces:**
- Produces:
  - `PFP.PAGES`: `[{key, tab, icon, sections:[{paper, fields:[Field]}]}]` in order `kseb` ("KSEB connection", paper "KSEB bill"), `contact` ("Personal & contact", "Aadhaar / PAN"), `reg` ("Registration & feasibility": sections "MNRE application acknowledgement & e-token", "KSEB feasibility approval", "KSEB registration & commissioning"), `bank` ("Bank & loan": "Passbook (subsidy account)", "Loan papers (Jan Samarth)"), `plant` ("Plant details": fields for counting only — the plant keys below plus `panel_serials`/`inverter_serials`). Field keys per page = `PF_PAGES` in Task 2 (plant page: capacity, panel_make, panel_type, panel_wattage, panel_count, panel_model, panel_efficiency, inverter_make, inverter_capacity, inverter_dc_voltage, meter_make, meter_serial, meter_reading, cell_invoice_no).
  - `Field = {k, l, s:'c'|'p'|'j', t?:'num'|'date'|'area'|'opts', opts?:[[value,label]], docs:[docKey], due:''|pipeKey, opt?:true, perm?:'loans'|'fin', hi?:true, ro?:true}`. `hi` only on `name`. The contact page also has a read-only `{k:'gps', l:'GPS location', s:'c', ro:true, docs:['agr'], due:''}` whose value is `lat,lng` (blank when either is empty or both are 0); it is edited with the Location button, never sent by `diff`, and left out of the PHP-list comparison. `docs` from the spec's "Which documents use which detail" (doc keys `cov req wcr an1 an2 an3 doi agr chk bfr bag`). `opt:true` on spin, alt_phone, email, premises, gps-less extras (aadhaar_no, pan_no, pole_no, gst_no, landmark, notes, applied_kw, etoken_id, approved_kw, approved_on, netmeter_on, commissioned_on, inspected_on, installed_on, loan_branch). `due` per the spec table: `pmsg` application_no/application_date/applied_kw/etoken_id/subsidy_amount; `feasibility` approved_*; `reg_pay` kseb_reg_no; `electrical` installed_on and plant-page panel/inverter keys and serials; `delivery` cell_invoice_no; `inspection` inspected_on and meter_*; `netmeter` netmeter_on/commissioned_on; `loan` loan keys (perm `loans`); `kseb_docs` passbook keys; `''` pages kseb/contact. Options: tariff `['', 'LT-1A Domestic', 'LT-6 Non-domestic', 'LT-7 Commercial', 'LT-4 Industrial', 'Other']`, phase `['', 'Single phase', 'Three phase']`, premises `['Owned','Leased']`, lead_type from `LT_OPTS` at render time (not in PFP).
  - `PFP.value(f, ctx) → string` with `ctx = {c, p, j, prog, pipe, can:(perm)=>bool}`; `application_no` = plant value else project value; `panel_serials`/`inverter_serials` = `''` when any listed panel/inverter has an empty serial or the list is shorter than `panel_count`, else `'ok'`.
  - `PFP.isDue(f, ctx) → bool`: `due === ''` → true; no `ctx.prog` or its `key` not in `ctx.pipe` → false; `perm === 'loans'` and `ctx.j.loan !== 'Yes'` → false; else `pipe.indexOf(prog.key) > pipe.indexOf(f.due)`.
  - `PFP.missing(pageKey, ctx) → [{k, l, docs}]`: fields with `docs.length && !opt && !value && isDue && (!perm || ctx.can(perm))`.
  - `PFP.later(f, ctx) → bool`: needed by a document, empty, not due (for the muted "needed later").
  - `PFP.counts(ctx) → {kseb, contact, reg, bank, plant}`.
  - `PFP.diff(pageKey, ctx, form) → {key: value}`: trimmed form values that differ from `PFP.value`; masked-looking values (contain `•`) are never included.
- [ ] **Step 1: Write the failing tests** `tests/pfp.test.js`:
  - every field key of pages kseb/contact/reg/bank matches the PHP list (hard-code the four arrays from Task 2 in the test and compare).
  - new customer, no project, empty consumer_no and empty plant → `counts().kseb >= 1`, `counts().reg === 0`, `counts().plant === 0`, `counts().bank === 0`.
  - project `prog.key = 'electrical'`, `j.loan = 'No'`, empty application_no and capacity → `missing('reg')` contains `application_no`; `missing('plant')` does not contain `capacity` (electrical is not past electrical) ; with `prog.key = 'kseb_docs'` it does; loan keys never in `missing('bank')` while `loan = 'No'`; with `'Yes'` and `prog.key = 'pmsg'` `jansamarth_id` is missing.
  - `application_no` empty in plant but set on project → not missing.
  - `prog.key = 'unknown'` → only kseb/contact counted (Review Focus 4).
  - `diff('bank', ctx, {bank_account:'••••5678', bank_ifsc:'X'})` → `{bank_ifsc:'X'}`.
  - `missing` excludes a `perm:'loans'` field when `ctx.can('loans')` is false.
- [ ] **Step 2: Run** `node --test tests/pfp.test.js` — Expected: FAIL (`Cannot find module` / PFP undefined).
- [ ] **Step 3: Implement** `assets/app28.js` to the interfaces above (no DOM).
- [ ] **Step 4: Run** `node --test tests/pfp.test.js` — Expected: all pass.
- [ ] **Step 5: Commit** — "Profile pages: the page model (PFP)".

### Task 4: Page view and edit — `renderPfPage`

**Files:**
- Create: `assets/app29.js`; Modify: `assets/app2.css` (append `.pp*` rules)

**Interfaces:**
- Consumes: `PFP` (Task 3), `profile/page_save` (Task 2), existing `api`, `esc`, `toast`, `canW`, `canR`, `FIN`, `BA`, `LT_OPTS`, `locModal`, `copyText`, `KD.DOCS[k].tab` for document names.
- Produces: `renderPfPage(box, st, key, edit)` where `st = {c, p, j, prog, pipe, id}` — `c` the customer (`customers/get`), `p` plant data (`plant/get` → `.data`), `j` the latest project (`c.projects[0]`, the list is newest first) or null, `prog` the latest timeline progress entry (`tl.progress[tl.progress.length - 1]`, oldest first) or null, `pipe` = `tl.pipe` — mutable, updated from the save response — and `edit:boolean`; `pfCtx(st) → ctx` for PFP; `pfNeed(f, ctx) → html` mark ("empty · needed by Agreement, Cover page" in red, or muted "needed later").
- Behaviour: header row = page title, "Keep the <paper> in hand" (per section), Edit this page / Save / Cancel; view rows click-to-copy (same `.pfv` button as today); the `hi` field in a highlighted box with the exact label from Global Constraints; edit inputs by type (`opts` → select, `date` → `type=date`, `num` → `inputmode=decimal`, `area` → textarea); masked fields render empty with `placeholder="<masked value> — type to replace"`; loan section hidden unless `canR('loans')`, read-only unless `canW('loans')`; `subsidy_amount` only when `FIN()` and a project exists; lead_type select only for admin (others see text); contact page shows a "GPS location" row with the Set/Change location button calling `locModal(st.c, st.id)`. Save sends `PFP.diff`; nothing changed → toast "No changes"; on success update `st` from the response and re-render view; on error keep the form.
- [ ] **Step 1: Implement** `renderPfPage` and the `.pp` styles (no DOM test harness; verified in Task 6).
- [ ] **Step 2: Check** `node --check assets/app29.js` — Expected: no output.
- [ ] **Step 3: Commit** — "Profile pages: page view and edit".

### Task 5: Wire the pages into the profile

**Files:**
- Modify: `assets/app11.js` (`pgCustomer`: tabs, Overview card, header Edit; drop `PF_GROUPS` usage and its "Copy all")
- Modify: `assets/app12.js` (`PL_SECTIONS`, `renderPlant` marks, rooftop fallback)
- Modify: `assets/app.js` (`customerModal` new-only short form, list action `ed`)

**Interfaces:**
- Consumes: `renderPfPage`, `pfCtx`, `pfNeed` (Task 4); `PFP.counts`, `PFP.PAGES` (Task 3); timeline `pipe`/`progress[].key|loan` (Task 2).
- Produces: global `PFT_EDIT` (boolean, consumed once by `pgCustomer` to open the current page in edit mode).
- [ ] **Step 1: Implement.**
  - `pgCustomer` also fetches `plant/get` in its `Promise.all` and builds `st` (Task 4) once per load.
  - Tabs: Overview, `1 · KSEB connection`, `2 · Personal & contact`, `3 · Registration & feasibility`, `4 · Bank & loan`, `5 · Plant details`, then Documents, Warranty card, MNRE warranty card, Tax bill as today; each page tab shows a red `.ppn` count when `PFP.counts` > 0. Plant details tab keeps key `plant` (`renderPlant`).
  - Overview: replace the `PF_GROUPS` cards with a "Details by page" card (one row per page: name, "n missing" in red or "Complete", click opens the page); keep progress, Location card, Quotations, Notes, Timeline.
  - Header Edit (`#ed`): on Overview open `kseb` in edit; on a page, that page in edit; on Plant details, `renderPlant(…, true)`.
  - `PL_SECTIONS`: remove `Application` and `KSEB & dates`; add `['Invoice & warranty', 'receipt', [['gst_invoice_no','GST invoice no.'], ['warranty_till','Warranty till','d']]]`; Rooftop's `rooftop_type` shows/prefills `d.rooftop_type || c.roof_type`. In the view, a field with a `PFP` plant-page entry shows `pfNeed` when empty.
  - `customerModal(0)`: fields name (label "Consumer name (as on the KSEB bill)"), phone, lead type (as today, Meta excluded), consumer no., address, district (default Thiruvananthapuram), notes; after save go to `#/customers/<id>`. List action `ed`: `PFT = 'kseb'; PFT_EDIT = true; location.hash = '#/customers/' + c.id`. `customerModal(id>0)` is no longer called anywhere.
- [ ] **Step 2: Check** `node --check assets/app.js assets/app11.js assets/app12.js` (one file per call) and `node --test tests/pfp.test.js`, `node --test tests/kseb.test.js` — Expected: no errors, all pass.
- [ ] **Step 3: Commit** — "Profile pages: tabs, overview summary, short new-customer form".

### Task 6: Ship-ready check

**Files:**
- Modify: `index.html` (add `<script src="assets/app28.js?v=…"></script>` and `app29.js` after `app27.js`; bump stamps)

- [ ] **Step 1:** Add the script tags; bump stamps (Global Constraints command).
- [ ] **Step 2: Run** all tests: `node --test tests/pfp.test.js`, `tests/kseb.test.js`, `tests/comm.test.js`, `tests/owner.test.js`, `tests/qm_calc.test.js`, `tests/mfr_xls.test.js` and `bash tests/run_api.sh` — Expected: 0 failures everywhere.
- [ ] **Step 3: Browser check** on a scratch copy (`tar` the tree to the scratchpad, `php -S 127.0.0.1:<port>`, open `http://<name>.localhost:<port>` via a same-origin login helper; delete the copy after). Check as admin and as an engineer: tabs and red counts; a new customer shows only page 1/2 counts; Edit/Save on each page; masked account unchanged after a page save; loan section read-only for engineer; Location button on page 2; Plant details without the moved sections; phone width 375 px; KSEB documentation tab still fills from the profile.
- [ ] **Step 4: Commit** — "Profile pages: load the new scripts".
