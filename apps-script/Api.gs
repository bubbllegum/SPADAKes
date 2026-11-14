/**
 * SPADAKes - Api.gs : logika anggaran.
 *
 * Model data:
 *  - Struktur : pohon per unit kerja & per Tahun Anggaran (program > kegiatan > sub kegiatan).
 *  - Nilai    : isian per (TA, periode/bulan, sub kegiatan): pagu murni APBD, pagu perubahan APBD,
 *               pagu BLUD, realisasi (kumulatif s/d bulan), anggaran kas (kumulatif s/d bulan).
 *  - Sub kegiatan berjenis APBD memakai pagu murni/perubahan; berjenis BLUD memakai pagu BLUD.
 *  - Deviasi (%) = % Realisasi - % Angkas Kas. Merah bila |deviasi| > ambang (default 10%).
 */

var ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sept', 'Okt', 'Nov', 'Des'];

/* ------------------------- helper umum ------------------------- */
function pct_(a, b) { return b ? a / b * 100 : 0; }
function zeroT_() { return { murni: 0, perub: 0, blud: 0, pagu: 0, real: 0, angkas: 0, pA: 0, pB: 0, rA: 0, rB: 0, aA: 0, aB: 0 }; }
function addT_(a, b) { for (var k in b) a[k] += b[k]; return a; }

function cmpKode_(a, b) {
  var x = String(a).split('.'), y = String(b).split('.');
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var p = x[i] === undefined ? -1 : Number(x[i]), q = y[i] === undefined ? -1 : Number(y[i]);
    if (isNaN(p) || isNaN(q)) { var s = String(x[i]).localeCompare(String(y[i])); if (s) return s; continue; }
    if (p !== q) return p - q;
  }
  return 0;
}

function unitsAll_() {
  return readTable_('Units').map(function (r) {
    return { id: String(r.id), nama: r.nama, singkatan: r.singkatan, punyaBLUD: Number(r.punyaBLUD) === 1, padNama: r.padNama || '', urutan: Number(r.urutan) || 0, aktif: Number(r.aktif) === 1 };
  }).sort(function (a, b) { return a.urutan - b.urutan; });
}

function allowedUnits_(u) {
  var all = unitsAll_().filter(function (x) { return x.aktif; });
  if (u.role === 'Unit') return all.filter(function (x) { return x.id === u.unit; });
  return all;
}

function unitFilter_(u, sel) {
  var allowed = allowedUnits_(u).map(function (x) { return x.id; });
  if (sel && sel !== 'ALL' && sel !== '') {
    if (allowed.indexOf(sel) < 0) throw new Error('Anda tidak berhak mengakses unit tersebut.');
    return [sel];
  }
  return allowed;
}

function canWrite_(u, unitId) {
  if (u.role === 'Admin') return true;
  if (u.role === 'Unit') return u.unit === unitId;
  return false;
}

function periodsOf_(ta) {
  return readTable_('Periode').filter(function (r) { return Number(r.ta) === Number(ta); })
    .map(function (r) { return { periode: Number(r.periode), status: r.status, tgl: periodTgl_(ta, Number(r.periode)) }; })
    .sort(function (a, b) { return a.periode - b.periode; });
}

function periodRow_(ta, per) {
  var rows = readTable_('Periode');
  for (var i = 0; i < rows.length; i++) if (Number(rows[i].ta) === Number(ta) && Number(rows[i].periode) === Number(per)) return rows[i];
  return null;
}

function nextNodeId_(rows) {
  var mx = 0;
  rows.forEach(function (r) { var m = /^N(\d+)$/.exec(String(r.id)); if (m) mx = Math.max(mx, Number(m[1])); });
  return mx;
}
function fmtId_(n) { return 'N' + ('00000' + n).slice(-5); }

/* ------------------------- bootstrap ------------------------- */
function bootstrap_(user) {
  var struktur = readTable_('Struktur'), per = readTable_('Periode'), nilai = readTable_('Nilai');
  var tas = {};
  struktur.forEach(function (r) { tas[Number(r.ta)] = true; });
  per.forEach(function (r) { tas[Number(r.ta)] = true; });
  var taList = Object.keys(tas).map(Number).sort(function (a, b) { return b - a; });
  var hasData = {};
  nilai.forEach(function (r) { hasData[r.ta + '|' + r.periode] = true; });
  var periods = {};
  taList.forEach(function (ta) {
    periods[ta] = periodsOf_(ta).map(function (x) { x.hasData = !!hasData[ta + '|' + x.periode]; return x; });
  });
  var allU = unitsAll_();
  return {
    user: user, cfg: getConfig_(), months: MONTHS, tas: taList, periods: periods,
    units: allU, myUnits: allowedUnits_(user).map(function (x) { return x.id; }),
    canWriteAny: user.role !== 'Pimpinan'
  };
}

/* ------------------------- inti perhitungan ------------------------- */
function loadStruktur_(ta, unitIds) {
  var order = {};
  unitsAll_().forEach(function (x) { order[x.id] = x.urutan; });
  var set = {};
  unitIds.forEach(function (id) { set[id] = true; });
  return readTable_('Struktur').filter(function (r) {
    return Number(r.ta) === Number(ta) && Number(r.aktif) === 1 && set[String(r.unit)];
  }).map(function (r) {
    return { id: String(r.id), unit: String(r.unit), level: r.level, kode: String(r.kode), uraian: r.uraian, parentId: String(r.parentId || ''), jenis: r.jenis, urutan: Number(r.urutan) };
  }).sort(function (a, b) { return (order[a.unit] - order[b.unit]) || (a.urutan - b.urutan); });
}

function nilaiByPeriode_(ta) {
  var map = {};
  readTable_('Nilai').forEach(function (r) {
    if (Number(r.ta) !== Number(ta)) return;
    var p = Number(r.periode);
    if (!map[p]) map[p] = {};
    map[p][String(r.subId)] = r;
  });
  return map;
}

