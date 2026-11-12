# Accounts — payments, receipts, project costs, expenses and profit

Date: 2026-11-12 · Status: for the owner's approval (builder check done)
Mockups (made-up data): `.superpowers/brainstorm/1963-1794450669/content/accounts-sketch.html`, `material-list-pdf.html`

## Why

Jasper Solar's money is spread over several places today: payments sit on each customer's Tax bill tab, fees and
commission live under Finance, ad spend under Ads, and nothing records what a project actually cost. The owner wants
one **Accounts** menu where staff record and track every payment received, chase what is still pending (with a
WhatsApp reminder), send receipts and the final bill to the customer's loan bank, enter what each project cost
material by material, and see the profit, including company running costs such as ads and AI tools.

Success: the owner opens Accounts and sees, for this month or this financial year, how much came in, how much is
pending and from whom, what was spent, and what the company earned, without asking anyone or opening a spreadsheet.

## Goals (the owner's words, organised)

1. **Track payments received**, often in several parts per project.
2. **Loan projects are labelled "Loan"** and otherwise work exactly like any other project: payments in as many parts as
   they come, no fixed 10/70/20 plan enforced. (The owner first described 10% margin / 70% / 20% and then said: no,
   the same as non-loan payers, only label it as loan.)
3. **A receipt for every payment**, shareable as a **PDF**.
4. **Tax bill generation is enabled only at the final payment** (nothing pending).
5. **Bank loan projects**: share each payment receipt and the final tax bill with the bank **by email**, with a
   ready-written email body, and **Email / WhatsApp buttons**. **Two separate email bodies**: one for payment receipts,
   one for the final tax bill.
6. **New customer profile fields**: bank email ID, bank manager name, bank manager phone number.
7. **Pending payments list** with a **WhatsApp payment reminder**.
8. **Project cost**: a button where staff add the cost of each material and the profit is found at the end.
9. **Materials list** like the itemised annexure of the owner's quotation (`D:\GDrive\jasper\SREEKUMAR K. S\Sreekumar_KS_10kW_SolarEdge_Quotation.pdf`,
   49 lines in 11 groups), with an option to **add a new material and save it**.
10. **Material list PDF** for purchase and for checking against site delivery, with **customer and project details**,
    the **full material list over as many pages as needed**.
11. **Company expenses**: ads expenses, AI expenses (and other running costs).
12. **One comprehensive page** to track all of it, including profit.

## Non-goals

- Not double-entry bookkeeping, a ledger, GST returns or a replacement for the accountant's books.
- No supplier payables tracking (what Jasper owes suppliers, due dates). Cost lines record supplier and bill no. only.
- No stock / inventory (materials bought for one project and used on another).
- No automatic WhatsApp sending. The WhatsApp Cloud API is still on Meta's test number and business-initiated
  messages need an approved template; reminders and shares open WhatsApp with the message ready and staff press send.
- No automatic reminders on a schedule; a person clicks the reminder button.
- No change to how quotations are made.

## Anti-goals (would make it a failure even if it works)

- The same money recorded twice (a second payments store beside the existing one).
- Cost and profit figures visible to sales staff or Business Associates.
- A reminder or receipt sent to the wrong person or with a wrong amount.
- Editing one screen silently overwriting data another screen saved.

## What already exists (build on it)

- `payments` table (`project_id, date, amount, mode, note, ref_no, receipt_no`), managed on the customer's **Tax bill**
  tab (`renderTax` in `assets/app18.js`): add / edit payments, `openReceipt` → `rcHtml` prints a receipt; receipt numbers
  `PREFIX/RCPT/FY/NNN` come from `POST gen/receipt` (`api/gen.php`); a receipt needs `ref_no` unless mode is Cash.
- `projects.cost` (project price incl. GST), `projects.loan`, `projects.stage` (pipeline in `api/pipeline.php`; has a
  "Tax bill generation" stage and "Project completed").
- Customer loan fields `loan_*` on profile page **4 · Bank & loan** (`assets/app28.js` `PFP`, saved via
  `profile/page_save` page `bank`; `LOAN_COLS` need `loans` write).
- Email: per-user mailboxes; `mail/send` accepts uploaded attachments (`$_FILES['att']`, PDF allowed, 24 MB).
- WhatsApp click-to-chat pattern `https://wa.me/<91phone>?text=` (used in `app18.js`).
- PDF tools vendored: `html2canvas` + `jsPDF` (quotation maker), `pdf-lib` (KSEB/bank papers).
- Ad spend per campaign per day: `ad_spend` table (Ads module). Commission / incentive per customer: `commissions`.
- Permission modules (`MODULES` in `api/lib.php`, `FIN_MODS` in `app2.js`), role defaults in `ROLE_DEFAULTS`.
- Numbering helper `gen_next_no(kind, date)` (continues from last issued number in the FY).

