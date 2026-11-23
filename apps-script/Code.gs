/**
 * SPADAKes - Strategi Pengendalian Deviasi Anggaran Kesehatan
 * Pemerintah Provinsi Banten
 *
 * Code.gs  : API web app (doGet/doPost JSON), database (Google Sheets), autentikasi, setup awal.
 * Api.gs   : logika anggaran (perhitungan, struktur, periode, PAD, rekap, pembanding, ekspor).
 * Xlsx.gs  : pembuat file Excel yang meniru format laporan Dinkes.
 * Seed.gs  : data awal dari file Excel "RINCIAN REALISASI ANGGARAN DINKES Per 30 Sept 2026".
 */

var TZ = 'Asia/Jakarta';
var DEFAULT_PASSWORD_UNIT = 'Spadakes@2026';
var DEFAULT_PASSWORD_ADMIN = 'Admin@2026';

var SCHEMA = {
  Users: ['username', 'nama', 'role', 'unit', 'hash', 'salt', 'aktif', 'mustChange', 'createdAt', 'lastLogin'],
  Units: ['id', 'nama', 'singkatan', 'punyaBLUD', 'padNama', 'urutan', 'aktif'],
  Struktur: ['id', 'ta', 'unit', 'level', 'kode', 'uraian', 'parentId', 'jenis', 'urutan', 'aktif'],
  Nilai: ['key', 'ta', 'periode', 'subId', 'murni', 'perubahan', 'blud', 'realisasi', 'angkas', 'updatedBy', 'updatedAt'],
  Periode: ['ta', 'periode', 'status', 'createdBy', 'createdAt'],
  PAD: ['key', 'ta', 'periode', 'unit', 'target', 'realisasi', 'angkas', 'updatedBy', 'updatedAt'],
  Log: ['ts', 'user', 'aksi', 'detail'],
  Arsip: ['ts', 'user', 'nama', 'tipe', 'ta', 'periode', 'url', 'fileId'],
  Config: ['key', 'value'],
  Paparan: ['id', 'judul', 'ket', 'fileId', 'nama', 'pages', 'size', 'cover', 'urutan', 'createdBy', 'createdAt', 'updatedAt']
};
var TEXT_COLS = {
  Users: ['username', 'hash', 'salt', 'unit', 'createdAt', 'lastLogin'], Units: ['id'], Struktur: ['id', 'unit', 'kode', 'uraian', 'parentId'],
  Nilai: ['key', 'subId', 'updatedAt'], Periode: ['createdAt'], PAD: ['key', 'unit', 'updatedAt'], Log: ['ts', 'detail'],
  Arsip: ['ts', 'nama', 'url', 'fileId'], Config: ['key', 'value'],
  Paparan: ['id', 'judul', 'ket', 'fileId', 'nama', 'cover', 'createdBy', 'createdAt', 'updatedAt']
};
/* ---------- PERIODE = TANGGAL DATA ----------
 * Setiap periode adalah satu tanggal (bulan + tanggal). Nomor periode disimpan sebagai
 * urutan hari dalam tahun (1 Jan = 1 ... 31 Des = 365/366), sehingga unik & berurutan. */
var MAXPER = 366;
function perDate_(ta, p) { return new Date(Number(ta), 0, Number(p)); }
function doyOf_(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1; }
function validPer_(ta, p) { p = Number(p); return p >= 1 && p <= MAXPER && perDate_(ta, p).getFullYear() === Number(ta); }
function perFromTgl_(ta, tgl) { // 'YYYY-MM-DD' -> nomor periode
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tgl || ''));
  if (!m) throw new Error('Tanggal tidak valid.');
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(ta) || d.getMonth() !== Number(m[2]) - 1) throw new Error('Tanggal harus berada pada tahun anggaran ' + ta + '.');
  return doyOf_(d);
}
function perName_(ta, p) { var d = perDate_(ta, p); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* =========================== WEB APP (API JSON) =========================== */
/**
 * Frontend (PWA) di-hosting di GitHub Pages dan memanggil URL web app ini.
 * - POST  : body JSON {token, action, payload}  (Content-Type text/plain agar tanpa preflight CORS)
 * - GET   : cek status layanan
 */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOut_({ ok: true, app: 'SPADAKes', status: 'online', time: now_() });
}