/**
 * Hitung seluruh pohon. o: {dasar:'murni'|'perubahan', jenis:''|'APBD'|'BLUD'}
 * Hasil: {nodes (dengan .t), byUnit:{id:{t,filled,cnt}}, total:t, cnt}
 */
function calcTree_(nodes, nilai, o) {
  var dasar = o.dasar === 'murni' ? 'murni' : 'perubahan', jf = o.jenis || '';
  var out = [], idx = {}, byUnit = {}, total = zeroT_();
  nodes.forEach(function (n) {
    var c = { id: n.id, unit: n.unit, level: n.level, kode: n.kode, uraian: n.uraian, parentId: n.parentId, jenis: n.jenis, t: zeroT_(), cnt: 0, leaf: n.level === 'sub', filled: false };
    idx[c.id] = c; out.push(c);
    if (!byUnit[c.unit]) byUnit[c.unit] = { t: zeroT_(), cnt: 0, filled: false };
  });
  out.forEach(function (c) {
    if (!c.leaf) return;
    if (jf && c.jenis !== jf) return;
    var raw = nilai[c.id] || null;
    var murni = 0, per = null, blud = 0, real = 0, angkas = 0;
    if (raw) {
      murni = num_(raw.murni); blud = num_(raw.blud); real = num_(raw.realisasi); angkas = num_(raw.angkas);
      per = (raw.perubahan === '' || raw.perubahan === null || raw.perubahan === undefined) ? null : num_(raw.perubahan);
      c.filled = true;
      c.raw = { murni: murni, perubahan: per === null ? '' : per, blud: blud, realisasi: real, angkas: angkas };
    } else {
      c.raw = { murni: 0, perubahan: '', blud: 0, realisasi: 0, angkas: 0 };
    }
    var t = c.t;
    if (c.jenis === 'BLUD') { t.blud = blud; t.pagu = blud; t.pB = blud; t.rB = real; t.aB = angkas; }
    else {
      var eff = per === null ? murni : per;
      t.murni = murni; t.perub = eff; t.pagu = dasar === 'murni' ? murni : eff; t.pA = t.pagu; t.rA = real; t.aA = angkas;
    }
    t.real = real; t.angkas = angkas; c.cnt = 1;
  });
  for (var i = out.length - 1; i >= 0; i--) {
    var c = out[i];
    if (!c.cnt) continue;
    var p = c.parentId ? idx[c.parentId] : null;
    if (c.leaf && c.filled) byUnit[c.unit].filled = true;
    if (p) {
      addT_(p.t, c.t); p.cnt += c.cnt;
    } else {
      addT_(byUnit[c.unit].t, c.t); byUnit[c.unit].cnt += c.cnt;
    }
  }
  Object.keys(byUnit).forEach(function (k) { addT_(total, byUnit[k].t); });
  return { nodes: out, byUnit: byUnit, total: total };
}

function resolvePeriode_(ta, p) {
  var per = Number(p.periode);
  if (per >= 1 && per <= weeksIn_(ta)) return per;
  var ps = periodsOf_(ta);
  return ps.length ? ps[ps.length - 1].periode : 1;
}

function dev_(t, ambang) {
  var rp = pct_(t.real, t.pagu), ap = pct_(t.angkas, t.pagu);
  return { realPct: rp, angkasPct: ap, dev: rp - ap, sisa: t.pagu - t.real, merah: Math.abs(rp - ap) > ambang };
}

/* ------------------------- dashboard ------------------------- */
function apiDashboard_(u, p) {
  var ta = Number(p.ta), cfg = getConfig_(), dasar = p.dasar === 'murni' ? 'murni' : 'perubahan';
  var units = unitFilter_(u, p.unit), per = resolvePeriode_(ta, p);
  var nodes = loadStruktur_(ta, units), byP = nilaiByPeriode_(ta), o = { dasar: dasar, jenis: p.jenis || '' };
  var months = [];
  for (var m = 1; m <= weeksIn_(ta); m++) {
    if (!byP[m]) { months.push({ periode: m, has: false }); continue; }
    var r = calcTree_(nodes, byP[m], o), d = dev_(r.total, cfg.ambang);
    months.push({ periode: m, has: true, pagu: r.total.pagu, real: r.total.real, angkas: r.total.angkas, realPct: d.realPct, angkasPct: d.angkasPct, dev: d.dev });
  }
  var cur = calcTree_(nodes, byP[per] || {}, o), allU = unitsAll_(), perUnit = [];
  allU.forEach(function (x) {
    if (units.indexOf(x.id) < 0) return;
    var b = cur.byUnit[x.id] || { t: zeroT_(), filled: false };
    var d = dev_(b.t, cfg.ambang);
    perUnit.push({ id: x.id, nama: x.nama, singkatan: x.singkatan, filled: !!b.filled, pagu: b.t.pagu, real: b.t.real, angkas: b.t.angkas, realPct: d.realPct, angkasPct: d.angkasPct, dev: d.dev, merah: d.merah });
  });
  var padMap = padMap_(ta, per), padTotal = { target: 0, real: 0, angkas: 0 };
  allU.forEach(function (x) {
    if (units.indexOf(x.id) < 0 || !x.padNama) return;
    var r = padMap[x.id];
    if (r) { padTotal.target += num_(r.target); padTotal.real += num_(r.realisasi); padTotal.angkas += num_(r.angkas); }
  });
  var d0 = dev_(cur.total, cfg.ambang);
  return {
    ta: ta, periode: per, dasar: dasar, ambang: cfg.ambang,
    kpi: { pagu: cur.total.pagu, real: cur.total.real, sisa: d0.sisa, angkas: cur.total.angkas, realPct: d0.realPct, angkasPct: d0.angkasPct, dev: d0.dev, merah: d0.merah, pagu_apbd: cur.total.pA, pagu_blud: cur.total.pB, real_apbd: cur.total.rA, real_blud: cur.total.rB },
    pad: padTotal, months: months, perUnit: perUnit, topDev: topDev_(cur, allU, cfg),
    unitFilled: perUnit.filter(function (x) { return x.filled; }).length
  };
}

