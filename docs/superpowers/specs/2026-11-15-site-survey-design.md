# Site survey (2026-11-15)

**Why:** the first stage of a project had no place of its own: nobody was named to visit the site, and site photos, the confirmed products / structure and the panel arrangement plan were not collected in the CRM.

**Owner's request:** new menu "Site survey"; lead / customer action "Add to site survey" opening a popup to choose the designated surveyor (default admin); the survey collects site photos (roof top, inverter position, earth position), confirms products and structure type, and holds the site plan for the panel arrangement.

**Approaches for the site plan:** (1) upload a sketch / drawing (photo, image, PDF) plus a few summary fields — chosen by the owner; (2) on-screen drawing tool — much bigger, awkward on a phone. The owner's sample (a finished "Rooftop Solar Panel Layout" sheet) is the kind of file that gets attached; it is shown large on the page.

**Design**
- Module `survey` (View / Edit; admin, assistant manager, sales, engineer edit; accounts view; BA never). Sidebar entry after Leads; routes `#/survey`, `#/survey/<id>`.
- `surveys` (one per lead or customer: assigned_to, status To visit / In progress / Done, visit_date, note, data JSON) and `survey_files` (slot roof / inverter / earth / plan / other). Files live in data/uploads, deleted through the Recycle bin.
- Add: lead ⋯ menu and customer ⋯ menu → popup (surveyor, planned visit date, note). Adding again hands the same survey to the chosen person. Surveyor gets a bell message (notifs kind `survey`).
- Admin and assistant managers see every survey; others see those given to them or added by them.
- Page: 1 Site photos · 2 Products and structure (+ "confirmed with the customer", who / when) · 3 Site plan (drawing + panels, rows, direction, size, gap, facing, notes) · 4 Site details. For a lead, parts 2 and 4 are the lead's own Plant details / Site condition (leads.plant, leads.site), so conversion carries them on.
- Photos are shrunk in the browser (longest side 2000 px) before upload.
- "Save and mark survey done" warns about missing parts; a done survey is locked until reopened; the person who added it is told.
- Not built: drawing tool, link to the pipeline's "Site survey" stage, copying a customer's survey into Plant details.
- Tests: tests/survey_api_test.php. Schema v68.