function doPost(e) {
  var res;
  try {
    var j = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    res = api(j.token, j.action, j.payload);
  } catch (err) {
    res = { ok: false, error: 'Permintaan tidak valid.' };
  }
  return jsonOut_(res);
}

/** Satu-satunya pintu masuk dari browser. */
function api(token, action, payload) {
  try {
    var route = ROUTES[action];
    if (!route) throw new Error('Aksi tidak dikenal: ' + action);
    var user = null;
    if (!route.open) user = sessionUser_(token);
    if (route.admin && user.role !== 'Admin') throw new Error('Akses ditolak: khusus Administrator.');
    var data = route.fn(user, payload || {}, token);
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), expired: !!(e && e.expired) };
  }
}

var ROUTES = {
  login: { open: true, fn: function (u, p) { return doLogin_(p); } },
  logout: { fn: function (u, p, t) { CacheService.getScriptCache().remove('S_' + t); PropertiesService.getScriptProperties().deleteProperty('SS_' + sha_(t)); log_(u.username, 'Logout', ''); return true; } },
  session: { fn: function (u) { return bootstrap_(u); } },
  changePassword: { fn: function (u, p) { return changePassword_(u, p); } },
  dashboard: { fn: function (u, p) { return apiDashboard_(u, p); } },
  struktur: { fn: function (u, p) { return apiStruktur_(u, p); } },
  saveNilai: { fn: function (u, p) { return apiSaveNilai_(u, p); } },
  addNode: { fn: function (u, p) { return apiAddNode_(u, p); } },
  updateNode: { fn: function (u, p) { return apiUpdateNode_(u, p); } },
  deleteNode: { fn: function (u, p) { return apiDeleteNode_(u, p); } },
  createPeriod: { admin: true, fn: function (u, p) { return apiCreatePeriod_(u, p); } },
  paparanList: { fn: function (u, p) { return apiPaparanList_(u, p); } },
  paparanFile: { fn: function (u, p) { return apiPaparanFile_(u, p); } },
  paparanAdd: { admin: true, fn: function (u, p) { return apiPaparanAdd_(u, p); } },
  paparanUpdate: { admin: true, fn: function (u, p) { return apiPaparanUpdate_(u, p); } },
  paparanDelete: { admin: true, fn: function (u, p) { return apiPaparanDelete_(u, p); } },
  deletePeriod: { admin: true, fn: function (u, p) { return apiDeletePeriod_(u, p); } },
  setPeriodStatus: { admin: true, fn: function (u, p) { return apiSetPeriodStatus_(u, p); } },
  createTA: { admin: true, fn: function (u, p) { return apiCreateTA_(u, p); } },
  importPrev: { fn: function (u, p) { return apiImportPrev_(u, p); } },
  pembanding: { fn: function (u, p) { return apiPembanding_(u, p); } },
  pad: { fn: function (u, p) { return apiPad_(u, p); } },
  savePad: { fn: function (u, p) { return apiSavePad_(u, p); } },
  rekap: { fn: function (u, p) { return apiRekap_(u, p); } },
  exportExcel: { fn: function (u, p) { return apiExport_(u, p); } },
  units: { fn: function (u, p) { return apiUnits_(u, p); } },
  saveUnit: { admin: true, fn: function (u, p) { return apiSaveUnit_(u, p); } },
  users: { admin: true, fn: function (u, p) { return apiUsers_(u, p); } },
  saveUser: { admin: true, fn: function (u, p) { return apiSaveUser_(u, p); } },
  resetPassword: { admin: true, fn: function (u, p) { return apiResetPassword_(u, p); } },
  saveConfig: { admin: true, fn: function (u, p) { return apiSaveConfig_(u, p); } },
  logs: { fn: function (u, p) { return apiLogs_(u, p); } },
  arsip: { fn: function (u, p) { return apiArsip_(u, p); } }
};

