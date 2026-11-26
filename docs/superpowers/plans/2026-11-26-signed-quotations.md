# Signed Quotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff ask the admin to sign a quotation; the admin's signed PDF (seal + signature) is stored with the quotation and is the one file everyone views, downloads and shares (WhatsApp / email, customer / bank), with a badge and notifications.

**Architecture:** A new server file `api/quote_sign.php` owns the signed-copy state (table `quote_sign`), the share log (`quote_log`), the content-version token and the notifications; `handle_qm()` in `api/quotemaker.php` routes new actions to it, and `qm save`, `files keep`, the Recycle bin and the 90-day lead-quote rule learn about signed copies. On the client, `assets/app51.js` is a pure, Node-tested `QSIGN` helper; `assets/app52.js` holds the UI (badge, Ask admin to sign, Review & sign, view / download / share window) wired into the Quotations list, the maker, the customer's Quotations card, Leads › Show quotation and the bell.

**Tech Stack:** PHP 8.3 + SQLite (PDO), vanilla JS (no build), html2canvas + jsPDF (existing `qmDownloadPdf`), Node `node:test`, PHP API tests over curl.

**Spec:** `docs/superpowers/specs/2026-11-26-signed-quotations-design.md`

## Global Constraints

- Bump `SCHEMA_VERSION` in `api/lib.php` from 79 to **80**; new tables/columns/indexes go in `migrate()` (idempotent: `CREATE TABLE IF NOT EXISTS`, column added only when missing).
- Every POST needs header `X-Solarize: 1`; uploads go through `sec_upload($fl, ['pdf'], 25)`.
- New GET actions must be added to the GET whitelist in `api.php` (line ~59): `sign_info`, `signed`.
- Deletes go through the Recycle bin (`trash_put` / `TRASH_FILE_COLS`); never `unlink` a signed copy outside it.
- `session_write_close()` runs early in `api.php`: no `$_SESSION` writes in the new code.
- PDO binds as TEXT: inline `(int)` values when comparing to expressions.
- Staff never receive the seal / signature pictures (`qm_signoff_mine()` and `qm img` rules unchanged).
- Business Associates have no Quotations access; every new action starts with `need('quotes')` (writes: `need('quotes', true)`; signing: `is_admin()`).
- Front end: CSS class prefix **`.qsg-`** (checked free) in `assets/quote.css`; monochrome line icons (`i-receipt`, `i-check`, `i-download`, `i-whatsapp`, `i-mail`, `i-eye`, `i-share`/`i-link` as available — grep `app.css` for `.i-` names before use); never `//` comments inside one-line statements (use `/* */`).
- Bump every `assets/(app[0-9]*|quote|kseb)\.(js|css)?v=` stamp in `index.html` once at the end; add `<script src="assets/app51.js?v=…">` and `app52.js` right after the `app50.js` line (line ~74, i.e. after `app22.js` and `app35.js`, whose `acDownload`, `acMobile`, `acMailReady`, `qmSavedPages`, `qmMount`, `qmDownloadPdf` they call).
- Notification copy (exact):
  - `sign_req` (to every active admin): `{who} asks you to sign quotation {no} · {name}`
  - `signed` (to creator `made_by` and requester `req_by`, never the signer): `{admin} added the seal & signature to quotation {no} · {name}`; when a signed copy already existed: `{admin} updated the signed quotation {no} · {name}`
  - `sign_lost` (to every active admin except the editor): `Quotation {no} · {name} was changed after signing by {who} — sign it again`
- Badge copy: `Waiting for signature` (amber), `Signed & sealed · 26 Nov` (green, date = `signed_at` as `d Mon`).
- Never real customer data in tests (made-up names / phones).

## Review Focus

1. A staff member presses Save on a signed quotation without changing anything (or only changes Sent/Accepted) → it must stay signed, file kept (Task 4 test `no-change staff save keeps the signature`).
2. A signed lead quotation when the lead becomes a customer → the customer's Documents must get the **signed** file, kept forever, not a re-made unsigned one (Task 4 test `files keep of a signed quotation stores the signed file`).
3. A signed quotation deleted and restored from the Recycle bin → badge, file and request come back (Task 1 test `delete and restore keep the signed copy`).
4. The admin's upload arrives after a staff edit (stale page) → refused with 409, nothing stored (Task 3 test `stale version refused`).
5. A quotation whose lead/customer has no phone or email, or a user without Loans access → share window disables those targets with a reason instead of failing (Task 6 test `targets without phone, email or loans access`).