function topDev_(cur, allU, cfg) {
  var nm = {};
  allU.forEach(function (x) { nm[x.id] = x.singkatan; });
  return cur.nodes.filter(function (n) { return n.level === 'kegiatan' && n.t.pagu > 0 && (n.t.real || n.t.angkas); }).map(function (n) {
    var d = dev_(n.t, cfg.ambang);
    return { unit: nm[n.unit], kode: n.kode, uraian: n.uraian, pagu: n.t.pagu, real: n.t.real, realPct: d.realPct, angkasPct: d.angkasPct, dev: d.dev, merah: d.merah };
  }).sort(function (a, b) { return Math.abs(b.dev) - Math.abs(a.dev); }).slice(0, 8);
}

/* ------------------------- struktur ------------------------- */
function apiStruktur_(u, p) {
  var ta = Number(p.ta), per = resolvePeriode_(ta, p), cfg = getConfig_();
  var units = unitFilter_(u, p.unit), nodes = loadStruktur_(ta, units), byP = nilaiByPeriode_(ta);
  var r = calcTree_(nodes, byP[per] || {}, { dasar: p.dasar, jenis: p.jenis });
  var show = !p.jenis;
  var list = r.nodes.filter(function (n) { return show || n.cnt > 0; }).map(function (n) {
    return { id: n.id, unit: n.unit, level: n.level, kode: n.kode, uraian: n.uraian, parentId: n.parentId, jenis: n.jenis, raw: n.raw || null, leaf: n.leaf, filled: !!n.filled };
  });
  var prow = periodRow_(ta, per), ulist = unitsAll_().filter(function (x) { return units.indexOf(x.id) >= 0; });
  var writable = {};
  ulist.forEach(function (x) { writable[x.id] = canWrite_(u, x.id) && (u.role === 'Admin' || !prow || prow.status !== 'Terkunci'); });
  return {
    ta: ta, periode: per, status: prow ? prow.status : 'Terbuka', ambang: cfg.ambang, nodes: list, writable: writable,
    units: ulist.map(function (x) { var b = r.byUnit[x.id] || { t: zeroT_(), filled: false }; return { id: x.id, nama: x.nama, singkatan: x.singkatan, punyaBLUD: x.punyaBLUD, t: b.t, filled: !!b.filled }; }),
    total: r.total
  };
}

function apiSaveNilai_(u, p) {
  var ta = Number(p.ta), per = Number(p.periode), items = p.items || [];
  if (!(per >= 1 && per <= weeksIn_(ta))) throw new Error('Periode tidak valid.');
  if (!items.length) return { saved: 0 };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var prow = periodRow_(ta, per);
    if (!prow) appendRows_('Periode', [{ ta: ta, periode: per, status: 'Terbuka', createdBy: u.username, createdAt: now_() }]);
    else if (prow.status === 'Terkunci' && u.role !== 'Admin') throw new Error('Periode ini terkunci. Hubungi administrator.');
    var struktur = {};
    readTable_('Struktur').forEach(function (r) { if (Number(r.ta) === ta && Number(r.aktif) === 1) struktur[String(r.id)] = r; });
    var sh = ss_().getSheetByName('Nilai'), cols = SCHEMA.Nilai, last = sh.getLastRow();
    var vals = last >= 2 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [], keyIdx = {};
    for (var i = 0; i < vals.length; i++) keyIdx[vals[i][0]] = i;
    var add = [], chIdx = [], ts = now_(), n = 0;
    items.forEach(function (it) {
      var node = struktur[String(it.id)];
      if (!node || node.level !== 'sub') throw new Error('Sub kegiatan tidak ditemukan: ' + it.id);
      if (!canWrite_(u, String(node.unit))) throw new Error('Anda tidak berhak mengubah unit ' + node.unit + '.');
      var isBlud = node.jenis === 'BLUD';
      var murni = isBlud ? 0 : num_(it.murni), blud = isBlud ? num_(it.blud) : 0;
      var perub = (isBlud || it.perubahan === '' || it.perubahan === null || it.perubahan === undefined) ? '' : num_(it.perubahan);
      var row = [ta + '|' + per + '|' + it.id, ta, per, String(it.id), murni, perub, blud, num_(it.realisasi), num_(it.angkas), u.username, ts];
      var k = row[0];
      if (keyIdx[k] !== undefined) { vals[keyIdx[k]] = row; chIdx.push(keyIdx[k]); }
      else add.push(row);
      n++;
    });
    if (chIdx.length) writeChangedRows_(sh, vals, chIdx, cols.length);
    if (add.length) {
      var start = sh.getLastRow() + 1;
      if (sh.getMaxRows() < start + add.length) sh.insertRowsAfter(sh.getMaxRows(), start + add.length - sh.getMaxRows() + 50);
      sh.getRange(start, 1, add.length, cols.length).setValues(add);
    }
    invalidate_('Nilai');
    log_(u.username, 'Simpan data', n + ' sub kegiatan - TA ' + ta + ' - ' + perName_(ta, per));
    return { saved: n, at: ts };
  } finally { lock.releaseLock(); }
}

/* ------------------------- tambah/ubah/hapus node ------------------------- */
/** Tulis hanya baris yang berubah (dikelompokkan per rentang berurutan). */
function writeChangedRows_(sh, vals, idxs, ncols) {
  idxs.sort(function (x, y) { return x - y; });
  var s = 0;
  while (s < idxs.length) {
    var e = s; while (e + 1 < idxs.length && idxs[e + 1] === idxs[e] + 1) e++;
    sh.getRange(idxs[s] + 2, 1, e - s + 1, ncols).setValues(vals.slice(idxs[s], idxs[e] + 1));
    s = e + 1;
  }
}
function renumber_(ta, ordered) {
  var sh = ss_().getSheetByName('Struktur'), cols = SCHEMA.Struktur, last = sh.getLastRow();
  var uCol = cols.indexOf('urutan') + 1, idCol = 1;
  var ids = sh.getRange(2, idCol, last - 1, 1).getValues(), ur = sh.getRange(2, uCol, last - 1, 1).getValues(), pos = {};
  ordered.forEach(function (n, i) { pos[n.id] = i + 1; });
  for (var i = 0; i < ids.length; i++) if (pos[String(ids[i][0])] !== undefined) ur[i][0] = pos[String(ids[i][0])];
  sh.getRange(2, uCol, last - 1, 1).setValues(ur);
  invalidate_('Struktur');
}

