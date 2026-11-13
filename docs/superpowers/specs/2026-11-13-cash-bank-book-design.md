# Company accounts, stage 1: Cash & bank book — design

Date: 2026-11-13. Owner approved the route ("books worked out from what is already entered", five stages, this one first).

## Why
Accounts tracks project money (payments, project cost, office expenses, profit) but not where the money is. The owner wants Accounts to
be the company's books. Stage 1 answers: how much is in cash and in each bank account, and every rupee in and out with a running balance.

## Approaches
1. Books derived from the records already entered, plus the missing pieces — chosen (staff keep working as now; nothing typed twice).
2. Double-entry vouchers like Tally — refused: someone must post every voucher, duplicates the CA's work.
3. Export only — included later as stage 5, not enough by itself.

## What stage 1 adds
- **Accounts** (`acc_books`): Cash in hand and one or more bank accounts, each with an opening balance and date. Two are made on
  upgrade ("Cash in hand", "Bank account" = default); the owner renames them and sets opening balances.
- **The book** (Accounts › Cash & bank): every entry with date, particulars, reference, money in, money out, running balance; per account
  or all together; by month or financial year (the existing period bar); opening and closing balance.
- Entries come from:
  - payments received (payments) — in;
  - office expenses (acc_expenses, amount incl. GST) — out;
  - commission / incentive paid (commissions part 1 and 2) — out;
  - purchases and services marked Purchased / Paid on a Project cost sheet (qty × price + GST), one entry per project + supplier + bill +
    day + account — out;
  - manual entries (`acc_txn`): owner's money in / out, loan received / repaid, bank charges, interest, other income, other payment, and
    transfers between accounts.
- **Which account**: mode Cash → the cash account, anything else → the default bank account. Any payment / expense / commission entry can
  be moved to another account from the book (`acc_book_map`). A purchase carries its own "Paid from" (new on Mark purchased and on the
  purchased line): an account, or "Not paid yet".
- **Supplier dues (simple)**: purchased lines marked "Not paid yet" are totalled as owed; purchased lines with nothing recorded are
  listed as "payment not recorded" so the owner can complete them. Full supplier bills and part payments are stage 2.
- Overview gets a "Cash & bank" tile with the total balance.

## My calls (owner not asked)
- KSEB fee lines made by the fee sync count as paid from the default bank account.
- Meta ad spend is not in the book yet (no payment record exists for it) — stage 4 with salaries.
- Loan and Subsidy payments go to the default bank account.
- A purchase's payment date is its purchase date (stage 2 adds real payment dates per bill).
- Deleting an account is allowed only while nothing uses it; otherwise it can be hidden.

## Non-goals (later stages)
Supplier bills with part payments (2), GST working (3), salaries and company profit & loss (4), export (5), balance sheet (never: CA).

## Data (schema v53)
`acc_books(id, name, kind cash|bank, note, opening, opening_on, is_default, hidden, sort)`,
`acc_txn(id, date, book_id, dir in|out, amount, cat, to_book_id, party, ref, note, created_by)`,
`acc_book_map(kind, ref_id, book_id)` with kind pay | exp | comm1 | comm2,
`acc_costs.pay_book` (NULL = not recorded, 0 = not paid yet, else the account) and `acc_costs.pay_on`.

## API (module acc; reads need accounts, writes accounts write)
GET `ac_books` (accounts with balances, dues, unrecorded), GET `ac_book&book=&period=` (opening, rows, closing),
POST `book_save`, `book_delete`, `txn_save`, `txn_delete`, `book_move`.

## Tests
`tests/books_test.php` (API), `tests/acc.test.js` (running balance rule `ACC.bookRun`).
