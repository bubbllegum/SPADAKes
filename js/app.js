/* =====================================================================
 * SPADAKes - Frontend
 * ===================================================================== */
var S = { token: null, boot: null, page: 'dashboard', f: { ta: null, periode: null, jenis: '', dasar: 'perubahan', unit: 'ALL' } };
var BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ------------------------- util ------------------------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function n0(v) { v = Number(v); return isFinite(v) ? v : 0; }
function fmtN(v) { return Math.round(n0(v)).toLocaleString('id-ID'); }
function rp(v) { v = n0(v); return (v < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(v)).toLocaleString('id-ID'); }
function pct(v) { return n0(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
function pctOf(a, b) { return b ? a / b * 100 : 0; }
function short(v) {
  v = n0(v); var a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e12) return s + (a / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' T';
  if (a >= 1e9) return s + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' Jt';
  return s + Math.round(a).toLocaleString('id-ID');
}
function parseNum(s) {
  s = String(s == null ? '' : s).replace(/Rp|\s/gi, '');
  if (s === '') return '';
  if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/\./g, '');
  var x = Number(s); return isFinite(x) ? x : NaN;
}
function ambang() { return n0(S.boot && S.boot.cfg.ambang) || 10; }
function isBad(dev) { return Math.abs(n0(dev)) > ambang(); }
function devPill(dev) { return '<span class="dev ' + (isBad(dev) ? 'bad' : 'ok') + '">' + pct(dev) + '</span>'; }
function initials(n) { return String(n || '?').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
function unitName(id) { var u = (S.boot.units || []).filter(function (x) { return x.id === id; })[0]; return u ? u.nama : id; }
function unitShort(id) { var u = (S.boot.units || []).filter(function (x) { return x.id === id; })[0]; return u ? u.singkatan : id; }
var ROLE_LABEL = { Admin: 'Administrator', Unit: 'Operator Unit', Pimpinan: 'Pimpinan' };

var _ld = 0;
function loader(d) { _ld = Math.max(0, _ld + d); $('#loader').classList.toggle('hidden', !_ld); }

function apiUrl() {
  var u = ''; try { u = localStorage.getItem('spadakes_api') || ''; } catch (e) { }
  return u || (window.SPADAKES_CONFIG && SPADAKES_CONFIG.apiUrl) || '';
}
var RC = {}, RC_TTL = 120000, READ_ACTIONS = { dashboard: 1, struktur: 1, pembanding: 1, pad: 1, rekap: 1, units: 1, arsip: 1, logs: 1, users: 1 };
function rcClear() { RC = {}; }
function call(action, payload) {
  var ck = null;
  if (READ_ACTIONS[action]) {
    ck = action + '|' + JSON.stringify(payload || {});
    var hit = RC[ck];
    if (hit && Date.now() - hit.t < RC_TTL) return Promise.resolve(JSON.parse(hit.d));
  } else if (action !== 'login' && action !== 'session' && action !== 'logout') rcClear();
  return callRaw(action, payload).then(function (d) { if (ck) RC[ck] = { t: Date.now(), d: JSON.stringify(d) }; return d; });
}
function callRaw(action, payload) {
  return new Promise(function (resolve, reject) {
    var url = apiUrl();
    if (!url) { var h = location.hostname; if (h === 'localhost' || h === '127.0.0.1') url = '/api'; }
    if (!url) { reject(new Error('Alamat server belum diatur. Tekan "Atur server" pada halaman login lalu tempel URL Web App Apps Script.')); return; }
    if (!navigator.onLine) { reject(new Error('Tidak ada koneksi internet.')); return; }
    loader(1);
    var done = function (r) {
      loader(-1);
      if (r && r.ok) return resolve(r.data);
      if (r && r.expired && action !== 'login') { forceLogout(r.error); }
      reject(new Error(r ? r.error : 'Terjadi kesalahan.'));
    };
    var fail = function (e) { loader(-1); reject(new Error('Gagal terhubung ke server. Periksa koneksi atau alamat server.')); };
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 120000);
    // text/plain => "simple request": tidak memicu preflight CORS pada Apps Script
    fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: S.token, action: action, payload: payload || {} }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); }).then(function (r) { clearTimeout(to); done(r); }).catch(function (e) { clearTimeout(to); fail(e); });
  });
}

function toast(msg, err, ms) {
  var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(function () { t.remove(); }, 300); }, ms || (err ? 6000 : 3500));
}
function fail(e) { toast(esc(e && e.message ? e.message : e), true); }

/** modal({title, body, wide, buttons:[{label,cls,click(close, root)}], onOpen(root)}) */
function modal(o) {
  var m = document.createElement('div'); m.className = 'mask';
  m.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><div class="modal-h"><h3>' + esc(o.title) + '</h3>' +
    (o.noClose ? '' : '<button class="btn sq sm" data-x aria-label="Tutup">✕</button>') + '</div><div class="modal-b">' + o.body + '</div>' +
    (o.buttons && o.buttons.length ? '<div class="modal-f"></div>' : '') + '</div>';
  document.body.appendChild(m);
  var close = function () { m.remove(); };
  if (!o.noClose) { $('[data-x]', m).onclick = close; m.addEventListener('mousedown', function (e) { if (e.target === m) close(); }); }
  (o.buttons || []).forEach(function (b) {
    var el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.innerHTML = b.label;
    el.onclick = function () { b.click ? b.click(close, m, el) : close(); };
    $('.modal-f', m).appendChild(el);
  });
  if (o.onOpen) o.onOpen(m);
  var f = $('input,select,textarea', m); if (f) setTimeout(function () { f.focus(); }, 30);
  return { root: m, close: close };
}
function confirmBox(title, html, okLabel, danger) {
  return new Promise(function (res) {
    modal({ title: title, body: '<div style="line-height:1.6">' + html + '</div>', buttons: [
      { label: 'Batal', click: function (c) { c(); res(false); } },
      { label: okLabel || 'Ya, lanjutkan', cls: danger ? 'pri danger' : 'pri', click: function (c) { c(); res(true); } }] });
  });
}
function busy(btn, on, txt) { if (!btn) return; if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = txt || 'Memproses…'; } else { btn.disabled = false; btn.innerHTML = btn._t; } }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
function tokGet() { try { return localStorage.getItem('spadakes_tok') || sessionStorage.getItem('spadakes_tok'); } catch (e) { return null; } }
function tokSet(t, remember) { try { localStorage.removeItem('spadakes_tok'); sessionStorage.removeItem('spadakes_tok'); if (t) (remember ? localStorage : sessionStorage).setItem('spadakes_tok', t); } catch (e) { } }
function bootSave() { try { localStorage.setItem('spadakes_boot', JSON.stringify(S.boot)); } catch (e) { } }
function bootLoad() { try { return JSON.parse(localStorage.getItem('spadakes_boot') || 'null'); } catch (e) { return null; } }
function isMobile() { return window.matchMedia('(max-width:720px)').matches; }