function orderedAll_(ta) { // seluruh node (aktif) TA ini sesuai urutan DFS
  return readTable_('Struktur').filter(function (r) { return Number(r.ta) === Number(ta) && Number(r.aktif) === 1; })
    .map(function (r) { return { id: String(r.id), unit: String(r.unit), level: r.level, kode: String(r.kode), parentId: String(r.parentId || ''), urutan: Number(r.urutan) }; })
    .sort(function (a, b) { return a.urutan - b.urutan; });
}

function checkKode_(kode) {
  if (!/^\d+(\.\d+)+$/.test(kode)) throw new Error('Format kode tidak valid. Contoh: 1.02.01.1.01.0001');
}

function apiAddNode_(u, p) {
  var ta = Number(p.ta), unit = String(p.unit), level = p.level, kode = String(p.kode || '').trim(), uraian = String(p.uraian || '').replace(/\s+/g, ' ').trim();
  if (['program', 'kegiatan', 'sub'].indexOf(level) < 0) throw new Error('Level tidak valid.');
  if (!canWrite_(u, unit)) throw new Error('Anda tidak berhak mengubah struktur unit ini.');
  checkKode_(kode);
  if (!uraian) throw new Error('Uraian wajib diisi.');
  var jenis = p.jenis === 'BLUD' ? 'BLUD' : 'APBD';
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var all = orderedAll_(ta), parent = null;
    if (level !== 'program') {
      all.forEach(function (n) { if (n.id === String(p.parentId)) parent = n; });
      var need = level === 'kegiatan' ? 'program' : 'kegiatan';
      if (!parent || parent.level !== need || parent.unit !== unit) throw new Error('Induk tidak valid (harus ' + need + ' pada unit yang sama).');
    }
    all.forEach(function (n) { if (n.unit === unit && n.kode === kode && n.level === level && n.parentId === (parent ? parent.id : '')) throw new Error('Kode sudah ada pada induk yang sama.'); });
    var seed = readTable_('Struktur'), id = fmtId_(nextNodeId_(seed) + 1);
    var node = { id: id, unit: unit, level: level, kode: kode, parentId: parent ? parent.id : '' };
    var sibs = all.filter(function (n) { return n.unit === unit && n.level === level && n.parentId === node.parentId; });
    var insertAt;
    var after = sibs.filter(function (n) { return cmpKode_(n.kode, kode) > 0; })[0];
    if (after) insertAt = all.indexOf(after);
    else if (parent) { // setelah keturunan terakhir induk
      var i = all.indexOf(parent) + 1;
      var rank = { program: 1, kegiatan: 2, sub: 3 };
      while (i < all.length && all[i].unit === unit && rank[all[i].level] > rank[parent.level]) i++;
      insertAt = i;
    } else { // program terakhir pada unit
      var lastIdx = -1;
      all.forEach(function (n, k) { if (n.unit === unit) lastIdx = k; });
      insertAt = lastIdx >= 0 ? lastIdx + 1 : all.length;
    }
    all.splice(insertAt, 0, node);
    appendRows_('Struktur', [{ id: id, ta: ta, unit: unit, level: level, kode: kode, uraian: uraian, parentId: node.parentId, jenis: jenis, urutan: insertAt + 1, aktif: 1 }]);
    renumber_(ta, all);
    log_(u.username, 'Tambah ' + level, kode + ' - ' + uraian.slice(0, 80) + ' (' + unit + ')');
    return { id: id };
  } finally { lock.releaseLock(); }
}

function structRow_(id) {
  var rows = readTable_('Struktur');
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id) && Number(rows[i].aktif) === 1) return rows[i];
  throw new Error('Data struktur tidak ditemukan.');
}

function apiUpdateNode_(u, p) {
  var row = structRow_(p.id);
  if (!canWrite_(u, String(row.unit))) throw new Error('Anda tidak berhak mengubah struktur unit ini.');
  var kode = String(p.kode || '').trim(), uraian = String(p.uraian || '').replace(/\s+/g, ' ').trim();
  checkKode_(kode);
  if (!uraian) throw new Error('Uraian wajib diisi.');
  var dup = readTable_('Struktur').filter(function (r) {
    return Number(r.aktif) === 1 && String(r.id) !== String(row.id) && Number(r.ta) === Number(row.ta) && String(r.unit) === String(row.unit) &&
      String(r.parentId) === String(row.parentId) && String(r.kode) === kode && r.level === row.level;
  });
  if (dup.length) throw new Error('Kode sudah dipakai pada induk yang sama.');
  var upd = { kode: kode, uraian: uraian };
  if (row.level === 'sub' && p.jenis) upd.jenis = p.jenis === 'BLUD' ? 'BLUD' : 'APBD';
  updateRow_('Struktur', row._row, upd);
  log_(u.username, 'Ubah ' + row.level, row.kode + ' -> ' + kode);
  return true;
}

function apiDeleteNode_(u, p) {
  var row = structRow_(p.id);
  if (!canWrite_(u, String(row.unit))) throw new Error('Anda tidak berhak mengubah struktur unit ini.');
  var rows = readTable_('Struktur');
  var kids = rows.filter(function (r) { return Number(r.aktif) === 1 && String(r.parentId) === String(row.id); });
  if (kids.length) throw new Error('Masih memiliki ' + kids.length + ' turunan. Hapus turunannya terlebih dahulu.');
  if (row.level === 'sub' && u.role !== 'Admin') {
    var has = readTable_('Nilai').some(function (r) { return String(r.subId) === String(row.id) && (num_(r.murni) || num_(r.perubahan) || num_(r.blud) || num_(r.realisasi) || num_(r.angkas)); });
    if (has) throw new Error('Sub kegiatan ini sudah memiliki angka. Hanya administrator yang dapat menghapusnya.');
  }
  updateRow_('Struktur', row._row, { aktif: 0 });
  log_(u.username, 'Hapus ' + row.level, row.kode + ' - ' + String(row.uraian).slice(0, 80));
  return true;
}