## The design

### 1. Sidebar › Accounts

A new sidebar entry **Accounts** (its own entry, not inside the Finance group). Route `#/accounts/<tab>`. Tabs:

| Tab | Shows |
|---|---|
| **Overview** | Month / financial-year switch (‹ › to step). Tiles: Received, Pending (n projects, n loan), Expenses (Ads · AI · Other), Profit. Under them the pending list (top 10, "see all"). |
| **Pending payments** | Every project with money still due. Columns: customer (+ **Loan** tag), plant kW, project price, received, pending, last payment (date · days ago), last reminder (date · by). Sorted by pending, biggest first; filter All / Loan / Not loan; search. Row actions: **WhatsApp reminder**, **+ Payment**, open customer. |
| **Payments received** | Every payment in the chosen period: date, customer, from (Customer / Bank), amount, mode · ref, receipt no., actions (PDF, WhatsApp, Email, bank buttons on loan projects). Total at the top. |
| **Project profit** | One row per project: price before GST, cost before GST, profit, margin %, cost lines entered, status (stage). Click → the project's cost sheet. |
| **Expenses** | Company running costs by month: category, date, amount, paid to, note. Categories at least **Ads**, **AI tools**, **Other** (admin can add more). Ad spend from Ads › campaigns shows as an automatic monthly line. |
| **Materials list** | The master list of materials (see §5): add, edit, hide. |

Lists use the CRM's standard spreadsheet table style and `lazyMore()` for long lists. Apple-inspired light theme,
monochrome line icons.

### 2. Payments

- Payments stay in the existing `payments` table. The Tax bill tab keeps working; Accounts reads and writes the same rows.
- New column `payments.src`: **Customer** or **Bank (loan)** (default Customer; on loan projects the add form asks).
- Any number of payments per project. Pending = `projects.cost` − sum of payments.
- **Which projects are "pending"**: the same rule as the Dashboard's overdue list (`api/ops.php`): projects past the
  early stages (Customer, KSEB feasibility check, Loan registration, KSEB feasibility payment, PMSG portal registration
  are left out) with money still due. One shared PHP function serves both, so the two totals always agree. Projects in
  the early stages appear under a "Not started" filter without the reminder button.
