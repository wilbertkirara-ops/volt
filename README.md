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

## Automatic sync (optional)
Off by default. The supervisor pastes the Google Apps Script /exec URL in Export › Automatic sync › Server settings.