---

### Task 1: Storage, version token and quotation state on list/get

**Files:**
- Create: `api/quote_sign.php`
- Modify: `api.php` (require `api/quote_sign.php` after `api/quotemaker.php`; whitelist `sign_info`, `signed`), `api/lib.php` (SCHEMA_VERSION 80; `migrate()`; `notif_add()` accepts `quote_id`), `api/core.php` (quotes list/get fields; customer get `quotes` rows), `api/trash.php` (`TRASH_FILE_COLS`, quote / customer / lead specs, `lead_quotes_expire`), `api/disc.php:135` (notifs feed returns `quote_id`, `quote_no`)
- Test: `tests/quote_sign_api_test.php` (new; add to `tests/run_api.sh` with the URL + sqlite path arguments like `att_auto_test.php`)

**Interfaces:**
- Produces (PHP):
  - tables `quote_sign(quote_id INTEGER PRIMARY KEY, req_by INTEGER, req_at TEXT, signed_by INTEGER, signed_at TEXT, file TEXT DEFAULT '', name TEXT DEFAULT '', size INTEGER DEFAULT 0, ver TEXT DEFAULT '')`, `quote_log(id INTEGER PRIMARY KEY AUTOINCREMENT, quote_id INTEGER, via TEXT, to_whom TEXT, to_addr TEXT DEFAULT '', user_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP)` + index `qlog_quote ON quote_log(quote_id)`; column `notifs.quote_id INTEGER`.
  - `qs_ver(array $doc): string` — sha1 of the canonical JSON of `$doc` without keys `seal` and `number` (assoc arrays key-sorted recursively, lists kept in order, `JSON_UNESCAPED_UNICODE`).
  - `qs_row(int $qid): ?array` — the `quote_sign` row or null.
  - `qs_state(?array $row): string` — `'signed'` when `file` ≠ '' ; `'waiting'` when `req_by` set and no file; else `''`.
  - `qs_out(int $qid, ?array $quote = null): array` — `{state, ver, signed_at, signed_by, signed_name, req_by, req_name, req_at, file_name, sealed}` (`sealed` = stored `doc.seal` true; `ver` = `qs_ver` of the stored doc).
  - `qs_admins(): array` — ids of active, not-deleted users with role `admin`.
  - `notif_add(..., ['quote_id' => $id])` stores `notifs.quote_id`.
- `quotes list` rows gain `sign_state`, `signed_at`; `quotes get` gains `sign` (= `qs_out`); customer get `quotes` rows gain `sign_state`, `signed_at`.

- [ ] **Step 1: Write the failing tests** in `tests/quote_sign_api_test.php` (multi-actor helper: one cookie jar per actor, as `actor()` in `tests/qm_api_test.php`; admin `boss`, sales `qsseller`, made-up lead "Test Sign Lead" phone `9800000401`, customer "Test Sign Customer" `9800000402`; a maker quotation saved through `qm save` with a minimal doc `{price: 150000, customer: {name: '…'}, items: {}}`):
  - `schema: quote_sign and quote_log exist, notifs has quote_id` (PRAGMA on the sqlite path)
  - `quotes list: an unsigned quotation has sign_state ''`
  - `quotes get: sign.state '' and a 40-char ver`
  - `ver ignores seal and number, changes with the price` (direct DB: same doc with `seal:true` → same `ver`; price changed → different)
  - `delete and restore keep the signed copy` (insert a `quote_sign` row with a file written into `data/uploads/`, delete the quote via `quotes delete`, file moved out of uploads; restore via the Recycle bin action used in `tests/trash*` / `api/trash.php` → row and file back)
  - `customer get quotes rows carry sign_state`