/* ------------------------- icons ------------------------- */
var IC = {
  dash: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  tree: '<path d="M4 5h16M4 10h16M4 15h10M4 20h10"/>',
  imp: '<path d="M12 3v12M7 8l5-5 5 5M4 17v4h16v-4"/>',
  cmp: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  pad: '<path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  rek: '<path d="M4 4h16v16H4zM9 4v16M15 4v16M4 10h16M4 15h16"/>',
  his: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc: '<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h7"/>',
  unit: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
  acc: '<circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 4-6 7-6s6 2 7 6M17 11l2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  xls: '<path d="M6 2h9l5 5v15H6zM9 11l5 6M14 11l-5 6"/>', save: '<path d="M5 13l4 4L19 7"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  wallet: '<path d="M3 7h18v13H3zM3 7l3-4h12l3 4M16 14h2"/>', trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>', swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>', home: '<path d="M3 11l9-7 9 7v10H3z"/>'
};
function ic(n, s) { return '<svg width="' + (s || 17) + '" height="' + (s || 17) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>'; }

/* ------------------------- navigasi ------------------------- */
var PAGES = {
  dashboard: { t: 'Dashboard', crumb: 'Dashboard Pengendalian Deviasi Anggaran', ic: 'dash', grp: 'MENU UTAMA', filters: ['ta', 'per', 'jenis', 'dasar', 'unit'] },
  struktur: { t: 'Struktur Anggaran', crumb: 'Struktur Anggaran Bertingkat per Unit', ic: 'tree', grp: 'MENU UTAMA', filters: ['ta', 'per', 'jenis', 'dasar', 'unit'] },
  importPrev: { t: 'Import Data Bulan Sebelumnya', crumb: 'Import Data Bulan Sebelumnya', ic: 'imp', grp: 'MENU UTAMA', filters: ['ta', 'unit'], write: true },
  pembanding: { t: 'Pembanding', crumb: 'Pembanding Data Anggaran', ic: 'cmp', grp: 'MENU UTAMA', filters: ['ta', 'jenis', 'unit'] },
  pad: { t: 'Pendapatan PAD', crumb: 'Pendapatan Asli Daerah (PAD)', ic: 'pad', grp: 'MENU UTAMA', filters: ['ta', 'per', 'unit'] },
  rekap: { t: 'Rekapitulasi', crumb: 'Rekapitulasi Realisasi Anggaran', ic: 'rek', grp: 'MENU UTAMA', filters: ['ta', 'per', 'dasar', 'unit'] },
  riwayat: { t: 'Riwayat Aktivitas', crumb: 'Riwayat Aktivitas', ic: 'his', grp: 'MENU UTAMA', filters: [] },
  arsip: { t: 'Dokumen & Arsip', crumb: 'Dokumen & Arsip Laporan', ic: 'doc', grp: 'PENGELOLAAN', filters: [] },
  unit: { t: 'Unit Kerja', crumb: 'Unit Kerja', ic: 'unit', grp: 'PENGELOLAAN', filters: [] },
  akun: { t: 'Kontrol Akun', crumb: 'Kontrol Akun & Pengaturan', ic: 'acc', grp: 'PENGELOLAAN', filters: [], admin: true }
};

function buildNav() {
  var h = '', g = '', role = S.boot.user.role;
  Object.keys(PAGES).forEach(function (k) {
    var p = PAGES[k];
    if (p.admin && role !== 'Admin') return;
    if (p.write && role === 'Pimpinan') return;
    if (p.grp !== g) { g = p.grp; h += '<div class="nav-h">' + g + '</div>'; }
    h += '<div class="nav-a" data-p="' + k + '" tabindex="0">' + ic(p.ic) + '<span>' + p.t + '</span></div>';
  });
  $('#nav').innerHTML = h;
  $$('.nav-a').forEach(function (a) {
    a.onclick = function () { go(a.dataset.p); };
    a.onkeydown = function (e) { if (e.key === 'Enter') go(a.dataset.p); };
  });
}

function go(page) {
  if (ST.dirty && Object.keys(ST.dirty).length && S.page === 'struktur' && page !== 'struktur') {
    if (!window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman?')) return;
    ST.dirty = {};
  }
  S.page = page; store('spadakes_page', page);
  var p = PAGES[page];
  $$('.nav-a').forEach(function (a) { a.classList.toggle('on', a.dataset.p === page); });
  $('#crumb').textContent = p.t; document.title = p.t + ' | SPADAKes';
  var fs = p.filters;
  $('#filters').classList.toggle('hidden', !fs.length);
  $('#fTa').parentNode.classList.toggle('hidden', fs.indexOf('ta') < 0);
  $('#fPer').parentNode.classList.toggle('hidden', fs.indexOf('per') < 0);
  $('#flJenis').classList.toggle('hidden', fs.indexOf('jenis') < 0);
  $('#flDasar').classList.toggle('hidden', fs.indexOf('dasar') < 0);
  $('#flUnit').classList.toggle('hidden', fs.indexOf('unit') < 0);
  if (window.innerWidth <= 1024) setSide(false);
  $('#filters').classList.remove('open'); updateFSum();
  window.scrollTo(0, 0);
  render();
}

function setSide(open, persist) {
  var wide = window.innerWidth > 1024;
  if (wide) { document.body.classList.toggle('side-closed', !open); if (persist) store('spadakes_side', open ? '1' : '0'); }
  else document.body.classList.toggle('side-open', open);
  var b = $('#menuBtn'); if (b) b.setAttribute('aria-expanded', String(open));
}
function toggleSide() {
  var wide = window.innerWidth > 1024;
  var open = wide ? document.body.classList.contains('side-closed') : !document.body.classList.contains('side-open');
  setSide(open, true);
}
function updateFSum() {
  var p = PAGES[S.page]; if (!p || !p.filters.length) return;
  var a = [];
  if (p.filters.indexOf('ta') >= 0) a.push('TA ' + S.f.ta);
  if (p.filters.indexOf('per') >= 0) a.push(BULAN[S.f.periode - 1]);
  if (p.filters.indexOf('jenis') >= 0 && S.f.jenis) a.push(S.f.jenis);
  if (p.filters.indexOf('dasar') >= 0) a.push(S.f.dasar === 'murni' ? 'Pagu Murni' : 'Pagu Perubahan');
  if (p.filters.indexOf('unit') >= 0) a.push(S.f.unit === 'ALL' ? 'Semua unit' : unitShort(S.f.unit));
  $('#fSum').textContent = a.join(' · ');
}
function render() {
  updateFSum();
  var c = $('#content');
  c.innerHTML = '<div class="card card-b"><div class="skel" style="width:30%"></div><br><div class="skel"></div><br><div class="skel" style="width:70%"></div></div>';
  ({ dashboard: pgDashboard, struktur: pgStruktur, importPrev: pgImport, pembanding: pgPembanding, pad: pgPad, rekap: pgRekap, riwayat: pgRiwayat, arsip: pgArsip, unit: pgUnit, akun: pgAkun })[S.page](c);
}

/* ------------------------- filter ------------------------- */
function periodsFor(ta) { return (S.boot.periods && S.boot.periods[ta]) || []; }
function latestPeriod(ta) {
  var ps = periodsFor(ta).filter(function (p) { return p.hasData; });
  if (!ps.length) ps = periodsFor(ta);
  return ps.length ? ps[ps.length - 1].periode : (new Date().getMonth() + 1);
}
function fillFilters(keep) {
  var b = S.boot;
  if (!S.f.ta || b.tas.indexOf(Number(S.f.ta)) < 0) S.f.ta = b.tas[0] || new Date().getFullYear();
  $('#fTa').innerHTML = b.tas.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') || '<option>' + S.f.ta + '</option>';
  $('#fTa').value = S.f.ta;
  fillPeriod(keep);
  var mine = b.myUnits;
  var opts = (mine.length > 1 ? '<option value="ALL">Semua Unit</option>' : '') + b.units.filter(function (u) { return mine.indexOf(u.id) >= 0; }).map(function (u) { return '<option value="' + u.id + '">' + esc(u.nama) + '</option>'; }).join('');
  $('#fUnit').innerHTML = opts;
  if (mine.length <= 1) S.f.unit = mine[0] || 'ALL';
  $('#fUnit').value = S.f.unit; if (!$('#fUnit').value) { S.f.unit = $('#fUnit').options[0] ? $('#fUnit').options[0].value : 'ALL'; $('#fUnit').value = S.f.unit; }
  $('#fJenis').value = S.f.jenis; $('#fDasar').value = S.f.dasar;
}
function fillPeriod(keep) {
  var ps = periodsFor(S.f.ta), has = {};
  ps.forEach(function (p) { has[p.periode] = p; });
  if (!keep || !S.f.periode) S.f.periode = latestPeriod(S.f.ta);
  $('#fPer').innerHTML = BULAN.map(function (b, i) {
    var p = has[i + 1], tag = p ? (p.status === 'Terkunci' ? ' 🔒' : (p.hasData ? ' ●' : ' ○')) : '';
    return '<option value="' + (i + 1) + '">' + b + tag + '</option>';
  }).join('');
  $('#fPer').value = S.f.periode;
}
function bindFilters() {
  var guard = function (fn) { return function (e) { if (ST.dirty && Object.keys(ST.dirty).length && S.page === 'struktur' && !window.confirm('Perubahan belum disimpan akan hilang. Lanjutkan?')) { fillFilters(true); return; } ST.dirty = {}; fn(e); render(); }; };
  $('#fTa').onchange = guard(function () { S.f.ta = Number($('#fTa').value); fillPeriod(false); });
  $('#fPer').onchange = guard(function () { S.f.periode = Number($('#fPer').value); });
  $('#fJenis').onchange = guard(function () { S.f.jenis = $('#fJenis').value; });
  $('#fDasar').onchange = guard(function () { S.f.dasar = $('#fDasar').value; });
  $('#fUnit').onchange = guard(function () { S.f.unit = $('#fUnit').value; });
}
function fp() { return { ta: Number(S.f.ta), periode: Number(S.f.periode), jenis: S.f.jenis, dasar: S.f.dasar, unit: S.f.unit }; }
function dasarText() { return S.f.dasar === 'murni' ? 'Pagu Murni APBD + BLUD' : 'Pagu Perubahan APBD + BLUD'; }
function scopeText() { return S.f.unit === 'ALL' ? 'Seluruh unit kerja' : unitName(S.f.unit); }
async function refreshBoot() { S.boot = await call('session'); bootSave(); fillFilters(true); }

/* ------------------------- auth ------------------------- */
function showLogin(msg) {
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  if (msg) toast(esc(msg));
  var su = store('spadakes_user'); $('#lgRem').checked = store('spadakes_rem') !== '0';
  if (su && !$('#lgUser').value) $('#lgUser').value = su;
  setTimeout(function () { (su ? $('#lgPass') : $('#lgUser')).focus(); }, 60);
}
function forceLogout(msg) { S.token = null; tokSet(null); rcClear(); $$('.mask').forEach(function (m) { m.remove(); }); showLogin(msg); }

function enterApp(fromCache) {
  var u = S.boot.user;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#sideName').textContent = u.nama; $('#topName').textContent = u.nama;
  $('#sideRole').textContent = u.role === 'Unit' ? unitShort(u.unit) : ROLE_LABEL[u.role] + ' Provinsi';
  $('#topRole').textContent = ROLE_LABEL[u.role] || u.role;
  $('#sideAv').textContent = $('#topAv').textContent = initials(u.nama);
  buildNav(); fillFilters(false);
  var pg = store('spadakes_page');
  go(PAGES[pg] && (!PAGES[pg].admin || u.role === 'Admin') ? pg : 'dashboard');
  if (u.mustChange && !fromCache) passwordModal(true);
}

function passwordModal(forced) {
  modal({
    title: forced ? 'Ganti Password Awal' : 'Ganti Password', noClose: forced,
    body: (forced ? '<p style="margin-top:0;color:var(--muted)">Demi keamanan, silakan ganti password bawaan sebelum menggunakan aplikasi.</p>' : '') +
      '<div class="fg"><label>Password lama</label><input class="txt" type="password" id="pwOld" autocomplete="current-password"></div>' +
      '<div class="fg"><label>Password baru</label><input class="txt" type="password" id="pwNew" autocomplete="new-password"><div class="hint">Minimal 8 karakter, kombinasi huruf dan angka.</div></div>' +
      '<div class="fg"><label>Ulangi password baru</label><input class="txt" type="password" id="pwNew2" autocomplete="new-password"></div>',
    buttons: (forced ? [] : [{ label: 'Batal' }]).concat([{ label: 'Simpan Password', cls: 'pri', click: function (close, m, btn) {
      var a = $('#pwOld', m).value, b = $('#pwNew', m).value, c = $('#pwNew2', m).value;
      if (b !== c) return toast('Konfirmasi password tidak sama.', true);
      busy(btn, true);
      call('changePassword', { lama: a, baru: b }).then(function () { close(); S.boot.user.mustChange = false; bootSave(); toast('Password berhasil diganti.'); }).catch(fail).then(function () { busy(btn, false); });
    } }])
  });
}

/* ===================================================================== *
 *  CHART (SVG ringan, tanpa library)
 * ===================================================================== */
function niceStep(max, n) { var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function bindTips(el) {
  var tip = $('#tip');
  $$('[data-tip]', el).forEach(function (n) {
    n.addEventListener('mousemove', function (e) { tip.innerHTML = n.getAttribute('data-tip'); tip.classList.remove('hidden'); var x = e.clientX + 14, y = e.clientY + 14; if (x + 300 > innerWidth) x = e.clientX - 260; tip.style.left = x + 'px'; tip.style.top = y + 'px'; });
    n.addEventListener('mouseleave', function () { tip.classList.add('hidden'); });
  });
}
function chartBars(el, o) { // o:{labels, series:[{name,color,values}], height}
  var W = el.clientWidth || 700, H = o.height || 300, pl = 64, pr = 12, pt = 14, pb = 34;
  var max = 0; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) max = Math.max(max, v); }); });
  if (!max) { el.innerHTML = '<div class="empty"><b>Belum ada data</b>Isi realisasi dan anggaran kas untuk melihat tren.</div>'; return; }
  var step = niceStep(max, 4), top = Math.ceil(max / step) * step, cw = (W - pl - pr) / o.labels.length, bw = Math.min(26, cw / (o.series.length + 1.2));
  var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '">';
  for (var t = 0; t <= top + 1; t += step) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="#ece9e0" ' + (t ? 'stroke-dasharray="3 4"' : '') + '/><text x="' + (pl - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end" font-size="11" fill="#7a8781">' + short(t) + '</text>';
  o.labels.forEach(function (lb, i) {
    var cx = pl + cw * i + cw / 2, tot = o.series.length * bw + (o.series.length - 1) * 4;
    o.series.forEach(function (sr, j) {
      var v = sr.values[i]; if (v == null) return;
      var x = cx - tot / 2 + j * (bw + 4), yy = y(v), h = Math.max(1, H - pb - yy);
      s += '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + h + '" rx="4" fill="' + sr.color + '" data-tip="<b>' + esc(lb) + '</b><br>' + esc(sr.name) + ': ' + rp(v) + (sr.extra ? '<br>' + sr.extra[i] : '') + '"/>';
    });
    s += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#7a8781">' + esc(lb) + '</text>';
  });
  el.innerHTML = s + '</svg>'; bindTips(el);
}
function chartDevBars(el, items, amb) { // horizontal diverging bars
  if (!items.length) { el.innerHTML = '<div class="empty"><b>Belum ada data</b></div>'; return; }
  var W = el.clientWidth || 400, rowH = 34, pl = 118, pr = 70, H = items.length * rowH + 30;
  var lim = Math.max(amb * 2, Math.ceil(Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); })) / 10) * 10);
  var x = function (v) { return pl + (W - pl - pr) * ((v + lim) / (2 * lim)); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '">';
  s += '<rect x="' + x(-amb) + '" y="0" width="' + (x(amb) - x(-amb)) + '" height="' + (H - 22) + '" fill="#e6f4ec" opacity=".7"/>';
  [-lim, -amb, 0, amb, lim].forEach(function (v) { s += '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="0" y2="' + (H - 22) + '" stroke="' + (v ? '#d9d5c9' : '#9aa6a0') + '" ' + (v && Math.abs(v) === amb ? 'stroke-dasharray="4 4"' : '') + '/><text x="' + x(v) + '" y="' + (H - 6) + '" font-size="10.5" fill="#7a8781" text-anchor="middle">' + (v > 0 ? '+' : '') + v + '%</text>'; });
  items.forEach(function (it, i) {
    var yy = i * rowH + 7, bad = Math.abs(it.value) > amb, c = bad ? '#c03a2b' : '#1e8a5a', x0 = x(0), x1 = x(it.value);
    s += '<text x="' + (pl - 10) + '" y="' + (yy + 15) + '" text-anchor="end" font-size="11.5" font-weight="600" fill="#3d4c46">' + esc(it.label) + '</text>';
    s += '<rect x="' + Math.min(x0, x1) + '" y="' + yy + '" width="' + Math.max(2, Math.abs(x1 - x0)) + '" height="20" rx="5" fill="' + c + '" data-tip="<b>' + esc(it.full || it.label) + '</b><br>Deviasi: ' + pct(it.value) + (it.extra ? '<br>' + it.extra : '') + '"/>';
    s += '<text x="' + (W - 2) + '" y="' + (yy + 14.5) + '" font-size="11.5" font-weight="800" fill="' + c + '" text-anchor="end">' + pct(it.value) + '</text>';
  });
  el.innerHTML = s + '</svg>'; bindTips(el);
}
function chartLine(el, labels, vals, amb) {
  var pts = vals.map(function (v, i) { return v == null ? null : { i: i, v: v }; }).filter(Boolean);
  if (!pts.length) { el.innerHTML = '<div class="empty"><b>Belum ada data</b></div>'; return; }
  var W = el.clientWidth || 400, H = 250, pl = 44, pr = 14, pt = 14, pb = 30;
  var lim = Math.max(amb * 2, Math.ceil(Math.max.apply(null, pts.map(function (p) { return Math.abs(p.v); })) / 5) * 5 + 5);
  var X = function (i) { return pl + (W - pl - pr) * (i + .5) / labels.length; }, Y = function (v) { return pt + (H - pt - pb) * (lim - v) / (2 * lim); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '">';
  s += '<rect x="' + pl + '" y="' + Y(amb) + '" width="' + (W - pl - pr) + '" height="' + (Y(-amb) - Y(amb)) + '" fill="#e6f4ec" opacity=".75"/>';
  [lim, amb, 0, -amb, -lim].forEach(function (v) { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v ? '#e3dfd4' : '#9aa6a0') + '" ' + (Math.abs(v) === amb ? 'stroke-dasharray="4 4"' : '') + '/><text x="' + (pl - 8) + '" y="' + (Y(v) + 4) + '" font-size="10.5" fill="#7a8781" text-anchor="end">' + v + '%</text>'; });
  labels.forEach(function (l, i) { s += '<text x="' + X(i) + '" y="' + (H - 9) + '" font-size="10.5" fill="#7a8781" text-anchor="middle">' + l + '</text>'; });
  s += '<polyline fill="none" stroke="#245c50" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (p) { return X(p.i) + ',' + Y(p.v); }).join(' ') + '"/>';
  pts.forEach(function (p) { var bad = Math.abs(p.v) > amb; s += '<circle cx="' + X(p.i) + '" cy="' + Y(p.v) + '" r="6" fill="' + (bad ? '#c03a2b' : '#1e8a5a') + '" stroke="#fff" stroke-width="2.5" data-tip="<b>' + BULAN[p.i] + '</b><br>Deviasi: ' + pct(p.v) + '"/>'; });
  el.innerHTML = s + '</svg>'; bindTips(el);
}
function chartDonut(el, parts, center) {
  var tot = parts.reduce(function (a, p) { return a + p.value; }, 0), R = 70, r = 48, cx = 90, cy = 90, a0 = -Math.PI / 2;
  var s = '<svg viewBox="0 0 180 180" width="170" height="170">';
  if (!tot) s += '<circle cx="90" cy="90" r="' + ((R + r) / 2) + '" fill="none" stroke="#eee" stroke-width="' + (R - r) + '"/>';
  parts.forEach(function (p) {
    if (!p.value) return;
    var a1 = a0 + 2 * Math.PI * p.value / tot - 0.0001, lg = a1 - a0 > Math.PI ? 1 : 0;
    var P = function (a, rr) { return (cx + rr * Math.cos(a)) + ' ' + (cy + rr * Math.sin(a)); };
    s += '<path d="M' + P(a0, R) + ' A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + P(a1, R) + ' L' + P(a1, r) + ' A' + r + ' ' + r + ' 0 ' + lg + ' 0 ' + P(a0, r) + 'Z" fill="' + p.color + '" data-tip="<b>' + esc(p.label) + '</b><br>' + rp(p.value) + ' (' + pct(pctOf(p.value, tot)) + ')"/>';
    a0 = a1 + 0.0001;
  });
  s += '<text x="90" y="86" text-anchor="middle" font-size="11" fill="#7a8781">' + esc(center[0]) + '</text><text x="90" y="104" text-anchor="middle" font-size="15" font-weight="800" fill="#16251f">' + esc(center[1]) + '</text></svg>';
  el.innerHTML = s; bindTips(el);
}

