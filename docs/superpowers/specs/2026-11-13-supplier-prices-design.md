# Suppliers and supplier prices on the price list — design

Date: 2026-11-13. Approved in conversation (owner picked "Only the one I pick").

## Why
The owner buys the same materials from more than one supplier (NetZero ITA, GIG Automation). Prices and brands differ, so the price list
should show each supplier's price for an item side by side, so whoever buys can choose the cheaper one.

## Goals
- A supplier list (name, short tag, contact person, phone, email, GSTIN, address, note), added and edited on the Price list page.
- Every price list item can hold several supplier prices: supplier, brand, price before GST, date, bill / quotation no., note.
- The Price list shows, per item, each supplier as a tag with its price; the lowest is marked; the saving against the price in use is shown.
- Filter the list by supplier, and to "Cheaper elsewhere" (items whose price in use is not the lowest).
- The papers received so far (NetZero quotation + 2 invoices, GIG 3 proformas + 2 invoices) are loaded once: 2 suppliers, new items, prices.

## Rules
- The item's dealer price (used by Expense sheets and the customer price) changes only when the owner picks a supplier price ("Use this
  price") or types a dealer price. A cheaper price from another supplier never changes it by itself.
- A picked supplier price stays linked: when that same supplier price is updated, the dealer price follows it.
- Typing a different dealer price (item form, or on an Expense sheet) removes the link.
- Different products stay separate items (8 kg vs 10 kg compound, 3 ft vs 4 ft rod, single vs multi spike). Same product, other brand =
  another supplier price on the same item, with the brand on it.
- One price per item + supplier + brand; saving it again replaces it (the date shows how old it is). No price history.

## Non-goals
Purchase orders, supplier ledgers / payments, bank details in code, price history, automatic "lowest wins".

## Approaches considered
1. Supplier + brand as extra columns on the item (one supplier per item) — cannot compare, items would be duplicated per supplier.
2. Separate tables: suppliers, and supplier prices per item, with the item pointing at the price in use — chosen: comparison is direct
   and the dealer price keeps working everywhere unchanged.
3. Dealer price = lowest supplier price automatically — refused by the owner (a cheaper offer may be a poorer product).

## Data (schema v52)
- `acc_suppliers(id, name, tag, contact, phone, email, gstin, address, note, created, updated)`, unique lower(name).
- `acc_offers(id, material_id, supplier_id, brand, rate, ref, on_date, note, created, updated)`, unique (material_id, supplier_id, lower(brand)).
- `acc_materials.offer_id` — the supplier price in use (NULL = dealer price typed by hand).

## API (module `acc`, accounts permission; writes need accounts write)
- GET `ac_materials` also returns `suppliers` and, per row, `offers` and `offer_id`.
- POST `supplier_save`, `supplier_delete` (Recycle bin, with its prices), `offer_save` ({pick:1} also uses it), `offer_delete`,
  `offer_pick` {material_id, offer_id} (0 = stop following).

## Screen
Price list: "Suppliers" button, supplier filter, a "Suppliers" column of tags (`GIG ₹1,530` lowest marked, the one in use ticked,
"₹63 less at GIG" when the price in use is not the lowest). Clicking the cell opens "Supplier prices" for the item: the comparison
table (supplier, brand, price, difference, date, bill), Use this price, edit, delete, add. Supplier names are offered in the Expense
sheet's supplier boxes.

## Data load (once, flag `acc_sup_v1`)
Seeded items are matched by name (renamed / deleted ones are skipped). Items already priced from NetZero get that price linked as the
one in use. New items with one supplier price use it; new items with several are left for the owner to pick.