- [ ] **Step 2: Run** `bash tests/run_api.sh` — expect the new file's checks to FAIL (missing tables / fields).
- [ ] **Step 3: Implement** the schema in `migrate()`, `api/quote_sign.php` helpers above, the require + whitelist in `api.php`, `notif_add` `quote_id`, the list/get/customer fields (a `LEFT JOIN quote_sign s ON s.quote_id=q.id` in the list SQL; `CASE WHEN s.file<>'' THEN 'signed' WHEN s.req_by>0 THEN 'waiting' ELSE '' END sign_state`), `TRASH_FILE_COLS['quote_sign'] = 'file'`, `['quote_sign', 'quote_id=?', [$id]]` added to the quote spec in `trash_crud`, `['quote_sign', 'quote_id IN (SELECT id FROM quotes WHERE customer_id=?)', [$cid]]` to `trash_spec_customer` (before the quotes rows are deleted), the same for the lead spec and `lead_quotes_expire()`; generic `quotes delete` and customer/lead deletes also `DELETE FROM quote_sign …` / `quote_log` for those quotes; `disc.php` feed: `LEFT JOIN quotes qq ON qq.id=n.quote_id` → `qq.number quote_no`.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — all PASS (whole suite, exit 0).
- [ ] **Step 5: Commit** `git add api tests && git commit -m "Signed quotations: storage, version token, state on lists"`

### Task 2: Ask admin to sign / cancel

**Files:**
- Modify: `api/quote_sign.php`, `api/quotemaker.php` (route `sign_req`, `sign_cancel`, `sign_info` to `qs_handle($a, $in)`)
- Test: `tests/quote_sign_api_test.php`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `qs_handle(string $a, array $in): void` (outputs); POST `qm sign_req {id}` → `{ok, sign}`; POST `qm sign_cancel {id}` → `{ok, sign}`; GET `qm sign_info&id=` → `{sign, shares: [{via, to_whom, to_addr, who, created}] (latest 5)}`.

- [ ] **Step 1: Write the failing tests:**
  - `sign_req: sales asks, every admin gets a sign_req notif with quote_id and the exact text` (text `Qs Seller asks you to sign quotation {no} · Test Sign Lead`)
  - `sign_req: state becomes waiting on list and get`
  - `sign_req twice: no second notification` (409 or ok without a new notif — pick ok + no new notif)
  - `sign_req on a signed quotation: 409 "already signed"`
  - `sign_req on a quotation without a maker doc: 400`
  - `sign_cancel by the requester clears it; by another sales user 403; by an admin ok`
  - `sign_info: sales gets state and shares; a BA gets 403`
- [ ] **Step 2: Run** `bash tests/run_api.sh` — new checks FAIL.
- [ ] **Step 3: Implement** in `api/quote_sign.php` (needs `need('quotes', true)` for the writes; upsert `quote_sign` keeping any file; `notif_from_me($admin, 'sign_req', $text, ['quote_id' => $id, 'lead_id' => …, 'customer_id' => …])` for each of `qs_admins()`); name = customer name else lead name; audit `quote_sign_req` / `quote_sign_cancel`.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Signed quotations: ask admin to sign"`

### Task 3: Signing upload and the signed PDF download

**Files:**
- Modify: `api/quote_sign.php`, `api/quotemaker.php` (route `sign`, `signed`)
- Test: `tests/quote_sign_api_test.php`

**Interfaces:**
- Produces: POST multipart `qm sign` fields `id`, `ver`, `file` (PDF) — admin only → `{ok, sign}`; GET `qm signed&id=[&dl=1]` streams the stored PDF (`Content-Type: application/pdf`, `Content-Disposition: inline|attachment; filename="<name>"`, `Cache-Control: private, no-store`).
- Server behaviour of `sign`: 403 unless `is_admin()`; 404 unknown quote; 400 no maker doc; **409 `{error: 'This quotation was changed — open it again', quiet: 0}` when `ver` ≠ `qs_ver(stored doc)`**; sets stored `doc.seal = true` without touching `updated` / `edit_by`; moves an older signed file to the Recycle bin (`trash_put('Signed quotation', …, [['quote_sign', 'quote_id=?', [$id]]])` then re-insert); stores the file in `up_dir()` as `bin2hex(random_bytes(12)).'.pdf'`, `name` = uploaded file name (sanitised like `files keep`); for a customer quotation writes / replaces the customer's Documents copy (`files` row, `gen='quote:<id>'`, `kind='gen'`, `item='Quotation <no> · signed'`, `life=0`, a **copy** of the file, not the same path); clears `req_by/req_at`; notifies (`signed` copy above) `made_by` and `req_by` (deduplicated, never the signer); for a lead quotation sets the 90-day clock start (see Task 4: `lead_quotes_expire` uses `MAX(updated, signed_at)`); audit `quote_sign`.