/* ------------------------- periode, TA, import ------------------------- */
function apiCreatePeriod_(u, p) {
  var ta = Number(p.ta), per = Number(p.periode), from = Number(p.copyFrom || 0), mode = p.copyMode || 'pagu';
  if (!(per >= 1 && per <= weeksIn_(ta))) throw new Error('Periode tidak valid.');
  if (periodRow_(ta, per)) throw new Error(perName_(ta, per) + ' sudah ada.');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    appendRows_('Periode', [{ ta: ta, periode: per, status: 'Terbuka', createdBy: u.username, createdAt: now_() }]);
    if (p.tgl) setPeriodTgl_(ta, per, p.tgl);
    var res = { copied: 0 };
    if (from && mode !== 'none') res = copyPeriode_(u, ta, from, per, mode === 'all', true, unitsAll_().map(function (x) { return x.id; }));
    log_(u.username, 'Buat periode', perName_(ta, per) + (from ? ' (salin dari Minggu ' + from + ', ' + mode + ')' : ''));
    return res;
  } finally { lock.releaseLock(); }
}

function copyPeriode_(u, ta, from, to, withReal, overwrite, unitIds) {
  var struktur = {};
  readTable_('Struktur').forEach(function (r) { if (Number(r.ta) === ta && Number(r.aktif) === 1) struktur[String(r.id)] = r; });
  var sh = ss_().getSheetByName('Nilai'), cols = SCHEMA.Nilai, last = sh.getLastRow();
  var vals = last >= 2 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [], keyIdx = {};
  for (var i = 0; i < vals.length; i++) keyIdx[vals[i][0]] = i;
  var add = [], copied = 0, skipped = 0, ts = now_(), chIdx = [], uset = {};
  unitIds.forEach(function (x) { uset[x] = true; });
  vals.slice().forEach(function (v) {
    if (Number(v[1]) !== ta || Number(v[2]) !== from) return;
    var node = struktur[String(v[3])];
    if (!node || !uset[String(node.unit)]) return;
    var row = [ta + '|' + to + '|' + v[3], ta, to, String(v[3]), v[4], v[5], v[6], withReal ? v[7] : 0, withReal ? v[8] : 0, u.username, ts];
    if (keyIdx[row[0]] !== undefined) {
      if (!overwrite) { skipped++; return; }
      vals[keyIdx[row[0]]] = row; chIdx.push(keyIdx[row[0]]);
    } else add.push(row);
    copied++;
  });
  if (chIdx.length) writeChangedRows_(sh, vals, chIdx, cols.length);
  if (add.length) {
    var start = sh.getLastRow() + 1;
    if (sh.getMaxRows() < start + add.length) sh.insertRowsAfter(sh.getMaxRows(), start + add.length - sh.getMaxRows() + 50);
    sh.getRange(start, 1, add.length, cols.length).setValues(add);
  }
  invalidate_('Nilai');
  // PAD
  var padRows = readTable_('PAD'), padIdx = {}, padAdd = [];
  padRows.forEach(function (r) { padIdx[String(r.key)] = r; });
  padRows.forEach(function (r) {
    if (Number(r.ta) !== ta || Number(r.periode) !== from || !uset[String(r.unit)]) return;
    var key = ta + '|' + to + '|' + r.unit;
    var o = { key: key, ta: ta, periode: to, unit: String(r.unit), target: r.target, realisasi: withReal ? r.realisasi : 0, angkas: withReal ? r.angkas : 0, updatedBy: u.username, updatedAt: ts };
    if (padIdx[key]) { if (overwrite) updateRow_('PAD', padIdx[key]._row, o); }
    else padAdd.push(o);
  });
  appendRows_('PAD', padAdd);
  return { copied: copied, skipped: skipped, pad: padAdd.length };
}

function apiImportPrev_(u, p) {
  var ta = Number(p.ta), from = Number(p.from), to = Number(p.to);
  if (!(from >= 1 && to >= 1 && from !== to)) throw new Error('Pilih periode sumber dan tujuan yang berbeda.');
  var units = unitFilter_(u, p.unit).filter(function (id) { return canWrite_(u, id); });
  if (!units.length) throw new Error('Anda tidak memiliki hak mengisi unit manapun.');
  var src = nilaiByPeriode_(ta)[from] || {};
  var nodes = loadStruktur_(ta, units), have = 0, existing = nilaiByPeriode_(ta)[to] || {}, exist = 0;
  nodes.forEach(function (n) { if (n.level === 'sub') { if (src[n.id]) have++; if (existing[n.id]) exist++; } });
  if (p.dryRun) return { sumber: have, sudahAda: exist, unit: units.length };
  var tr = periodRow_(ta, to);
  if (tr && tr.status === 'Terkunci' && u.role !== 'Admin') throw new Error('Periode tujuan terkunci.');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (!tr) appendRows_('Periode', [{ ta: ta, periode: to, status: 'Terbuka', createdBy: u.username, createdAt: now_() }]);
    var res = copyPeriode_(u, ta, from, to, p.mode === 'all', !!p.overwrite, units);
    log_(u.username, 'Import data periode sebelumnya', 'Minggu ' + from + ' -> Minggu ' + to + ' TA ' + ta + ' (' + res.copied + ' baris)');
    return res;
  } finally { lock.releaseLock(); }
}

