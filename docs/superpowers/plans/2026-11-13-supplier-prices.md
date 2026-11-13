# Suppliers and supplier prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The price list holds suppliers and each supplier's price and brand per item, shows them side by side, and the owner picks which one is the dealer price.

**Architecture:** Two new tables (`acc_suppliers`, `acc_offers`) and `acc_materials.offer_id` (the supplier price in use). The dealer price (`acc_materials.rate`) stays the single number every other screen reads; picking a supplier price copies it there. Pure comparison rules live in `ACC` (app32.js, Node-tested); the page code is a new file app36.js so app34.js does not grow.

**Tech Stack:** PHP 8.3 + SQLite (api/accounts.php, api/lib.php migrate), plain JS (no build), `node --test`, `bash tests/run_api.sh`.

**Spec:** `docs/superpowers/specs/2026-11-13-supplier-prices-design.md`

## Global Constraints

- The dealer price changes only when the owner picks a supplier price or types one. Never "lowest wins".
- A picked supplier price stays linked: updating it updates `rate`; typing a different dealer price (item form or Expense sheet) sets `offer_id` NULL.
- One price per item + supplier + brand (unique `(material_id, supplier_id, lower(brand))`); saving again replaces it.
- All prices are before GST, 0 < rate ≤ 1e9 (`acc_money`), rate 0 refused for a supplier price.
- Deletes go through `trash_put` first. POSTs need `need('accounts', true)`.
- `SCHEMA_VERSION` 51 → 52. Data load runs once behind settings flag `acc_sup_v1`.
- No bank details of suppliers in code. No real customer data in tests (made-up supplier names).
- CSS prefix `.acs` (check acc.css / app.css / app2.css that it is free; else `.acsp`). Monochrome line icons, no emoji.
- Never a `//` comment inside a one-line statement; use `/* */`.
- Bump `?v=` on index.html assets (pattern `assets/(app[0-9]*|quote|kseb|acc)\.(js|css)`) and add the `app36.js` script tag after app35.js.

## Review Focus

1. Supplier deleted while one of its prices is in use → the item keeps its dealer price, `offer_id` NULL, no error on the list.
2. Item deleted → its supplier prices go to the Recycle bin with it and come back on restore.
3. Same supplier + brand saved twice for an item (also brand in another case) → one row, updated, not a 500.
4. Item with supplier prices but none picked and dealer price 0 → list shows "Pick a price", Expense sheet still works at 0.
5. Data load on a live list where a seeded item was renamed or deleted → skipped quietly, the rest loads; running migrate twice adds nothing.

---

### Task 1: Comparison rules in ACC

**Files:** Modify `assets/app32.js`; Test `tests/acc.test.js`

**Interfaces — Produces:**
- `ACC.supTag(s)` → `s.tag` trimmed, else the first word of `s.name` (max 14 chars).
- `ACC.offerCmp(mat, sups)` → `{ offers: [{...o, sup, tag, low:bool, used:bool, diff}], low, used, save, n }` where offers are sorted by rate then supplier name; `low` = the cheapest offer (first of ties); `used` = offer with `id === mat.offer_id` or null; `diff` = `r2(o.rate - low.rate)`; `save` = `r2(mat.rate - low.rate)` when `mat.rate > 0` and that is > 0.005, else 0; offers of unknown suppliers are dropped.
- `ACC.offerFilter(mat, f)` → true when `f` is `''`; `'cheaper'` → `offerCmp(mat).save > 0`; `'none'` → no offers; a supplier id → some offer has it.

- [ ] Tests: two suppliers 1530 / 1593 with `offer_id` on 1593 → `low.rate 1530`, `used.rate 1593`, `save 63`, diffs `[0, 63]`; ties → first by supplier name is low and `save 0`; no offers → `{offers: [], low: null, used: null, save: 0, n: 0}`; `mat.rate 0` → `save 0`; `supTag({name:'GIG Automation'}) === 'GIG'`, `supTag({name:'X', tag:' NZ '}) === 'NZ'`; filter cases.
- [ ] Run `node --test tests/acc.test.js` → fails; implement; passes. Commit.

### Task 2: Tables, API, links