/* ===================================================================== *
 *  DASHBOARD
 * ===================================================================== */
var _dash = null;
async function pgDashboard(c) {
  try { _dash = await call('dashboard', fp()); } catch (e) { c.innerHTML = '<div class="card empty"><b>Gagal memuat</b>' + esc(e.message) + '</div>'; return; }
  var d = _dash, k = d.kpi, amb = d.ambang, nU = d.perUnit.length;
  var bad = Math.abs(k.dev) > amb;
  c.innerHTML =
    '<div class="pg-head"><div><div class="eyebrow">Executive Overview</div><h2>Dashboard Pengendalian Deviasi Anggaran</h2></div><div class="sp"></div>' +
    '<span class="pill gold">Ambang deviasi ±' + amb + '%</span></div>' +
    '<div class="ctx"><span><b>' + esc(scopeText()) + '</b> · Tahun Anggaran ' + d.ta + ' · Status s/d <b>' + BULAN[d.periode - 1] + '</b> · Dasar: ' + dasarText() + (S.f.jenis ? ' · Jenis: ' + S.f.jenis : '') + ' · ' + d.unitFilled + '/' + nU + ' unit sudah mengisi</span>' +
    '<span class="legend-dev"><span><i class="dot" style="background:var(--ok)"></i>Deviasi ≤ ' + amb + '%</span><span><i class="dot" style="background:var(--bad)"></i>Deviasi &gt; ' + amb + '%</span></span></div>' +
    '<div class="kpis">' +
    kpi('Total Pagu Dasar', k.pagu, 'APBD ' + short(k.pagu_apbd) + ' · BLUD ' + short(k.pagu_blud), 'wallet', '#eef5f2', 'var(--forest-600)') +
    kpi('Total Realisasi', k.real, '<b>' + pct(k.realPct) + '</b> dari pagu dasar<div class="bar"><i style="width:' + Math.min(100, k.realPct) + '%"></i></div>', 'trend', '#eef2f8', 'var(--murni)') +
    kpi('Sisa Anggaran', k.sisa, 'Pagu dasar dikurangi realisasi', 'rek', '#fbf5e7', 'var(--perub)') +
    kpi('Pendapatan PAD', d.pad.real, d.pad.target ? pct(pctOf(d.pad.real, d.pad.target)) + ' dari target ' + short(d.pad.target) : 'Belum ada target PAD', 'pad', '#f2eef8', '#6c4fa3') +
    '<div class="card kpi ' + (bad ? 'dev-bad' : 'dev-ok') + '" style="--tint:' + (bad ? '#fbe9e6' : '#e6f4ec') + ';--tc:' + (bad ? 'var(--bad)' : 'var(--ok)') + '"><span class="ic">' + ic('swap', 20) + '</span><small>Deviasi</small><div class="v num">' + pct(k.dev) + '</div><div class="full">Real ' + pct(k.realPct) + ' − Angkas ' + pct(k.angkasPct) + '</div><div class="s">' + (bad ? 'Melebihi' : 'Dalam') + ' ambang ' + amb + '%</div></div>' +
    '</div>' +
    '<div class="grid2"><div class="card"><div class="card-h"><div><h3>Tren Realisasi &amp; Anggaran Kas</h3><p>Nilai kumulatif per bulan pada TA ' + d.ta + '</p></div><div class="sp"></div><div class="lgd"><span><i style="background:#245c50"></i>Realisasi</span><span><i style="background:#d8bb7f"></i>Angkas s/d</span></div></div><div class="card-b"><div id="chTrend"></div></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Status Unit Kerja</h3><p>Pemantauan pengisian ' + BULAN[d.periode - 1] + '</p></div><div class="sp"></div><span class="pill mut">' + nU + ' unit</span></div><div class="card-b ulist">' +
    d.perUnit.map(function (u) {
      return '<div class="uitem"><div class="uic">' + ic('home', 16) + '</div><div style="min-width:0"><b>' + esc(u.nama) + '</b><small>' + (u.filled ? 'Realisasi ' + pct(u.realPct) + ' · Angkas ' + pct(u.angkasPct) : 'Belum mengisi anggaran pada periode ini.') + '</small></div>' +
        '<div class="r"><span class="pill ' + (u.filled ? 'ok' : 'bad') + '">' + (u.filled ? 'SUDAH MENGISI' : 'BELUM MENGISI') + '</span>' + (u.filled ? devPill(u.dev) : '<small>0,00%</small>') + '</div></div>';
    }).join('') + '</div></div></div>' +
    '<div class="grid3"><div class="card"><div class="card-h"><div><h3>Deviasi per Unit Kerja</h3><p>Area hijau = dalam ambang ±' + amb + '%</p></div></div><div class="card-b"><div id="chDev"></div></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Tren Deviasi Bulanan</h3><p>% Realisasi − % Angkas Kas</p></div></div><div class="card-b"><div id="chLine"></div></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Komposisi Pagu &amp; PAD</h3><p>APBD vs BLUD, capaian pendapatan</p></div></div><div class="card-b"><div style="display:flex;align-items:center;gap:16px"><div id="chDonut"></div><div class="lgd" style="flex-direction:column;align-items:flex-start;gap:10px"><span><i style="background:#2f6fb0"></i>APBD<br><b class="num">' + short(k.pagu_apbd) + '</b></span><span><i style="background:#2a8a85"></i>BLUD<br><b class="num">' + short(k.pagu_blud) + '</b></span></div></div>' +
    '<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px"><b>Realisasi PAD</b><span class="num">' + short(d.pad.real) + ' / ' + short(d.pad.target) + '</span></div><div class="progress"><i style="width:' + Math.min(100, pctOf(d.pad.real, d.pad.target)) + '%;background:linear-gradient(90deg,#c8a45c,#d8bb7f)"></i></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:6px"><span>Capaian ' + pct(pctOf(d.pad.real, d.pad.target)) + '</span><span>Angkas ' + pct(pctOf(d.pad.angkas, d.pad.target)) + '</span></div></div></div></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Kegiatan dengan Deviasi Terbesar</h3><p>Prioritas pengendalian periode ' + BULAN[d.periode - 1] + '</p></div></div><div class="card-b" style="padding-top:8px">' +
    (d.topDev.length ? '<table class="t"><thead><tr><th class="l">Unit</th><th class="l">Kode</th><th class="l">Kegiatan</th><th>Pagu</th><th>Realisasi</th><th>% Real</th><th>% Angkas</th><th class="c">Deviasi</th></tr></thead><tbody>' +
      d.topDev.map(function (x) { return '<tr><td class="l">' + esc(x.unit) + '</td><td class="l num">' + esc(x.kode) + '</td><td class="l" style="white-space:normal;min-width:260px">' + esc(x.uraian) + '</td><td>' + rp(x.pagu) + '</td><td>' + rp(x.real) + '</td><td>' + pct(x.realPct) + '</td><td>' + pct(x.angkasPct) + '</td><td class="c">' + devPill(x.dev) + '</td></tr>'; }).join('') + '</tbody></table>'
      : '<div class="empty"><b>Belum ada data</b></div>') + '</div></div>';
  drawDash();
}
function kpi(t, v, s, icn, tint, tc) { return '<div class="card kpi" style="--tint:' + tint + ';--tc:' + tc + '"><span class="ic">' + ic(icn, 20) + '</span><small>' + t + '</small><div class="v num">Rp ' + short(v) + '</div><div class="full" title="' + esc(rp(v)) + '">' + rp(v) + '</div><div class="s">' + s + '</div></div>'; }
function drawDash() {
  if (!_dash || S.page !== 'dashboard' || !$('#chTrend')) return;
  var d = _dash, ab = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  chartBars($('#chTrend'), { labels: ab, height: 300, series: [
    { name: 'Realisasi', color: '#245c50', values: d.months.map(function (m) { return m.has ? m.real : null; }), extra: d.months.map(function (m) { return m.has ? 'Realisasi ' + pct(m.realPct) + ' · Deviasi ' + pct(m.dev) : ''; }) },
    { name: 'Angkas s/d', color: '#d8bb7f', values: d.months.map(function (m) { return m.has ? m.angkas : null; }) }] });
  chartDevBars($('#chDev'), d.perUnit.filter(function (u) { return u.filled; }).map(function (u) { return { label: u.singkatan, full: u.nama, value: u.dev, extra: 'Realisasi ' + pct(u.realPct) + ' · Angkas ' + pct(u.angkasPct) }; }), d.ambang);
  chartLine($('#chLine'), ab, d.months.map(function (m) { return m.has ? m.dev : null; }), d.ambang);
  chartDonut($('#chDonut'), [{ label: 'APBD', value: d.kpi.pagu_apbd, color: '#2f6fb0' }, { label: 'BLUD', value: d.kpi.pagu_blud, color: '#2a8a85' }], ['Total Pagu', short(d.kpi.pagu)]);
}
var _rz; window.addEventListener('resize', function () { clearTimeout(_rz); _rz = setTimeout(drawDash, 200); });

/* ===================================================================== *
 *  STRUKTUR ANGGARAN
 * ===================================================================== */
var ST = { paint: 0, data: null, idx: {}, kids: {}, open: {}, mode: 'real', q: '', dirty: {} };
var MODES = [{ k: 'murni', l: 'Pagu Murni', c: 'var(--murni)' }, { k: 'perub', l: 'Pagu Perubahan', c: 'var(--perub)' }, { k: 'real', l: 'Realisasi & Angkas Kas', c: 'var(--forest-600)' }, { k: 'view', l: 'Lihat Saja', c: '#9aa6a0' }];

async function pgStruktur(c) {
  var d;
  try { d = await call('struktur', fp()); } catch (e) { c.innerHTML = '<div class="card empty"><b>Gagal memuat</b>' + esc(e.message) + '</div>'; return; }
  ST.data = d; ST.dirty = {}; ST.idx = {}; ST.kids = {};
  d.units.forEach(function (u) { var id = 'U:' + u.id; ST.idx[id] = { id: id, unit: u.id, level: 'unit', kode: '', uraian: u.nama, t: u.t }; ST.kids[id] = []; if (ST.open[id] === undefined) ST.open[id] = true; });
  d.nodes.forEach(function (n) {
    ST.idx[n.id] = n; ST.kids[n.id] = [];
    var p = n.parentId ? n.parentId : 'U:' + n.unit;
    (ST.kids[p] = ST.kids[p] || []).push(n.id); n._p = p;
  });
  var admin = S.boot.user.role === 'Admin', anyW = Object.keys(d.writable).some(function (k) { return d.writable[k]; });
  if (!anyW) ST.mode = 'view';
  var lastDay = new Date(d.ta, d.periode, 0).getDate();
  c.innerHTML =
    '<div class="pg-head"><div><div class="eyebrow">Data Anggaran</div><h2>Struktur Anggaran Bertingkat per Unit</h2></div><div class="sp"></div>' +
    (admin ? '<button class="btn" id="btPer">' + ic('cal', 15) + 'Periode &amp; TA</button>' : '') +
    (anyW ? '<button class="btn pri" id="btSave" disabled>' + ic('save', 15) + 'Simpan Perubahan</button>' : '') +
    '<button class="btn gold" id="btXls">' + ic('xls', 15) + 'Ekspor Excel</button></div>' +
    '<div class="card">' +
    (d.status === 'Terkunci' ? '<div class="lockbar">' + ic('lock', 15) + 'Periode ' + BULAN[d.periode - 1] + ' ' + d.ta + ' terkunci' + (admin ? ' — Anda tetap dapat mengubah sebagai administrator.' : ' — data hanya dapat dilihat.') + '</div>' : '') +
    '<div class="card-h"><div><h3>Struktur Anggaran</h3><p>' + (S.f.jenis || 'Semua Anggaran') + ' · ' + dasarText() + ' · Status s/d ' + lastDay + ' ' + BULAN[d.periode - 1] + ' ' + d.ta + '</p></div><div class="sp"></div>' +
    '<div class="search">' + ic('search', 15) + '<input id="stQ" placeholder="Cari kode, program, kegiatan, sub kegiatan…" value="' + esc(ST.q) + '"></div>' +
    '<button class="btn" id="btOpen">Buka Semua</button><button class="btn" id="btClose">Tutup Semua</button></div>' +
    '<div class="mode-bar"><span style="font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--muted)">MODE PENGISIAN</span><div class="seg" id="seg">' +
    MODES.map(function (m) { return '<button data-m="' + m.k + '"' + (!anyW && m.k !== 'view' ? ' disabled style="opacity:.45"' : '') + '><i style="background:' + m.c + '"></i>' + m.l + '</button>'; }).join('') + '</div>' +
    '<span style="font-size:12px;color:var(--muted)" id="modeHint"></span><div style="flex:1"></div><span class="dirty hidden" id="dirty"></span></div>' +
    '<div class="tbl-wrap" id="stWrap" style="max-height:calc(100vh - 330px)"><table class="st" id="st"></table></div></div>';
  $('#seg').onclick = function (e) { var b = e.target.closest('button[data-m]'); if (!b || b.disabled) return; ST.mode = b.dataset.m; drawStruktur(); };
  var qt; $('#stQ').oninput = function () { clearTimeout(qt); qt = setTimeout(function () { ST.q = $('#stQ').value.trim(); drawStruktur(); }, 180); };
  $('#btOpen').onclick = function () { Object.keys(ST.idx).forEach(function (k) { if (ST.idx[k].level !== 'sub') ST.open[k] = true; }); drawStruktur(); };
  $('#btClose').onclick = function () { Object.keys(ST.idx).forEach(function (k) { ST.open[k] = ST.idx[k].level === 'unit'; }); drawStruktur(); };
  if ($('#btSave')) $('#btSave').onclick = saveStruktur;
  if ($('#btPer')) $('#btPer').onclick = periodModal;
  $('#btXls').onclick = function () { exportExcel(this); };
  drawStruktur();
}

