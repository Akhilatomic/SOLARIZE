# Customer profile in pages — design

Date: 2026-11-11 · Status: draft for approval

## Why

The customer profile is the only place staff type a customer's details. Every KSEB and bank document the CRM prints
(Cover page, Request letter, Work completion report, Annexures 1–3, Details of installation, Agreement, Checklist sheet,
Feasibility report, Vendor–customer agreement) is filled from it, so a detail missing from the profile is a blank on the paper.

Staff copy the details from the papers the customer and the portals give them, and those papers arrive in a fixed order:

1. KSEB bill (always first)
2. Aadhaar card / PAN card
3. PM Surya Ghar application acknowledgement and e-token (MNRE portal)
4. KSEB feasibility approval ("ack")
5. Bank loan papers (feasibility for bank, Jan Samarth digital approval)
6. Bank passbook (subsidy account)
7. Installation (panels, inverters, serial numbers, meters, DCR, test results)
8. KSEB inspection and commissioning (KSEB registration no., SPIN, dates, commissioning certificate)

Today the details are split between one long customer form (Edit) and the Plant details tab, in an order that does not
follow those papers. Someone holding a KSEB bill cannot see which boxes it fills; correcting one detail later means hunting
for it. Many details are common to several documents (name, consumer no., address) and must be typed once.

## What we're building

The profile becomes a set of **pages (tabs), one per set of papers**, in the order the papers arrive. Approved by the user
on a mockup ("YES. GOOD"):

| Tab | Keep in hand | Holds |
|---|---|---|
| Overview | — | progress, timeline, location card, quotations, notes (as today) + a summary of what is still missing per page |
| 1 · KSEB connection | KSEB bill | name, consumer no., section office (+ sub division, division, circle), tariff, phase, connected load, meter no., DTR (transformer), pole no., address as on the bill, district, PIN, panchayath / municipality, village & survey no., premises owned / leased |
| 2 · Personal & contact | Aadhaar, PAN | phone, alternate phone, email, Aadhaar no., PAN no., GST no., lead type, landmark, GPS location |
| 3 · Registration & feasibility | MNRE acknowledgement, e-token, KSEB feasibility approval, commissioning certificate | application no. and date, applied capacity, e-token ID, eligible subsidy, approved capacity and approval date, KSEB registration no., SPIN, installation / inspection / net-meter / commissioning dates |
| 4 · Bank & loan | Passbook, loan papers | subsidy account (holder, bank, branch, account no., IFSC); loan (Jan Samarth ID, loan bank, branch, amount, sanction date) |
| 5 · Plant details | installation, DCR | today's Plant details tab minus the fields moved to page 3: panels with serials, inverters, structure, rooftop (incl. roof type), solar & net meter, GST invoice no. and warranty till, DCR, test results |
| Documents, Warranty card, MNRE warranty card, Tax bill | — | unchanged |

### Behaviour (decided with the user)

- **One page at a time.** Each page shows its details read-only (click to copy, as today) with its own **Edit this page**
  button; editing shows only that page's boxes, with Save / Cancel. Staff fill one paper at a time instead of one long form.
- **Each page names the paper(s) to keep in hand** ("Keep the KSEB bill in hand"). Where a page covers several papers
  (pages 3 and 4), its boxes are grouped under each paper's name.