/* =========================== DATABASE =========================== */
var _SS = null;
function ss_() {
  if (_SS) return _SS;
  var props = PropertiesService.getScriptProperties();
  var s = null;
  try { s = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { s = null; }
  if (!s) {
    var id = props.getProperty('DB_ID');
    if (id) s = SpreadsheetApp.openById(id);
  }
  if (!s) {
    s = SpreadsheetApp.create('SPADAKes - Database');
    props.setProperty('DB_ID', s.getId());
  }
  _SS = s;
  return s;
}

function sheet_(name) {
  ensureSetup_();
  return ss_().getSheetByName(name);
}

var _SETUP_DONE = false, _IN_SETUP = false;
function ensureSetup_() {
  if (_SETUP_DONE || _IN_SETUP) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_V') === '1') {
    var chk = ss_().getSheetByName('Struktur'), chk2 = ss_().getSheetByName('Paparan');
    if (chk && chk2) { _SETUP_DONE = true; return; }
  }
  setup();
  _SETUP_DONE = true;
}

/** Jalankan manual dari editor sekali (opsional). Aman dijalankan ulang. */
function setup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  _IN_SETUP = true;
  try {
    var s = ss_();
    Object.keys(SCHEMA).forEach(function (name) {
      var sh = s.getSheetByName(name);
      if (!sh) sh = s.insertSheet(name);
      var cols = SCHEMA[name];
      if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#12372f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      (TEXT_COLS[name] || []).forEach(function (c) {
        var idx = cols.indexOf(c) + 1;
        sh.getRange(1, idx, sh.getMaxRows(), 1).setNumberFormat('@');
        sh.getRange(1, idx).setNumberFormat('General');
      });
    });
    var def = s.getSheetByName('Sheet1') || s.getSheetByName('Sheet 1') || s.getSheetByName('Lembar1');
    if (def && s.getSheets().length > 1) { try { s.deleteSheet(def); } catch (e) { } }
    seedIfEmpty_();
    PropertiesService.getScriptProperties().setProperty('SETUP_V', '1');
    _SETUP_DONE = true;
  } finally { _IN_SETUP = false; lock.releaseLock(); }
}

/* ---------- cache tabel: memo per-eksekusi + CacheService lintas-permintaan (berversi) ---------- */
var _MEMO = {};
var NOCACHE_ = { Log: true };
var CHUNK_ = 60000, MAXCHUNK_ = 80;
function tver_(name) {
  var cache = CacheService.getScriptCache(), v = cache.get('V_' + name);
  if (!v) { v = Utilities.getUuid().slice(0, 8); cache.put('V_' + name, v, 21600); }
  return v;
}
function invalidate_(name) {
  delete _MEMO[name];
  try { CacheService.getScriptCache().put('V_' + name, Utilities.getUuid().slice(0, 8), 21600); } catch (e) { }
}
function cacheGetBig_(key) {
  var cache = CacheService.getScriptCache(), head = cache.get(key + '#n');
  if (!head) return null;
  var n = Number(head), keys = [], i;
  for (i = 0; i < n; i++) keys.push(key + '#' + i);
  var got = cache.getAll(keys), parts = [];
  for (i = 0; i < n; i++) { var p = got[keys[i]]; if (p === undefined || p === null) return null; parts.push(p); }
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
function cachePutBig_(key, obj) {
  var s = JSON.stringify(obj), n = Math.ceil(s.length / CHUNK_);
  if (n > MAXCHUNK_) return;
  var cache = CacheService.getScriptCache(), put = {};
  for (var i = 0; i < n; i++) put[key + '#' + i] = s.substr(i * CHUNK_, CHUNK_);
  put[key + '#n'] = String(n);
  try { cache.putAll(put, 21600); } catch (e) { }
}
function readTable_(name) {
  if (_MEMO[name]) return _MEMO[name];
  ensureSetup_();
  var cols = SCHEMA[name], vals = null, ck = null;
  if (!NOCACHE_[name]) { ck = 'T_' + name + '_' + tver_(name); vals = cacheGetBig_(ck); }
  if (!vals) {
    var sh = ss_().getSheetByName(name), last = sh.getLastRow();
    vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var r = 0; r < vals.length; r++) for (var c = 0; c < cols.length; c++) if (vals[r][c] instanceof Date) vals[r][c] = Utilities.formatDate(vals[r][c], TZ, 'yyyy-MM-dd HH:mm:ss');
    if (ck && vals.length) cachePutBig_(ck, vals);
  }
  var out = new Array(vals.length);
  for (var i = 0; i < vals.length; i++) {
    var o = { _row: i + 2 }, row = vals[i];
    for (var k = 0; k < cols.length; k++) o[cols[k]] = row[k];
    out[i] = o;
  }
  _MEMO[name] = out;
  return out;
}
/** n baris terakhir (untuk tabel besar seperti Log); tanpa cache. */
function readTail_(name, n) {
  ensureSetup_();
  var cols = SCHEMA[name], sh = ss_().getSheetByName(name), last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - n + 1), vals = sh.getRange(start, 1, last - start + 1, cols.length).getValues(), out = [];
  for (var i = 0; i < vals.length; i++) { var o = { _row: start + i }; for (var c = 0; c < cols.length; c++) o[cols[c]] = vals[i][c] instanceof Date ? Utilities.formatDate(vals[i][c], TZ, 'yyyy-MM-dd HH:mm:ss') : vals[i][c]; out.push(o); }
  return out;
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  ensureSetup_();
  var sh = ss_().getSheetByName(name), cols = SCHEMA[name];
  var rows = objs.map(function (o) { return cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; }); });
  var start = sh.getLastRow() + 1;
  if (sh.getMaxRows() < start + rows.length) sh.insertRowsAfter(sh.getMaxRows(), start + rows.length - sh.getMaxRows() + 50);
  sh.getRange(start, 1, rows.length, cols.length).setValues(rows);
  invalidate_(name);
}