function canEditField(n, f) {
  if (!n.leaf || !ST.data.writable[n.unit] || ST.mode === 'view') return false;
  if (f === 'murni') return ST.mode === 'murni' && n.jenis === 'APBD';
  if (f === 'perubahan') return ST.mode === 'perub' && n.jenis === 'APBD';
  if (f === 'blud') return (ST.mode === 'murni' || ST.mode === 'perub') && n.jenis === 'BLUD';
  return ST.mode === 'real' && (f === 'realisasi' || f === 'angkas');
}

function recalc() { // hitung ulang agregat di sisi klien (sama dengan server)
  var dasar = S.f.dasar === 'murni' ? 'murni' : 'perubahan', z = function () { return { murni: 0, perub: 0, blud: 0, pagu: 0, real: 0, angkas: 0 }; };
  Object.keys(ST.idx).forEach(function (k) { if (!ST.idx[k].leaf) ST.idx[k].t = z(); });
  var tot = z(), order = ST.data.nodes.slice().reverse();
  order.forEach(function (n) {
    if (n.leaf) {
      var r = n.raw || { murni: 0, perubahan: '', blud: 0, realisasi: 0, angkas: 0 }, t = z();
      if (n.jenis === 'BLUD') { t.blud = n0(r.blud); t.pagu = t.blud; }
      else { t.murni = n0(r.murni); t.perub = r.perubahan === '' || r.perubahan == null ? t.murni : n0(r.perubahan); t.pagu = dasar === 'murni' ? t.murni : t.perub; }
      t.real = n0(r.realisasi); t.angkas = n0(r.angkas); n.t = t;
    }
    var p = ST.idx[n._p]; if (p) for (var k in n.t) if (p.t[k] !== undefined) p.t[k] += n.t[k];
  });
  ST.data.units.forEach(function (u) { var t = ST.idx['U:' + u.id].t; for (var k in tot) tot[k] += t[k]; });
  ST.total = tot;
}

function visibleIds() {
  var out = [], q = ST.q.toLowerCase(), keep = null;
  if (q) {
    keep = {};
    Object.keys(ST.idx).forEach(function (k) {
      var n = ST.idx[k];
      if (n.level === 'unit') return;
      if ((n.kode + ' ' + n.uraian).toLowerCase().indexOf(q) >= 0) { var x = n; while (x) { keep[x.id] = true; x = ST.idx[x._p]; } }
    });
  }
  var walk = function (id) {
    if (keep && !keep[id]) return;
    out.push(id);
    if (keep || ST.open[id]) (ST.kids[id] || []).forEach(walk);
  };
  ST.data.units.forEach(function (u) { walk('U:' + u.id); });
  return out;
}

function cellNum(n, f, val, cls) {
  if (n.leaf && canEditField(n, f)) {
    var raw = n.raw[f], ph = f === 'perubahan' ? 'title="Kosongkan bila tidak ada perubahan (mengikuti pagu murni)" placeholder="' + fmtN(n.raw.murni) + '"' : 'placeholder="0"';
    var warn = (f === 'realisasi' && n0(n.raw.realisasi) > n.t.pagu && n.t.pagu > 0) ? ' warn' : '';
    return '<td class="' + cls + '"><input class="ni' + (ST.dirty[n.id] && ST.dirty[n.id][f] ? ' chg' : '') + warn + '" data-id="' + n.id + '" data-f="' + f + '" inputmode="decimal" ' + ph + ' value="' + (raw === '' || raw == null ? '' : fmtN(raw)) + '"></td>';
  }
  return '<td class="' + cls + '" data-c="' + f + '">' + val + '</td>';
}

function rowHtml(id) {
  var n = ST.idx[id], t = n.t, lv = n.level, rp_ = pctOf(t.real, t.pagu), ap = pctOf(t.angkas, t.pagu), dv = rp_ - ap;
  var depth = { unit: 0, program: 1, kegiatan: 2, sub: 3 }[lv], hasK = (ST.kids[id] || []).length;
  var tg = lv === 'sub' ? '<span class="tg ph"></span>' : '<span class="tg" data-tg="' + id + '">' + (ST.open[id] || ST.q ? '−' : '+') + '</span>';
  var lvlName = { unit: 'Unit', program: 'Program', kegiatan: 'Kegiatan', sub: 'Sub Keg.' }[lv];
  var tree = '<div class="tree" style="padding-left:' + depth * 18 + 'px">' + tg + '<span class="lvl ' + lv + '">' + lvlName + '</span>' + (n.kode ? '<span class="kd">' + esc(n.kode) + '</span>' : '') + '<span class="ur" title="' + esc(n.uraian) + '">' + esc(n.uraian) + '</span></div>';
  var w = ST.data.writable[n.unit];
  var isA = !n.leaf || n.jenis === 'APBD', isB = !n.leaf || n.jenis === 'BLUD';
  var perubTxt = n.leaf && n.jenis === 'APBD' && (n.raw.perubahan === '' || n.raw.perubahan == null) ? '<span class="na" title="Belum ada perubahan — mengikuti pagu murni">' + rp(t.perub) + '</span>' : rp(t.perub);
  var acts = '';
  if (w && lv !== 'sub') acts += '<button class="ab" data-add="' + id + '" title="Tambah ' + ({ unit: 'program', program: 'kegiatan', kegiatan: 'sub kegiatan' }[lv]) + '">' + ic('plus', 14) + '</button>';
  if (w && lv !== 'unit') acts += '<button class="ab" data-ed="' + id + '" title="Ubah / hapus">' + ic('edit', 14) + '</button>';
  return '<tr class="lv-' + lv + '" data-row="' + id + '">' +
    '<td class="sticky">' + tree + '</td>' +
    '<td class="c">' + (n.leaf ? '<span class="jn ' + n.jenis + '">' + n.jenis + '</span>' : '') + '</td>' +
    (isA ? cellNum(n, 'murni', rp(t.murni), 'col-murni sep-m') : '<td class="col-murni sep-m na">—</td>') +
    (isA ? cellNum(n, 'perubahan', perubTxt, 'col-perub sep-p') : '<td class="col-perub sep-p na">—</td>') +
    (isB ? cellNum(n, 'blud', n.leaf || t.blud ? rp(t.blud) : '<span class="na">—</span>', 'col-blud sep-b') : '<td class="col-blud sep-b na">—</td>') +
    '<td class="sep" data-c="pagu"><b>' + rp(t.pagu) + '</b></td>' +
    cellNum(n, 'realisasi', rp(t.real), 'col-real sep') +
    '<td data-c="sisa">' + rp(t.pagu - t.real) + '</td><td data-c="rp">' + pct(rp_) + '</td>' +
    cellNum(n, 'angkas', rp(t.angkas), 'col-real sep') +
    '<td data-c="ap">' + pct(ap) + '</td><td class="c sep" data-c="dev">' + devPill(dv) + '</td>' +
    '<td><div class="acts">' + acts + '</div></td></tr>';
}

function drawStruktur() {
  recalc();
  var d = ST.data, ids = visibleIds(), mode = ST.mode, mon = BULAN[d.periode - 1].toUpperCase();
  $$('#seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === mode); });
  $('#modeHint').textContent = { murni: 'Isi kolom biru: pagu murni APBD (dan pagu BLUD untuk sub kegiatan BLUD).', perub: 'Isi kolom emas: pagu perubahan APBD. Kosongkan bila tidak berubah.', real: 'Isi realisasi dan anggaran kas kumulatif s/d ' + BULAN[d.periode - 1] + '.', view: 'Mode baca — tidak ada isian.' }[mode];
  var tb = $('#st');
  tb.className = 'st m-' + (mode === 'perub' ? 'perub' : mode);
  var head = '<colgroup><col class="c-u"><col class="c-j"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-n"><col class="c-p"><col class="c-n"><col class="c-p"><col class="c-d"><col class="c-a"></colgroup>' +
    '<thead><tr class="g"><th class="sticky l" rowspan="2" style="top:0;text-align:left;padding-left:16px">Struktur / Uraian</th><th rowspan="2" class="c" style="top:0">Jenis</th>' +
    '<th class="g-murni h-murni sep-m">Pagu Murni</th><th class="g-perub h-perub sep-p">Pagu Perubahan</th><th class="g-blud sep-b">BLUD</th><th class="sep">Dasar</th>' +
    '<th colspan="3" class="g-real h-real sep">Realisasi</th><th colspan="2" class="g-gold sep">Anggaran Kas</th><th rowspan="2" class="c sep" style="top:0">Deviasi</th><th rowspan="2" class="c" style="top:0">Aksi</th></tr>' +
    '<tr class="h"><th class="g-murni h-murni sep-m">APBD</th><th class="g-perub h-perub sep-p">APBD</th><th class="g-blud sep-b">Pagu BLUD</th><th class="sep">Pagu Dipakai</th>' +
    '<th class="h-real sep">Realisasi</th><th>Sisa Anggaran</th><th>Real. %</th><th class="sep">S/D ' + mon + '</th><th>Angkas %</th></tr></thead>';
  var T = ST.total, rr = pctOf(T.real, T.pagu), aa = pctOf(T.angkas, T.pagu);
  var FIRST = 120, rest = ids.length > FIRST ? ids.slice(FIRST) : [];
  var body = ids.length ? ids.slice(0, FIRST).map(rowHtml).join('') : '<tr><td colspan="13" class="l"><div class="empty"><b>Tidak ada data</b>' + (ST.q ? 'Tidak ditemukan hasil untuk “' + esc(ST.q) + '”.' : 'Belum ada struktur anggaran untuk filter ini.') + '</div></td></tr>';
  var foot = '<tfoot><tr><td class="sticky l">JUMLAH ' + (S.f.unit === 'ALL' ? 'SELURUH UNIT' : esc(unitShort(S.f.unit))) + '</td><td></td><td class="sep-m">' + rp(T.murni) + '</td><td class="sep-p">' + rp(T.perub) + '</td><td class="sep-b">' + rp(T.blud) + '</td><td class="sep">' + rp(T.pagu) + '</td><td class="sep">' + rp(T.real) + '</td><td>' + rp(T.pagu - T.real) + '</td><td>' + pct(rr) + '</td><td class="sep">' + rp(T.angkas) + '</td><td>' + pct(aa) + '</td><td class="c sep">' + devPill(rr - aa) + '</td><td></td></tr></tfoot>';
  tb.innerHTML = head + '<tbody>' + body + '</tbody>' + foot;
  updateDirty();
  var tk = ++ST.paint, at = 0, bd = tb.tBodies[0];
  (function more() { // sisa baris digambar bertahap agar layar tidak membeku
    if (tk !== ST.paint || at >= rest.length) return;
    var chunk = rest.slice(at, at + 150); at += 150;
    bd.insertAdjacentHTML('beforeend', chunk.map(rowHtml).join(''));
    setTimeout(more, 16);
  })();
}

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-tg]'); if (t && S.page === 'struktur') { var id = t.dataset.tg; ST.open[id] = !ST.open[id]; if (ST.q) { ST.q = ''; $('#stQ').value = ''; ST.open[id] = true; } drawStruktur(); return; }
  var a = e.target.closest('[data-add]'); if (a) return nodeModal('add', a.dataset.add);
  var ed = e.target.closest('[data-ed]'); if (ed) return nodeModal('edit', ed.dataset.ed);
});
document.addEventListener('focusin', function (e) {
  if (e.target.classList && e.target.classList.contains('ni')) { var v = parseNum(e.target.value); e.target.value = v === '' || isNaN(v) ? '' : String(v).replace('.', ','); setTimeout(function () { e.target.select(); }, 0); }
});
document.addEventListener('focusout', function (e) {
  if (!(e.target.classList && e.target.classList.contains('ni'))) return;
  var el = e.target, n = ST.idx[el.dataset.id], f = el.dataset.f, v = parseNum(el.value);
  if (isNaN(v)) { toast('Angka tidak valid: ' + esc(el.value), true); v = n.raw[f]; }
  if (v === '' && f !== 'perubahan') v = 0;
  el.value = v === '' ? '' : fmtN(v);
  if (String(n.raw[f]) === String(v)) return;
  n.raw[f] = v;
  ST.dirty[n.id] = ST.dirty[n.id] || {}; ST.dirty[n.id][f] = true;
  el.classList.add('chg');
  recalc(); refreshCells(n.id);
  updateDirty();
});
document.addEventListener('keydown', function (e) {
  if (e.target.classList && e.target.classList.contains('ni') && e.key === 'Enter') {
    var all = $$('.ni'), i = all.indexOf(e.target), same = all.filter(function (x) { return x.dataset.f === e.target.dataset.f; }), j = same.indexOf(e.target);
    var nx = same[j + (e.shiftKey ? -1 : 1)]; if (nx) nx.focus(); else e.target.blur();
    e.preventDefault();
  }
});
function refreshCells(id) { // perbarui angka baris ini & seluruh induknya tanpa merender ulang tabel
  var x = ST.idx[id], chain = [];
  while (x) { chain.push(x.id); x = ST.idx[x._p]; }
  chain.forEach(function (cid) {
    var tr = document.querySelector('tr[data-row="' + cid + '"]'); if (!tr) return;
    var tmp = document.createElement('tbody'); tmp.innerHTML = rowHtml(cid);
    var nr = tmp.firstChild;
    $$('td', nr).forEach(function (td, i) { var old = tr.children[i]; if (old && !old.querySelector('input')) old.innerHTML = td.innerHTML; else if (old) { var inp = old.querySelector('input'), ni = td.querySelector('input'); if (inp && ni) inp.className = ni.className; } });
  });
  var T = ST.total, rr = pctOf(T.real, T.pagu), aa = pctOf(T.angkas, T.pagu), f = $$('#st tfoot td');
  if (f.length) { f[2].innerHTML = rp(T.murni); f[3].innerHTML = rp(T.perub); f[4].innerHTML = rp(T.blud); f[5].innerHTML = rp(T.pagu); f[6].innerHTML = rp(T.real); f[7].innerHTML = rp(T.pagu - T.real); f[8].innerHTML = pct(rr); f[9].innerHTML = rp(T.angkas); f[10].innerHTML = pct(aa); f[11].innerHTML = devPill(rr - aa); }
}
function updateDirty() {
  var n = Object.keys(ST.dirty).length, el = $('#dirty'), b = $('#btSave');
  if (el) { el.classList.toggle('hidden', !n); el.textContent = n + ' sub kegiatan belum disimpan'; }
  if (b) b.disabled = !n;
}
window.addEventListener('beforeunload', function (e) { if (Object.keys(ST.dirty || {}).length) { e.preventDefault(); e.returnValue = ''; } });

