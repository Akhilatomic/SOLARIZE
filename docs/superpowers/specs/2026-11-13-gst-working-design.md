# Company accounts, stage 3: GST working — design

Date: 2026-11-13. Stage 3 of the approved route; started on the owner's "Start stage 3".

## Why
The owner (and the CA) need, per month, the GST collected on tax bills, the input tax credit on purchases and expenses, and the net
payable — without re-typing bills into another tool.

## What it shows (Accounts › GST, by month or financial year)
- **GST collected** — every tax bill issued in the period: taxable value and tax, split by rate (Part A 5 % / Part B 18 % from the bill's
  own 70:30 split, or its item lines), CGST + SGST for Kerala, IGST when the bill is marked interstate. B2B (customer GSTIN) is marked.
- **Input credit** — GST on:
  1. purchased lines of Project cost sheets (by bill date, else purchase date), one row per supplier + bill;
  2. supplier bills added directly (Supplier dues), using the GST typed on the bill; a direct bill replaces sheet lines of the same
     supplier + bill no., as in stage 2;
  3. office expenses that carry GST.
- Each input row is marked: **Claim** (supplier in the list with a GSTIN), **Check** (no GSTIN on record: an expense, an unnamed or
  unlisted supplier, a supplier without GSTIN), **No credit** (KSEB fee lines: the bill is in the customer's name).
- **Net payable** = GST collected − credit marked Claim. Also shown: what it would be if the Check rows are valid too.
- Two registers under the summary: sales (bill no., date, customer, GSTIN, taxable, tax, total) and purchases (date, supplier, GSTIN,
  bill no., taxable, tax, total, mark and why).

## My calls (owner not asked)
- Purchases are treated as bought within Kerala (CGST + SGST); the CRM does not know a supplier's state.
- It is a working for the owner and the CA, not the return: credit also depends on the supplier filing (GSTR-2B); credit notes, advances
  and reverse charge are not handled.
- Nothing is stored: the working is computed from the bills each time, so a corrected bill corrects the working.

## API
GET `acc/ac_gst&period=` (accounts read). No new tables, no schema change.

## Tests
`tests/gst_test.php`.