function updateRow_(name, row, obj) {
  var sh = ss_().getSheetByName(name), cols = SCHEMA[name];
  var cur = sh.getRange(row, 1, 1, cols.length).getValues()[0];
  for (var c = 0; c < cols.length; c++) if (obj.hasOwnProperty(cols[c])) cur[c] = obj[cols[c]];
  sh.getRange(row, 1, 1, cols.length).setValues([cur]);
  invalidate_(name);
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function log_(user, aksi, detail) {
  try { appendRows_('Log', [{ ts: now_(), user: user, aksi: aksi, detail: String(detail || '').slice(0, 500) }]); } catch (e) { }
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v).replace(/Rp|\s/gi, '');
  if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  var x = Number(s);
  return isFinite(x) ? x : 0;
}

/* =========================== CONFIG =========================== */
function getConfig_() {
  var cfg = { instansi: 'Dinas Kesehatan Provinsi Banten', ambang: 10, judulLaporan: 'Realisasi Anggaran Per Sub Kegiatan Tahun {TA}', logo: '' };
  readTable_('Config').forEach(function (r) {
    if (r.key === 'ambang') cfg.ambang = num_(r.value) || 10;
    else if (cfg.hasOwnProperty(r.key)) cfg[r.key] = r.value;
  });
  return cfg;
}

function apiSaveConfig_(u, p) {
  var rows = readTable_('Config'), map = {};
  rows.forEach(function (r) { map[r.key] = r; });
  ['instansi', 'ambang', 'judulLaporan', 'logo'].forEach(function (k) {
    if (p[k] === undefined) return;
    if (map[k]) updateRow_('Config', map[k]._row, { value: String(p[k]) });
    else appendRows_('Config', [{ key: k, value: String(p[k]) }]);
  });
  log_(u.username, 'Pengaturan', 'Mengubah konfigurasi aplikasi');
  return getConfig_();
}

/* =========================== AUTH =========================== */
function hash_(pw, salt) {
  var d = salt + '|' + pw;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d);
  for (var i = 0; i < 150; i++) bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return Utilities.base64Encode(bytes);
}

function newSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function validPassword_(pw) {
  if (!pw || pw.length < 8) return 'Password minimal 8 karakter.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password harus mengandung huruf dan angka.';
  return '';
}

