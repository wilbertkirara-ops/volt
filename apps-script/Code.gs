/**
 * Voltline — RUEAP Lot 2, Kirehe & Ngoma : synchronisation server (Google Apps Script)
 * (c) 2026 Eng. Wilbert KIRARA, Expert Surveyor in Electrical Power Lines. All rights reserved.
 * ---------------------------------------------------------------------------
 * Receives the points + stamped photos from the phones and stores them in:
 *   - this Google Sheet: one tab per layer (Transformers, Poles, Customers),
 *     one row per point, updated in place when the point is edited
 *   - Google Drive, one folder per transformer, same layout as the design packages:
 *       Voltline - Lot 2/<District> District/<Transformer>/
 *           Information Data/   Excel (customers, Lot 2 template) + CSV tables, updated by the phones
 *           KMZ/                Google Earth file
 *           Shapefile/          Transformer, Poles, LV_Network, Customers, Service_Cable (TM Rwanda)
 *           Photos/Transformer, Photos/Poles, Photos/Customers
 *           Map PDF/, MXD/      for the office
 *           Backup/             phone backup (.wklv.json) of this transformer
 *
 * SETUP (once): Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 * > copy the /exec URL > in the app: Export > Automatic sync > Server settings.
 * TOKEN must equal SYNC_TOKEN in app.js.
 *
 * ACCESS (version 3): every phone also sends its personal sync code. The codes are kept in
 * the "Agents" tab of the Sheet (Name | Code | Role | Active | Last seen | Name on phone | App build).
 * Role "supervisor" may also run migrate and pull (live data for the tracker).
 * Set Active to NO to cut a phone off at once. Codes are never written in this file.
 */
const TOKEN = 'voltline-lot2-p8zblULZSwk3lqdCHRrmj764';
const AGENTS_TAB = 'Agents';
const AGENTS_HEAD = ['Name', 'Code', 'Role', 'Active', 'Last seen', 'Name on phone', 'App build'];
// until this date a phone without a code is still accepted (time to hand out the codes); a wrong code is always refused
const GRACE_UNTIL = new Date('2026-11-26T23:59:59+02:00');
const SHEET_ID = '1NaD-U-PxDfDl1sW9dgrbXWO7JdcLPYuX6oXeGzrSLJk'; // Google Sheet "Voltline - Lot 2 LV As-Built (Kirehe & Ngoma) - Sync"
const ROOT_FOLDER = 'Voltline - Lot 2';
const OLD_ROOT = 'Voltline - Lot 2 Photos';          // first version: photos only
const TABS = ['Transformers', 'Poles', 'Customers'];
const PHOTO_SUB = { Transformers: 'Photos/Transformer', Poles: 'Photos/Poles', Customers: 'Photos/Customers' };
const SUBFOLDERS = ['Information Data', 'KMZ', 'Shapefile', 'Photos/Transformer', 'Photos/Poles', 'Photos/Customers', 'Map PDF', 'MXD', 'Backup'];
const TEXT_COLS = ['Meter_number', 'ID', 'Phone_number', 'UPI', 'HSE No.', 'POLES', 'Pole_Numbe', 'From_Pole'];
const TAIL = ['Photo', 'Photo File ID', 'Received (server)', 'Status'];

