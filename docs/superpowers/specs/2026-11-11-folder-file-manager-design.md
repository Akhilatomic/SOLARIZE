# Folder page as a file manager — design

Date: 2026-11-11 · Status: approved in chat ("YES PROCEED")

## Why

Staff keep product papers — datasheets, BIS certificates, test reports — and download them to hand in with the KSEB
documents. Today's Folder page is one flat list of files tagged with a category, brand and model, with availability
switches; there is no way to arrange papers by product line (e.g. *Solar panels → ReNew → 550 Wp*), to replace a paper
when the manufacturer issues a new version, or to download a set of papers at once.

## What we're building (user's words: "create a file manager inside this page")

- **Folders inside folders**: create, rename, move and delete folders, e.g. *Solar panels → ReNew → 550 Wp*.
- **Upload** into the open folder by dragging files onto the page or with an Upload button (several files at once).
- **Download** a single file, or several ticked files and/or folders at once (one ZIP, keeping the folder structure).
- **Rename, move, delete** files; deletes go to the Recycle bin (restorable for 72 h), as everywhere else in the CRM.
- **New version**: uploading a file with the same name into the same folder replaces the old file; the old one goes to
  the Recycle bin.
- **Remove from the page** (user's words: "remove all files from the page"): the flat list of cards, the category tabs and
  the availability switches/badges go.

## Calls I made (not discussed)

- Files already uploaded are **not deleted**: a one-time migration puts them in a top-level folder **"Old uploads"**, in a
  sub-folder per old category, for staff to file or delete themselves.
- Files may also sit at the top level (outside any folder), like a computer's file manager.
- Share links (`api.php?m=share&t=…`) and the WhatsApp "share" from this page keep working; a replaced file gets a new
  link (like a deleted one, the old link stops working). The WhatsApp inbox's "send a datasheet" picker lists the files
  with their folder path; its caption no longer says "(currently unavailable)".
- Folder URL `#/folder/<folderId>` so the browser's Back button goes to the previous folder.
- Same permission as today: module `folder` read to browse/download/share, write to create/upload/rename/move/delete.
- Limits as today: PDF, images, Word, Excel; up to 25 MB per file. A ZIP download is refused above 500 MB in total.

## Non-goals

Versions history beyond the Recycle bin; linking papers automatically to a customer's panel/inverter model on the KSEB
documentation page (possible follow-up); folders per customer (customer documents stay on the profile's Documents tab).