async function saveStruktur() {
  var ids = Object.keys(ST.dirty); if (!ids.length) return;
  var btn = $('#btSave'); busy(btn, true, 'Menyimpan…');
  var items = ids.map(function (id) { var r = ST.idx[id].raw; return { id: id, murni: r.murni, perubahan: r.perubahan, blud: r.blud, realisasi: r.realisasi, angkas: r.angkas }; });
  try {
    var r = await call('saveNilai', { ta: ST.data.ta, periode: ST.data.periode, items: items });
    ST.dirty = {}; toast('Tersimpan: ' + r.saved + ' sub kegiatan.');
    await refreshBoot(); render();
  } catch (e) { fail(e); busy(btn, false); }
}

function nodeModal(kind, id) {
  var n = ST.idx[id]; if (!n) return;
  var child = { unit: 'program', program: 'kegiatan', kegiatan: 'sub' }[n.level];
  var lvName = { program: 'Program', kegiatan: 'Kegiatan', sub: 'Sub Kegiatan' };
  var isAdd = kind === 'add', level = isAdd ? child : n.level;
  var kodeVal = isAdd ? (n.kode ? n.kode + '.' : '1.02.') : n.kode;
  var jenisDef = isAdd ? (n.level === 'kegiatan' && /BLUD/i.test(n.uraian) ? 'BLUD' : 'APBD') : n.jenis;
  var body = '<div class="ctx" style="margin-bottom:16px"><span>Unit: <b>' + esc(unitName(n.unit)) + '</b>' + (isAdd && n.level !== 'unit' ? '<br>Induk: <b>' + esc(n.kode + ' · ' + n.uraian) + '</b>' : '') + '</span></div>' +
    '<div class="fg"><label>Kode ' + lvName[level] + '</label><input class="txt" id="nKode" value="' + esc(kodeVal) + '" placeholder="contoh 1.02.01.1.01.0001"><div class="hint">Format angka dipisah titik.</div></div>' +
    '<div class="fg"><label>Uraian / Nama ' + lvName[level] + '</label><textarea id="nUr" placeholder="Nama ' + lvName[level].toLowerCase() + '">' + (isAdd ? '' : esc(n.uraian)) + '</textarea></div>' +
    (level === 'sub' ? '<div class="fg"><label>Sumber / Jenis Anggaran</label><select class="sel" id="nJenis"><option value="APBD">APBD (pagu murni &amp; perubahan)</option><option value="BLUD">BLUD (pagu BLUD)</option></select></div>' : '');
  var btns = [{ label: 'Batal' }];
  if (!isAdd) btns.unshift({ label: 'Hapus', cls: 'danger', click: async function (close) {
    if (!(await confirmBox('Hapus ' + lvName[n.level], 'Hapus <b>' + esc(n.kode + ' ' + n.uraian) + '</b>? Data yang dihapus tidak tampil lagi pada struktur dan laporan.', 'Hapus', true))) return;
    try { await call('deleteNode', { id: n.id }); close(); toast('Data dihapus.'); render(); } catch (e) { fail(e); }
  } });
  btns.push({ label: isAdd ? 'Tambah' : 'Simpan', cls: 'pri', click: async function (close, m, btn) {
    var p = { kode: $('#nKode', m).value.trim(), uraian: $('#nUr', m).value.trim(), jenis: $('#nJenis', m) ? $('#nJenis', m).value : 'APBD' };
    busy(btn, true);
    try {
      if (isAdd) { await call('addNode', Object.assign(p, { ta: ST.data.ta, unit: n.unit, level: level, parentId: n.level === 'unit' ? '' : n.id })); ST.open[id] = true; }
      else await call('updateNode', Object.assign(p, { id: n.id }));
      close(); toast(isAdd ? lvName[level] + ' ditambahkan.' : 'Perubahan disimpan.'); render();
    } catch (e) { fail(e); busy(btn, false); }
  } });
  modal({ title: (isAdd ? 'Tambah ' : 'Ubah ') + lvName[level], body: body, buttons: btns, onOpen: function (m) { if ($('#nJenis', m)) $('#nJenis', m).value = jenisDef; } });
}

async function exportExcel(btn) {
  busy(btn, true, 'Menyiapkan Excel…');
  try {
    var r = await call('exportExcel', fp());
    download(r.base64, r.name);
    toast('Excel siap: <b>' + esc(r.name) + '</b>' + (r.url ? '<br><a href="' + esc(r.url) + '" target="_blank" rel="noopener">Buka salinan di Google Drive</a>' : ''), false, 8000);
  } catch (e) { fail(e); }
  busy(btn, false);
}
function download(b64, name) {
  var bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  var url = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function periodModal() {
  var ta = Number(S.f.ta), ps = periodsFor(ta), has = {};
  ps.forEach(function (p) { has[p.periode] = p; });
  var free = BULAN.map(function (b, i) { return i + 1; }).filter(function (i) { return !has[i]; });
  var body = '<div class="tabs"><button class="on" data-t="p">Periode Baru</button><button data-t="s">Status Periode</button><button data-t="ta">Tahun Anggaran Baru</button></div>' +
    '<div data-pane="p"><div class="row2"><div class="fg"><label>Tahun Anggaran</label><input class="txt" value="' + ta + '" disabled></div>' +
    '<div class="fg"><label>Bulan / Periode</label><select class="sel" id="pBul">' + free.map(function (i) { return '<option value="' + i + '">' + BULAN[i - 1] + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="row2"><div class="fg"><label>Salin data dari</label><select class="sel" id="pFrom"><option value="">— Kosong (tidak menyalin) —</option>' + ps.map(function (p) { return '<option value="' + p.periode + '">' + BULAN[p.periode - 1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label>Yang disalin</label><select class="sel" id="pMode"><option value="pagu">Pagu saja (realisasi &amp; angkas = 0)</option><option value="all">Pagu + realisasi + angkas</option></select></div></div>' +
    '<div class="hint" style="font-size:12px;color:var(--muted)">Struktur program/kegiatan/sub kegiatan berlaku untuk seluruh periode dalam satu TA.</div></div>' +
    '<div data-pane="s" class="hidden"><table class="t"><thead><tr><th class="l">Periode</th><th class="l">Data</th><th class="l">Status</th><th class="c">Aksi</th></tr></thead><tbody>' +
    (ps.length ? ps.map(function (p) { return '<tr><td class="l"><b>' + BULAN[p.periode - 1] + ' ' + ta + '</b></td><td class="l">' + (p.hasData ? '<span class="pill ok">ADA DATA</span>' : '<span class="pill mut">KOSONG</span>') + '</td><td class="l">' + (p.status === 'Terkunci' ? '<span class="pill bad">TERKUNCI</span>' : '<span class="pill ok">TERBUKA</span>') + '</td><td class="c"><button class="btn sm" data-lock="' + p.periode + '" data-st="' + (p.status === 'Terkunci' ? 'Terbuka' : 'Terkunci') + '">' + (p.status === 'Terkunci' ? 'Buka Kunci' : 'Kunci') + '</button></td></tr>'; }).join('') : '<tr><td colspan="4"><div class="empty">Belum ada periode.</div></td></tr>') +
    '</tbody></table><div class="hint" style="font-size:12px;color:var(--muted);margin-top:10px">Periode terkunci hanya dapat diubah oleh administrator.</div></div>' +
    '<div data-pane="ta" class="hidden"><div class="row2"><div class="fg"><label>Tahun anggaran baru</label><input class="txt" id="tNew" type="number" value="' + ((S.boot.tas[0] || ta) + 1) + '"></div>' +
    '<div class="fg"><label>Salin struktur dari TA</label><select class="sel" id="tFrom"><option value="">— Kosong —</option>' + S.boot.tas.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') + '</select></div></div>' +
    '<label class="chk"><input type="checkbox" id="tPagu" checked> Salin pagu terakhir sebagai pagu murni awal (Januari)</label></div>';
  var tab = 'p';
  var mm = modal({ title: 'Periode & Tahun Anggaran', wide: true, body: body, buttons: [{ label: 'Tutup' }, { label: 'Buat', cls: 'pri', click: async function (close, m, btn) {
    busy(btn, true);
    try {
      if (tab === 'p') {
        if (!$('#pBul', m).value) throw new Error('Semua bulan sudah dibuat.');
        var r = await call('createPeriod', { ta: ta, periode: Number($('#pBul', m).value), copyFrom: Number($('#pFrom', m).value || 0), copyMode: $('#pMode', m).value });
        S.f.periode = Number($('#pBul', m).value); toast('Periode dibuat' + (r.copied ? ' · ' + r.copied + ' sub kegiatan disalin' : '') + '.');
      } else if (tab === 'ta') {
        var t = Number($('#tNew', m).value), r2 = await call('createTA', { ta: t, fromTa: Number($('#tFrom', m).value || 0), copyPagu: $('#tPagu', m).checked });
        S.f.ta = t; S.f.periode = 1; toast('TA ' + t + ' dibuat (' + r2.nodes + ' baris struktur).');
      } else { close(); return; }
      close(); await refreshBoot(); fillFilters(true); render();
    } catch (e) { fail(e); busy(btn, false); }
  } }], onOpen: function (m) {
    $$('.tabs button', m).forEach(function (b) { b.onclick = function () { tab = b.dataset.t; $$('.tabs button', m).forEach(function (x) { x.classList.toggle('on', x === b); }); $$('[data-pane]', m).forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== tab); }); $('.modal-f .pri', m).classList.toggle('hidden', tab === 's'); }; });
    $$('[data-lock]', m).forEach(function (b) { b.onclick = async function () { try { await call('setPeriodStatus', { ta: ta, periode: Number(b.dataset.lock), status: b.dataset.st }); mm.close(); await refreshBoot(); toast('Status periode diperbarui.'); render(); periodModal(); } catch (e) { fail(e); } }; });
  } });
}

/* ===================================================================== *
 *  IMPORT DATA BULAN SEBELUMNYA
 * ===================================================================== */
function pgImport(c) {
  var ta = Number(S.f.ta), ps = periodsFor(ta).filter(function (p) { return p.hasData; });
  var last = ps.length ? ps[ps.length - 1].periode : 1, to = Math.min(12, last + 1);
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Pengisian Cepat</div><h2>Import Data Bulan Sebelumnya</h2></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Salin data periode</h3><p>Salin pagu (dan bila perlu realisasi &amp; anggaran kas) dari bulan sebelumnya ke bulan tujuan untuk ' + esc(scopeText()) + ' · TA ' + ta + '.</p></div></div><div class="card-b">' +
    '<div class="steps"><div class="stepbox"><small>SUMBER</small><div class="fg" style="margin:10px 0 0"><select class="sel" id="iFrom" style="width:100%">' + (ps.length ? ps.map(function (p) { return '<option value="' + p.periode + '"' + (p.periode === last ? ' selected' : '') + '>' + BULAN[p.periode - 1] + ' ' + ta + '</option>'; }).join('') : '<option value="">Belum ada periode berisi data</option>') + '</select></div></div>' +
    '<div class="arrow">' + ic('imp', 28).replace('M12 3v12M7 8l5-5 5 5M4 17v4h16v-4', 'M5 12h14M13 6l6 6-6 6') + '</div>' +
    '<div class="stepbox"><small>TUJUAN</small><div class="fg" style="margin:10px 0 0"><select class="sel" id="iTo" style="width:100%">' + BULAN.map(function (b, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === to ? ' selected' : '') + '>' + b + ' ' + ta + '</option>'; }).join('') + '</select></div></div></div>' +
    '<div class="row2" style="margin-top:20px"><div class="fg"><label>Data yang disalin</label><select class="sel" id="iMode"><option value="pagu">Pagu saja — realisasi &amp; angkas diisi 0</option><option value="all">Pagu + realisasi + anggaran kas (angka kumulatif)</option></select></div>' +
    '<div class="fg"><label>Jika data tujuan sudah ada</label><select class="sel" id="iOw"><option value="0">Lewati (jangan timpa)</option><option value="1">Timpa dengan data sumber</option></select></div></div>' +
    '<div style="display:flex;gap:10px"><button class="btn" id="iChk">Cek Data</button><button class="btn pri" id="iRun">' + ic('imp', 15) + 'Proses Import</button></div>' +
    '<div id="iRes"></div></div></div>';
  var pay = function () { return { ta: ta, from: Number($('#iFrom').value), to: Number($('#iTo').value), mode: $('#iMode').value, overwrite: $('#iOw').value === '1', unit: S.f.unit }; };
  $('#iChk').onclick = async function () {
    try { var r = await call('importPrev', Object.assign(pay(), { dryRun: true }));
      $('#iRes').innerHTML = '<div class="stat"><div><b class="num">' + r.sumber + '</b><small>sub kegiatan berisi data di sumber</small></div><div><b class="num">' + r.sudahAda + '</b><small>sudah ada di tujuan</small></div><div><b class="num">' + r.unit + '</b><small>unit kerja diproses</small></div></div>';
    } catch (e) { fail(e); }
  };
  $('#iRun').onclick = async function () {
    var p = pay();
    if (!(await confirmBox('Proses import', 'Salin data <b>' + BULAN[p.from - 1] + '</b> → <b>' + BULAN[p.to - 1] + ' ' + ta + '</b> (' + (p.mode === 'all' ? 'pagu + realisasi + angkas' : 'pagu saja') + ', ' + (p.overwrite ? 'menimpa' : 'tanpa menimpa') + ' data yang sudah ada)?'))) return;
    var b = this; busy(b, true);
    try { var r = await call('importPrev', p); toast('Import selesai: ' + r.copied + ' disalin, ' + r.skipped + ' dilewati.'); await refreshBoot();
      $('#iRes').innerHTML = '<div class="stat"><div><b class="num">' + r.copied + '</b><small>baris disalin</small></div><div><b class="num">' + r.skipped + '</b><small>dilewati</small></div><div><b class="num">' + r.pad + '</b><small>baris PAD baru</small></div></div>';
    } catch (e) { fail(e); }
    busy(b, false);
  };
}

