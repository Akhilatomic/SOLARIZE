# Quotation maker — design

Date: 10 Nov 2026 · Solarize CRM (D:\SOLARIZE) · status: approved by the user (10 Nov 2026)

## Why

Today every customer quotation is a hand-edited copy of one of ~27 PDFs (2 / 3 / 5 kW × inverter × panel × structure, with or without an SBI loan page). Staff want to make the same branded quotation inside Solarize in a minute: pick a saved template, fill the customer, adjust what differs, download the PDF. Reusing templates is the main time saver; the admin keeps the product list and rates in one place.

## What the user decided

- **Each item category is a tab** in the maker (Customer, Solar panels, Inverter, … Structure, Installation, Price & loan). In every tab the user can pick a product, change it for this quote, or add another component.
- **Templates**: a quotation setup can be saved as a template, reused for the next customer, modified, and saved back (update) or saved as a new template.
- **Settings gear** in the maker opens **Products & rates**: add new products / choices per category, and set custom rates.
- **Package price is set by the user** (the gross amount, e.g. ₹1,70,000). It is not computed from the rates. Rates are only a guide shown next to the price.
- **Layout A**: editing on the left, live preview of the quotation pages on the right (on a phone the preview becomes its own tab).
- **PDF download** of the finished quotation.

## Goals

1. The downloaded PDF looks like the current quotations (same page structure, colours, pictures, logos, wording).
2. A new quotation from a template takes about a minute: choose template → choose customer/lead → check price → Download PDF.
3. Templates are shared by the team; products, pictures, logos, wording and rates are managed once in Products & rates.
4. Every quotation is saved in the CRM against its customer or lead and can be reopened, changed and downloaded again.

## Non-goals (this version)

- Item-wise prices or a GST breakdown on the quotation (the current quotations show only the package price; GST invoices are the Tax bill).
- Editing the page design itself from the app (colours, page order).
- Sending the PDF by WhatsApp/email from the maker (download, then attach). Can follow later.

## Anti-goals

- A PDF that looks noticeably different or less professional than today's.
- Staff accidentally changing master products or rates while making a quote.
- Losing old quotations: existing quotations in the CRM keep opening as they do now.

## The quotation document (what the PDF contains)

Taken from the 27 examples. Pages appear in this order:

1. **Cover** — company header (logo, GSTIN, office, email, mobile, website), title bar ("2 kW TSUN Microinverter Quotation" + "PM SURYA GHAR (PMSGY) · ON-GRID" pill), Customer details (name, address, consumer number, email, mobile, project), Quote details (number, date, valid till, sales/engineer, phone, email), "Your solar plant at a glance" (4 boxes: DC kWp + panel count × Wp, inverter size/type, panel performance warranty, subsidy), Price and payment (bank account details; gross amount incl. KSEB charges; subsidy; cost after subsidy), two signature lines, footer (website · "MNRE Empanelled · KSEB registered company · Class A Supervisor & Class B Contractor Works" · Page x of y).
2. **What is included in your plant** (one or two pages, as many as the items need) — table: #, item name + picture, "what it is" (one plain sentence + product details), brand logos (with BOX/MCB/SPD/FUSE labels where relevant), quantity (+ small note such as "2.4+ kWp", "red + black", "measured on site"). Footnotes: brands from approved makes; "As required" items measured on site; IEC/IS standards.
3. **Easy finance with the SBI Surya Ghar loan** — only when the loan option is on: margin / loan / subsidy boxes, EMI table (5, 7, 10 years; before and after the subsidy is credited), monthly saving, SBI loan terms, who can apply, how to apply (4 steps), helpline, source note.
4. **Delivery, payment & terms** — delivery & installation, subsidy box with the worked-out explanation, payment schedule (feasibility payment, 70 %, 30 %), warranty at a glance (from the chosen products), terms and conditions, KSEB charges (included) table.
5. **Product feature page(s)** — a full-page picture attached to a chosen product (today: the StormShield Pro-Mount 3.0 page for HDG structures).

## Calculations

