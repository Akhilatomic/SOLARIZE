# Signed quotations (admin seal & signature, shared by everyone)

Date: 2026-11-26 · Status: for the owner's approval (reviewed; retention decided by the owner)

## Why

Sales staff make quotations in the quotation maker. Banks need a **signed** quotation (company seal + the owner's signature) for
the customer's solar loan, and customers receive the quotation on WhatsApp. Only the admin (owner) may sign. Today:

- Only admins get the seal and signature pictures (`qm_signoff_mine()`; `qm img` 404s them for anyone else). An admin can tick
  "Add the company seal and signature" in the maker and save; the PDF kept in the customer's Documents then carries the seal.
- Every other way staff get a quotation — the maker's Download PDF, Leads › Show quotation, the WhatsApp button (text only), the
  Documents copy re-made by `qmKeepNote()` on each save — is **re-made in the staff member's browser, without the seal**. A staff
  save of a sealed quotation also takes the seal off (`unset($doc['seal'])` in `qm save`) and replaces the Documents copy.
- Lead quotations have no Documents page until the lead becomes a customer.
- Nobody is told when the admin signs, and the admin is not told when a quotation needs signing.

So a salesperson cannot get the exact signed file to the customer or the bank.

## What the owner asked for (their words, condensed)

"When a user creates and saves a quotation, save it on the Documents, and admin can view the quotation and add sign and seal and save
it again. After adding seal and sign all users can view and download the sealed and signed document. Add a badge after adding seal and
sign. Also send a notification to the user who created the quotation that the sign and seal was added by the admin." Purpose: "send
to customer on WhatsApp, also share it with the bank — signed quotation required." The owner picked approach A (below) and chose that
**staff press "Ask admin to sign"** to tell the admin a quotation is waiting.

## Goals

1. The admin's signed PDF is **stored with the quotation** (lead or customer quotation) and is the only file anyone gets for a signed
   quotation: view, download, share.
2. Staff ask for a signature with **Ask admin to sign**; every admin is notified; the quotation shows **Waiting for signature**.
3. The admin signs from the request (review and sign, no editing needed) or by ticking the box in the maker and saving.
4. A **Signed & sealed** badge (with the date) shows wherever quotations are listed.
5. The quotation's creator (and the person who asked, if different) is notified when the admin signs.
6. Anyone who can open the quotation can **share the signed PDF**: WhatsApp or email, to the customer or to the bank (bank manager's
   phone / bank email from the customer's Bank & loan page), or download it. Each share is logged and shown ("Shared" history).
7. For a customer quotation, the customer's Documents copy (`gen` key `quote:<id>`) **is** the signed file while it is signed.

## Non-goals

- Staff never get the bare seal and signature pictures (the existing admin-only rule stays).
- No digital (cryptographic) signature — it is the printed seal and signature picture, as on the tax bill.
- The Android "Jasper" app's own notifications are not changed (the web bell, toast and desktop alerts are).
- Older quotations made before the quotation maker (no `doc`) are not signable.
- No change to how an unsigned quotation is shared (the WhatsApp button keeps sending the text message).

## Anti-goals (would make it a failure even if it works)

- A signed file goes out that no longer matches the quotation (someone changed it after signing).
- A signature disappears because someone pressed Save without changing anything, or changed only the status.
- A staff browser overwrites the signed Documents copy with an unsigned one.
- The admin is flooded with alerts for drafts (only explicit requests notify them).

## Approaches considered

- **A. Keep the admin's signed PDF on the quotation (picked by the owner).** The admin's browser makes the PDF with the pictures and
  uploads it; the server keeps it per quotation and hands that file to everyone. Costs one stored PDF per signed quotation (~1–2 MB).
- B. Let staff browsers draw the seal on signed quotations (serve the pictures to staff for sealed quotations). Fewer new parts, but
  every staff browser could save the seal and signature pictures — against the owner's admin-only rule.
- C. Badge + notification only, staff use the Documents copy. Cheapest, but lead quotations have no Documents page and WhatsApp
  would still send text only.

## Behaviour

### States of a quotation (shown as a badge next to its status)

| State | Badge | When |
|---|---|---|
| Not signed | (none) | default |
| Waiting for signature | amber "Waiting for signature" | staff pressed Ask admin to sign, admin has not signed yet |
| Signed | green "Signed & sealed · 26 Nov" | a signed PDF is stored and matches the current quotation |

### Ask admin to sign (staff)

- Shown to anyone with Quotations edit, on a **saved** maker quotation that is not signed and not already waiting: in the maker
  header, in the Quotations list row actions, on the customer's Quotations card, in Leads › Show quotation.
- Unsaved changes in the maker are saved first.
- Notifies every active admin (bell + toast + desktop alert): "Anu asks you to sign quotation JS/QT/2026/0150 · <customer or lead
  name>"; clicking opens the quotation (`#/quotes/<id>`).
- An admin who presses it on their own quotation simply goes to signing (no request needed).
- **Claude's call:** the requester may withdraw the request ("Cancel request"); a request ends when the quotation is signed, deleted,
  or withdrawn.

### Signing (admin)

Two ways, one server step:

1. **Review & sign** — from the request notification, the Quotations list (filter chip "Waiting for signature (N)", admin only), the
   customer card or Show quotation: a read-only view of the saved quotation with the seal and signature drawn in, and a button
   **Add seal & signature**. The admin does not have to open the editor.
2. **In the maker** — tick "Add the company seal and signature" and Save (as today).

Either way the admin's browser makes the PDF from the **saved** copy with `seal: true` (same renderer as `qmKeepQuote` /
`qmSavedPages`) and uploads it. The server, admin only:

- checks the quotation has not changed since the admin loaded it (a version token, below; 409 otherwise: "This quotation was
  changed — open it again");
- sets `doc.seal = true` in the stored quotation if it is not already (without counting as a content change);
- stores the PDF as the quotation's signed copy (replacing an older signed copy);
- for a customer quotation, puts the same file in the customer's Documents under `gen` key `quote:<id>` (replacing the copy there);
- ends the request; notifies the creator (`quotes.made_by`) and the requester if different (never the admin themself): "Boss added
  the seal & signature to quotation JS/QT/2026/0150 · <name>"; click opens the quotation;
- audits it (`quote_sign`).

If the admin unticks the box and saves, the signed copy goes to the Recycle bin and the badge goes (no notification —
**Claude's call**).

### Viewing, downloading, sharing a signed quotation (everyone who can open it)

- **View** opens the stored signed PDF in the CRM's document viewer; **Download** downloads that file. This replaces the re-made PDF
  in: the maker's Download PDF (for a signed quotation), Leads › Show quotation (shows and downloads the signed PDF), the customer's
  Quotations card.
- **Share** opens a share window like the payment receipts' (`acShare` in `assets/app35.js`): WhatsApp or Email × Customer or Bank,
  plus Download. On a phone the share sheet sends the PDF itself; on a computer the PDF downloads and WhatsApp opens with the message
  ready. Bank options need the customer's `loan_mgr_phone` / `loan_bank_email` (greyed with "Add it on the Bank & loan page"
  otherwise); a lead quotation offers Customer (the lead's phone/email) and Download only. **Claude's call (permissions
  unchanged):** the Bank options follow the existing rule for loan details — shown only to users with Loans read, because
  `mask_customer()` hides the bank contact fields from everyone else (all default staff roles have Loans read). Unlike receipts they
  do **not** need a project with loan = Yes, because quotations usually come before a project exists.
- Message wording: a new pair of templates for quotations (to customer, to bank), with `{name}`, `{quote_no}`, `{amount}`, `{date}`,
  `{company}`; defaults written by the builder in the tone of the existing receipt templates; admin-editable in Quotations › gear ›
  Quotation settings (where every Quotations user's settings already come from — the bank email templates need Payments/Accounts
  access, which some quotation makers lack). **Claude's call.**
- Each share is logged per quotation (who, how, to whom, address, when) and the share window shows the latest few, as on receipts.
- In the Quotations list the WhatsApp button of a **signed** quotation opens this share window; unsigned ones keep today's text
  message.

### Changes after signing

- The server decides, on every `qm save`, whether the **printed content** changed: compare the stored `doc` with the new one,
  ignoring only `seal` and `number` (set by the server, never changes). `date` is compared — it prints. Note that `qmkSave`
  re-takes `snap` / `snap_settings`; a different snapshot means different printed lines, so it counts as a change. Status is a
  column, not part of `doc`, so a status change is never a content change.
- **No content change** (e.g. Save pressed again, or only the status changed — `qm status` never touches the doc): the quotation stays
  signed, `doc.seal` is kept even for a staff save, the signed copy stays.
- **Content changed by staff:** seal off (as today), the signed copy goes to the Recycle bin, the badge goes, and every admin is
  notified "Quotation JS/QT/2026/0150 was changed after signing by Anu — sign it again" (click opens it). It does not become
  "Waiting for signature" by itself (**Claude's call**; staff can ask again).
- **Content changed by an admin with the box still ticked:** the admin's browser makes and uploads a new signed copy right after the
  save (as in Signing); the creator is notified again ("updated the signed quotation").
- While a quotation is signed, `files keep` for `quote:<id>` from any browser is refused/ignored, so nobody's re-made copy replaces
  the signed Documents copy (`qmKeepNote` after a staff save, `qmKeepLeadQuotes` on conversion). On lead → customer conversion a
  signed lead quotation's signed file is copied into the new customer's Documents.
- Deleting a quotation (Recycle bin) takes its signed copy and request with it; restoring brings them back.

### How long signed copies are kept (owner's choice: "Customers forever")

- **Customer quotation, signed:** the signed copy and its Documents copy (`quote:<id>`) are kept until someone deletes them
  (`life` 0, like tax bills and the approved quotation) — not the 120-day `gen_days` or the 200-day converted-lead lifetime. If it
  stops being signed (changed after signing, or unticked) the Documents copy falls back to the normal lifetime from that day.
- **Lead quotation, signed:** the 90-day rule for unconverted leads' quotations (`lead_quotes_expire()`) stays, but **signing restarts
  its clock** (90 days from the signing). When the lead becomes a customer, the signed copy goes into the customer's Documents and is
  kept until deleted, as above.
- The quotation's own stored signed copy lives exactly as long as the quotation (Recycle bin with it, restored with it).

### Quotations sealed before this is live

**Claude's call:** no backfill. Since 21 Nov 2026 admins could tick the seal in the maker, so a few quotations have `doc.seal = true`
but no stored signed copy. They show as not signed; for an admin, Review & sign / the maker offer "Make the signed copy" (one click,
same Signing step), after which they are signed like any other. Until then they behave as today.

## Data (builder may adjust names)

- New table `quote_sign` (one row per quotation): `quote_id` PK, `req_by`, `req_at`, `signed_by`, `signed_at`, `file` (stored name
  under `data/`), `name` (download file name), `size`, `ver` (the version token of the doc it was made from). Kept off `quotes` so the
  generic quotes CRUD and `SELECT *` lists never carry or overwrite it.
- New table `quote_log`: `id`, `quote_id`, `via` (whatsapp | email | pdf), `to_whom` (customer | bank), `to_addr`, `user_id`,
  `created`.
- `notifs.quote_id` (new column) so the bell can open `#/quotes/<id>`; new notif kinds `sign_req`, `signed`, `sign_lost`.
- Version token: a hash of the stored `doc` JSON without `seal` (server-computed, returned by `quotes get` / the list).
- Bump `SCHEMA_VERSION` (migrations run once per version) and add indexes for the new FK columns.
- Signed PDFs are served by a GET action (added to the api.php GET whitelist) that applies the same access as opening the quotation
  (Quotations read; Business Associates have no Quotations access). Uploads go through `sec_upload($fl, ['pdf'], 25)`; every POST
  needs `X-Solarize: 1`.

## Constraints from the project

- Front end: no build step, assets `app<N>.js`; namespace new CSS classes and grep `app.css` / `app2.css` first; monochrome line
  icons; bump the `?v=` asset stamp in `index.html`.
- Server: deletes go through the Recycle bin (`trash_put`); `session_write_close()` runs early — no new `$_SESSION` writes after it;
  GET actions must be whitelisted; PDO binds as TEXT (inline ints when comparing to expressions).
- The CRM's menu tabs run pages inside iframes; notifications / desktop alerts run only in the outer window (`FRAME` guards).
- Tests: PHP API tests in `tests/run_api.sh` (temp copy), Node tests `node --test tests/*.test.js`; never real customer data in tests.

## Left to the builder

File layout (which `app<N>.js`), exact UI placement and styling within the rules above, template default wording, how the share
window is shared with `acShare` (reuse vs. a quotation variant), the version-token algorithm, and test structure.