/* ===================================================================== *
 *  PEMBANDING
 * ===================================================================== */
var PB = { mode: 'periode', level: 'program', a: null, b: null };
async function pgPembanding(c) {
  var ta = Number(S.f.ta), ps = periodsFor(ta);
  if (!PB.a || !ps.some(function (p) { return p.periode === PB.a; })) PB.a = ps.length > 1 ? ps[ps.length - 2].periode : (ps[0] ? ps[0].periode : 1);
  if (!PB.b || !ps.some(function (p) { return p.periode === PB.b; })) PB.b = ps.length ? ps[ps.length - 1].periode : 1;
  var opt = function (sel) { return ps.map(function (p) { return '<option value="' + p.periode + '"' + (p.periode === sel ? ' selected' : '') + '>' + BULAN[p.periode - 1] + '</option>'; }).join(''); };
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Analisis</div><h2>Pembanding Data Anggaran</h2></div></div>' +
    '<div class="card"><div class="mode-bar"><div class="seg" id="pbMode"><button data-m="periode">Antar Periode</button><button data-m="pagu">Pagu Murni vs Perubahan</button></div>' +
    '<div class="fl"><label id="lbA">Periode A</label><select class="sel" id="pbA">' + opt(PB.a) + '</select></div>' +
    '<div class="fl" id="flB"><label>Periode B</label><select class="sel" id="pbB">' + opt(PB.b) + '</select></div>' +
    '<div class="fl" id="flD"><label>Dasar</label><select class="sel" id="pbD"><option value="perubahan">Pagu Perubahan</option><option value="murni">Pagu Murni</option></select></div>' +
    '<div style="flex:1"></div><div class="seg" id="pbLv"><button data-l="unit">Unit</button><button data-l="program">Program</button><button data-l="kegiatan">Kegiatan</button><button data-l="sub">Sub Kegiatan</button></div></div>' +
    '<div id="pbOut"><div class="card-b"><div class="skel"></div></div></div></div>';
  $('#pbD').value = S.f.dasar;
  var seg = function () { $$('#pbMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === PB.mode); }); $$('#pbLv button').forEach(function (b) { b.classList.toggle('on', b.dataset.l === PB.level); }); $('#flB').classList.toggle('hidden', PB.mode === 'pagu'); $('#flD').classList.toggle('hidden', PB.mode === 'pagu'); $('#lbA').textContent = PB.mode === 'pagu' ? 'Periode' : 'Periode A'; };
  $('#pbMode').onclick = function (e) { var b = e.target.closest('button'); if (b) { PB.mode = b.dataset.m; seg(); load(); } };
  $('#pbLv').onclick = function (e) { var b = e.target.closest('button'); if (b) { PB.level = b.dataset.l; seg(); draw(); } };
  $('#pbA').onchange = function () { PB.a = Number(this.value); load(); }; $('#pbB').onchange = function () { PB.b = Number(this.value); load(); }; $('#pbD').onchange = load;
  seg();
  var data = null;
  async function load() {
    try { data = await call('pembanding', { ta: ta, mode: PB.mode, a: Number($('#pbA').value), b: Number($('#pbB').value), dasar: $('#pbD').value, unit: S.f.unit, jenis: S.f.jenis }); draw(); }
    catch (e) { $('#pbOut').innerHTML = '<div class="empty"><b>Gagal memuat</b>' + esc(e.message) + '</div>'; }
  }
  function draw() {
    if (!data) return;
    var lv = { unit: 0, program: 1, kegiatan: 2, sub: 3 }, max = lv[PB.level];
    var rows = data.rows.filter(function (r) { return lv[r.level] <= max; });
    var dlt = function (v, inv) { var cls = v > 0 ? (inv ? 'var(--bad)' : 'var(--ok)') : v < 0 ? (inv ? 'var(--ok)' : 'var(--bad)') : 'var(--muted)'; return '<span style="color:' + cls + ';font-weight:700">' + (v > 0 ? '+' : '') + fmtN(v) + '</span>'; };
    var dev = function (t) { return pctOf(t.real, t.pagu) - pctOf(t.angkas, t.pagu); };
    var head, line;
    if (data.mode === 'pagu') {
      head = '<tr><th class="l">Uraian</th><th>Pagu Murni</th><th>Pagu Perubahan</th><th>Selisih</th><th>% Perubahan</th><th>Realisasi</th><th class="c">Deviasi (Murni)</th><th class="c">Deviasi (Perubahan)</th></tr>';
      line = function (r) { var d0 = r.b.pagu - r.a.pagu; return '<td>' + rp(r.a.pagu) + '</td><td>' + rp(r.b.pagu) + '</td><td>' + dlt(d0) + '</td><td>' + pct(pctOf(d0, r.a.pagu)) + '</td><td>' + rp(r.a.real) + '</td><td class="c">' + devPill(dev(r.a)) + '</td><td class="c">' + devPill(dev(r.b)) + '</td>'; };
    } else {
      head = '<tr><th class="l">Uraian</th><th>Pagu ' + esc(data.labelA) + '</th><th>Pagu ' + esc(data.labelB) + '</th><th>Realisasi ' + esc(data.labelA) + '</th><th>Realisasi ' + esc(data.labelB) + '</th><th>Δ Realisasi</th><th>Angkas ' + esc(data.labelB) + '</th><th class="c">Deviasi ' + esc(data.labelA) + '</th><th class="c">Deviasi ' + esc(data.labelB) + '</th><th>Δ Deviasi</th></tr>';
      line = function (r) { var dd = dev(r.b) - dev(r.a); return '<td>' + rp(r.a.pagu) + '</td><td>' + rp(r.b.pagu) + '</td><td>' + rp(r.a.real) + '</td><td>' + rp(r.b.real) + '</td><td>' + dlt(r.b.real - r.a.real) + '</td><td>' + rp(r.b.angkas) + '</td><td class="c">' + devPill(dev(r.a)) + '</td><td class="c">' + devPill(dev(r.b)) + '</td><td><b style="color:' + (dd >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (dd > 0 ? '+' : '') + pct(dd) + '</b></td>'; };
    }
    var body = rows.map(function (r) {
      var pad = lv[r.level] * 18;
      return '<tr' + (r.level === 'unit' ? ' class="grp-row"' : '') + '><td class="l" style="white-space:normal;min-width:340px;padding-left:' + (12 + pad) + 'px">' + (r.kode ? '<span class="num" style="color:var(--muted);font-weight:700;margin-right:8px">' + esc(r.kode) + '</span>' : '') + esc(r.uraian) + '</td>' + line(r) + '</tr>';
    }).join('');
    $('#pbOut').innerHTML = '<div class="tbl-wrap"><table class="t"><thead>' + head + '</thead><tbody>' + (body || '<tr><td colspan="10"><div class="empty">Tidak ada data.</div></td></tr>') + '</tbody><tfoot><tr><td class="l">JUMLAH</td>' + line(data.total) + '</tr></tfoot></table></div>';
  }
  load();
}

/* ===================================================================== *
 *  PAD
 * ===================================================================== */
async function pgPad(c) {
  var d; try { d = await call('pad', fp()); } catch (e) { c.innerHTML = '<div class="card empty"><b>Gagal memuat</b>' + esc(e.message) + '</div>'; return; }
  var anyW = d.rows.some(function (r) { return r.writable; });
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Pendapatan</div><h2>Pendapatan Asli Daerah (PAD)</h2></div><div class="sp"></div>' + (anyW ? '<button class="btn pri" id="pdSave">' + ic('save', 15) + 'Simpan PAD</button>' : '') + '</div>' +
    '<div class="ctx"><span>Per tanggal <b>' + new Date(d.ta, d.periode, 0).getDate() + ' ' + BULAN[d.periode - 1] + ' ' + d.ta + '</b> · Isian target, realisasi pendapatan, dan anggaran kas pendapatan (kumulatif).</span></div>' +
    '<div class="card"><div class="tbl-wrap" style="max-height:none"><table class="t" id="pdT"><thead><tr><th class="l">Unit</th><th>Target Pendapatan</th><th>Realisasi Pendapatan</th><th>+/-</th><th>% Realisasi</th><th>Anggaran Kas</th><th>% Angkas</th><th class="c">Deviasi</th></tr></thead><tbody></tbody><tfoot></tfoot></table></div></div>';
  if (!d.rows.length) { $('#pdT tbody').innerHTML = '<tr><td colspan="8"><div class="empty"><b>Tidak ada unit dengan PAD</b>Atur “Nama PAD” pada menu Unit Kerja.</div></td></tr>'; return; }
  var inp = function (r, f) { return r.writable ? '<input class="ni" style="min-width:150px" data-u="' + r.unit + '" data-f="' + f + '" value="' + fmtN(r[f]) + '">' : rp(r[f]); };
  function draw() {
    $('#pdT tbody').innerHTML = d.rows.map(function (r) { var rr = pctOf(r.realisasi, r.target), aa = pctOf(r.angkas, r.target); return '<tr><td class="l"><b>' + esc(r.nama) + '</b>' + (r.filled ? '' : ' <span class="pill mut">BELUM DIISI</span>') + '</td><td>' + inp(r, 'target') + '</td><td>' + inp(r, 'realisasi') + '</td><td>' + rp(r.realisasi - r.target) + '</td><td>' + pct(rr) + '</td><td>' + inp(r, 'angkas') + '</td><td>' + pct(aa) + '</td><td class="c">' + devPill(rr - aa) + '</td></tr>'; }).join('');
    var T = d.rows.reduce(function (a, r) { a.t += r.target; a.r += r.realisasi; a.a += r.angkas; return a; }, { t: 0, r: 0, a: 0 }), rr = pctOf(T.r, T.t), aa = pctOf(T.a, T.t);
    $('#pdT tfoot').innerHTML = '<tr><td class="l">JUMLAH</td><td>' + rp(T.t) + '</td><td>' + rp(T.r) + '</td><td>' + rp(T.r - T.t) + '</td><td>' + pct(rr) + '</td><td>' + rp(T.a) + '</td><td>' + pct(aa) + '</td><td class="c">' + devPill(rr - aa) + '</td></tr>';
    $$('#pdT input').forEach(function (el) { el.onchange = function () { var v = parseNum(el.value); if (isNaN(v) || v === '') v = 0; d.rows.filter(function (r) { return r.unit === el.dataset.u; })[0][el.dataset.f] = v; d._dirty = true; draw(); }; });
  }
  draw();
  if ($('#pdSave')) $('#pdSave').onclick = async function () {
    var b = this; busy(b, true);
    try { await call('savePad', { ta: d.ta, periode: d.periode, items: d.rows.filter(function (r) { return r.writable; }).map(function (r) { return { unit: r.unit, target: r.target, realisasi: r.realisasi, angkas: r.angkas }; }) }); toast('Data PAD tersimpan.'); await refreshBoot(); render(); }
    catch (e) { fail(e); busy(b, false); }
  };
}

/* ===================================================================== *
 *  REKAP
 * ===================================================================== */
async function pgRekap(c) {
  var d; try { d = await call('rekap', fp()); } catch (e) { c.innerHTML = '<div class="card empty"><b>Gagal memuat</b>' + esc(e.message) + '</div>'; return; }
  var tgl = new Date(d.ta, d.periode, 0).getDate() + ' ' + BULAN[d.periode - 1] + ' ' + d.ta;
  var tr = function (r, padMode) { return '<tr><td class="l"><b>' + esc(r.nama) + '</b></td><td>' + rp(r.pagu) + '</td><td>' + rp(r.real) + '</td><td>' + rp(padMode ? r.real - r.pagu : r.pagu - r.real) + '</td><td>' + pct(r.realPct) + '</td><td>' + rp(r.angkas) + '</td><td>' + pct(r.angkasPct) + '</td><td class="c">' + devPill(r.dev) + '</td></tr>'; };
  var ft = function (r, padMode) { return '<tr><td class="l">JUMLAH</td><td>' + rp(r.pagu) + '</td><td>' + rp(r.real) + '</td><td>' + rp(padMode ? r.real - r.pagu : r.pagu - r.real) + '</td><td>' + pct(r.realPct) + '</td><td>' + rp(r.angkas) + '</td><td>' + pct(r.angkasPct) + '</td><td class="c">' + devPill(r.dev) + '</td></tr>'; };
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Laporan</div><h2>Rekapitulasi Realisasi Anggaran</h2></div><div class="sp"></div><button class="btn gold" id="rkX">' + ic('xls', 15) + 'Ekspor Excel</button></div>' +
    '<div class="ctx"><span><b>Realisasi Anggaran ' + esc(S.boot.cfg.instansi) + ' TA ' + d.ta + '</b> · Per tanggal ' + tgl + ' · Dasar: ' + dasarText() + '</span></div>' +
    '<div class="card" style="margin-bottom:20px"><div class="card-h"><div><h3>Realisasi Belanja per Unit</h3><p>APBD dan BLUD dipisah sesuai format rekap</p></div></div><div class="card-b" style="padding-top:10px"><table class="t"><thead><tr><th class="l">Unit</th><th>Pagu</th><th>Realisasi</th><th>Sisa Anggaran</th><th>% Realisasi</th><th>Anggaran Kas</th><th>% Angkas</th><th class="c">Deviasi (%)</th></tr></thead><tbody>' +
    d.rows.map(function (r) { return tr(r); }).join('') + '</tbody><tfoot>' + ft(d.total) + '</tfoot></table></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Pendapatan Asli Daerah (PAD)</h3><p>Per tanggal ' + tgl + '</p></div></div><div class="card-b" style="padding-top:10px"><table class="t"><thead><tr><th class="l">Unit</th><th>Target Pendapatan</th><th>Realisasi Pendapatan</th><th>+/-</th><th>% Realisasi</th><th>Anggaran Kas</th><th>% Angkas</th><th class="c">Deviasi (%)</th></tr></thead><tbody>' +
    (d.padRows.length ? d.padRows.map(function (r) { return tr(r, true); }).join('') : '<tr><td colspan="8"><div class="empty">Belum ada data PAD.</div></td></tr>') + '</tbody><tfoot>' + ft(d.padTotal, true) + '</tfoot></table></div></div>';
  $('#rkX').onclick = function () { exportExcel(this); };
}

/* ===================================================================== *
 *  RIWAYAT, ARSIP, UNIT, AKUN
 * ===================================================================== */
async function pgRiwayat(c) {
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Audit Trail</div><h2>Riwayat Aktivitas</h2></div><div class="sp"></div><div class="search">' + ic('search', 15) + '<input id="lgQ" placeholder="Cari pengguna atau aktivitas…"></div></div><div class="card"><div id="lgOut"></div></div>';
  async function load() {
    try { var rows = await call('logs', { q: $('#lgQ').value, limit: 400 });
      $('#lgOut').innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th class="l" style="width:170px">Waktu</th><th class="l" style="width:170px">Pengguna</th><th class="l" style="width:220px">Aktivitas</th><th class="l">Detail</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (r) { return '<tr><td class="l num">' + esc(r.ts) + '</td><td class="l"><b>' + esc(r.user) + '</b></td><td class="l">' + esc(r.aksi) + '</td><td class="l" style="white-space:normal">' + esc(r.detail) + '</td></tr>'; }).join('') : '<tr><td colspan="4"><div class="empty">Belum ada aktivitas.</div></td></tr>') + '</tbody></table></div>';
    } catch (e) { fail(e); }
  }
  var t; $('#lgQ').oninput = function () { clearTimeout(t); t = setTimeout(load, 300); };
  load();
}

async function pgArsip(c) {
  var rows; try { rows = await call('arsip'); } catch (e) { return fail(e); }
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Arsip</div><h2>Dokumen &amp; Arsip Laporan</h2></div><div class="sp"></div><button class="btn gold" id="arX">' + ic('xls', 15) + 'Buat Laporan Excel</button></div>' +
    '<div class="ctx"><span>Setiap ekspor Excel otomatis tersimpan di folder Google Drive <b>“SPADAKes - Arsip Laporan”</b>. Laporan baru dibuat sesuai filter: TA ' + S.f.ta + ', ' + BULAN[S.f.periode - 1] + ', ' + dasarText() + ', ' + esc(scopeText()) + '.</span></div>' +
    '<div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th class="l">Nama Dokumen</th><th class="l">TA / Periode</th><th class="l">Dibuat oleh</th><th class="l">Waktu</th><th class="c">Berkas</th></tr></thead><tbody>' +
    (rows.length ? rows.map(function (r) { return '<tr><td class="l"><span class="pill ok" style="margin-right:8px">XLSX</span><b>' + esc(r.nama) + '</b></td><td class="l">' + esc(r.ta) + ' · ' + (BULAN[Number(r.periode) - 1] || '') + '</td><td class="l">' + esc(r.user) + '</td><td class="l num">' + esc(r.ts) + '</td><td class="c">' + (r.url ? '<a class="btn sm" href="' + esc(r.url) + '" target="_blank" rel="noopener">Buka di Drive</a>' : '<span class="na">—</span>') + '</td></tr>'; }).join('') : '<tr><td colspan="5"><div class="empty"><b>Belum ada arsip</b>Klik “Buat Laporan Excel” untuk membuat laporan pertama.</div></td></tr>') + '</tbody></table></div></div>';
  $('#arX').onclick = async function () { await exportExcel(this); render(); };
}

async function pgUnit(c) {
  var rows; try { rows = await call('units'); } catch (e) { return fail(e); }
  var admin = S.boot.user.role === 'Admin';
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Organisasi</div><h2>Unit Kerja</h2></div><div class="sp"></div>' + (admin ? '<button class="btn pri" id="unAdd">' + ic('plus', 15) + 'Tambah Unit</button>' : '') + '</div>' +
    '<div class="ucards">' + rows.map(function (u) {
      return '<div class="card ucard"><div style="display:flex;gap:12px;align-items:flex-start"><div class="uic" style="width:42px;height:42px;border-radius:11px;background:var(--gold-50);border:1px solid var(--gold-100);color:var(--gold-500);display:grid;place-items:center;flex:none">' + ic('unit', 20) + '</div><div style="flex:1;min-width:0"><h4>' + esc(u.nama) + '</h4><small style="color:var(--muted)">Kode ' + esc(u.id) + ' · Singkatan rekap: ' + esc(u.singkatan) + '</small></div>' + (admin ? '<button class="ab" data-un="' + u.id + '">' + ic('edit', 14) + '</button>' : '') + '</div>' +
        '<div class="meta">' + (u.aktif ? '<span class="pill ok">AKTIF</span>' : '<span class="pill bad">NONAKTIF</span>') + '<span class="pill ' + (u.punyaBLUD ? 'gold' : 'mut') + '">' + (u.punyaBLUD ? 'APBD + BLUD' : 'APBD') + '</span>' + (u.padNama ? '<span class="pill gold">PAD</span>' : '') + '</div>' +
        '<div style="display:flex;gap:20px;font-size:12.5px;color:var(--muted)"><span><b class="num" style="color:var(--ink);font-size:16px">' + u.node + '</b> sub kegiatan</span><span><b class="num" style="color:var(--ink);font-size:16px">' + u.akun + '</b> akun</span></div></div>';
    }).join('') + '</div>';
  var edit = function (u) {
    u = u || { id: '', nama: '', singkatan: '', punyaBLUD: false, padNama: '', aktif: true };
    modal({ title: u.id ? 'Ubah Unit Kerja' : 'Tambah Unit Kerja', body:
      '<div class="fg"><label>Nama unit kerja</label><input class="txt" id="uNm" value="' + esc(u.nama) + '"></div>' +
      '<div class="row2"><div class="fg"><label>Singkatan (untuk rekap)</label><input class="txt" id="uSg" value="' + esc(u.singkatan) + '" placeholder="mis. RSUD BANTEN"></div><div class="fg"><label>Nama pada tabel PAD</label><input class="txt" id="uPd" value="' + esc(u.padNama) + '" placeholder="kosongkan bila tidak ada PAD"></div></div>' +
      '<label class="chk"><input type="checkbox" id="uBl"' + (u.punyaBLUD ? ' checked' : '') + '> Unit memiliki anggaran BLUD (rekap dipisah APBD / BLUD)</label>' +
      '<label class="chk"><input type="checkbox" id="uAk"' + (u.aktif ? ' checked' : '') + '> Unit aktif</label>',
      buttons: [{ label: 'Batal' }, { label: 'Simpan', cls: 'pri', click: async function (close, m, btn) {
        busy(btn, true);
        try { await call('saveUnit', { id: u.id, nama: $('#uNm', m).value, singkatan: $('#uSg', m).value, padNama: $('#uPd', m).value, punyaBLUD: $('#uBl', m).checked, aktif: $('#uAk', m).checked }); close(); toast('Unit kerja disimpan.'); await refreshBoot(); render(); }
        catch (e) { fail(e); busy(btn, false); }
      } }] });
  };
  if ($('#unAdd')) $('#unAdd').onclick = function () { edit(); };
  $$('[data-un]').forEach(function (b) { b.onclick = function () { edit(rows.filter(function (r) { return r.id === b.dataset.un; })[0]); }; });
}

async function pgAkun(c) {
  var rows; try { rows = await call('users'); } catch (e) { return fail(e); }
  var cfg = S.boot.cfg, uopts = S.boot.units.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nama) + '</option>'; }).join('');
  c.innerHTML = '<div class="pg-head"><div><div class="eyebrow">Keamanan</div><h2>Kontrol Akun &amp; Pengaturan</h2></div><div class="sp"></div><button class="btn pri" id="acAdd">' + ic('plus', 15) + 'Tambah Akun</button></div>' +
    '<div class="grid2" style="grid-template-columns:minmax(0,2.4fr) minmax(280px,1fr)"><div class="card"><div class="card-h"><div><h3>Daftar Akun</h3><p>' + rows.length + ' akun terdaftar · Admin: semua akses · Operator Unit: unitnya saja · Pimpinan: hanya melihat</p></div></div><div class="card-b" style="padding-top:10px"><div class="tbl-wrap" style="max-height:560px"><table class="t"><thead><tr><th class="l">Pengguna</th><th class="l">Role</th><th class="l">Unit</th><th class="l">Login terakhir</th><th class="c">Status</th><th class="c">Aksi</th></tr></thead><tbody>' +
    rows.map(function (r) { return '<tr><td class="l"><div style="display:flex;gap:10px;align-items:center"><div class="av" style="width:32px;height:32px;font-size:11px">' + initials(r.nama) + '</div><div><b>' + esc(r.nama) + '</b><br><small style="color:var(--muted)">@' + esc(r.username) + '</small></div></div></td><td class="l">' + (ROLE_LABEL[r.role] || r.role) + '</td><td class="l">' + (r.unit ? esc(unitShort(r.unit)) : '<span class="na">Semua</span>') + '</td><td class="l num">' + esc(String(r.lastLogin || '—').slice(0, 16)) + '</td><td class="c">' + (r.aktif ? '<span class="pill ok">AKTIF</span>' : '<span class="pill bad">NONAKTIF</span>') + '</td><td class="c"><div class="acts"><button class="ab" data-ue="' + esc(r.username) + '" title="Ubah">' + ic('edit', 14) + '</button><button class="ab" data-ur="' + esc(r.username) + '" title="Reset password">' + ic('lock', 14) + '</button></div></td></tr>'; }).join('') +
    '</tbody></table></div></div></div>' +
    '<div class="card"><div class="card-h"><div><h3>Pengaturan Aplikasi</h3><p>Berlaku untuk seluruh pengguna</p></div></div><div class="card-b">' +
    '<div class="fg"><label>Nama instansi</label><input class="txt" id="cfIn" value="' + esc(cfg.instansi) + '"></div>' +
    '<div class="fg"><label>Ambang deviasi (%)</label><input class="txt" id="cfAm" type="number" step="0.5" value="' + esc(cfg.ambang) + '"><div class="hint">Deviasi di atas ambang ditandai merah, di bawah/sama ditandai hijau.</div></div>' +
    '<div class="fg"><label>Judul laporan Excel</label><input class="txt" id="cfJd" value="' + esc(cfg.judulLaporan) + '"><div class="hint">{TA} diganti tahun anggaran.</div></div>' +
    '<button class="btn pri" id="cfSave">Simpan Pengaturan</button></div></div></div>';
  var edit = function (u) {
    var isNew = !u; u = u || { username: '', nama: '', role: 'Unit', unit: '', aktif: true };
    modal({ title: isNew ? 'Tambah Akun' : 'Ubah Akun', body:
      '<div class="row2"><div class="fg"><label>Username</label><input class="txt" id="aUn" value="' + esc(u.username) + '"' + (isNew ? '' : ' disabled') + '></div><div class="fg"><label>Nama lengkap</label><input class="txt" id="aNm" value="' + esc(u.nama) + '"></div></div>' +
      '<div class="row2"><div class="fg"><label>Role</label><select class="sel" id="aRl"><option value="Unit">Operator Unit</option><option value="Admin">Administrator</option><option value="Pimpinan">Pimpinan (hanya lihat)</option></select></div><div class="fg" id="aUf"><label>Unit kerja</label><select class="sel" id="aUt">' + uopts + '</select></div></div>' +
      '<label class="chk"><input type="checkbox" id="aAk"' + (u.aktif ? ' checked' : '') + '> Akun aktif</label>' + (isNew ? '<div class="hint" style="font-size:12px;color:var(--muted);margin-top:8px">Password awal akan ditampilkan setelah disimpan; pengguna wajib menggantinya saat login pertama.</div>' : ''),
      onOpen: function (m) { $('#aRl', m).value = u.role; if (u.unit) $('#aUt', m).value = u.unit; var sync = function () { $('#aUf', m).style.visibility = $('#aRl', m).value === 'Unit' ? 'visible' : 'hidden'; }; $('#aRl', m).onchange = sync; sync(); },
      buttons: [{ label: 'Batal' }, { label: 'Simpan', cls: 'pri', click: async function (close, m, btn) {
        busy(btn, true);
        try { var r = await call('saveUser', { username: $('#aUn', m).value, nama: $('#aNm', m).value, role: $('#aRl', m).value, unit: $('#aUt', m).value, aktif: $('#aAk', m).checked });
          close(); render();
          if (r.created) modal({ title: 'Akun dibuat', body: 'Sampaikan password awal berikut kepada pengguna <b>' + esc($('#aUn', m).value) + '</b>:<div class="secret">' + esc(r.password) + '</div>Pengguna wajib menggantinya saat login pertama.', buttons: [{ label: 'Selesai', cls: 'pri' }] });
          else toast('Akun diperbarui.');
        } catch (e) { fail(e); busy(btn, false); }
      } }] });
  };
  $('#acAdd').onclick = function () { edit(); };
  $$('[data-ue]').forEach(function (b) { b.onclick = function () { edit(rows.filter(function (r) { return r.username === b.dataset.ue; })[0]); }; });
  $$('[data-ur]').forEach(function (b) { b.onclick = async function () {
    if (!(await confirmBox('Reset password', 'Buat password sementara baru untuk <b>@' + esc(b.dataset.ur) + '</b>?', 'Reset'))) return;
    try { var r = await call('resetPassword', { username: b.dataset.ur }); modal({ title: 'Password sementara', body: 'Password sementara untuk <b>@' + esc(b.dataset.ur) + '</b>:<div class="secret">' + esc(r.password) + '</div>Pengguna wajib menggantinya saat login.', buttons: [{ label: 'Selesai', cls: 'pri' }] }); } catch (e) { fail(e); }
  }; });
  $('#cfSave').onclick = async function () {
    var b = this; busy(b, true);
    try { S.boot.cfg = await call('saveConfig', { instansi: $('#cfIn').value, ambang: $('#cfAm').value, judulLaporan: $('#cfJd').value }); toast('Pengaturan disimpan.'); } catch (e) { fail(e); }
    busy(b, false);
  };
}