- **DC capacity** = panel count × panel Wp (e.g. 4 × 600 = 2.4 kWp). Shown as "2.4+ kWp" when the panel is "600+ Wp".
- **Subsidy (PM Surya Ghar)** on DC kWp: ₹30,000 per kW for the first 2 kW, ₹18,000 per kW for the next 1 kW, capped at ₹78,000 (the CRM's existing subsidy setting). Explanation text is generated ("4 × 600 Wp = 2.4 kWp: ₹30,000 per kW for the first 2 kW, plus ₹18,000 per kW for the next 0.4 kW"). The amount can be overridden on a quote.
- **Cost after subsidy** = gross amount − subsidy.
- **Loan page**: margin 10 % of gross, loan 90 %, loan after subsidy = loan − subsidy; EMI = P·r·(1+r)^n / ((1+r)^n − 1) with r = annual rate / 12 (6.00 % default) for 60, 84, 120 months; monthly saving = DC kWp × 1,300 units × ₹7 ÷ 12. All four figures (rate, margin %, units per kWp, tariff) live in Quotation settings. (Verified: reproduces the examples — ₹2,958 / ₹1,659 / ₹2,235 / ₹1,253 / ₹1,699 / ₹953 / ₹1,820.)
- **KSEB charges table**: feasibility charge ₹1,000; registration fee **₹1,000 per kW of plant size** (2 kW → ₹2,000, 5 kW → ₹5,000), printed as "Registration fee (₹1,000 per kW, 80% refundable)" — decided by the user; stamp paper ₹300 → total. Defaults from Quotation settings, editable per quote. (The older 2–3 kW PDFs showed a flat ₹3,108; the user chose the per-kW rule.)
- **Payment schedule**: feasibility payment ₹1,180, then 70 % "before material readiness …", then 30 % "after installation" (texts and figures from settings, editable per quote).

## Screens

### Quotations menu
The existing Quotations list stays. "New quotation" opens the **maker**. Quotations made with the maker reopen in the maker; older quotations keep opening in today's simple editor.

### Maker (layout A)
- **Template bar**: template picker · *Save as new template* · *Update template* (only for its creator or an admin) · *Download PDF* · gear (Products & rates; admin only).
- **Tabs**: Customer · Solar panels · Inverter · Optimisers (only shown when chosen inverter needs them, e.g. SolarEdge) · ACDB box · DCDB box · DC cables · AC cables · Isolator switch · Energy meter · Other electrical parts · Earthing · Lightning arrester · Mounting structure · Installation · Price & loan.
- **Customer tab**: pick a customer or a lead (search); fills name, address, consumer number, email, mobile; project text ("2 kW On-grid PMSGY"); quote number (auto, editable), date, valid-for days, sales/engineer (signed-in user by default).
- **Item tabs**: product cards of that category (picture, name, details, warranty, and — for users who may see money — the rate). Click to choose. Quantity (+ the small quantity note). *Change wording for this quote* (edits the printed name/sentence/details only for this quotation). *Add another component* (adds a free line to the category, or another catalogue product). *Remove from this quote* (e.g. no optimisers).
- **Price & loan tab**: gross amount (package price, typed); subsidy (auto, override); "items add up to ₹X at your rates" guide (finance users only); loan page on/off; KSEB charges table; payment schedule; delivery days; terms (list, editable); title and pill text (auto from size + inverter, editable).
- **Preview** (right side): the real pages, updated as you type; page arrows.
- **Saving**: *Save* stores the quotation (status Draft/Sent/Accepted/Rejected as today). *Download PDF* saves first, then downloads "2kW TSUN Microinverter – SHEREEF KUTTY – JSS-PMSGY-2026-0142.pdf".

### Products & rates (gear) — admin only
- Left: categories (the item tabs above + KSEB charges). Right: the products of the category with picture, name as printed, details, brands, warranty, rate (₹ + unit), default star, edit / hide.
- Product fields: category; name as printed; plain sentence ("Make electricity from sunlight."); details paragraph; picture (upload); brand logos (one or more, each with an optional label such as BOX / MCB / SPD); default quantity + unit + quantity note; warranty years (and the warranty-box label, e.g. "TSUN microinverter"); rate (₹ per unit); panel Wp (panels only); inverter kW (inverters only); "needs optimisers" (inverters); attached full-page picture (optional, e.g. StormShield); hidden.
- **Quotation settings** tab: quote number format and next number (JSS/PMSGY/YYYY/NNNN, next 0144), valid-for days (5), bank account block, company header lines, footer line, delivery texts, payment schedule, KSEB charge defaults, loan figures and texts, terms list, subsidy rates (shared with the existing CRM setting).

### Templates
A template stores: name, the chosen product per category with quantity, wording changes, extra components, package price, loan on/off and price-tab texts. It does **not** store the customer. Templates are visible to everyone who can make quotations.

## Who can do what (builder's call, confirm with user)

- Make / save quotations, save new templates: users with Quotations *edit*.
- Update or delete a template: its creator or an admin.
- Products & rates and Quotation settings: admin only.
- Rates are shown only to users with the Finance permission (as everywhere else money is gated in the CRM).

## Starting content

Pre-loaded from the 27 example PDFs so day one looks exactly like today:
- Products: panels (Premier NeoBlack 600+ Wp TOPCon; ReNew 550+ Wp mono PERC; ReNew RPS2MH72BD 550 Wp dual-glass), inverters (TSUN TSOL-MS2000 / MS3000; TSUN-or-Deye option text; Deye micro; SolarEdge Home Wave SE3000H; SolarEdge 3-phase; Premier PEI 3 kW string), SolarEdge S-Series optimisers, ACDB, DCDB, DC cable, AC cable, isolator, energy meter (1-phase / 3-phase), other electrical parts, earthing, lightning arrester, structures (HDG; GI; GI spot-welded; Apollo GI 330 GSM), installation — with the exact wording from the PDFs.
- Pictures: item pictures cut from the PDF pages at high resolution; brand logos extracted from the PDFs; company logo; the StormShield page as a full-page picture attached to the HDG structure.
- Templates: one per example combination (12 + the 5 kW ones), each with its package price (e.g. "2 kW · TSUN · Premier · HDG" ₹1,70,000).
- Rates: left empty (₹0) for the admin to fill; they are only a guide.

## How it gets built (builder's calls)

- Part of the existing app (PHP + SQLite + plain JS, no build step), following its conventions (permissions via `need()`, uploads via `sec_upload`, deletes via the Recycle bin, schema bump, `?v=` bump).
- New tables: products (catalogue), quote templates; quotations keep using the `quotes` table with the full maker data stored as JSON alongside the existing columns (so the list, customer profile and statuses keep working).
- Pictures and logos are files in the app (pre-loaded ones in the repo; uploaded ones in the data folder, served only to signed-in users).
- The preview is HTML pages at A4 size. The PDF is made in the browser from those same pages (html2canvas + jsPDF, stored in the app because the page security rules allow no outside scripts), so the PDF matches the preview exactly. Trade-off: the PDF text is part of the page image (not selectable), file size about 1–3 MB like today's.
- The font of the current quotations (Poppins) is stored in the app.

## Left to the builder

Exact tab order on phones, empty states, how many items fit per page before moving to the next page, how hidden products appear in old templates, file naming of uploads.
