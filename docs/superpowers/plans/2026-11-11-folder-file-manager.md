# Folder File Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Folder page into a file manager — nested folders, drag-and-drop upload, single/multi download (ZIP), rename / move / delete, same-name upload replaces the old version.

**Architecture:** A new `ds_folders` table and a `folder_id` on the existing `datasheets` table (files keep their storage, share tokens and WhatsApp sending). `api/folder.php` gets folder and bulk actions plus a streamed ZIP download. `assets/app4.js` `pgFolder` is rewritten as a file-manager view (`#/folder/<id>`).

**Tech Stack:** PHP 8.3 + SQLite (PDO), vanilla JS, PHP API tests over `php -S` (`tests/run_api.sh`).

**Spec:** `docs/superpowers/specs/2026-11-11-folder-file-manager-design.md`

## Global Constraints

- `SCHEMA_VERSION` 41 in `api/lib.php`; every POST needs header `X-Solarize: 1`; GET actions used here (`list`, `get`, `zip`) are already in api.php's GET whitelist.
- Uploads only through `sec_upload($fl, ['image','pdf','office'], 25)`; deletes only after `trash_put(...)` (Recycle bin).
- Every value in HTML through `esc()`; never `//` mid-line in one-line statements (use `/* */`).
- New CSS only with the `.fm` prefix (checked free in app.css/app2.css) in `assets/app2.css`; Apple-like light theme, monochrome `i-*` icons (defined: alert award bank bell calendar card chat check chev clip clipboard clock coin copy dashboard dots download eye file folder gauge gear leave link lock mail megaphone menu note pencil phone pin plus project receipt refresh search shield sun target trash undo upload user userplus users whatsapp x); works at ≤820 px.
- Test data made up. Commit with `git -c user.name="Jasper Solar" -c user.email=gotjobinmilkwater@gmail.com commit …`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Bump the `?v=` stamps in index.html after JS/CSS changes: `sed -i -E "s#(assets/(app[0-9]*|quote|kseb)\.(js|css))\?v=[0-9]+#\1?v=$(date +%s)#g" index.html`.

## Review Focus

1. Moving a folder into itself or any of its sub-folders must be refused (else folders vanish from the tree).
2. Deleting a folder must put the whole sub-tree (folders and files) in one Recycle bin entry whose restore brings back every row and file.
3. Two files that would get the same name in one folder (upload, rename, move) — replace on upload only; rename/move refuse with 409.
4. ZIP of folders with nested sub-folders and duplicate names keeps every file (paths `A/B/name.pdf`, duplicates `name (2).pdf`) and its bytes match.
5. Old datasheets (folder_id NULL before v41) land in "Old uploads/<category>" exactly once, even if the migration runs again.

---

### Task 1: Server — folders, bulk actions, ZIP, migration

**Files:** Modify `api/folder.php`, `api/lib.php` (schema v41, migrate), `api/wa.php` (send_datasheet caption), `api/trash.php` only if restore needs `ds_folders` registered; Create `tests/folder_api_test.php`; Modify `tests/run_api.sh`.