var REMEMBER_DAYS = 30;
function sha_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)).slice(0, 22); }
function purgeSessions_(now, username) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SS_') !== 0) return;
    var p = String(all[k]).split('|');
    if (Number(p[1]) < now || (username && p[0] === username)) props.deleteProperty(k);
  });
}
function doLogin_(p) {
  var username = String(p.username || '').trim().toLowerCase(), pw = String(p.password || '');
  if (!username || !pw) throw new Error('Username dan password wajib diisi.');
  var cache = CacheService.getScriptCache(), fkey = 'F_' + username;
  var fails = Number(cache.get(fkey) || 0);
  if (fails >= 5) throw new Error('Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
  var rows = readTable_('Users'), u = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].username).toLowerCase() === username) { u = rows[i]; break; }
  if (!u || hash_(pw, String(u.salt)) !== String(u.hash)) {
    cache.put(fkey, String(fails + 1), 600);
    log_(username, 'Login gagal', '');
    throw new Error('Username atau password salah.');
  }
  if (Number(u.aktif) !== 1) throw new Error('Akun Anda dinonaktifkan. Hubungi administrator.');
  cache.remove(fkey);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('S_' + token, String(u.username), 21600);
  var remember = p.remember === true || p.remember === 1 || p.remember === 'true';
  if (remember) {
    var exp = Date.now() + REMEMBER_DAYS * 86400000;
    purgeSessions_(Date.now(), null);
    PropertiesService.getScriptProperties().setProperty('SS_' + sha_(token), String(u.username) + '|' + exp);
  }
  updateRow_('Users', u._row, { lastLogin: now_() });
  log_(u.username, 'Login', remember ? 'ingat saya' : '');
  var user = publicUser_(u);
  return { token: token, remember: remember, boot: bootstrap_(user) };
}

function publicUser_(u) {
  return { username: String(u.username), nama: u.nama, role: u.role, unit: String(u.unit || ''), mustChange: Number(u.mustChange) === 1 };
}

function sessionUser_(token) {
  var expired = function () { var e = new Error('Sesi berakhir. Silakan login kembali.'); e.expired = true; return e; };
  if (!token) throw expired();
  var cache = CacheService.getScriptCache();
  var uname = cache.get('S_' + token);
  if (!uname) { // cache habis: cek sesi "ingat saya"
    var pv = PropertiesService.getScriptProperties().getProperty('SS_' + sha_(token));
    if (pv) { var pp = String(pv).split('|'); if (Number(pp[1]) > Date.now()) uname = pp[0]; }
    if (!uname) throw expired();
    cache.put('S_' + token, uname, 21600);
  }
  var rows = readTable_('Users');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].username) === uname && Number(rows[i].aktif) === 1) return publicUser_(rows[i]);
  }
  var e2 = new Error('Akun tidak aktif.'); e2.expired = true; throw e2;
}

function changePassword_(u, p) {
  var rows = readTable_('Users'), row = null;
  rows.forEach(function (r) { if (String(r.username) === u.username) row = r; });
  if (!row) throw new Error('Akun tidak ditemukan.');
  if (hash_(String(p.lama || ''), String(row.salt)) !== String(row.hash)) throw new Error('Password lama salah.');
  var msg = validPassword_(String(p.baru || ''));
  if (msg) throw new Error(msg);
  if (p.baru === p.lama) throw new Error('Password baru harus berbeda dari password lama.');
  var salt = newSalt_();
  updateRow_('Users', row._row, { salt: salt, hash: hash_(String(p.baru), salt), mustChange: 0 });
  log_(u.username, 'Ganti password', '');
  return true;
}

function apiUsers_() {
  return readTable_('Users').map(function (r) {
    return { username: String(r.username), nama: r.nama, role: r.role, unit: String(r.unit || ''), aktif: Number(r.aktif) === 1, lastLogin: r.lastLogin, createdAt: r.createdAt };
  });
}