**Files:** Modify `api/lib.php` (migrate, version), `api/accounts.php`; Create `tests/acc_sup_test.php`; Modify `tests/run_api.sh`

**Interfaces — Produces:**
- Tables exactly as in the spec; index `acco_mat ON acc_offers(material_id)`, `acco_sup ON acc_offers(supplier_id)`.
- `acc_materials_list()` rows gain `offer_id` (int|null) and `offers` (list of `{id, supplier_id, brand, rate, ref, on_date, note}`); GET `ac_materials` gains `suppliers` (list of `{id, name, tag, contact, phone, email, gstin, address, note, n}` with `n` = number of prices, ordered by name).
- POST `supplier_save {id?, name, tag, contact, phone, email, gstin, address, note}` → `{ok, id, suppliers}`; name required ≤ 120, unique any case (409 `quiet`), GSTIN blank or 15 letters/digits (upper-cased), tag ≤ 14.
- POST `supplier_delete {id}` → trash_put('Supplier', name, supplier row + its offers); `offer_id` NULL on items that used one of them; `{ok, suppliers}`.
- POST `offer_save {id?, material_id, supplier_id, brand, rate, ref, on_date, note, pick?}` → upsert on (material, supplier, lower(brand)); `on_date` blank or Y-m-d; when the saved offer is the item's `offer_id` or `pick` is set: `rate` and `offer_id` on the item; `{ok, id, item}` (item = the row as on the list, with offers).
- POST `offer_delete {id}` → trash_put('Supplier price', "supplier · item"); item's `offer_id` NULL when it was the one in use (rate kept); `{ok, item}`.
- POST `offer_pick {material_id, offer_id}` → `offer_id` > 0: rate = offer's rate and link; 0: unlink only; `{ok, item}`.
- `material_save`: when the item has `offer_id` and the saved rate differs from that offer's rate by > 0.005 → `offer_id` NULL. `cost_save` line 493 (typed price back to the list): also `offer_id=NULL`. `material_delete`: offers into the same trash_put spec, then deleted.

- [ ] Write `tests/acc_sup_test.php` (same harness as `tests/acc_groups_test.php`; made-up suppliers "Sp Alpha Traders", "Sp Beta Electricals") covering: add 2 suppliers; duplicate name any case → 409; bad GSTIN refused; two offers on one item; duplicate offer (brand other case) updates in place; list returns offers + suppliers with `n`; pick → rate follows and `offer_id` set; update picked offer → rate follows; update unpicked offer → rate unchanged; material_save with another rate → `offer_id` null; pick 0 → unlink, rate kept; rate 0 offer refused; sales role (no accounts write) refused on every POST; delete offer in use → rate kept, link gone; delete supplier → its offers gone, item unlinked, Recycle bin has it; delete item → offers gone; Review Focus 1-4.
- [ ] Add it to `tests/run_api.sh`; run → fails; implement; `bash tests/run_api.sh` all pass. Commit.

### Task 3: Data load from the papers

**Files:** Modify `api/acc_seed.php`, `api/lib.php`; Create `tests/acc_sup_load_test.php` (no server, in-memory SQLite like `tests/acc_prices_test.php`); Modify `tests/run_api.sh`

**Interfaces — Produces:** `acc_sup_v1_data()` → `['suppliers' => [key => [name, tag, phone, email, gstin, address]], 'items' => [[grp, name, unit, gst, new(bool), offers => [[supKey, brand, rate, ref, date, note]]]]]`; `acc_sup_v1($db)` once behind flag `acc_sup_v1`, called in migrate right after `acc_prices_v1($db)`.

Rules: existing item (new = false) found by `lower(trim(name))` in any category, else skipped; new item inserted (rate 0) unless a same-named item exists, then that one is used. After its offers are in: item rate > 0 and an offer of the same rate (±0.005) → link the one from NetZero first; item rate 0 and exactly one offer → rate = it, linked; otherwise untouched. Offer note = the description as printed on the supplier's paper. The data table is in the plan's appendix (below).