- **Missing details are visible — only when they are due.** A box that is empty, is needed by a KSEB or bank document,
  **and whose paper should already be in hand at the customer's current pipeline step** shows in red with the document
  names ("empty · needed by Agreement"). The page's tab shows a red count of such boxes. User's choice ("Only when it's
  due"): a customer added today shows only the KSEB bill and contact details as missing, not ~40 boxes. An empty box that
  is not due yet is shown plainly (e.g. a muted "needed later"), never red. Optional details (SPIN, wheeling preferences)
  are never counted. A customer without a project: only pages 1 and 2 are due.

  When each paper is due (a detail is due once the customer's latest project has moved past that pipeline step; exact
  field-to-step mapping is the builder's, following this table):

  | Paper | Due after the pipeline step |
  |---|---|
  | KSEB bill (page 1), Aadhaar / PAN / contact (page 2) | from the start (Customer) |
  | KSEB feasibility approval | KSEB feasibility check |
  | Loan papers (only when the project says Loan taken = Yes) | Loan registration |
  | MNRE application acknowledgement, e-token | PMSG portal registration |
  | KSEB registration no. | KSEB registration fee payment |
  | DCR / cell invoice | Material delivery |
  | Plant installation details (panels, inverters, serials, structure) | Electrical installation |
  | Passbook (subsidy account) | KSEB documents submission |
  | Meter details, inspection date | DISCOM inspection |
  | Net meter date, commissioning date | DISCOM net-meter commissioning |
- **The consumer name is the name exactly as on the KSEB bill.** It sits at the top of page 1 in a highlighted box:
  "Consumer name (exactly as on the KSEB bill — printed on every document)". User's rule: the name must match the KSEB bill;
  if it does not, staff update it to match. There is no separate contact-person name.
- **Nothing already entered is lost.** Existing details only move to the page of the paper they come from (e.g. application
  no. and KSEB reg. no. move from Plant details to page 3).

### New boxes (details already on the papers, no box today)

| Detail | Paper | Page |
|---|---|---|
| Pole no. | KSEB bill ("Pole#") | 1 |
| Aadhaar no., PAN no. | Aadhaar, PAN | 2 |
| Applied capacity (kWp) | MNRE application acknowledgement | 3 |
| E-token ID, eligible subsidy (₹) | e-token | 3 |
| Approved capacity (kWp), approval date | KSEB feasibility approval | 3 |
| Net meter installed on | commissioning certificate | 3 |
| Loan bank, branch, loan amount, sanction date | Jan Samarth digital approval | 4 |

No document prints these yet; they are for reference and for papers still to be built (bank quotation, disbursement
request, installation certificate).

## Goals

- Staff can sit with one paper and fill exactly the boxes it covers, in the order the papers arrive (KSEB bill first).
- Anyone can see at a glance which details are still missing for the documents, and on which page.
- Correcting a detail later is quick: open the page for that paper, Edit, Save.

## Non-goals

- Reading the papers automatically (no OCR / upload-to-fill).
- Changing what the KSEB and bank documents print, or their layouts.
- Changing the pipeline stages.

## Anti-goals (a failure even if it works)

- Any value already in a profile disappears or is blanked.
- Saving one page clears or changes boxes on another page (the plant save today rewrites every plant key; a page save
  must only touch its own fields).
- The "New customer" step gets longer or harder (it stays a short form; the pages fill the rest later).
- Full Aadhaar, PAN or bank account numbers become visible to roles that today only see the last 4 digits of the account.

## Constraints

- Existing stack (PHP 8 + SQLite, no build step, vanilla JS files in `assets/`); bump `SCHEMA_VERSION` for new columns
  and the `?v=` asset stamps in `index.html`; new GET actions go in the api.php whitelist; every POST needs `X-Solarize`.
- Customer fields live in `customers` (column list in `api/lib.php` `$E`), plant fields in the `plant` JSON
  (`PLANT_KEYS`, `api/plant.php`); documents read `customer.*` and `plant.*` (KD.defaults in `assets/app24.js`), and the
  Agreement tab can fill empty profile fields (`kseb_fill`, `KSEB_FILL` in `api/kseb.php`) — keep these working with the
  same keys, or update both sides together.
- Permissions as today: editing needs customers write; `mask_customer()` masks the bank account for non-finance roles;
  Business Associates only see their own customers and never loan details (`ba_gate`, BA has no `loans` access).
- UI rules: Apple-like light theme, monochrome line icons, works on phones (≤820 px); CSS class prefixes collide easily —
  grep `app.css` / `app2.css` before choosing one.
- Tests: `node --test tests/<file>.test.js` per file and `bash tests/run_api.sh`; test data must be made up (no real
  customers' names, numbers or addresses).

## Which documents use which detail (today)

Used to decide what counts as "needed". From KD.defaults (`assets/app24.js`):

- **Page 1:** name — all 12; consumer no. — all 12; section — Cover, Request letter, WCR, Details of installation, Agreement,
  Checklist; sub division / division — Cover, Details of installation; tariff — Cover, Annexures 1–3, Details of installation,
  Agreement; phase — WCR, Cover, Details of installation, Agreement; connected load — Cover, Annexures 1–2, Details of
  installation, Agreement; address / district / PIN — almost all; panchayath, village & survey, transformer, premises — Agreement.
- **Page 2:** phone — Cover, Request letter, WCR, Annexures 1–3, Details of installation; alternate phone — Cover, Details
  of installation; email — Cover, Annexures 1–3, Details of installation; GPS — Agreement.
- **Page 3:** application no. — Cover, Feasibility report; application date — Cover; KSEB reg. no. — Cover, Annexure 3;
  SPIN — Agreement (optional); installed on — Cover (optional).
- **Page 4:** bank holder / name / branch / account / IFSC — Cover, Details of installation; Jan Samarth ID — Feasibility report.
- **Page 5:** capacity, panel make / type / model / wattage / count / efficiency / serials, inverter make / capacity / count /
  type / serials, DC voltage, meter make / serial / reading, meters provided by, cell invoice no. — Cover, WCR, Annexures,
  Details of installation, Agreement, Vendor–customer agreement.

## Calls I made (not discussed with the user)

- Overview keeps progress, location, quotations, notes and the timeline; the three detail cards it shows today (Basic,
  KSEB, Bank) are replaced by a short "Details by page" card with each page's missing count and a link to it.
- Lead type, GST no. and landmark go on page 2; the customer's roof type joins the Rooftop section of page 5.
- Aadhaar and PAN numbers are masked exactly like the bank account (last 4 digits for roles that do not see the full account).
- Loan details on page 4 are shown only to roles that can read `loans` (the Bank documentation permission); the passbook
  part follows the customers permission and the existing masking.
- Page 3's application no. and eligible subsidy are the **same data** as the project's Subsidy tab, not new boxes: the
  application no. is stored today both as `projects.application_no` and `plant.application_no` — page 3 shows one value
  (whichever is filled) and saving writes both, so neither place looks empty or disagrees. "Eligible subsidy" is the
  project's existing `subsidy_amount` and keeps today's finance rule (shown and editable only for finance roles).
- Page 4 permissions: the passbook part is edited with customers write (as the bank details are today); the loan part
  with `loans` write (the Bank documentation permission), so Accounts can fill loans and an Engineer only views them. The
  server checks both on save; Business Associates are refused on the server, not only hidden.
- Loan details are not counted as missing for a customer whose project says Loan taken = No.
- The "Edit" button in the profile header opens the page you are on (or page 1 from Overview) instead of the long form;
  the long customer form remains only as the short "New customer" form (name as on the KSEB bill, phone, lead type,
  consumer no., address, district).

## Left to the builder

- Where each new detail is stored (customer column or plant key), as long as documents and `kseb_fill` keep working and a
  page save never touches other fields.
- How "needed by" is worked out (a list kept beside the page definitions, or derived from the document definitions), and
  the exact field-to-pipeline-step mapping within the "when each paper is due" table.
- The look of the pages, the edit mechanics (inline vs. a panel), phone layout, and whether the KSEB/Bank documentation
  pages' "Still empty" note links straight to the right profile page.
- How details already recorded at pipeline stages (e.g. feasibility, PMSG portal registration, loan — stage ref/date) are
  shown on page 3/4 so staff do not type them twice.