function apiSetPeriodStatus_(u, p) {
  var r = periodRow_(Number(p.ta), Number(p.periode));
  if (!r) throw new Error('Periode tidak ditemukan.');
  var st = p.status === 'Terkunci' ? 'Terkunci' : 'Terbuka';
  updateRow_('Periode', r._row, { status: st });
  log_(u.username, st === 'Terkunci' ? 'Kunci periode' : 'Buka kunci periode', perName_(p.ta, Number(p.periode)));
  return true;
}

function apiCreateTA_(u, p) {
  var ta = Number(p.ta), from = Number(p.fromTa);
  if (!(ta >= 2000 && ta <= 2100)) throw new Error('Tahun anggaran tidak valid.');
  if (readTable_('Struktur').some(function (r) { return Number(r.ta) === ta; }) || periodsOf_(ta).length) throw new Error('Tahun anggaran ' + ta + ' sudah ada.');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var all = readTable_('Struktur'), n = nextNodeId_(all), map = {}, add = [];
    var src = all.filter(function (r) { return from && Number(r.ta) === from && Number(r.aktif) === 1; }).sort(function (a, b) { return Number(a.urutan) - Number(b.urutan); });
    src.forEach(function (r) { n++; map[String(r.id)] = fmtId_(n); });
    src.forEach(function (r, i) {
      add.push({ id: map[String(r.id)], ta: ta, unit: String(r.unit), level: r.level, kode: String(r.kode), uraian: r.uraian, parentId: r.parentId ? map[String(r.parentId)] : '', jenis: r.jenis, urutan: i + 1, aktif: 1 });
    });
    appendRows_('Struktur', add);
    appendRows_('Periode', [{ ta: ta, periode: 1, status: 'Terbuka', createdBy: u.username, createdAt: now_() }]);
    var cnt = 0;
    if (from && p.copyPagu) {
      var byP = nilaiByPeriode_(from), ps = Object.keys(byP).map(Number).sort(function (a, b) { return b - a; });
      if (ps.length) {
        var latest = byP[ps[0]], rows = [], ts = now_();
        src.forEach(function (r) {
          if (r.level !== 'sub' || !latest[String(r.id)]) return;
          var v = latest[String(r.id)], eff = (v.perubahan === '' || v.perubahan === null) ? num_(v.murni) : num_(v.perubahan);
          var id = map[String(r.id)];
          rows.push({ key: ta + '|1|' + id, ta: ta, periode: 1, subId: id, murni: r.jenis === 'BLUD' ? 0 : eff, perubahan: '', blud: r.jenis === 'BLUD' ? num_(v.blud) : 0, realisasi: 0, angkas: 0, updatedBy: u.username, updatedAt: ts });
        });
        appendRows_('Nilai', rows); cnt = rows.length;
      }
    }
    log_(u.username, 'Buat TA', 'TA ' + ta + ' (struktur disalin dari ' + (from || '-') + ', ' + add.length + ' baris)');
    return { nodes: add.length, nilai: cnt };
  } finally { lock.releaseLock(); }
}

/* ------------------------- PAD ------------------------- */
function padMap_(ta, per) {
  var m = {};
  readTable_('PAD').forEach(function (r) { if (Number(r.ta) === Number(ta) && Number(r.periode) === Number(per)) m[String(r.unit)] = r; });
  return m;
}

function apiPad_(u, p) {
  var ta = Number(p.ta), per = resolvePeriode_(ta, p), cfg = getConfig_(), units = unitFilter_(u, p.unit), m = padMap_(ta, per), prow = periodRow_(ta, per);
  var rows = [];
  unitsAll_().forEach(function (x) {
    if (!x.padNama || units.indexOf(x.id) < 0) return;
    var r = m[x.id] || {};
    var t = { target: num_(r.target), real: num_(r.realisasi), angkas: num_(r.angkas) };
    rows.push({ unit: x.id, nama: x.padNama, target: t.target, realisasi: t.real, angkas: t.angkas, filled: !!m[x.id], writable: canWrite_(u, x.id) && (u.role === 'Admin' || !prow || prow.status !== 'Terkunci') });
  });
  return { ta: ta, periode: per, ambang: cfg.ambang, rows: rows };
}

function apiSavePad_(u, p) {
  var ta = Number(p.ta), per = Number(p.periode), items = p.items || [];
  var prow = periodRow_(ta, per);
  if (prow && prow.status === 'Terkunci' && u.role !== 'Admin') throw new Error('Periode ini terkunci.');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (!prow) appendRows_('Periode', [{ ta: ta, periode: per, status: 'Terbuka', createdBy: u.username, createdAt: now_() }]);
    var m = padMap_(ta, per), ts = now_(), add = [], n = 0;
    items.forEach(function (it) {
      if (!canWrite_(u, String(it.unit))) throw new Error('Anda tidak berhak mengubah PAD unit ' + it.unit + '.');
      var o = { key: ta + '|' + per + '|' + it.unit, ta: ta, periode: per, unit: String(it.unit), target: num_(it.target), realisasi: num_(it.realisasi), angkas: num_(it.angkas), updatedBy: u.username, updatedAt: ts };
      if (m[it.unit]) updateRow_('PAD', m[it.unit]._row, o); else add.push(o);
      n++;
    });
    appendRows_('PAD', add);
    log_(u.username, 'Simpan PAD', n + ' unit - TA ' + ta + ' - ' + perName_(ta, per));
    return { saved: n };
  } finally { lock.releaseLock(); }
}