- [ ] Test: fresh seed + v51 + load → 2 suppliers; "Copper conductor earthing, 10 SWG" rate 1593, 2 offers, linked to the 1593 one; "Single phase energy meter" exists, rate 0, 2 offers, no link; "INVT XG 3KTL-S grid-tie inverter, 3 kW (with Wi-Fi stick)" rate 16200 linked; a renamed seeded item gets no offers; second run changes nothing; every `new = false` name is in `acc_seed_list()`.
- [ ] Run → fails; implement; passes; full suite passes. Commit.

### Task 4: Price list page

**Files:** Create `assets/app36.js`; Modify `assets/app34.js` (acMaterials: bar, column, filter, click), `assets/acc.css`, `index.html`

**Interfaces — Consumes:** Task 1 `ACC.*`, Task 2 API. `acMats(true)` must also keep `ACS.sups = r.suppliers`.
**Produces:** `acSupManage(reload)` (Suppliers window: list with tag, phone, GSTIN, number of prices; add / edit / delete), `acSupForm(s, done)`, `acOffers(mat, reload)` (Supplier prices window for one item: comparison table — Supplier, Brand, Price, vs lowest, Date, Bill no., Use this price / "In use", edit, delete — and an add form: supplier select with "+ New supplier", brand, price, date (today), bill no., note, "Use as the dealer price" tick), `acSupCell(mat)` (the tags for the list column), `acSupList()` (datalist `acx_sups` of supplier names for the Expense sheet's supplier inputs and the Mark purchased window).

List column "Suppliers" after Unit: up to 3 tags `TAG ₹price` (lowest gets class `acs-low`, the one in use `acs-use` with a tick icon), "+N" when more, then a muted line "₹63 less at GIG" when `save > 0`, "Pick a price" when offers exist, dealer price 0 and none in use; a writer with no offers sees a faint "Add price". Whole cell is a button opening `acOffers`. Filter select before the count: All suppliers / each supplier / Cheaper elsewhere / No supplier price. Search also matches supplier names and brands. Readers (no accounts write) see everything, no buttons.

- [ ] Implement; `node --check` both JS files; bump `?v=`.
- [ ] Browser check on a local copy (php -S on a `*.localhost` host, scratch data): add supplier, add two prices, pick, see the saving line, filter "Cheaper elsewhere", delete supplier; 390 px width has no sideways page scroll. Commit.

### Task 5: Finish

- [ ] `bash tests/run_api.sh` and `node --test tests/*.test.js` all pass; `php -l` on changed PHP.
- [ ] Update the price list help note (`acx-note`) with one sentence on supplier prices. Commit. Push only on the owner's "Push live".

## Appendix: data to load

Suppliers — `gig`: GIG Automation, tag GIG, Chittazha, near Vattappara, Trivandrum, GSTIN 32AEVPJ2210A1Z6. `nz`: NetZero ITA, tag NetZero, phone 8590412347, mail@netzeroita.com, Mudippura Road, near Mudippura Temple, Jagathy, Thiruvananthapuram 695014, GSTIN 32AYBPK5504G2ZW.

Papers — NQ = NetZero quotation SAL-QTN-2026-00049 (2026-10-30); N375 / N376 = NetZero invoices NZ/26-27/375, 376 (2026-11-11); G1768 = GIG invoice GIGBBTV/26-1768 (2026-10-14); G2086 = GIGPI-2086 (2026-10-17); G2422 = GIGPI-2422 (2026-11-02); G2262 = GIGBBTV/26-2262 (2026-11-07).

Existing items (supplier · brand · price · paper):
- 45*45 channel slotted grey: nz · – · 115 · NQ
- Microtek – MC4 PV connector pair: nz · Microtek · 31 · N376
- 4-6 sq mm CU palm lug: nz · – · 15 · NQ
- Excel Earthings – SS lightning arrester … single spike: nz · – · 1180 · N376
- Excel Earthings – ISI … earth rod 14 mm x 1.2 m: nz · Excel · 307 · N376; gig · – · 203 · G2086
- Excel Earthings – Earth pit chamber 18 x 18 cm PVC: nz · Estera · 278 · N376; nz · – · 170 · NQ; gig · – · 175 · G1768
- Excel Earthings – Earthing compound 10 kg bag: gig · Excel · 220 · G1768
- Copper conductor earthing, 10 SWG: nz · – · 1593 · N376; gig · – · 1530 · G2086
- Excel Earthings – SS terminal strip, 4 pole: gig · Excel · 170 · G2086; nz · – · 106 · N376
- 50 sq mm AL cable MC, yellow with green: nz · – · 75 · NQ; gig · Giga · 61.50 · G1768
- Earthing 16 sq mm aluminium multi iconic: gig · Iconic · 22 · G2422; nz · – · 30 · NQ
- AL 50 sq mm lug: gig · – · 13 · G2422; nz · – · 16 · NQ
- Ring lug AL 16 sq mm: nz · – · 8 · NQ
- Aizer – 20 mm PVC conduit elbow / slip bend / tee / coupler: nz · Anchor · 6.60 / 7.70 / 9.90 / 5.44 · NQ
- 20 mm SS saddle 3, Fisher PVC 6 mm 0.59, Screw SS star 6*32 1.59, 8 mm plastic sleeve 10, Insulation tape black 9 (N376), red 9: nz · – · NQ
- Estera – Nylon cable tie (300*4.8) black: nz · Estera · 237 · NQ
- Havells – 40/4P isolator (40 A, 4 pole): gig · Havells · 530 · G2422
- Excel Earthings – 3 phase powder coated meter box …: gig · – · 1065 · G2422
- KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, red: gig · Polycab · 87.80 · G2422; … black: gig · V-Guard · 85.06 · G2422

New items (category · name · unit · GST): offers
- Inverter & optimizers · INVT XG 3KTL-S grid-tie inverter, 3 kW (with Wi-Fi stick) · Nos · 5: nz · INVT · 16200 · NQ
- Solar panels · ReNew DCR bifacial PV module, 550 Wp (RPS2MH72BD550) · Nos · 5: nz · ReNew · 12100 · N375
- Metering & isolation · Single phase energy meter · Nos · 18: nz · L&T · 1689 · N376; gig · Visiontek · 1202.54 · G2086
- Metering & isolation · Single phase net meter · Nos · 18: gig · Visiontek · 2734.74 · G2262
- Metering & isolation · 40 A DP isolator (2 pole) · Nos · 18: nz · V-Guard · 224 · N376; nz · Luker · 301.86 · NQ; gig · V-Guard · 208.83 · G1768
- Metering & isolation · Single phase meter box · Nos · 18: nz · Estera · 679 · N376; gig · – · 510 · G2086
- Distribution boards · ACDB 1-5 kW, single phase · Nos · 18: nz · L&T / Schutz · 1499 · N376; gig · Havells Premium CH · 1500 · G2086
- Distribution boards · DCDB 1-5 kW, 1 in 1 out · Nos · 18: nz · L&T / Schutz · 1749 · N376; gig · Havells Premium CH · 1650 · G2086
- Distribution boards · ACDB 5-12 kW, three phase · Nos · 18: gig · Havells Premium · 3500 · G2422
- Distribution boards · DCDB 4-8 kW, 2 in 2 out · Nos · 18: gig · Havells / V-Guard Premium · 3400 · G2422
- DC cables & connectors · DC 4 sq mm cable, black · m · 18: nz · KEI · 57 · NQ
- AC cables & lugs · AC cable 4 sq mm copper, black · m · 18: nz · Anchor · 61 · NQ; same, red: nz · Anchor · 61 · NQ
- Earthing & lightning protection · SS lightning arrester, multi spike · Nos · 18: gig · Excel · 1100 · G1768
- Earthing & lightning protection · Copper bonded earth rod 13.5 mm x 3 ft · Nos · 18: nz · – · 251.80 · NQ
- Earthing & lightning protection · Earth pit chamber, square · Nos · 18: gig · – · 200 · G2086
- Earthing & lightning protection · Earthing compound 8 kg · Nos · 18: nz · Estera · 205.85 · N376; gig · – · 109 · G2086
- Earthing & lightning protection · 50 sq mm T holder · Nos · 18: gig · – · 6.35 · G2422
- Cable accessories & consumables · Nylon cable tie (400*4.8) white · Nos · 18: nz · Estera · 260 · N376
- Cable accessories & consumables · Cable tie 4.8*350 mm white · Nos · 18: gig · – · 181 · G2422