- [ ] **Step 1: Write the failing tests** (make a tiny valid PDF in the test with `"%PDF-1.4\n…%%EOF"` as `tests/kseb_api_test.php` / folder tests do, or reuse `assets/kseb/blank.pdf`):
  - `sign: sales gets 403`
  - `stale version refused` (409, nothing stored)
  - `sign: admin stores the file, state signed, doc.seal true, updated unchanged`
  - `signed: creator and requester notified once each with the exact text; the admin is not`
  - `signed: customer quotation → Documents copy gen quote:<id>, life 0, item "Quotation <no> · signed"`
  - `signed: lead quotation → no files row`
  - `re-sign: older file goes to the Recycle bin, notif text "updated the signed quotation"`
  - `signed GET: sales downloads the same bytes; BA 403; unknown id 404; unsigned quotation 404`
- [ ] **Step 2: Run** `bash tests/run_api.sh` — FAIL.
- [ ] **Step 3: Implement** as described (`sec_upload($_FILES['file'] ?? null, ['pdf'], 25)`; the multipart body arrives in `$_POST` — `body()` already returns `$_POST` for multipart).
- [ ] **Step 4: Run** `bash tests/run_api.sh` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Signed quotations: admin signs, everyone downloads the signed PDF"`

### Task 4: Save rules, Documents copy, lead clock

**Files:**
- Modify: `api/quotemaker.php` (`case 'save'`), `api/quote_sign.php` (`qs_after_save(int $id, array $old, array $new, bool $admin): void`), `api/core.php` (`files keep`), `api/trash.php` (`lead_quotes_expire`)
- Test: `tests/quote_sign_api_test.php`

**Interfaces:**
- Consumes: `qs_ver`, `qs_row`, `qs_out`.
- Produces: `qm save` response gains `sign` (= `qs_out`) and `ver`.