function doGet() { return out({ ok: true, app: 'Voltline Lot 2 sync', version: 3, time: new Date().toISOString() }); }

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad request' }); }
  if (d.token !== TOKEN) return out({ ok: false, error: 'unauthorised (old app version: reopen the app with internet)' });
  let who;
  try { who = auth_(d); } catch (err) { return out({ ok: false, error: String(err) }); }
  if (!who.ok) return out(who);
  try {
    if (d.action === 'ping') return out({ ok: true, version: 3, agent: who.name, role: who.role });
    // supervisor actions: read-only or long, they run without the write lock
    if (d.action === 'migrate' || d.action === 'pull') {
      if (who.role !== 'supervisor') return out({ ok: false, error: 'supervisor code required' });
      return out(d.action === 'migrate' ? migrate(d) : pull());
    }
  } catch (err) { return out({ ok: false, error: String(err) }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (d.action === 'delete') return out(markDeleted(d.id));
    if (d.action === 'upsert') return out(upsert(d));
    if (d.action === 'files') return out(saveFiles(d));
    if (d.action === 'folders') return out(makeFolders(d.trfs || []));
    return out({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- access: personal sync codes (Agents tab) ---------- */
function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function agentsTab_() {
  const ss = book_();
  let sh = ss.getSheetByName(AGENTS_TAB);
  if (!sh) {
    sh = ss.insertSheet(AGENTS_TAB, 0);
    sh.getRange(1, 1, 1, AGENTS_HEAD.length).setValues([AGENTS_HEAD]).setFontWeight('bold').setBackground('#fde68a');
    sh.setFrozenRows(1);
  }
  return sh;
}
function auth_(d) {
  const code = normCode_(d.code);
  if (!code) {
    if (new Date() < GRACE_UNTIL && d.action !== 'migrate' && d.action !== 'pull') return { ok: true, name: d.agent || '', role: 'agent', grace: true };
    return { ok: false, error: 'sync code missing: enter your sync code (ask the supervisor)' };
  }
  const sh = agentsTab_();
  const n = sh.getLastRow();
  if (n < 2) return { ok: false, error: 'sync code not valid' };
  const V = sh.getRange(2, 1, n - 1, AGENTS_HEAD.length).getValues();
  for (let i = 0; i < V.length; i++) {
    if (normCode_(V[i][1]) !== code) continue;
    if (/^(no|non|0|false)$/i.test(String(V[i][3]).trim())) return { ok: false, error: 'sync code disabled: contact the supervisor' };
    try { sh.getRange(i + 2, 5, 1, 3).setValues([[new Date(), d.agent || '', d.build || 'older than v14']]); } catch (e) {}
    return { ok: true, name: String(V[i][0]), role: /super/i.test(String(V[i][2])) ? 'supervisor' : 'agent' };
  }
  return { ok: false, error: 'sync code not valid: check it with the supervisor' };
}

function book_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

/* ---------- Drive folders (ids cached in the script properties) ---------- */
function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function cached_(key, make) {
  const P = PropertiesService.getScriptProperties();
  const id = P.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = make(); P.setProperty(key, f.getId()); return f;
}
function root_() {
  return cached_('root', function () { const it = DriveApp.getFoldersByName(ROOT_FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER); });
}
function clean_(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); }
/* folder of a transformer, under its district ("Kirehe District" / "Ngoma District"); the whole package layout is created the first time */
function trfFolder_(trf, sector) {
  const name = clean_(trf) || 'No transformer';
  return cached_('trf:' + name, function () {
    const sec = clean_(sector) || 'Other';
    const f = child_(child_(root_(), sec), name);
    SUBFOLDERS.forEach(function (p) { sub_(f, name, p); });
    return f;
  });
}
function sub_(trfFolder, trfName, path) {
  return cached_('sub:' + trfName + '|' + path, function () {
    let f = trfFolder; path.split('/').forEach(function (n) { f = child_(f, n); }); return f;
  });
}
function folderFor_(trf, sector, path) { const f = trfFolder_(trf, sector); return sub_(f, clean_(trf) || 'No transformer', path); }

function makeFolders(trfs) {
  const done = [];
  trfs.forEach(function (t) { if (t && t.n) { trfFolder_(t.n, t.s); done.push(t.n); } });
  return { ok: true, folders: done.length, root: root_().getUrl() };
}

/* ---------- sheet ---------- */
function tab_(name, header) {
  const ss = book_();
  let sh = ss.getSheetByName(name);
  const full = ['Record ID'].concat(header).concat(TAIL);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, full.length).setValues([full]).setFontWeight('bold').setBackground('#d9e2f3');
    sh.setFrozenRows(1);
  } else {
    const cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    full.forEach(function (h) { if (cur.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#d9e2f3'); cur.push(h); } });
  }
  return sh;
}
function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }
function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function upsert(d) {
  if (!d.id || !d.sheet || !d.header || !d.row) return { ok: false, error: 'missing data' };
  const sh = tab_(d.sheet, d.header);
  const H = headers_(sh);
  let row = findRow_(sh, d.id);
  const rec = { 'Record ID': d.id };
  d.header.forEach(function (h, i) { rec[h] = d.row[i]; });
  if (row) {
    const prev = sh.getRange(row, 1, 1, H.length).getValues()[0];
    rec['Photo'] = prev[H.indexOf('Photo')]; rec['Photo File ID'] = prev[H.indexOf('Photo File ID')];
  }
  if (d.photo) {
    if (rec['Photo File ID']) { try { DriveApp.getFileById(rec['Photo File ID']).setTrashed(true); } catch (e) {} }
    const blob = Utilities.newBlob(Utilities.base64Decode(d.photo), 'image/jpeg', d.photoName || (d.id + '.jpg'));
    const f = folderFor_(d.trf, d.sector || rec['Sector'], PHOTO_SUB[d.sheet] || 'Photos').createFile(blob);
    rec['Photo File ID'] = f.getId(); rec['Photo'] = f.getUrl();
  }
  rec['Received (server)'] = new Date();
  rec['Status'] = 'OK';
  const values = H.map(function (h) { const v = rec[h]; return v === undefined || v === null ? '' : v; });
  if (!row) { row = sh.getLastRow() + 1; }
  H.forEach(function (h, i) { if (TEXT_COLS.indexOf(h) >= 0) sh.getRange(row, i + 1).setNumberFormat('@'); });
  sh.getRange(row, 1, 1, H.length).setValues([values]);
  return { ok: true, id: d.id, photo: rec['Photo'] || '' };
}

/* data files of one transformer (KMZ, shapefiles, Excel, CSV, backup): the newest replaces the previous one */
function saveFiles(d) {
  if (!d.trf || !d.files) return { ok: false, error: 'missing data' };
  let n = 0;
  d.files.forEach(function (x) {
    const folder = folderFor_(d.trf, d.sector, x.folder || 'Information Data');
    const old = folder.getFilesByName(x.name);
    while (old.hasNext()) old.next().setTrashed(true);
    const bytes = x.b64 != null ? Utilities.base64Decode(x.b64) : Utilities.newBlob(x.text || '').getBytes();
    folder.createFile(Utilities.newBlob(bytes, x.mime || 'application/octet-stream', x.name)); n++;
  });
  return { ok: true, files: n, folder: trfFolder_(d.trf, d.sector).getUrl() };
}

/* moves the photos of the first version into the new layout. Resumable: it stops after about
   4.5 minutes and remembers where it was; call it again until done = true. Photos already in
   the right folder are skipped. d.districts (optional) = { transformer: "Kirehe" | "Ngoma" }. */
function migrate(d) {
  const t0 = Date.now(), BUDGET = 270000;
  const P = PropertiesService.getScriptProperties();
  const ss = book_(), map = (d && d.districts) || {};
  const dist = {};
  Object.keys(map).forEach(function (k) { dist[clean_(k)] = map[k]; });
  const data = {};
  TABS.forEach(function (name) {
    const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return;
    const H = headers_(sh), V = sh.getRange(2, 1, sh.getLastRow() - 1, H.length).getValues();
    data[name] = { H: H, V: V };
    const iT = H.indexOf('TRF_Name'), iD = H.indexOf('District');
    if (iT >= 0 && iD >= 0) V.forEach(function (r) { const t = clean_(r[iT]); if (t && r[iD] && !dist[t]) dist[t] = String(r[iD]); });
  });
  function districtOf(t) {
    const v = String(dist[clean_(t)] || '').trim(); if (!v) return 'Other';
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() + ' District';
  }
  let moved = 0, skipped = 0, failed = 0, done = true;
  outer:
  for (let k = 0; k < TABS.length; k++) {
    const name = TABS[k], x = data[name]; if (!x || P.getProperty('mig:fin:' + name)) continue;
    const iF = x.H.indexOf('Photo File ID'), iT = x.H.indexOf('TRF_Name'), iSt = x.H.indexOf('Status');
    let i = Number(P.getProperty('mig:' + name) || 0);
    for (; i < x.V.length; i++) {
      if (Date.now() - t0 > BUDGET) { P.setProperty('mig:' + name, String(i)); done = false; break outer; }
      const r = x.V[i], id = r[iF]; if (!id) continue;
      if (iSt >= 0 && String(r[iSt]).indexOf('DELETED') === 0) continue;
      try {
        const f = DriveApp.getFileById(id); if (f.isTrashed()) continue;
        const target = folderFor_(r[iT], districtOf(r[iT]), PHOTO_SUB[name]), tid = target.getId();
        let here = false; const ps = f.getParents(); while (ps.hasNext()) if (ps.next().getId() === tid) here = true;
        if (here) skipped++; else { f.moveTo(target); moved++; }
      } catch (e) { failed++; }
    }
    P.deleteProperty('mig:' + name); P.setProperty('mig:fin:' + name, '1');
  }
  if (done) TABS.forEach(function (name) { P.deleteProperty('mig:fin:' + name); });
  let oldFilesLeft = 0, trashed = 0;
  const it = DriveApp.getFoldersByName(OLD_ROOT);
  while (it.hasNext()) {
    const o = it.next(); const c = countFiles_(o); oldFilesLeft += c;
    if (done && c === 0) { o.setTrashed(true); trashed++; }
  }
  return { ok: true, done: done, moved: moved, alreadyInPlace: skipped, failed: failed, oldFilesLeft: oldFilesLeft, oldFoldersTrashed: trashed, root: root_().getUrl() };
}
function countFiles_(f) {
  let n = 0; const fs = f.getFiles(); while (fs.hasNext()) { if (!fs.next().isTrashed()) n++; }
  const sub = f.getFolders(); while (sub.hasNext()) n += countFiles_(sub.next());
  return n;
}

/* live data for the supervisor tracker: the three layer tabs as they are now */
function pull() {
  const ss = book_(), tz = ss.getSpreadsheetTimeZone(), tabs = {};
  TABS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 1) { tabs[name] = { header: [], rows: [] }; return; }
    const V = sh.getDataRange().getValues(), H = V[0].map(String);
    tabs[name] = {
      header: H,
      rows: V.slice(1).map(function (r) {
        return r.map(function (v, j) {
          if (v instanceof Date) return Utilities.formatDate(v, tz, H[j] === 'Date' ? 'yyyy-MM-dd' : H[j] === 'Time' ? 'HH:mm:ss' : "yyyy-MM-dd'T'HH:mm:ss");
          return v === null || v === undefined ? '' : String(v);
        });
      })
    };
  });
  return { ok: true, version: 3, time: new Date().toISOString(), tabs: tabs };
}

function markDeleted(id) {
  const ss = book_();
  for (const name of TABS) {
    const sh = ss.getSheetByName(name); if (!sh) continue;
    const row = findRow_(sh, id); if (!row) continue;
    const H = headers_(sh);
    sh.getRange(row, H.indexOf('Status') + 1).setValue('DELETED on phone ' + new Date().toISOString());
    sh.getRange(row, 1, 1, H.length).setFontColor('#9ca3af');
    const iF = H.indexOf('Photo File ID');
    if (iF >= 0) { const pid = sh.getRange(row, iF + 1).getValue(); if (pid) { try { DriveApp.getFileById(pid).setTrashed(true); } catch (e) {} } }
    return { ok: true, id: id };
  }
  return { ok: true, id: id, note: 'not found' };
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
