# Voltline — LV as-built survey, RUEAP Lot 2 (Kirehe & Ngoma)

Created by Eng. Wilbert KIRARA. Same engine as WK LV As-Built (Nyanza), set up for Kirehe and Ngoma districts.

## Files (upload all of them, keep the folders)
- `index.html`, `app.js` — the app
- `voltline-transformers.js` — Phase 2 transformers (35), district, sector, position where known
- `voltline-villages.js` — NISR village boundaries (Kirehe, Ngoma and bordering villages), TM Rwanda
- `voltline-customers.js` — customer lists by transformer (house = SN of the list)
- `voltline-template.xlsx` — Lot 2 client Excel template for the customer export
- `tracker.html` — supervisor console
- `leaflet/`, `ocr/`, `exceljs.min.js`, `jszip.min.js`, `zxing.min.js` — libraries, work offline
- `sw.js`, `manifest.webmanifest`, icons — offline install

## Update on GitHub Pages
Replace the files in the same repository (same link). Data already on the phones is kept and moved to the new format on first opening.
Bump `CACHE` in `sw.js` and `BUILD` in `app.js` on every release.

## Automatic sync (Google Drive)
Server: `apps-script/Code.gs` (Google Apps Script web app). It writes every point to the Google Sheet
"Voltline - Lot 2 LV As-Built (Kirehe & Ngoma) - Sync" (tabs Transformers / Poles / Customers) and the
files and stamped photos to Drive "Voltline - Lot 2/<District> District/<Transformer>/" (Information Data, KMZ,
Shapefile, Photos/Transformer|Poles|Customers, Map PDF, MXD, Backup).
Setup once: script.google.com > New project > paste Code.gs > Deploy > New deployment > Web app
(Execute as: Me, Who has access: Anyone) > Authorise > copy the /exec URL.
Then set SYNC_URL_DEFAULT in app.js to that URL (all phones sync by themselves), or paste it on each
phone in Export > Automatic sync > Server settings. TOKEN in Code.gs must equal SYNC_TOKEN in app.js.

Live sync server (deployment "Voltline sync v1", project "Voltline - Lot 2 Sync"):
https://script.google.com/macros/s/AKfycbwm9WN32u66its86mhn2H38IZ5vQD6JX4DMpdShLRLtOYet9kIfv7wLbhMpIY0r9xI1Zg/exec

(version 3 since build 2026-11-23-v9, same URL)

## Sync codes (since v9)
Each phone sends a personal sync code. The codes live in the **Agents** tab of the sync Sheet:
Name | Code | Role (agent / supervisor) | Active (YES / NO) | Last seen | Name on phone.
- New surveyor: add a row with any 6 letters/digits as Code, Role `agent`, Active `YES`, and give them the code.
  They type it once at sign-in, or in Export > Automatic sync > "Your sync code".
- Lost phone or surveyor leaving: set Active to `NO`. That phone is refused at once; its unsent points stay on the phone.
- A `supervisor` code also opens the live data in `tracker.html` (Load live data) and runs the photo migration.
- Until 26 Nov 2026 23:59 a phone without a code is still accepted, so the codes can be handed out. After that, no code = no sync.
- Never write codes in app.js or Code.gs: the repository is public.

## Checks when saving (since v16)
- A meter number can belong to one customer only: saving a meter already recorded is refused, and tapping an
  already-recorded customer in the list offers to open that point instead. (One person may own several meters.)
- No meter number: the surveyor must confirm, and "No meter" is written in Comment.
- Required: Conductor on every pole, Service cable type on every customer.
- Service cable over 50 m: the app proposes the nearest pole; over 150 m it must be confirmed.
- A red/amber badge in the header always shows the number of points to fix/check; tap it to see the list.

## Checks before export (since v9)
Excel and ZIP exports first list the points to fix or check: missing photo/assembly, duplicate pole, house,
meter or ID numbers, ID not 16 digits, phone not 07X XXX XXXX, service cable over 50 m, LV span over the limit of its conductor, GPS worse than ±10 m.

## Supervisor tracker (since v9)
Tab "Progress vs customer list": customers surveyed / expected per transformer (matched by meter, ID, then
name), surveyed customers not in the list, work per surveyor per day, and the list of customers not surveyed
yet per transformer (CSV).