Rules (in `case 'save'`, computed after `$doc['number']` / `$doc['date']` are set, with `$old = json_decode($cur['doc'], true)`):
- same content (`qs_ver($old) === qs_ver($doc)`) and old `seal` true → keep `$doc['seal'] = true` for **anyone** (replaces today's unconditional `unset` for non-admins in this case only);
- content changed by a non-admin → `unset($doc['seal'])` (as today); if a signed file exists → Recycle bin (`trash_put('Signed quotation', …)`) and delete the row's file fields; the customer's `quote:<id>` Documents row gets `life = rule('gen_days')` from now; notify `sign_lost` (copy above) to `qs_admins()` minus the editor;
- admin saves with `seal` false → signed file to the Recycle bin, Documents life back to `gen_days`, no notification;
- admin saves with `seal` true and content changed → old signed file to the Recycle bin (the client uploads a fresh one right after, Task 7); no notification here.

`files keep` with `gen=quote:<id>` while the quotation is signed: ignore the uploaded file, (re)write the customer's Documents copy from the signed file (copy, `life 0`, item `Quotation <no> · signed`), reply `{id, life: 0, signed: 1}`. This also covers lead → customer conversion (`qmKeepLeadQuotes`).

`lead_quotes_expire()`: the age test uses `MAX(COALESCE(q.updated, q.created), COALESCE(s.signed_at, ''))` with `LEFT JOIN quote_sign s ON s.quote_id=q.id`.

- [ ] **Step 1: Write the failing tests:**
  - `no-change staff save keeps the signature` (sales re-saves the identical doc → state signed, file there, doc.seal true)
  - `staff status change keeps the signature` (`qm status` Accepted → still signed)
  - `staff content change removes it: file in Recycle bin, state '', admins get sign_lost with the exact text, Documents life = gen_days`
  - `admin unticks: signed copy removed, no notification`
  - `files keep of a signed quotation stores the signed file` (POST `files keep` with a different PDF → Documents file bytes = signed file bytes, life 0)
  - `lead clock: a signed lead quotation older than 90 days by updated but signed today is not expired` (set `quotes.updated` 100 days back in SQL, run the housekeeping entry point used by `tests` for `lead_quotes_expire`, or call it through the hourly housekeeping action)
- [ ] **Step 2: Run** `bash tests/run_api.sh` — FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — PASS (also the existing `qm_api_test.php` checks "staff cannot put the seal on a quotation" and "a staff change to a sealed quotation takes the seal off" must still pass).
- [ ] **Step 5: Commit** `git commit -am "Signed quotations: edits after signing, Documents copy, lead clock"`

### Task 5: Share log and share templates

**Files:**
- Modify: `api/quote_sign.php` (`QS_TPL_DEFAULT`, `qs_tpl()`, actions `share_log`, `share_tpl_save`), `api/quotemaker.php` (route; `qm boot` returns `share_tpl`)
- Test: `tests/quote_sign_api_test.php`

**Interfaces:**
- Produces: `QS_TPL_DEFAULT = ['cust_subject', 'cust_body', 'bank_subject', 'bank_body']` (placeholders `{name}`, `{quote_no}`, `{amount}`, `{date}`, `{company}`, `{sender}`, `{sender_phone}`; wording in the tone of `ACX_CUST` in `assets/app35.js`, e.g. cust_body `Dear {name},\n\nPlease find attached our signed quotation {quote_no} dated {date} for ₹{amount}.\n\nRegards,\n{sender}\n{company}\n{sender_phone}`; bank_body addresses "Dear Sir/Madam," and names the customer: `…the signed quotation {quote_no} dated {date} for ₹{amount} for the rooftop solar plant of our customer {name}, for the loan…`); stored with `kv_set('qm_share_tpl', …)`; `qm boot` → `share_tpl` (merged with defaults); POST `qm share_tpl_save` admin only (4000-char limit per field, unknown keys ignored); POST `qm share_log {id, via: whatsapp|email|pdf, to_whom: customer|bank, to_addr}` (`need('quotes')` — read is enough, as sharing is for everyone who can open it; only for a signed quotation, else 409); `sign_info.shares` lists the latest 5 with `who` = user name.

- [ ] **Step 1: Write the failing tests:** `share_log: sales logs a WhatsApp share to the customer; sign_info shows it with who`, `share_log: unknown via 400; unsigned quotation 409`, `share_tpl: boot has defaults; sales cannot save (403); admin saves bank_body and boot returns it`.
- [ ] **Step 2: Run** `bash tests/run_api.sh` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bash tests/run_api.sh` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Signed quotations: share log and templates"`

### Task 6: Pure client rules `QSIGN`

**Files:**
- Create: `assets/app51.js` (exports `QSIGN` for Node like `assets/app24.js` does with `module.exports`)
- Test: `tests/qsign.test.js`

**Interfaces:**
- Produces:
  - `QSIGN.state(sign) → { k: 'signed'|'waiting'|'', label: string, cls: 'g'|'a'|'' }` (labels exactly `Signed & sealed · 26 Nov` from `signed_at` `2026-11-26 …`, `Waiting for signature`).
  - `QSIGN.can(sign, me, q) → { ask, cancel, sign, make, share }` — ask: `canWrite && me.role !== 'admin' && k === '' && q has a maker doc`; cancel: `k === 'waiting' && (me.id === sign.req_by || me.role === 'admin')`; sign: admin and `k !== 'signed'`; make: admin and `sign.sealed && k !== 'signed'` (label "Make the signed copy"); share: `k === 'signed'`.
  - `QSIGN.targets(ctx) → [{ via, to_whom, addr, ok, why }]` for the four WhatsApp/Email × Customer/Bank buttons; ctx `{ phone, email, bank_phone, bank_email, is_customer, loans }`; bank needs `is_customer && loans` (why `Only for customers`, `Needs access to Loans`) and the address (why `Add it on the Bank & loan page`); customer needs phone / email (why `No phone number` / `No email`).
  - `QSIGN.fill(tpl, vars) → string` (`{key}` replaced, unknown keys left empty).
- [ ] **Step 1: Write the failing tests** `state labels`, `can: staff ask / admin sign / requester cancel / make for sealed`, `targets without phone, email or loans access`, `fill`.
- [ ] **Step 2: Run** `node --test tests/qsign.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement** `assets/app51.js`.
- [ ] **Step 4: Run** `node --test tests/qsign.test.js` — PASS.
- [ ] **Step 5: Commit** `git add assets/app51.js tests/qsign.test.js && git commit -m "Signed quotations: client rules"`

### Task 7: UI — badge, ask, review & sign, view / download / share

**Files:**
- Create: `assets/app52.js`
- Modify: `assets/app2.js` (`pgQuotes`: "Signature" column with the badge; row actions; admin filter chip `Waiting for signature (N)`; a signed row's WhatsApp button opens `qsShare`), `assets/app11.js` (`pfQuoteCard`: badge + View/Download/Share or Ask), `assets/app22.js` (`qmkHead` badge + buttons; `qmkSave` → after an admin save with `seal` true call `qsSign(id, ver)` instead of `qmKeepNote`, store `QMK.sign = r.sign`; `qmkPdf` for a signed, unchanged quotation downloads the signed file; `qmShowQuote` shows the signed PDF in an `<iframe>` and offers Share / Ask / Review & sign), `assets/app9.js` (bell items, toasts and desktop alerts for kinds `sign_req`, `signed`, `sign_lost` → `#/quotes/<quote_id>`; exclude them from the generic branch at line ~131), `assets/app23.js` (Quotation settings: section "Sharing a signed quotation" editing the four `share_tpl` fields, admin), `assets/quote.css` (`.qsg-` styles), `index.html` (scripts + stamp)
- Test: manual browser check in Task 8 (UI); `node --check` on every changed JS file.

**Interfaces:**
- Consumes: `QSIGN` (Task 6); API from Tasks 2–5; existing `qmSavedPages(q)`, `qmMount(box, pages)`, `qmDownloadPdf(box, name, false) → Blob`, `docViewer(F, i, U)`, `acDownload(file)`, `acMobile()`, `acMailReady()`, `composeMail({to, subject, body, attach, onSent})`, `ACC.waLink(phone, text)`, `modal()`, `toast()`, `api()`.
- Produces (globals):
  - `qsBadge(sign) → string` (HTML pill, `.qsg-b` + `pill` classes; '' when unsigned)
  - `qsAsk(q) → Promise<sign>`, `qsCancel(q) → Promise<sign>`
  - `qsSign(id, ver?) → Promise<sign>` — loads `quotes get`, builds pages with `qmSavedPages` after forcing `d.seal = true`, renders off-screen (`.qm-off` box like `qmKeepQuote`), uploads via `fetch('api.php?m=qm&a=sign', {method:'POST', headers:{'X-Solarize':'1'}, body: FormData(id, ver, file)})`; on 409 toasts the server message.
  - `qsReview(id)` — admin window: the saved quotation with the seal drawn in (pictures are available to admins) + **Add seal & signature** (or **Make the signed copy** when `sealed`) → `qsSign`.
  - `qsView(q)`, `qsDownload(q)` — `docViewer([{id, name}], 0, f => 'api.php?m=qm&a=signed&id=' + q.id + (dl ? '&dl=1' : ''))` / an `<a download>` on `…&dl=1`.
  - `qsShare(q, who)` — window with the `QSIGN.targets` buttons + Download + "Shared" history from `sign_info`; WhatsApp: phone + share sheet with the PDF, else `acDownload` + `window.open(ACC.waLink(...))` opened at click time (pop-up rule as `acShareBtn`); Email: `composeMail({…, attach: [file]})` after `acMailReady()`; each success → POST `qm share_log`.
- [ ] **Step 1: Implement `assets/app52.js`** with the globals above.
- [ ] **Step 2: Wire** the five screens and the bell as listed in Files.
- [ ] **Step 3: Run** `node --check` on `assets/app2.js assets/app9.js assets/app11.js assets/app22.js assets/app23.js assets/app51.js assets/app52.js` — no errors; `for t in tests/*.test.js; do node --test "$t"; done` — all PASS.
- [ ] **Step 4: Commit** `git commit -am "Signed quotations: badge, ask, review & sign, share"`

### Task 8: Whole-feature check

**Files:** none new (fixes only).

- [ ] **Step 1: Run** `bash tests/run_api.sh` (exit 0) and every `node --test tests/*.test.js` (all pass).
- [ ] **Step 2: Local browser check** on a scratch copy (`php -S localhost:<port>`, host `qs.localhost:<port>`, test admin + a test sales user, the seal/signature pictures from `D:\GDrive\jasper\quotation seal and signature\` uploaded through `qm upload` + `settings_save`, a made-up lead and customer): sales makes and saves a quotation → Ask admin to sign → admin bell shows it → Review & sign → badge on the list, customer card, Show quotation, maker → sales bell "added the seal & signature" → sales View / Download (bytes = stored file) / Share (WhatsApp computer path opens wa.me, Email path opens the composer) → sales edits the price → badge gone, admin bell "changed after signing". Remember: pages run inside the menu-tab iframe (query `iframe.contentDocument`), CSP blocks `eval`.
- [ ] **Step 3: Delete** the scratch copy and its cookie jars; reset the browser viewport.
- [ ] **Step 4: Commit** any fixes `git commit -am "Signed quotations: fixes from the end-to-end check"`.
