# Tax bill drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tax bill gets "Save as draft" (no number used, editable, any time) and "Save & download" (finalise + PDF + Documents copy); a final bill can be changed by an admin only.

**Architecture:** Drafts live in their own `gen_docs` row (kind `taxd`, one per customer) written by a new `gen/draft` action and returned by `gen/get` as `draft`; finalising (`gen/save` kind tax, first time) deletes it. `gen/save` on an existing tax bill is refused for non-admins. The browser (`renderTax` in `assets/app18.js`) opens from the draft, marks unfinished bills DRAFT, and shows a read-only final bill with an admin-only "Edit issued bill".

**Tech Stack:** PHP 8.3 + SQLite (no build step), vanilla JS, tests = PHP API scripts run by `bash tests/run_api.sh` + `node --test tests/*.test.js`.

**Spec:** `docs/superpowers/specs/2026-11-22-tax-bill-draft-design.md`

## Global Constraints

- Drafts never use or reserve an invoice number; everything that reads issued bills keeps reading `kind='tax'` only.
- Finalising keeps today's rules: final-payment lock (`acc_bill_lock`), admin `early:1` (audited `tax_bill_early`), typed number unique (409).
- Final bill: `gen/save` kind tax with an existing row → 403 "Only an admin can change an issued tax bill" unless `is_admin()`; admin saves audited `tax_bill_edit`.
- Draft save needs customers write + finance (same gates as `gen/save` tax); audited `tax_bill_draft`.
- POSTs need `X-Solarize: 1`; CSP forbids inline handlers; UI uses `ask()`, CSS vars, monochrome icons; bump `?v=` on deploy.
- No real customer data in tests.

## Review Focus

- A draft whose typed number another bill took meanwhile: finalising must 409 and keep the draft (not delete it).
- Two people: A saves a draft while B finalises → draft row must not survive the final bill (`gen/get` returns `draft: null` once `tax` exists).
- Non-admin opening a final bill: no editable field, no Auto button, Print / Send still work.
- Draft saved while payment is due, then finalised early by an admin → draft deleted, `tax_bill_early` audited.
- Old bills (issued before this change) open read-only for staff with no draft pill.

---

### Task 1: Server — drafts and admin-only edits

**Files:**
- Modify: `api/gen.php` (`handle_gen`: case `get` adds `draft`; new case `draft`; case `save` admin rule + draft delete + `tax_bill_edit` audit)
- Create: `tests/tax_draft_test.php` (pattern of `tests/subsidy_api_test.php`: own actors, `call()`, DB path argv[2])
- Modify: `tests/run_api.sh` (run the new test), `tests/qm_api_test.php:466-467` (staff edit of the issued "Bill Two" is now 403 and the seal stays 1)

**Interfaces:**
- Produces: `POST api.php?m=gen&a=draft` body `{kind:'tax', customer_id, issued_on:'Y-m-d', number:'' | typed, data:{…}}` → `{ok:true, draft:{number, issued_on, data, updated, updated_by}}`; 409 "The tax bill is already final" when a `tax` row exists.
- Produces: `gen/get` kind tax → adds `draft` (same shape, or `null`; always `null` when `doc` exists).

- [ ] **Step 1: Write `tests/tax_draft_test.php`** with checks: draft save 200 and `gen/get` returns it (number '' and a typed one round-trip); `gen/next` before and after a draft is the same number; draft allowed while `lock.locked` is true; second draft save replaces the first (one `taxd` row); finalise (`gen/save` admin, early:1) → `number` set, `draft` null, no `taxd` row; finalise with a draft whose typed number another customer's bill has → 409 and the draft still there; staff (accounts role with customers write, as in qm_api_test) `gen/save` on the final bill → 403, data unchanged; admin edit → 200 and an `audit_log` row action `tax_bill_edit`; `gen/draft` after final → 409.
- [ ] **Step 2: Run** `bash tests/run_api.sh` → new checks FAIL (unknown action / 200 instead of 403).
- [ ] **Step 3: Implement in `api/gen.php`**: `taxd` rows are written with plain SQL (do not add `taxd` to `GEN_KINDS`); `save` deletes `taxd` for the customer after a successful first insert of `tax`; the admin rule sits before the UPDATE branch; `draft` uses `gen_clean`, the same `issued_on` check and drops `show_seal` for non-admins.
- [ ] **Step 4: Update `tests/qm_api_test.php:466-467`** to the new rule; **run** `bash tests/run_api.sh` → all PASS.
- [ ] **Step 5: Commit** `api/gen.php tests/tax_draft_test.php tests/run_api.sh tests/qm_api_test.php`.

### Task 2: Browser — draft buttons, DRAFT mark, read-only final bill

**Files:**
- Modify: `assets/app18.js` (`renderTax` ~190-444: form source, buttons in `drawIssue`, `html()` DRAFT mark, read-only mode, Save & download), `assets/app2.css` or `TAXDOC_CSS` in app18.js (DRAFT watermark style — print window copies TAXDOC_CSS, so the mark lives there)

**Interfaces:**
- Consumes: Task 1 `gen/draft` and `gen/get().draft`.
- Produces: `renderTax(box, c, id, edit)` — 4th arg `true` = an admin pressed "Edit issued bill".

- [ ] **Step 1:** Form source: `g.doc ? g.doc : g.draft ? g.draft : new`; with a draft, `#tno` shows the draft number (typed → `noAuto=false`) else `g.next_no`; pill "Draft · saved <dmy> by <name>".
- [ ] **Step 2:** Editable `w` = `canW('customers') && (!g.doc || (ADM && edit))`; final + not editing: fields disabled, Auto hidden, admin sees `Edit issued bill` (→ `renderTax(box, c, id, true)`).
- [ ] **Step 3:** Buttons before final: `Save as draft` (sec, POST `gen/draft`, toast "Draft saved", re-render) and `Save & download` (primary = today's `issue()`; lock message + admin "Issue early" kept). After the save: set `TAX_DL = id`; on re-render build the PDF once (`acPdfFromHtml(... DOC_CSS + ACX_A4_FILL ...)`), `keepTax(blob)`, download it as `acFileName('Tax invoice', number, c.name)`. Admin editing a final bill: `Save changes` + `Save & download`.
- [ ] **Step 4:** `html()`: when `!g.doc`, add the DRAFT watermark element and print "(given when finalised)" as the number when `noAuto`.
- [ ] **Step 5: Verify in the browser** (scratch copy, `php -S`, fresh `*.localhost` host): draft save → reload shows it; Save & download downloads one PDF and Documents has "Tax invoice <no>"; DRAFT visible in preview and print; staff user sees the final bill read-only; admin Edit issued bill → Save changes works. `node --test tests/*.test.js` PASS.
- [ ] **Step 6: Commit** `assets/app18.js` (+ css) — push only on the owner's "Push live" (bump `?v=`).
