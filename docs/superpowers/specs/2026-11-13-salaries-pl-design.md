# Company accounts, stage 4: Salaries, Meta ad spend, Profit & loss — design

Date: 2026-11-13. Stage 4 of the approved route; started on the owner's "Start stage 4".

## Why
The books still miss what the staff are paid and the company's profit as a whole. Project profit is known per project; the owner needs
profit after salaries, ads and every other overhead, per month and per financial year.

## Salaries (Accounts › Salaries)
- A payment to a person (`acc_salary`): staff member (a CRM user, or a typed name for someone who is not), kind (Salary, Advance, Bonus,
  Other), date, amount, what it is for (free text: "Week ending 14 Nov", "Nov 2026"), the account it was paid from, reference, note.
- The page lists the period's payments and a total per person. Each payment goes out of the cash and bank book.
- An advance counts as salary cost when it is paid (no separate advance account).

## Meta ad spend in the book
- The CRM already knows the daily ad spend (ad_spend, from Meta). Setting `acc_ads` {book, gst}: "Meta ads are paid from <account>" and
  "add 18 % GST". Off until the owner chooses an account. When on, each month's spend goes out of that account as one entry dated the
  last day with spend in that month.

## Profit & loss (Accounts › Profit & loss)
One column for a month; twelve month columns and a total for a financial year.
- Sales: taxable value of the tax bills issued in the period (the Project profit rule: a billed project with no cost lines is left out
  and listed, so a missing cost sheet never reads as profit).
- Less project cost (materials and services before GST) and commission / incentive of those projects = Gross profit.
- Other income: interest received and other income (Cash & bank manual entries).
- Overheads: salaries, ads (Meta spend + the Ads expense category), every other expense category (before GST), bank charges, other payments.
- Net profit before income tax = gross profit + other income − overheads.
- Not in it (not profit or loss): owner's money in / out, loans, transfers, GST, stock bought but not yet used on a project.
- The Overview's profit tile now shows this net profit and opens this page.

## My calls (owner not asked)
- Salaries and overheads are counted by payment date (cash basis); project profit by the tax bill's month (as the Project profit tab).
- Meta's GST is an option, default on once an account is chosen.

## Data (schema v55)
`acc_salary(id, user_id, name, kind, date, amount, for_what, book_id, ref, note, created_by)`; setting `acc_ads`.

## API (module acc)
GET `ac_salary&period=`, `ac_sal&id=`, `ac_pl&period=`; POST `salary_save`, `salary_delete`, `ads_book_save`.

## Tests
`tests/pl_test.php`.
