# KSEB documents — design

Date: 10 Nov 2026 · Solarize CRM (D:\SOLARIZE) · status: draft, waiting for the user's approval (reviewer check done)

## Why

For every plant, Jasper Solar hands a set of papers to the customer's KSEB section office (the DISCOM). Today each one is a Word/PDF file copied from the last customer and retyped by hand. The details are already in the CRM: the customer profile and the plant details. Staff want to open **KSEB documentation**, pick the customer, check the details and download a ready-to-print PDF. The printed copy is **signed and stamped by hand** and **taken to the KSEB section office**. Nothing is sent online and there is no digital signature.

## What the user decided

- The existing **KSEB documentation** page (menu "KSEB Docs", `#/kseb`) becomes a page with **tabs**. Each tab makes one PDF document.
- **Tab 1 = Work Completion Report**, laid out like the sample `D:\GDrive\jasper\raj kumar m\wc.pdf` (a signed and stamped scan), printed on the **new letterhead** `C:\Users\gotjo\Downloads\Jasper-Solar-Letterhead_2.pdf`.
- **Tab 2 = Annexure 1** (അനുബന്ധം 1, application to connect the solar plant to the grid). The template is `D:\GDrive\jasper\aneesh r a\kseb\doc\Form 1 …pdf` (the file name contains U+202F, so open it with a glob). **Keep the form as it is**, with the Malayalam text untouched, and **write the details in English in the right-hand column**.
- Details **fill in automatically from the customer profile**.
- Signature and stamp are added by hand, so the PDF leaves room for them and prints no signature image.

## Goals

1. Pick a customer, check the details, download the PDF: under a minute for one document.
2. The Annexure 1 PDF is KSEB's original form page (vector, the same file), with only English text added.
3. The Work Completion Report carries the same information as the sample, on the new letterhead, and prints well on A4.
4. Adding the next form of this kind (Annexure 2 and Annexure 3 sit in the same folder, with the same table layout) is mostly a new template file plus a field list, not new code.

## Non-goals (this version)

- Annexure 2, Annexure 3 and the other KSEB papers (agreement, joint inspection report, DCR declaration…). They come later as new tabs.
- Uploading the signed scan from this page. The existing KSEB checklist (project → KSEB documents) already takes uploads.
- Storing the generated PDF in the customer's files, and emailing or WhatsApping it.
- Digital signature or stamp images.
- Malayalam text entered by staff (all typed values are English).

## Anti-goals

- Any change to the KSEB form itself: redrawn tables, retyped or garbled Malayalam, shifted lines.
- A form that prints another customer's details, or outdated details after the profile was corrected.
- Losing what the KSEB page shows today (the per-project KSEB checklist overview).

## The page

`#/kseb` shows a tab bar: **Work completion report · Annexure 1 · Checklist**. The **Checklist** tab is today's `pgOverview('kseb')` table, unchanged.

Every document tab has the same layout as the quotation maker: **details on the left, a live A4 preview on the right**. On a phone the preview becomes a toggle or a second tab.

- **Customer picker** at the top: a search box over customers (name, phone, consumer no.). The chosen customer **stays chosen when switching tabs** and is kept in the URL (for example `#/kseb/<customerId>`, with the tab remembered in `TAB.kseb`). The customer profile can then link straight to it later.
- Below the picker, the **fields** of the document, grouped as on the paper. Each field is pre-filled. A field the user changed shows a small "edited" mark with a reset button that brings back the profile value.
- Fields that are empty in the profile are highlighted ("Still empty: consumer no., inverter serial"), like the manufacturer warranty form does today. Downloading is still allowed, because staff may want to write a value by hand.
- Buttons: **Download PDF**, **Save** (keeps the edits for this customer and document), and a link **Open customer profile** to fix data at the source.

### Saving rule (prevents outdated data)

Only the **fields the user changed** are saved, per customer and document. Every other field is read fresh from the profile and plant details each time. Correcting the profile therefore corrects the next print, unless someone overrode that field on purpose.