/* ------------------------- rekap & pembanding ------------------------- */
function buildRekap_(ta, per, dasar, units, cfg) {
  var nodes = loadStruktur_(ta, units), byP = nilaiByPeriode_(ta), r = calcTree_(nodes, byP[per] || {}, { dasar: dasar });
  var rows = [], tot = zeroT_(), allU = unitsAll_();
  function push(nama, id, jenis, pagu, real, angkas) {
    var d = dev_({ pagu: pagu, real: real, angkas: angkas }, cfg.ambang);
    rows.push({ nama: nama, unit: id, jenis: jenis, pagu: pagu, real: real, angkas: angkas, sisa: pagu - real, realPct: d.realPct, angkasPct: d.angkasPct, dev: d.dev, merah: d.merah });
  }
  allU.forEach(function (x) {
    if (units.indexOf(x.id) < 0) return;
    var b = (r.byUnit[x.id] || { t: zeroT_() }).t;
    if (x.punyaBLUD) {
      var hasA = b.pA || b.rA || b.aA, hasB = b.pB || b.rB || b.aB;
      if (hasA || !hasB) push(x.singkatan + ' (APBD)', x.id, 'APBD', b.pA, b.rA, b.aA);
      if (hasB) push(x.singkatan + ' (BLUD)', x.id, 'BLUD', b.pB, b.rB, b.aB);
    } else push(x.singkatan, x.id, 'APBD', b.pA + b.pB, b.rA + b.rB, b.aA + b.aB);
  });
  var T = { pagu: 0, real: 0, angkas: 0 };
  rows.forEach(function (x) { T.pagu += x.pagu; T.real += x.real; T.angkas += x.angkas; });
  var dt = dev_(T, cfg.ambang);
  var total = { nama: 'JUMLAH', pagu: T.pagu, real: T.real, angkas: T.angkas, sisa: T.pagu - T.real, realPct: dt.realPct, angkasPct: dt.angkasPct, dev: dt.dev, merah: dt.merah };
  var pm = padMap_(ta, per), padRows = [], PT = { target: 0, real: 0, angkas: 0 };
  allU.forEach(function (x) {
    if (!x.padNama || units.indexOf(x.id) < 0) return;
    var q = pm[x.id] || {}, t = num_(q.target), re = num_(q.realisasi), an = num_(q.angkas), d = dev_({ pagu: t, real: re, angkas: an }, cfg.ambang);
    padRows.push({ nama: x.padNama, unit: x.id, pagu: t, real: re, angkas: an, sisa: re - t, realPct: d.realPct, angkasPct: d.angkasPct, dev: d.dev, merah: d.merah });
    PT.target += t; PT.real += re; PT.angkas += an;
  });
  var dp = dev_({ pagu: PT.target, real: PT.real, angkas: PT.angkas }, cfg.ambang);
  var padTotal = { nama: 'JUMLAH', pagu: PT.target, real: PT.real, angkas: PT.angkas, sisa: PT.real - PT.target, realPct: dp.realPct, angkasPct: dp.angkasPct, dev: dp.dev, merah: dp.merah };
  return { rows: rows, total: total, padRows: padRows, padTotal: padTotal, tree: r };
}

function apiRekap_(u, p) {
  var ta = Number(p.ta), per = resolvePeriode_(ta, p), cfg = getConfig_(), dasar = p.dasar === 'murni' ? 'murni' : 'perubahan';
  var b = buildRekap_(ta, per, dasar, unitFilter_(u, p.unit), cfg);
  return { ta: ta, periode: per, dasar: dasar, ambang: cfg.ambang, rows: b.rows, total: b.total, padRows: b.padRows, padTotal: b.padTotal };
}

function apiPembanding_(u, p) {
  var ta = Number(p.ta), cfg = getConfig_(), units = unitFilter_(u, p.unit), mode = p.mode === 'pagu' ? 'pagu' : 'periode';
  var nodes = loadStruktur_(ta, units), byP = nilaiByPeriode_(ta), A, B, la, lb;
  if (mode === 'pagu') {
    var per = Number(p.a) || resolvePeriode_(ta, {});
    A = calcTree_(nodes, byP[per] || {}, { dasar: 'murni', jenis: p.jenis }); B = calcTree_(nodes, byP[per] || {}, { dasar: 'perubahan', jenis: p.jenis });
    la = 'Pagu Murni'; lb = 'Pagu Perubahan';
  } else {
    var dasar = p.dasar === 'murni' ? 'murni' : 'perubahan', a = Number(p.a), b = Number(p.b);
    if (!a || !b) throw new Error('Pilih dua periode yang akan dibandingkan.');
    A = calcTree_(nodes, byP[a] || {}, { dasar: dasar, jenis: p.jenis }); B = calcTree_(nodes, byP[b] || {}, { dasar: dasar, jenis: p.jenis });
    la = 'Minggu ' + a + ' (' + perName_(ta, a).replace(/^Minggu \d+ \(|\)$/g, '') + ')'; lb = 'Minggu ' + b + ' (' + perName_(ta, b).replace(/^Minggu \d+ \(|\)$/g, '') + ')';
  }
  var bi = {};
  B.nodes.forEach(function (n) { bi[n.id] = n; });
  var rows = [], ulist = unitsAll_();
  var byU = {};
  A.nodes.forEach(function (n) { if (n.cnt > 0 || !p.jenis) { (byU[n.unit] = byU[n.unit] || []).push(n); } });
  ulist.forEach(function (x) {
    if (units.indexOf(x.id) < 0) return;
    var ua = A.byUnit[x.id], ub = B.byUnit[x.id];
    if (!ua) return;
    rows.push({ level: 'unit', unit: x.id, kode: '', uraian: x.nama, a: ua.t, b: ub.t });
    (byU[x.id] || []).forEach(function (n) { rows.push({ level: n.level, unit: n.unit, kode: n.kode, uraian: n.uraian, a: n.t, b: bi[n.id].t }); });
  });
  var tot = { level: 'total', unit: '', kode: '', uraian: 'JUMLAH', a: A.total, b: B.total };
  return { mode: mode, labelA: la, labelB: lb, ambang: cfg.ambang, rows: rows, total: tot };
}