- **More than one project per customer**: Accounts works per project. The tax bill and its receipts stay as today
  (per customer, latest project, `gen_acct()`); older projects of the same customer show in Accounts with their
  payments, use the ÷ 1.089 price, and have no tax bill lock. Receipts for payments on an older project are produced
  from Accounts (the receipt code takes the payment's own project).
- **Loan label**: projects with `loan` = Yes show a **Loan** tag everywhere in Accounts and can be filtered. No split
  rules are enforced.

### 3. Receipts as PDF and sharing

- Every saved payment can produce its receipt (the existing receipt layout, `rcHtml`) as an **A4 PDF file**, named like
  `Receipt JS-RCPT-26-27-031 Customer Name.pdf`. Existing rule kept: a receipt needs a reference no. unless Cash.
- Buttons on each payment: **PDF** (download), **WhatsApp** (customer), **Email** (customer, if they have an email).
- On loan projects also **Email to bank** and **WhatsApp to bank**.
- **Email**: opens a small compose window filled with To (bank email / customer email), subject and the body from the
  matching template; staff can edit it; the PDF is attached; it is sent from the staff member's own connected mailbox
  through `mail/send`. If they have no mailbox connected, the button says so and links to Email settings.
- **WhatsApp**: on a phone, the share sheet sends the PDF file itself (Web Share API with the file). On a computer,
  the PDF downloads and WhatsApp opens to the person's number with the message ready; staff attach the downloaded file.
- Each share is logged on the payment (when, by whom, to whom, how) and shows as "sent" ticks in the lists.

### 4. Tax bill only at the final payment

- On the Tax bill tab, issuing the bill (the action that gives it its number) is disabled while pending > 0; the button
  shows "₹ X still due". When pending reaches 0 it unlocks.
- **Loan projects (owner's decision): the bill unlocks when only the bank's money is left**, because the bank releases
  its last part only after it gets the final tax bill. Rule: customer's share = project price − loan amount
  (`customers.loan_amount`, page 4 · Bank & loan); the bill unlocks when the payments marked **Customer** cover the
  customer's share (or when nothing is pending at all). If the loan amount is blank, the button stays locked and says
  "Enter the loan amount on the Bank & loan page".
- Admin override: an admin can issue it early after a confirm ("Issue the tax bill before full payment?"), logged in the
  audit log.
- Bills already issued before this change are untouched.
- The final tax bill gets the same PDF / Email to bank / WhatsApp to bank buttons, with the tax bill email template.

### 5. Bank details on the customer profile

New customer fields on profile page **4 · Bank & loan** (same rules as the other `loan_*` fields: `loans` permission):
**Bank email**, **Bank manager name**, **Bank manager phone**. They fill the To / greeting / WhatsApp number of the bank
shares.

### 6. Email templates (two)

Settings for Accounts (admin, gear on the Accounts page): **Payment receipt email** and **Final tax bill email**, each a
subject + body with placeholders: `{manager}`, `{bank}`, `{customer}`, `{consumer_no}`, `{loan_ref}` (Jan Samarth ID /
loan account), `{amount}`, `{amount_words}`, `{date}`, `{receipt_no}`, `{mode_ref}`, `{bill_no}`, `{bill_total}`,
`{received_total}`, `{kw}`, `{company}`, `{sender}`, `{sender_phone}`. Defaults (English, editable):

- Receipt — subject `Payment receipt {receipt_no} – {customer} – solar plant {kw} kW`; body: Dear {manager}, please find
  attached the payment receipt {receipt_no} for ₹{amount} received on {date} ({mode_ref}) towards the {kw} kW rooftop
  solar plant of {customer} (consumer no. {consumer_no}, loan ref {loan_ref}). Kindly process the next disbursement.
  Regards, {sender}, {company}, {sender_phone}.
- Tax bill — subject `Final tax invoice {bill_no} – {customer} – solar plant {kw} kW`; body: Dear {manager}, the {kw} kW
  rooftop solar plant of {customer} (consumer no. {consumer_no}, loan ref {loan_ref}) is complete. Please find attached
  the final tax invoice {bill_no} for ₹{bill_total}. Kindly release the final disbursement. Regards, …

A WhatsApp reminder template (customer) is also editable: Dear {customer}, a balance of ₹{pending} is pending for your
{kw} kW solar plant. Kindly pay at the earliest. Account: {company bank details}. Thank you, {company}.

### 7. Materials list (master)

- Table of materials: group, name (with make/spec), unit (Nos, m, kg, kW, Job, Set, Lot…), GST %, last purchase rate
  (before GST), hidden flag, sort order.
- First filled with the 49 lines of the owner's 10 kW SolarEdge quotation annexure, in its 11 groups (Inverter &
  optimizers, Solar panels, Structure & supports, Distribution boards, Metering & isolation, DC cables & connectors,
  AC cables & lugs, Earthing & lightning protection, Pipes & conduit fittings, Cable accessories & consumables,
  Services and charges). The quotation's prices are selling prices, so the list starts **without rates**.
- **Add new material** (from the Materials tab or straight from a cost sheet line) saves it to the list for future
  projects. Typing a rate on a cost sheet updates that material's "last purchase rate".

### 8. Project cost sheet

- Opened by a **Project cost** button on the project (and from Accounts › Project profit, and from the Tax bill tab).
- Lines grouped like the quotation: material (picked from the list, or a new one), qty, unit, rate before GST, GST %,
  amount (qty × rate), supplier, bill no., bill date, note. Services (welding, installation, KSEB fees, liaisoning,
  transport) are lines in the "Services and charges" group.
- **Copy from another project**: copy the lines (items and quantities, optionally rates) of a similar plant.
- An automatic, read-only line **Incentive / commission** shows the amount from Finance › Commission/Incentive for this
  customer.
- **KSEB fees**: the owner's quotations include KSEB charges in the gross amount (feasibility ₹1,180, registration
  ₹1,000/kW + GST), and Jasper pays KSEB, so they are cost lines in "Services and charges". When Finance › Fees has an
  amount for this customer (feasibility / registration / stamp paper), the line is filled from it; otherwise typed.
  The customer's money for them is part of the project price and recorded as ordinary payments.