/* ------------------------- mobile: isian lewat lembar bawah ------------------------- */
function fillSheet(id) {
  var n = ST.idx[id], f = [];
  if (!n || !n.leaf) return;
  var fields = [['murni', 'Pagu Murni (APBD)'], ['perubahan', 'Pagu Perubahan (APBD)'], ['blud', 'Pagu BLUD'], ['realisasi', 'Realisasi'], ['angkas', 'Anggaran Kas s/d ' + BULAN[ST.data.periode - 1]]];
  fields.forEach(function (x) { if (canEditField(n, x[0])) f.push(x); });
  if (!f.length) return toast('Tidak ada kolom yang dapat diisi pada mode ini.', true);
  var t = n.t;
  modal({ title: 'Isi Anggaran', body:
    '<div style="margin-bottom:14px"><span class="kd" style="font-size:11.5px;color:var(--muted);display:block">' + esc(n.kode) + '</span><b style="font-size:14.5px;line-height:1.4">' + esc(n.uraian) + '</b></div>' +
    '<div class="sheet-prev"><div><small>Pagu dipakai</small><b>' + rp(t.pagu) + '</b></div><div><small>Realisasi</small><b>' + rp(t.real) + '</b></div></div>' +
    f.map(function (x) { var v = n.raw[x[0]]; return '<div class="fg"><label>' + x[1] + '</label><input class="txt money" data-f="' + x[0] + '" inputmode="decimal" placeholder="' + (x[0] === 'perubahan' ? fmtN(n.raw.murni) : '0') + '" value="' + (v === '' || v == null ? '' : String(v).replace('.', ',')) + '"></div>'; }).join(''),
    buttons: [{ label: 'Batal' }, { label: 'Simpan Isian', cls: 'pri', click: function (close, m) {
      var bad = false;
      $$('input[data-f]', m).forEach(function (el) {
        var k = el.dataset.f, v = parseNum(el.value);
        if (isNaN(v)) { bad = true; return; }
        if (v === '' && k !== 'perubahan') v = 0;
        if (String(n.raw[k]) !== String(v)) { n.raw[k] = v; ST.dirty[n.id] = ST.dirty[n.id] || {}; ST.dirty[n.id][k] = true; }
      });
      if (bad) return toast('Ada angka yang tidak valid.', true);
      close(); drawStruktur();
    } }] });
}
function drawStrukturMobile() {
  recalc();
  var d = ST.data, ids = visibleIds(), mode = ST.mode, T = ST.total;
  $$('#seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === mode); });
  $('#modeHint').textContent = { murni: 'Ketuk "Isi" pada sub kegiatan untuk mengisi pagu murni / BLUD.', perub: 'Ketuk "Isi" untuk mengisi pagu perubahan.', real: 'Ketuk "Isi" untuk mengisi realisasi & anggaran kas.', view: 'Mode baca — tidak ada isian.' }[mode];
  var tb = $('#st'); tb.className = 'st mob';
  var rows = ids.map(function (id) {
    var n = ST.idx[id], t = n.t, lv = n.level, depth = { unit: 0, program: 1, kegiatan: 2, sub: 3 }[lv];
    var rr = pctOf(t.real, t.pagu), ap = pctOf(t.angkas, t.pagu), dv = rr - ap;
    var tg = lv === 'sub' ? '<span class="tg ph"></span>' : '<span class="tg" data-tg="' + id + '">' + (ST.open[id] || ST.q ? '−' : '+') + '</span>';
    var lvlName = { unit: 'Unit', program: 'Program', kegiatan: 'Kegiatan', sub: 'Sub Keg.' }[lv];
    var canFill = n.leaf && ['murni', 'blud', 'perubahan', 'realisasi', 'angkas'].some(function (f) { return canEditField(n, f); });
    var act = canFill ? '<button class="m-fillbtn" data-fill="' + id + '">Isi</button>' : (lv !== 'sub' && ST.data.writable[n.unit] ? '<button class="ab" data-add="' + id + '" aria-label="Tambah">' + ic('plus', 14) + '</button>' : '') + (lv !== 'unit' && ST.data.writable[n.unit] ? '<button class="ab" data-ed="' + id + '" aria-label="Ubah">' + ic('edit', 14) + '</button>' : '');
    return '<tr class="lv-' + lv + '" data-row="' + id + '"><td class="sticky"><div class="tree" style="padding-left:' + depth * 10 + 'px">' + tg + '<div class="tree-t"><span class="lvl ' + lv + '" style="align-self:flex-start">' + lvlName + (n.leaf ? ' · ' + n.jenis : '') + '</span>' + (n.kode ? '<span class="kd">' + esc(n.kode) + '</span>' : '') + '<span class="ur">' + esc(n.uraian) + '</span></div></div></td>' +
      '<td>' + rp(t.pagu) + '</td><td>' + rp(t.real) + '<br><small style="color:var(--muted)">' + pct(rr) + '</small></td><td class="c">' + devPill(dv) + '</td><td><div class="acts">' + act + '</div></td></tr>';
  }).join('') || '<tr><td colspan="5" class="l"><div class="empty"><b>Tidak ada data</b>' + (ST.q ? 'Tidak ditemukan hasil.' : 'Belum ada struktur anggaran.') + '</div></td></tr>';
  var rr = pctOf(T.real, T.pagu), aa = pctOf(T.angkas, T.pagu);
  tb.innerHTML = '<thead><tr class="h"><th class="sticky l" style="top:0;padding-left:14px">Uraian</th><th style="top:0">Pagu</th><th style="top:0">Realisasi</th><th class="c" style="top:0">Dev.</th><th class="c" style="top:0"></th></tr></thead><tbody>' + rows + '</tbody>' +
    '<tfoot><tr><td class="sticky l">JUMLAH</td><td>' + rp(T.pagu) + '</td><td>' + rp(T.real) + '</td><td class="c">' + devPill(rr - aa) + '</td><td></td></tr></tfoot>';
  updateDirty();
}
(function () { var o = drawStruktur; drawStruktur = function () { return isMobile() ? drawStrukturMobile() : o(); }; })();
document.addEventListener('click', function (e) { var b = e.target.closest('[data-fill]'); if (b) fillSheet(b.dataset.fill); });

/* ------------------------- PWA ------------------------- */
var deferredInstall = null;
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function syncInstallUI() {
  var can = !!deferredInstall && !isStandalone();
  $('#lnkInstall').classList.toggle('hidden', !can); $('#btnInstall').classList.toggle('hidden', !can);
}
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; syncInstallUI(); });
window.addEventListener('appinstalled', function () { deferredInstall = null; syncInstallUI(); toast('SPADAKes terpasang di perangkat Anda.'); });
function doInstall() { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; syncInstallUI(); }); }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
function serverModal() {
  modal({ title: 'Atur Server', body:
    '<div class="fg"><label>URL Web App Apps Script</label><input class="txt" id="svUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(apiUrl()) + '" autocapitalize="none" spellcheck="false"><div class="hint" style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5">Salin dari Apps Script → Deploy → Web app. Pengaturan ini tersimpan di perangkat ini saja. Administrator dapat menetapkannya permanen di <b>js/config.js</b>.</div></div>',
    buttons: [{ label: 'Batal' }, { label: 'Uji & Simpan', cls: 'pri', click: async function (close, m, btn) {
      var u = $('#svUrl', m).value.trim();
      if (u && !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/exec$/.test(u) && !/^https:\/\/script\.googleusercontent\.com\//.test(u)) return toast('Format URL tidak sesuai. Harus berakhir dengan /exec.', true);
      busy(btn, true, 'Menguji…');
      try { var r = await fetch(u || '/api', { redirect: 'follow' }); var j = await r.json(); if (!j.ok) throw 0; try { if (u) localStorage.setItem('spadakes_api', u); else localStorage.removeItem('spadakes_api'); } catch (e) { } close(); toast('Server terhubung.'); }
      catch (e) { toast('Server tidak dapat dihubungi. Periksa URL dan pengaturan akses (Anyone).', true); busy(btn, false); }
    } }] });
}

/* ------------------------- start ------------------------- */
(function init() {
  $('#yr').textContent = new Date().getFullYear();
  $('#today').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  bindFilters();
  $('#lgEye').onclick = function () { var p = $('#lgPass'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('#loginForm').onsubmit = async function (e) {
    e.preventDefault();
    var btn = $('#lgBtn'); $('#loginErr').classList.add('hidden'); btn.disabled = true;
    try {
      var rem = $('#lgRem').checked, un = $('#lgUser').value.trim();
      var r = await call('login', { username: un, password: $('#lgPass').value, remember: rem });
      S.token = r.token; S.boot = r.boot; tokSet(r.token, rem); bootSave(); $('#lgPass').value = '';
      store('spadakes_user', rem ? un.toLowerCase() : null); store('spadakes_rem', rem ? '1' : '0');
      enterApp();
    } catch (err) { $('#loginErr').textContent = err.message; $('#loginErr').classList.remove('hidden'); }
    btn.disabled = false;
  };
  var out = async function () {
    if (Object.keys(ST.dirty).length && !window.confirm('Ada perubahan belum disimpan. Tetap keluar?')) return;
    try { await call('logout'); } catch (e) { }
    ST.dirty = {}; S.token = null; tokSet(null); rcClear(); try { localStorage.removeItem('spadakes_boot'); } catch (e) { } showLogin('Anda telah keluar dari SPADAKes.');
  };
  $('#btnLogout').onclick = out; $('#btnLogout2').onclick = out;
  $('#btnRefresh').onclick = async function () { rcClear(); try { await refreshBoot(); render(); toast('Data diperbarui.'); } catch (e) { fail(e); } };
  $('#btnPass').onclick = function () { closeUM(); passwordModal(false); };
  $('#menuBtn').onclick = toggleSide;
  $('#scrim').onclick = function () { setSide(false); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeUM(); if (window.innerWidth <= 1024) setSide(false); } });
  // menu pengguna
  function closeUM() { $('#userMenu').classList.add('hidden'); $('#userBtn').setAttribute('aria-expanded', 'false'); }
  $('#userBtn').onclick = function (e) { e.stopPropagation(); var h = $('#userMenu').classList.toggle('hidden'); this.setAttribute('aria-expanded', String(!h)); };
  document.addEventListener('click', function (e) { if (!e.target.closest('.umenu')) closeUM(); });
  // filter (mobile)
  $('#fToggle').onclick = function () { var o = $('#filters').classList.toggle('open'); this.setAttribute('aria-expanded', String(o)); this.textContent = o ? 'Tutup filter' : 'Ubah filter'; };
  // pengaturan awal menu
  var sv = store('spadakes_side');
  if (window.innerWidth > 1024) setSide(sv !== '0');
  var wasM = isMobile();
  window.addEventListener('resize', function () {
    var m = isMobile();
    if (m !== wasM) { wasM = m; if (S.page === 'struktur' && ST.data && !$('.mask')) drawStruktur(); }
    if (window.innerWidth > 1024) { document.body.classList.remove('side-open'); setSide(store('spadakes_side') !== '0'); } else document.body.classList.remove('side-closed');
  });
  // PWA
  $('#lnkServer').onclick = function (e) { e.preventDefault(); serverModal(); };
  $('#lnkInstall').onclick = function (e) { e.preventDefault(); doInstall(); };
  $('#btnInstall').onclick = function () { closeUM(); doInstall(); };
  if (isIOS() && !isStandalone()) { var lk = $('#lnkInstall'); lk.classList.remove('hidden'); lk.textContent = 'Pasang di iPhone'; lk.onclick = function (e) { e.preventDefault(); modal({ title: 'Pasang di iPhone / iPad', body: '<div style="line-height:1.7">Buka halaman ini di <b>Safari</b>, ketuk ikon <b>Bagikan</b> (kotak dengan panah), lalu pilih <b>Tambah ke Layar Utama</b>.</div>', buttons: [{ label: 'Mengerti', cls: 'pri' }] }); }; }
  var net = function () { $('#offline').classList.toggle('hidden', navigator.onLine); };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Versi baru tersedia. <a href="#" id="swReload" style="color:#fff;font-weight:800;text-decoration:underline">Muat ulang</a>', false, 12000); });
      });
    }).catch(function () { });
    var rl = false; navigator.serviceWorker.addEventListener('controllerchange', function () { if (rl) return; rl = true; });
    document.addEventListener('click', function (e) { if (e.target.id === 'swReload') { e.preventDefault(); location.reload(); } });
  }
  var qp = new URLSearchParams(location.search); if (qp.get('go')) store('spadakes_page', qp.get('go'));
  var tok = tokGet(), cb = bootLoad();
  var bad = function (e) { var net = /koneksi|terhubung|server/i.test(e.message); if (!net) { S.token = null; tokSet(null); } showLogin(net ? e.message : ''); };
  if (tok && cb && cb.user) {
    // tampil seketika dari data tersimpan, lalu verifikasi & segarkan di latar belakang
    S.token = tok; S.boot = cb; enterApp(true);
    call('session').then(function (b) { S.boot = b; bootSave(); fillFilters(true); buildNav(); if (b.user.mustChange && !$('.mask')) passwordModal(true); }).catch(function (e) { if (e && e.message && !/koneksi|terhubung|server/i.test(e.message)) return; });
  } else if (tok) { S.token = tok; call('session').then(function (b) { S.boot = b; bootSave(); enterApp(); }).catch(bad); }
  else showLogin();
})();
