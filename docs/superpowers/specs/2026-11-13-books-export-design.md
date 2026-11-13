# Company accounts, stage 5: Export for the accountant — design

Date: 2026-11-13. Last stage of the approved route; started on the owner's "Start stage 5".

## Why
The CA keeps the statutory books in their own software. The owner should hand over one file with everything the CRM knows for a month
or a financial year, instead of screenshots and re-typing.

## What
An **Export** button on the Accounts page (everyone who can open Accounts). It takes the period chosen on the period bar and downloads
one Excel workbook, `Books <company> <period>.xlsx`, with these sheets:
1. Summary — company, period, when it was made; sales, gross profit, overheads, net profit; GST collected, credit to claim, to check,
   net payable; each account's opening and closing balance; owed to suppliers today.
2. Profit & loss — the statement as on screen (months as columns for a financial year).
3. Cash & bank — every account's entries: account, date, particulars, details, reference, money in, money out, balance, with opening
   and closing rows per account.
4. Sales register and 5. Purchase register — as on the GST page (purchases with their credit mark and reason).
6. GST summary — collected and input credit by rate, and the net.
7. Payments received, 8. Expenses, 9. Salaries — the period's rows.
10. Supplier dues — each supplier's bills on credit, paid, balance (as of today).

Amounts are numbers (not text), dates are yyyy-mm-dd, so the CA can sort, filter and total.

## How
In the browser, with the Excel library already in the CRM (assets/vendor/xlsx-0.18.5.min.js, loaded only on Export). The data comes
from the existing read actions (ac_pl, ac_book per account, ac_gst, ac_received, ac_expenses, ac_salary, ac_dues, ac_books): no new
server code, nothing stored. The sheet contents are built by the pure `ACC.exportSheets(d)` (unit tested); app41.js fetches and writes.

## My calls (owner not asked)
- Excel (.xlsx), not a Tally import file: every CA can open it, and a Tally XML needs the CA's own ledger names.
- Supplier dues are as of today, not as of the period's last day (the dues page has no dates in the past).