/* ------------------------- ekspor Excel ------------------------- */
function apiExport_(u, p) {
  var ta = Number(p.ta), per = resolvePeriode_(ta, p), cfg = getConfig_(), dasar = p.dasar === 'murni' ? 'murni' : 'perubahan';
  var units = unitFilter_(u, p.unit), nodes = loadStruktur_(ta, units), byP = nilaiByPeriode_(ta);
  var r = calcTree_(nodes, byP[per] || {}, { dasar: dasar, jenis: p.jenis });
  var pe = perEndDate_(ta, per), tgl = pe.getDate(), abbr = ABBR[pe.getMonth()], full = MONTHS[pe.getMonth()];
  var uData = [];
  unitsAll_().forEach(function (x) {
    if (units.indexOf(x.id) < 0) return;
    var b = r.byUnit[x.id] || { t: zeroT_() }, list = [];
    r.nodes.forEach(function (n) {
      if (n.unit !== x.id) return;
      if (p.jenis && n.cnt === 0) return;
      list.push({ level: n.level, kode: n.kode, uraian: n.uraian, pagu: n.t.pagu, real: n.t.real, angkas: n.t.angkas });
    });
    uData.push({ nama: x.nama, nodes: list, pagu: b.t.pagu, real: b.t.real, angkas: b.t.angkas });
  });
  var rk = buildRekap_(ta, per, dasar, units, cfg);
  var tglTxt = tgl + ' ' + abbr + ' ' + ta, tglFull = tgl + ' ' + full + ' ' + ta;
  var data = {
    judul1: String(cfg.judulLaporan).replace('{TA}', ta), judul2: cfg.instansi,
    subJudul: 'Realisasi s/d Tanggal ' + tglTxt,
    labelPagu: dasar === 'murni' ? 'PAGU MURNI' : 'PAGU PERUBAHAN',
    angkasLabel: 'ANGGARAN KAS S/D ' + tgl + ' ' + full.toUpperCase() + ' ' + ta + ' ',
    units: uData, sheetRincian: 'Rincian SIAP ' + tgl + ' ' + abbr, sheetRekap: 'Rekap SIAP ' + tgl + ' ' + abbr,
    rekap: {
      judul: 'REALISASI ANGGARAN ' + String(cfg.instansi).toUpperCase() + ' TA ' + ta, sub: 'Per Tanggal ' + tglFull,
      rows: rk.rows.map(function (x) { return { nama: x.nama, pagu: x.pagu, real: x.real, angkas: x.angkas }; }),
      pad: { judul: 'PENDAPATAN ASLI DAERAH (PAD) \nPER TANGGAL ' + tglFull, rows: rk.padRows.map(function (x) { return { nama: x.nama, pagu: x.pagu, real: x.real, angkas: x.angkas }; }) }
    }
  };
  var bytes = xl_buildLaporan_(data);
  var signed = bytes.map(function (b) { return b > 127 ? b - 256 : b; });
  var scope = units.length === 1 ? '_' + units[0] : '';
  var name = 'RINCIAN_REALISASI_ANGGARAN_DINKES_Per_' + tgl + '_' + abbr + '_' + ta + scope + '.xlsx';
  var blob = Utilities.newBlob(signed, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name);
  var url = '', fid = '';
  try {
    var fname = 'SPADAKes - Arsip Laporan', it = DriveApp.getFoldersByName(fname), folder = it.hasNext() ? it.next() : DriveApp.createFolder(fname);
    var f = folder.createFile(blob); url = f.getUrl(); fid = f.getId();
  } catch (e) { url = ''; }
  appendRows_('Arsip', [{ ts: now_(), user: u.username, nama: name, tipe: 'Excel', ta: ta, periode: per, url: url, fileId: fid }]);
  log_(u.username, 'Ekspor Excel', name);
  return { name: name, base64: Utilities.base64Encode(signed), url: url };
}

/* ------------------------- unit, log, arsip ------------------------- */
function apiUnits_(u) {
  var us = readTable_('Users'), st = readTable_('Struktur');
  return unitsAll_().filter(function (x) { return u.role !== 'Unit' || x.id === u.unit; }).map(function (x) {
    x.akun = us.filter(function (r) { return String(r.unit) === x.id; }).length;
    x.node = st.filter(function (r) { return String(r.unit) === x.id && Number(r.aktif) === 1 && r.level === 'sub'; }).length;
    return x;
  });
}

function apiSaveUnit_(u, p) {
  var nama = String(p.nama || '').trim(), sing = String(p.singkatan || '').trim();
  if (!nama || !sing) throw new Error('Nama unit dan singkatan wajib diisi.');
  var rows = readTable_('Units'), ex = null;
  rows.forEach(function (r) { if (String(r.id) === String(p.id)) ex = r; });
  var base = { nama: nama, singkatan: sing, punyaBLUD: p.punyaBLUD ? 1 : 0, padNama: String(p.padNama || '').trim(), aktif: p.aktif ? 1 : 0 };
  if (ex) { base.urutan = p.urutan ? Number(p.urutan) : ex.urutan; updateRow_('Units', ex._row, base); log_(u.username, 'Ubah unit', ex.id); return { id: String(ex.id) }; }
  var id = sing.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'UNIT';
  var n = 1, base0 = id;
  while (rows.some(function (r) { return String(r.id) === id; })) { n++; id = base0 + n; }
  base.id = id; base.urutan = rows.length + 1;
  appendRows_('Units', [base]);
  log_(u.username, 'Tambah unit', id + ' - ' + nama);
  return { id: id };
}

function apiLogs_(u, p) {
  var rows = readTail_('Log', 1500), q = String(p.q || '').toLowerCase();
  rows = rows.filter(function (r) { return u.role === 'Admin' || r.user === u.username; });
  if (q) rows = rows.filter(function (r) { return (r.user + ' ' + r.aksi + ' ' + r.detail).toLowerCase().indexOf(q) >= 0; });
  return rows.reverse().slice(0, Number(p.limit) || 300).map(function (r) { return { ts: r.ts, user: r.user, aksi: r.aksi, detail: r.detail }; });
}

function apiArsip_(u) {
  return readTable_('Arsip').filter(function (r) { return u.role !== 'Unit' || r.user === u.username; }).reverse().slice(0, 200)
    .map(function (r) { return { ts: r.ts, user: r.user, nama: r.nama, tipe: r.tipe, ta: r.ta, periode: r.periode, url: r.url }; });
}