**Interfaces (produces):**
- Table `ds_folders(id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, name TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, user TEXT)` + index on parent_id; column `datasheets.folder_id INTEGER` + index. NULL = top level.
- Migration (in v41 migrate, idempotent): if any `datasheets.folder_id IS NULL` rows exist and no top-level folder named "Old uploads" exists, create it; for each distinct non-empty `category` of those rows create/reuse a sub-folder named after the category; set `folder_id` (rows with an empty category go directly into "Old uploads"). Rows already in a folder are never touched.
- `GET folder/list` → `{folders:[{id,parent_id,name,created,user}], items:[{id,folder_id,title,file_name,size,token,created,updated,user,brand,model,notes}]}` (folders by name, items by title, case-insensitive).
- `GET folder/get?id=&dl=` unchanged.
- `POST folder/folder_new {parent_id|null, name}` → `{id}`; `POST folder/folder_rename {id, name}` → `{ok}`. Name: trimmed, 1–80 characters, no `/` or `\` (400 "Folder names cannot contain / or \"); unique among its siblings case-insensitively (409 "A folder with this name is already here").
- `POST folder/upload` multipart `file`, `folder_id` (empty/0 = top level; unknown folder 404) → `{id, replaced:bool}`. Same `file_name` (case-insensitive) already in that folder → the old row goes to the Recycle bin (`trash_put('Datasheet', '<file_name> (replaced by a new version)', [['datasheets','id=?',[$old]]])`, then the row is deleted) and the new row is inserted. Title = file name without extension.
- `POST folder/rename {id, name}` (file) → new `file_name` = name (extension kept/added from the old file), `title` = name without extension; clash in the folder → 409 "A file with this name is already here".
- `POST folder/move {files:[ids], folders:[ids], to: folder_id|null}` → `{ok}`; a folder into itself or its sub-tree → 400 "A folder cannot go inside itself"; any name clash in the target (file names or folder names) → 409 listing the names; nothing moves when refused.
- `POST folder/delete {files:[ids], folders:[ids]}` → `{ok}`; each file `trash_put('Datasheet', title, [['datasheets','id=?',[id]]])` then delete; each folder: one `trash_put('Folder', '<folder path>', [['ds_folders','id IN (…sub-tree…)',[]],['datasheets','folder_id IN (…sub-tree…)',[]]])` then delete those rows. Recycle-bin restore must bring back the folders and files (check `api/trash.php` restore handles any table in the snapshot; register `ds_folders` wherever tables are listed).
- `GET folder/zip?files=1,2&folders=3` → streamed ZIP (stored, no compression; write each local header after `hash_file('crc32b')`/`filesize`, then `readfile`, so memory stays small — reuse the header layout of `docs_zip` in `api/plant.php`). Paths: a selected folder's files under `<folder name>/<sub-path>/<file_name>`; selected loose files at the ZIP root; a repeated path gets ` (2)`, ` (3)` before the extension. File name of the download: `<single selected folder name>.zip` or `Files <yyyy-mm-dd>.zip`. Total over 500 MB → 413 "Too much to download at once — select fewer files". Nothing selected / nothing found → 404.
- Removed actions: `save`, `toggle` (category/availability editing). `upload` no longer takes a category.
- `api/wa.php` `send_datasheet`: caption = title only (drop the "(currently unavailable)" suffix).
- Permissions: read actions need `folder`; every mutating action needs `folder` write (`need('folder', true)`); audit each mutation (`audit('create'|'update'|'move'|'delete'|'upload', 'datasheet'|'ds_folder', id, name)`).

- [ ] **Step 1: Write failing tests** `tests/folder_api_test.php` (copy helpers from `tests/kseb_api_test.php`; users admin + a `sales` user (folder write) + an `engineer` user; check ROLE_DEFAULTS for one role with folder read but not write, or create a custom role only if none exists — otherwise test write refusal with a BA, who has no folder access at all → 403):
  - create `Solar panels` → `ReNew` → `550 Wp`; duplicate `ReNew` under `Solar panels` → 409; name with `/` → 400.
  - upload `datasheet.pdf` (a tiny made-up PDF) into `550 Wp` → listed with folder_id; upload another `datasheet.pdf` there → `replaced:true`, list has one `datasheet.pdf` with the new size, a Recycle bin entry exists.
  - rename the file to `ReNew 550 datasheet` → file_name `ReNew 550 datasheet.pdf`; rename onto an existing name → 409.
  - move `ReNew` into `550 Wp` → 400; move a file to the top level → folder_id null; move with a clash → 409 and nothing moved.
  - ZIP of folder `Solar panels` plus a loose file: central-directory names include `Solar panels/ReNew/550 Wp/ReNew 550 datasheet.pdf` and the loose file at the root; extract one entry and compare bytes with `folder/get`.
  - delete folder `Solar panels` → its sub-folders and files gone from `list`; one Recycle bin entry; restore it (`trash/restore`, see api/trash.php) → all back.
  - migration: insert a `datasheets` row with `folder_id NULL`, category `Solar Panel` via PDO on the DB path, set `PRAGMA user_version=40`, call `list` → row is in `Old uploads/Solar Panel`; run again (user_version 40 again) → still one "Old uploads" and one "Solar Panel" folder.
  - BA → `list` 403; `folder_new` 403.
- [ ] **Step 2: Run** `bash tests/run_api.sh` — Expected: the new suite fails.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run** `bash tests/run_api.sh` — Expected: every suite "0 failed".
- [ ] **Step 5: Commit** — "Folder: nested folders, bulk move/delete, ZIP download (server)".

### Task 2: File manager page and WhatsApp picker

**Files:** Modify `assets/app4.js` (rewrite `pgFolder`; keep `shareModal`, `shareUrl`, `fsize`, `fext`, `baseUrl`; drop `availBadge`, `uploadModal`, `editModal`, category/availability UI), `assets/app.js` route (`folder` page receives the folder id from `#/folder/<id>` like other pages), `assets/app7.js` (`datasheetPicker`: show each file's folder path, search includes the path), `assets/app2.css` (`.fm*`), `index.html` (stamps).

**Interfaces:** consumes Task 1's actions. Produces `pgFolder(id)` (id = current folder or 0/undefined for the top level) and `fmPath(folders, id) → [{id, name}]` (root → folder).

- [ ] **Step 1: Implement** the page:
  - Header: "Folder" + subtitle "Datasheets, BIS certificates and test reports"; breadcrumb `Folder › Solar panels › ReNew` (each crumb links to `#/folder/<id>`, "Folder" to `#/folder`); search box (searches every folder; results show the folder path and open their folder); writers get **New folder** and **Upload** buttons.
  - List (table-like rows, folders first then files): checkbox, icon (`i-folder` for folders; a small file-type badge for files, like today's `.dsf`), name (folder → opens it; file → preview in a new tab via `folder/get`), size or "N items", modified date, by.
  - Selection bar when anything is ticked: **Download** (exactly one file → `folder/get&dl=1`; otherwise `folder/zip?files=…&folders=…`), **Share on WhatsApp** (files only, opens existing `shareModal`), and for writers **Rename** (exactly one item), **Move** (dialog with a folder tree; the moved folders and their sub-folders are not offered), **Delete** (confirm, says they go to the Recycle bin for 72 hours), **Clear**. Select-all checkbox in the list header.
  - Upload: drag files anywhere on the page (highlight a drop zone) or the Upload button (multiple); uploads into the current folder one by one with progress ("Uploading 2 of 5…"); before uploading, a file whose name already exists in this folder asks once "Replace X with the new version? The old one goes to the Recycle bin."; types and 25 MB limit as the server; toast the result and reload the folder.
  - Empty folder: "This folder is empty." + for writers "Drop files here or use Upload."
  - Phone (≤820 px): rows collapse to name + size, toolbar wraps, selection bar sticks to the bottom.
  - Search, folder, selection kept in module state `FM` (not across customers); Back/forward works through the hash.
- [ ] **Step 2: Implement** the WhatsApp picker change (path under each file name; search matches the path).
- [ ] **Step 3: Check** `node --check assets/app4.js`, `node --check assets/app7.js`, `node --check assets/app.js`; bump stamps.
- [ ] **Step 4: Commit** — "Folder: file manager page".
