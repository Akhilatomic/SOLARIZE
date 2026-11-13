# Company accounts, stage 2: Supplier bills and dues — design

Date: 2026-11-13. Stage 2 of the route the owner approved (see 2026-11-13-cash-bank-book-design.md); started on the owner's "Start stage 2".

## Why
The owner buys on credit and in bulk. Accounts must say what is owed to each supplier, take part payments, and put those payments in the
cash and bank book.

## How it works
- **A supplier's account** = bills bought on credit − payments made. A balance above zero is owed; below zero is an advance.
- **Bills on credit come from two places:**
  1. Project cost sheets: purchased lines marked "Not paid yet", grouped per supplier + bill no. (no bill no.: per project + purchase day).
  2. Bills added directly (`acc_bills`): stock bought in bulk, tools, or an old balance from before the CRM. A direct bill is either on
     credit or paid at once from an account.
- **No double counting:** when a direct bill exists for a supplier + bill no., sheet lines with the same supplier + bill no. are only the
  split of that bill across projects; they are not added again to the dues or to the cash and bank book.
- **Payments** (`acc_sup_pay`): supplier, date, amount, the account it was paid from, reference, optionally the bill no. it is against.
  They reduce the supplier's balance (on account, oldest first in the reader's mind; no per-bill matching) and go out of the cash and bank book.
- Suppliers are matched by name, any case; a name typed on a sheet that is not in the supplier list still gets an account.
- A sheet line "Not paid yet" with no supplier named is listed under "Supplier not named" so it is not lost.

## Screen: Accounts › Supplier dues
Tiles (owed in all, suppliers with a balance, advances). Table per supplier: bills on credit, paid, balance, last payment, Pay, Ledger.
Ledger: every bill and payment with a running balance; payments and direct bills can be edited and deleted there; sheet bills open
their Project cost sheet. Buttons: Add bill, Record payment.

## My calls (owner not asked)
- Payments are on account for the supplier, not matched bill by bill.
- Lines paid at purchase ("Paid from <account>") stay out of the dues; they are already in the cash and bank book.
- Purchased lines with no payment recorded stay out until someone chooses "Paid from" or "Not paid yet" (the Cash & bank page lists them).

## Data (schema v54)
`acc_bills(id, supplier, bill_no, date, amount, gst_amt, note, pay_book, created_by)` — amount includes GST; pay_book 0 = on credit.
`acc_sup_pay(id, supplier, date, amount, book_id, ref, bill_no, note, created_by)`.

## API (module acc)
GET `ac_dues`, GET `ac_sup&name=`; POST `bill_save`, `bill_delete`, `spay_save`, `spay_delete`.

## Tests
`tests/dues_test.php`.