- Header tiles: project price before GST, total cost before GST, profit, margin %, lines without a rate.
- **Profit = project price before GST − total cost before GST − incentive/commission.** GST collected and paid is not
  profit. Project price before GST = the issued tax bill's taxable total when there is one, else `projects.cost` / 1.089
  (the CRM's 70:30 Part A 5% / Part B 18% rule = 8.9% overall).

### 9. Material list PDF (purchase + site delivery check)

- **Download material list** on the cost sheet makes an A4 PDF (see mockup `material-list-pdf.html`): company header,
  title "MATERIAL LIST — Purchase & site delivery check", number + date; **Customer** block (name, phone, site address,
  KSEB consumer no., section, landmark / map link); **Project** block (plant kW, phase, system type, panels, inverter,
  structure, quotation no., engineer, planned install date).
- Table: every **material** line of the cost sheet (services left out), in quotation groups: No, item · make, qty,
  unit, and blank columns **Ordered ☐**, **Delivered qty ___**, **OK ☐**, **Remarks**. **No prices.**
- The full list runs over as many pages as needed (the owner: "all materials in multiple pages is ok"); the table
  header repeats on each page; page x / y in the footer; the signature block (Purchased by · Delivered by · Received at
  site, with dates) on the last page.
- The signed sheet is checked on paper; staff can photograph it and upload it to the customer's Documents.

### 10. Company expenses

- Entry: date, category, amount (as paid), GST % (0 / 5 / 18, default 0), paid to, payment mode, note (optional bill
  upload is the builder's call). Profit uses the amount before GST, the same basis as project profit.
- **Ads**: Ads › campaign spend (`ad_spend`) is summed per month automatically and shown as "Ads (from campaigns)";
  typed Ads entries are for ad costs not entered as campaign spend.
- **AI tools** and **Other** are typed.
- Overview Expenses tile = campaign spend + typed expenses for the period.

### 11. Overview profit

Profit for a period = profit of the projects counted in that period (§8) − company expenses in that period.

- A project counts in the period in which its **tax bill was issued** (`gen_docs.issued_on`), i.e. when the sale is billed.
- Projects with **no cost lines** are left out of the Profit total and listed under "Cost not entered" (count + link),
  so old and imported projects do not show their whole price as profit. Projects with some lines without a rate are
  counted and flagged "incomplete".

### 12. Who sees what

- New permission module **accounts** (a finance module: listed in `FIN_MODS`, hidden for roles without finance).
  Read = see the Accounts menu (all tabs, including cost and profit); write = edit cost sheets, materials, expenses,
  templates.
- Defaults: admin all; **accounts** role read + write; everyone else none. Business Associates never (add to
  `ROLE_NEVER` like WhatsApp).
- Recording payments keeps using the existing `payments` permission (Tax bill tab and Accounts' + Payment).
- Customer bank fields keep the `loans` permission.

## Constraints

- PHP + SQLite, no build step; bump `SCHEMA_VERSION` for new tables/columns; new tables get indexes on filter columns.
- All writes POST with `X-Solarize: 1`; GET-only actions go in the api.php whitelist; deletes go through the Recycle
  bin (`trash_put`).
- Strict CSP: no inline scripts or handlers; new JS in new `assets/appNN.js` files; CSS class prefix checked against
  app.css/app2.css (e.g. `.acx`).
- Pure calculation code (pending, profit, before-GST price, template filling) in a Node-testable module; API tests in
  `tests/*_api_test.php` added to `tests/run_api.sh`. Never real customer data in tests.
- Bump `?v=` asset stamps in index.html on deploy.

## Left to the builder

Table and column names, file split, exact layouts within the mockups' spirit, PDF engine choice (jsPDF / pdf-lib),
how share logs are stored, Excel export of lists (optional), pagination details.

## Calls made by Claude (not yet confirmed by the owner)

- Accounts is a separate sidebar entry, not inside Finance.
- Build on the existing payments table; add `payments.src` (Customer / Bank).
- WhatsApp opens with the message ready (no automatic sending) until a real number + approved template exist.
- Admin can issue a tax bill early (with confirm).
- Materials list seeded from the 10 kW quotation without rates.
- Profit counted before GST; price before GST from the tax bill, else ÷ 1.089.
- Material list PDF has no prices; delivery is checked on paper.
- Ads expenses = campaign spend (automatic) + typed Ads entries.
- New `accounts` permission: admin + accounts role by default.
- A project's profit counts in the month its tax bill was issued; projects with no cost lines are left out and listed.
- "Pending" uses the Dashboard's rule (early-stage projects left out), shared code.
- KSEB fees are cost lines, filled from Finance › Fees when there.
- Expenses carry a GST % so profit compares before-GST amounts.
- Accounts is per project; tax bill stays per customer (latest project).