function apiSaveUser_(u, p) {
  var username = String(p.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username 3-30 karakter (huruf kecil, angka, titik, strip, garis bawah).');
  if (['Admin', 'Unit', 'Pimpinan'].indexOf(p.role) < 0) throw new Error('Role tidak valid.');
  if (p.role === 'Unit' && !p.unit) throw new Error('Akun Unit wajib memilih unit kerja.');
  var rows = readTable_('Users'), ex = null, admins = 0;
  rows.forEach(function (r) { if (String(r.username).toLowerCase() === username) ex = r; if (r.role === 'Admin' && Number(r.aktif) === 1) admins++; });
  var aktif = p.aktif ? 1 : 0;
  if (ex) {
    if (ex.role === 'Admin' && Number(ex.aktif) === 1 && (p.role !== 'Admin' || !aktif) && admins <= 1) throw new Error('Minimal harus ada satu Administrator aktif.');
    updateRow_('Users', ex._row, { nama: p.nama, role: p.role, unit: p.role === 'Unit' ? p.unit : '', aktif: aktif });
    log_(u.username, 'Ubah akun', username);
    return { created: false };
  }
  var salt = newSalt_(), pw = p.role === 'Admin' ? DEFAULT_PASSWORD_ADMIN : DEFAULT_PASSWORD_UNIT;
  appendRows_('Users', [{ username: username, nama: p.nama || username, role: p.role, unit: p.role === 'Unit' ? p.unit : '', hash: hash_(pw, salt), salt: salt, aktif: aktif, mustChange: 1, createdAt: now_() }]);
  log_(u.username, 'Tambah akun', username);
  return { created: true, password: pw };
}

function apiResetPassword_(u, p) {
  var rows = readTable_('Users'), row = null;
  rows.forEach(function (r) { if (String(r.username) === p.username) row = r; });
  if (!row) throw new Error('Akun tidak ditemukan.');
  var pw = (row.role === 'Admin' ? 'Adm' : 'Unt') + Math.floor(100000 + Math.random() * 900000) + '!';
  var salt = newSalt_();
  updateRow_('Users', row._row, { salt: salt, hash: hash_(pw, salt), mustChange: 1 });
  CacheService.getScriptCache().remove('F_' + String(row.username).toLowerCase());
  purgeSessions_(0, String(row.username));
  log_(u.username, 'Reset password', p.username);
  return { password: pw };
}

/* =========================== SEED =========================== */
function seedIfEmpty_() {
  if (readTable_('Units').length) return;
  var ta = 2026, per = doyOf_(new Date(2026, 8, 30)), who = 'sistem', ts = now_(); // data awal = realisasi s/d 30 Sept 2026
  PropertiesService.getScriptProperties().setProperty('PER_MODE', 'tanggal');
  appendRows_('Units', SEED.units.map(function (u, i) { return { id: u[0], nama: u[1], singkatan: u[2], punyaBLUD: u[3], padNama: u[4], urutan: i + 1, aktif: 1 }; }));
  var struktur = [], nilai = [], cur = {}, n = 0, curUnit = '', lastProg = '', lastKeg = '', order = 0;
  SEED.rows.forEach(function (r) {
    n++; order++;
    var id = 'N' + ('0000' + n).slice(-5), unit = r[0], level = r[1];
    var parent = level === 'program' ? '' : (level === 'kegiatan' ? cur.program : cur.kegiatan);
    cur[level] = id;
    struktur.push({ id: id, ta: ta, unit: unit, level: level, kode: r[2], uraian: r[3], parentId: parent, jenis: r[4], urutan: order, aktif: 1 });
    if (level === 'sub') {
      nilai.push({
        key: ta + '|' + per + '|' + id, ta: ta, periode: per, subId: id,
        murni: r[4] === 'APBD' ? r[5] : 0, perubahan: '', blud: r[4] === 'BLUD' ? r[5] : 0,
        realisasi: r[6], angkas: r[7], updatedBy: who, updatedAt: ts
      });
    }
  });
  appendRows_('Struktur', struktur);
  appendRows_('Nilai', nilai);
  appendRows_('Periode', [{ ta: ta, periode: per, status: 'Terbuka', createdBy: who, createdAt: ts }]);
  var padRows = [];
  SEED.pad.forEach(function (p) {
    var unit = '';
    SEED.units.forEach(function (u) { if (u[4] === p[0]) unit = u[0]; });
    padRows.push({ key: ta + '|' + per + '|' + unit, ta: ta, periode: per, unit: unit, target: p[1], realisasi: p[2], angkas: p[3], updatedBy: who, updatedAt: ts });
  });
  appendRows_('PAD', padRows);
  // akun awal
  var users = [];
  function mk(username, nama, role, unit, pw) {
    var salt = newSalt_();
    users.push({ username: username, nama: nama, role: role, unit: unit, hash: hash_(pw, salt), salt: salt, aktif: 1, mustChange: 1, createdAt: ts });
  }
  mk('admin', 'Administrator SPADAKes', 'Admin', '', DEFAULT_PASSWORD_ADMIN);
  mk('pimpinan', 'Pimpinan (Hanya Lihat)', 'Pimpinan', '', DEFAULT_PASSWORD_UNIT);
  var uname = { DINKES: 'dinkes', PELKES: 'pelkes', LABKESDA: 'labkesda', RSUDBTN: 'rsudbanten', RSUDMLP: 'rsudmalingping', RSUDLBN: 'rsudlabuan', RSUDCLG: 'rsudcilograng' };
  SEED.units.forEach(function (un) { mk(uname[un[0]], 'Operator ' + un[1], 'Unit', un[0], DEFAULT_PASSWORD_UNIT); });
  appendRows_('Users', users);
  appendRows_('Config', [
    { key: 'instansi', value: 'Dinas Kesehatan Provinsi Banten' }, { key: 'ambang', value: '10' },
    { key: 'judulLaporan', value: 'Realisasi Anggaran Per Sub Kegiatan Tahun {TA}' }
  ]);
  log_('sistem', 'Setup', 'Database dibuat dan diisi dari Excel per 30 September 2026');
}


/**
 * MIGRASI SEKALI JALAN — untuk database lama yang periodenya BULAN (1-12) atau MINGGU (1-53).
 * Jalankan manual dari editor Apps Script: pilih fungsi "migrasiKeTanggal" lalu Run
 * (salin dulu spreadsheet sebagai cadangan). Hasil: setiap periode menjadi satu TANGGAL data.
 *  - dari bulan : bulan m -> tanggal terakhir bulan itu (September 2026 -> 30 September 2026)
 *  - dari minggu: minggu w -> tanggal data yang pernah diisi, atau hari Minggu akhir minggu itu
 * Aman dijalankan ulang (ditandai PER_MODE=tanggal).
 */
function migrasiKeTanggal() {
  var props = PropertiesService.getScriptProperties(), mode = props.getProperty('PER_MODE');
  if (mode === 'tanggal') return 'Sudah berbasis tanggal. Tidak ada yang diubah.';
  ensureSetup_();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var tglCfg = {};
    readTable_('Config').forEach(function (r) { var m = /^tgl\|(\d+)\|(\d+)$/.exec(String(r.key)); if (m && r.value) tglCfg[m[1] + '|' + m[2]] = String(r.value); });
    var map = function (ta, x) {
      x = Number(x); ta = Number(ta);
      if (mode === 'minggu') {
        var t = tglCfg[ta + '|' + x], mm = t && /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
        if (mm) return doyOf_(new Date(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3])));
        var j = new Date(ta, 0, 1), dow = (j.getDay() + 6) % 7, s = new Date(ta, 0, 1 - dow + (x - 1) * 7), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
        if (e.getFullYear() > ta) e = new Date(ta, 11, 31);
        return doyOf_(e);
      }
      return doyOf_(new Date(ta, x, 0)); // bulan -> hari terakhir bulan
    };
    var lim = mode === 'minggu' ? 53 : 12, out = [];
    ['Periode', 'Nilai', 'PAD'].forEach(function (name) {
      var sh = ss_().getSheetByName(name), cols = SCHEMA[name], last = sh.getLastRow();
      if (last < 2) return;
      var vals = sh.getRange(2, 1, last - 1, cols.length).getValues(), iTa = cols.indexOf('ta'), iPer = cols.indexOf('periode'), iKey = cols.indexOf('key'), n = 0;
      vals.forEach(function (r) {
        var x = Number(r[iPer]); if (!(x >= 1 && x <= lim)) return;
        var w = map(r[iTa], x); r[iPer] = w; n++;
        if (iKey >= 0) { var p = String(r[iKey]).split('|'); p[1] = String(w); r[iKey] = p.join('|'); }
      });
      sh.getRange(2, 1, vals.length, cols.length).setValues(vals);
      invalidate_(name); out.push(name + ': ' + n + ' baris');
    });
    props.setProperty('PER_MODE', 'tanggal');
    log_('sistem', 'Migrasi periode', (mode === 'minggu' ? 'minggu' : 'bulan') + ' -> tanggal; ' + out.join('; '));
    return 'Migrasi selesai. ' + out.join('; ');
  } finally { lock.releaseLock(); }
}
function migrasiBulanKeMinggu() { return migrasiKeTanggal(); } // nama lama (kompatibilitas)