**The date is the one exception** *(my call)*. Before the first save, a document's date defaults to today. The first **Download PDF** (or Save) by someone with edit rights stores the date with the document. Later reprints use that stored date, so a lost copy prints the same date as the signed copy KSEB holds. A small "Today" button next to the date field sets it to today when a fresh copy is wanted. Download also stores any changed fields, so a reprint always matches the last PDF made.

## Document 1 — Work Completion Report

Printed on the letterhead PDF (A4, 595.9 × 841.9 pt). Measured on the letterhead: "Ref No." label at x 34, y 177–187 and "Date" label at x 408, y 177–187, each followed by a dotted line. The body area runs from about y 200 to the footer rule at y 751.

| On paper | Value (default) |
|---|---|
| Letterhead **Ref No.** line | blank (editable) |
| Letterhead **Date** line | today, as DD-MM-YYYY (editable) |
| Title | WORK COMPLETION REPORT |
| **VENDOR DATA** heading | |
| Name of the Vendor | M/S JASPER SOLAR SOLUTIONS |
| Address of the Vendor | Jasper Building Anad Bank Junction Nedumangad Thiruvananthapuram |
| Mail ID of the Vendor | info@jasper.solar |
| Contact No of the Vendor | 0960 552 5552 |
| **CUSTOMER DATA** heading | |
| Name of the Customer | customer name |
| Address of the Customer | address, district, pincode (as stored, wrapped) |
| Contact No of the Customer | phone |
| EB consumer number | consumer_no |
| Electrical Section | kseb_section |
| Installed Plant Capacity | plant capacity (else the project's kW) + " KW" |
| Phase | phase: "Single phase" → "Single", "Three phase" → "Three" |
| **SPECIFICATION** heading | |
| SPV Module: Make / Type / Each Module Watt | plant panel_make / panel_type / panel_wattage + " Wp" |
| Inverter: Make / Capacity / Serial No | plant inverter_make / capacity / the inverter serial numbers joined with ", ". Capacity: `inverter_capacity` is per inverter in kW, so one inverter prints "5 KW"; with `inverter_count` > 1 it prints count × size and the total, e.g. "2 × 5 KW (10 KW)", or "4 × 0.6 KW (2.4 KW)" for microinverters *(my call; editable on the tab like every field)* |
| Signature block (right) | "For JASPER SOLAR SOLUTIONS", Name: Er Akhil ST, Designation: PROPRIETOR, Phone: 0960 552 5552, with blank space above for the hand signature and stamp |

The vendor lines and the signatory (name, designation, phone) are **company defaults**. They are editable on the tab and a "Save as default" button stores them for everyone, in `settings` key `kseb_defaults`, the same way `mfr_defaults` works. The first defaults are the values above, taken from the sample.

Fonts follow the sample: Times for the body and a bold sans (Helvetica-Bold) for the title and the section headings. Long values wrap. The sample's content takes about 527 pt of height and the letterhead body leaves about 551 pt, so the layout is tight. The body starts at about 12 pt, and if the page would overflow, the text and spacing shrink a step at a time (minimum about 9 pt). It never runs into the footer, and the signature block always keeps about 60 pt of blank space for the hand signature and stamp.

## Document 2 — Annexure 1

The template is the KSEB form page itself (A4, 595.3 × 841.9 pt, vector, Malayalam set in the embedded FML-TTIndulekha font). Measured table lines (PDF points, origin top-left): columns x 43.4 | 85.9 | 369.5 | 553.8; row lines y 155.7 | 233.7 | 256.1 | 285.5 | 343.8 | 380.3 | 402 | 446. The English values go in the **right-hand column (x ≈ 370–554)** of each row, vertically centred in the cell with a small padding, wrapped and shrunk to fit. Row 1's value cell is about 184 × 78 pt and holds six labelled lines, so it will usually use a smaller size (about 8–9 pt).

| Row | Malayalam question (meaning) | Value (default) |
|---|---|---|
| 1 | Name, consumer no., category, phone, email, full address | Name / Consumer No / Category (tariff, e.g. LT-1A Domestic) / Phone / Email / Address, one label per line |
| 2 | Connected load / contract demand | sanctioned_load + " kW" |
| 3 | Capacity of the solar plant to be installed | capacity + " kWp" |
| 4 | Will the energy be used at other premises of the consumer (if so, their consumer no., address, section) | NO |
| 5 | Rooftop or ground mounted | ROOF-TOP |
| 6 | Plant installation intended to be completed in | 30 DAYS |
| Place / Date (left cell) | സ്ഥലം / തീയതി | Place = customer's district (editable); Date = today, DD-MM-YYYY (editable) |
| Consumer's signature (right cell) | ഉപഭോക്താവിന്റെ ഒപ്പ് | left blank |
| Acknowledgement slip (lower half) | filled by the KSEB office | left blank |

The user's copy of the form already has "ROOF-TOP" and "30 DAYS" typed into rows 5–6. In that file they are two **FreeText annotations** (Helvetica 10.5 pt), not part of the page content, and the page has no other annotations or form fields. The stored template is the same file with those two annotations deleted: a one-time step with PyMuPDF (`page.delete_annot`), not redaction, which would leave annotations in place. The CRM then prints rows 5–6 from the field values, with the same defaults, so a ground-mounted plant or a different period can be printed correctly. The cleaned template must be checked visually against the original: every other mark stays where it was.

## How it is made (builder's calls, stated plainly)

- **PDF engine:** vendor **pdf-lib 1.17.1** (MIT; `pdf-lib.min.js` ≈ 520 KB from npm, kept in `assets/vendor/` like html2canvas and jsPDF, and loaded only on this page). pdf-lib opens the template PDF and draws text on it, so both the letterhead and the KSEB form stay vector and exact. The built-in Times and Helvetica fonts cover English, so no font files are needed. Text is cleaned to the fonts' character set (WinAnsi) before drawing, because an unsupported character would make pdf-lib fail.
- **Templates** live in `assets/kseb/`: `letterhead.pdf`, `annexure-1.pdf` (cleaned), plus a PNG of each (about 150 dpi) for the preview. They are public files, which is fine: a blank letterhead and a blank KSEB form.
- **Preview** = the PNG with the text laid on top in HTML, positioned in PDF points and scaled to the preview width. Line breaks and font sizes come from **one layout function** using the PDF font metrics, the same one that writes the PDF, so the preview and the PDF break lines identically.
- **Document definitions** are data: a template file, page size, and a list of fields (key, label, how to get the default from the profile/plant, box position, font, size, alignment, wrap). A new form of the same kind (Annexure 2/3) means adding a definition, a cleaned template and its PNG.
- **Server:** a small new module `kseb` (`api/kseb.php`). It has one GET action that returns the customer (masked as usual), plant details, latest project, company settings, `kseb_defaults` and the saved overrides for that customer; one action to save overrides; and one to save defaults. Saved overrides go in the existing `gen_docs` table (`kind` = `kseb_wcr`, `kseb_an1`; number left empty), so **no schema change** is needed. Customer delete, restore and reset already include `gen_docs`. The read action is named `get`, which is already on the GET-allowed list in `api.php`. Saves and default changes are written to the audit log.
- **Permissions:** viewing the page and downloading need `checklist` read (as the menu item does today) plus `customers` read. Saving overrides and defaults needs `checklist` write.
- **Styling:** CSS class prefix `.kd`, checked against app.css/app2.css/quote.css for collisions first. Monochrome line icons, Apple-style light theme as elsewhere.
- **Files:** new page code in a new `assets/app24.js`, plus a script tag in `index.html` and the `?v=` bump on deploy.

## Testing

- Node tests for the pure parts: default values from a sample profile/plant (phase mapping, capacity fallback, serial joining, address joining), the saving rule (overrides only), WinAnsi clean-up, and the wrap-and-shrink layout.
- PHP API tests in `tests/` for kseb get/save/defaults, including permissions.
- Manual check: render both PDFs for Raj Kumar M's data and compare them with the sample and the original form, opened side by side as images. Every Malayalam line and table rule must match the original exactly, and the English text must sit inside its cells.

## Left to the builder

The exact positions and font sizes of each field (measured from the templates), the tab and picker styling, phone layout details, the exact empty-field wording, and file names (suggested: `Work Completion Report - <Customer>.pdf`, `Annexure 1 - <Customer>.pdf`).
