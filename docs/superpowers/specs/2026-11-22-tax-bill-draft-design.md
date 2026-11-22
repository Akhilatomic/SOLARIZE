# Tax bill: Save as draft, Save & download, final bills admin-only — short design

Date: 2026-11-22 · Status: approved by the owner in chat ("Admin only") · Size: small change

## Intent

Owner: "Tax bill — add a Save to draft and Save and download option. Draft — it helps to change it before finalize."
Today the first "Issue tax bill" press uses up the next invoice number at once (and only after the final payment); there is no way to
keep a half-made bill. A draft lets staff prepare and correct the bill first; finalising gives the number and the PDF.

## Approaches

1. **Draft kept in its own row (gen_docs kind `taxd`, number not reserved) — picked.** Nothing that reads issued bills (accounts,
   profit report, bank papers, warranty card, number series: all `kind='tax'`) ever sees a draft; finalising deletes the draft row.
2. Status column on the `tax` row (draft / issued) — rejected: every reader of `kind='tax'` would have to learn to skip drafts, and
   the number series (`gen_next_no` reads the last `tax` number) would treat a draft's number as used.
3. Draft only in the browser (localStorage) — rejected: lost on another computer or for another staff member.

## Design

- **Before the bill is final** (no `tax` row):
  - **Save as draft** (secondary button): POST `gen/draft` (kind=tax, customer_id, issued_on, number, data) → upsert gen_docs
    `taxd` row (number = the typed number or '' when "Auto"; not checked against other bills, not reserved). Needs customers write +
    finance, like a save. Allowed at any time — the final-payment lock does not apply. Audited `tax_bill_draft`.
  - **Save & download** (primary): finalises exactly as "Issue tax bill" did (number given or the typed one, final-payment lock,
    admin "Issue early" link kept), deletes the `taxd` row, then builds the A4 PDF once, downloads it and keeps it in Documents
    (the existing keepTax copy).
  - The form opens from the draft when there is one: pill "Draft · saved <date> by <name>", the typed number (or next number when
    the draft used Auto), all fields. `gen/get` returns `draft: {number, issued_on, data, updated, updated_by}` (null when none or
    when the bill is final).
  - Preview and Print of a bill that is not final carry a large diagonal **DRAFT** mark and "Invoice no.: (given when finalised)"
    when the number is automatic, so a draft cannot pass for a real invoice.
- **After the bill is final** (owner: "Admin only"):
  - Everyone else sees the bill read-only (fields disabled) with Print / Send / Save to Documents as today.
  - An admin sees it read-only too, with **Edit issued bill**; pressing it enables the form with **Save changes** and
    **Save & download**. Server: `gen/save` kind tax on an existing bill → 403 unless admin; audited `tax_bill_edit` (number + total).
  - The invoice number "Auto" button on a final bill is admin-only as well (it is part of editing).
- Payments, receipts and the commission box in the same tab are unchanged (not part of the bill).

## Non-goals

No credit / debit notes; no draft for the warranty card; no change to how numbers are made.

## Calls made by Claude

- A draft can be saved before the final payment; only finalising waits for it.
- Printing a draft is allowed but marked DRAFT.
- A draft's typed number is not reserved; it is checked when the bill is finalised (409 if another bill has it).

## Tests

`tests/` PHP API: draft save / reload, draft does not use the number (next number unchanged), draft allowed while payment is due,
finalising deletes the draft and gives the number, non-admin edit of a final bill → 403, admin edit → 200 + audit, `gen/get` hides
drafts once final. Browser: draft → reload shows it; Save & download downloads one PDF and keeps it in Documents; DRAFT mark in
preview; non-admin sees a read-only final bill.
