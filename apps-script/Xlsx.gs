/**
 * SPADAKes - Pembuat file .xlsx murni (tanpa library).
 * Menghasilkan berkas Excel dengan format yang meniru
 * "RINCIAN REALISASI ANGGARAN DINKES" (font Bookman Old Style, border medium,
 * warna baris unit/program/kegiatan, lebar kolom, tinggi baris, landscape).
 * Tidak memakai API Google apa pun, sehingga bisa diuji di luar Apps Script.
 */

/* ---------- util byte / zip (tanpa kompresi) ---------- */
var XL_CRC_TABLE = (function () {
  var t = [], c, n, k;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function xl_crc32_(bytes) {
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) crc = XL_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function xl_utf8_(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
      var d = str.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function xl_zip_(files) {
  var out = [], central = [], offset = 0;
  function w16(a, v) { a.push(v & 255, (v >>> 8) & 255); }
  function w32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
  files.forEach(function (f) {
    var name = xl_utf8_(f.name), data = xl_utf8_(f.data), crc = xl_crc32_(data);
    var h = [];
    w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, 0); w16(h, 0x21);
    w32(h, crc); w32(h, data.length); w32(h, data.length); w16(h, name.length); w16(h, 0);
    var i;
    for (i = 0; i < h.length; i++) out.push(h[i]);
    for (i = 0; i < name.length; i++) out.push(name[i]);
    for (i = 0; i < data.length; i++) out.push(data[i]);
    var c = [];
    w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, 0); w16(c, 0x21);
    w32(c, crc); w32(c, data.length); w32(c, data.length); w16(c, name.length);
    w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, offset);
    for (i = 0; i < name.length; i++) c.push(name[i]);
    central.push(c);
    offset += h.length + name.length + data.length;
  });
  var cdStart = offset, cdLen = 0;
  central.forEach(function (c) { for (var i = 0; i < c.length; i++) out.push(c[i]); cdLen += c.length; });
  var e = [];
  w32(e, 0x06054b50); w16(e, 0); w16(e, 0); w16(e, files.length); w16(e, files.length);
  w32(e, cdLen); w32(e, cdStart); w16(e, 0);
  for (var j = 0; j < e.length; j++) out.push(e[j]);
  return out;
}

function xl_esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function xl_col_(n) { // 1 -> A
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------- stylebook ---------- */
function XlStyles() {
  this.fonts = []; this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  this.borders = []; this.numFmts = []; this.xfs = []; this.cache = {};
  this.fontMap = {}; this.fillMap = {}; this.borderMap = {}; this.fmtMap = {};
  this.xf({}); // style 0 = default
}
XlStyles.prototype._font = function (o) {
  var x = '<font>' + (o.b ? '<b/>' : '') + (o.i ? '<i/>' : '') +
    '<sz val="' + (o.sz || 11) + '"/><color rgb="FF' + (o.color || '000000') + '"/><name val="' + (o.font || 'Calibri') + '"/></font>';
  if (this.fontMap[x] === undefined) { this.fontMap[x] = this.fonts.length; this.fonts.push(x); }
  return this.fontMap[x];
};
XlStyles.prototype._fill = function (rgb) {
  if (!rgb) return 0;
  var x = '<fill><patternFill patternType="solid"><fgColor rgb="FF' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>';
  if (this.fillMap[x] === undefined) { this.fillMap[x] = this.fills.length; this.fills.push(x); }
  return this.fillMap[x];
};
XlStyles.prototype._border = function (b) {
  b = b || {};
  function side(n, st) { return st ? '<' + n + ' style="' + st + '"><color rgb="FF000000"/></' + n + '>' : '<' + n + '/>'; }
  var x = '<border>' + side('left', b.l) + side('right', b.r) + side('top', b.t) + side('bottom', b.b) + '<diagonal/></border>';
  if (this.borderMap[x] === undefined) { this.borderMap[x] = this.borders.length; this.borders.push(x); }
  return this.borderMap[x];
};
XlStyles.prototype._fmt = function (code) {
  if (!code || code === 'General') return 0;
  if (code === '0.00') return 2;
  if (code === '#,##0.00') return 4;
  if (this.fmtMap[code] === undefined) { this.fmtMap[code] = 164 + this.numFmts.length; this.numFmts.push(code); }
  return this.fmtMap[code];
};
/** o: {font,sz,b,i,color,fill,border:{l,r,t,b},fmt,h,v,wrap} */
XlStyles.prototype.xf = function (o) {
  var key = JSON.stringify(o);
  if (this.cache[key] !== undefined) return this.cache[key];
  var f = this._font(o), fi = this._fill(o.fill), bo = this._border(o.border), nf = this._fmt(o.fmt);
  var al = (o.h || o.v || o.wrap) ?
    '<alignment' + (o.h ? ' horizontal="' + o.h + '"' : '') + (o.v ? ' vertical="' + o.v + '"' : '') + (o.wrap ? ' wrapText="1"' : '') + '/>' : '';
  var x = '<xf numFmtId="' + nf + '" fontId="' + f + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' +
    (nf ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fi ? ' applyFill="1"' : '') + ' applyBorder="1"' +
    (al ? ' applyAlignment="1">' + al + '</xf>' : '/>');
  this.xfs.push(x);
  this.cache[key] = this.xfs.length - 1;
  return this.cache[key];
};
XlStyles.prototype.xml = function () {
  var nf = this.numFmts.map(function (c, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + xl_esc_(c) + '"/>'; }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (nf ? '<numFmts count="' + this.numFmts.length + '">' + nf + '</numFmts>' : '') +
    '<fonts count="' + this.fonts.length + '">' + this.fonts.join('') + '</fonts>' +
    '<fills count="' + this.fills.length + '">' + this.fills.join('') + '</fills>' +
    '<borders count="' + this.borders.length + '">' + this.borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + this.xfs.length + '">' + this.xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
};

/* ---------- worksheet ---------- */
function XlSheet(name) {
  this.name = name; this.rows = {}; this.merges = []; this.cols = []; this.heights = {};
  this.freeze = 0; this.defaultColWidth = 14.43; this.defaultRowHeight = 15; this.titleRows = null; this.maxCol = 1; this.maxRow = 1;
}
/** set(r,c,{v,f,s}) ; v number|string|null ; f formula without '=' ; s style index */
XlSheet.prototype.set = function (r, c, cell) {
  if (!this.rows[r]) this.rows[r] = {};
  this.rows[r][c] = cell;
  if (c > this.maxCol) this.maxCol = c;
  if (r > this.maxRow) this.maxRow = r;
};
XlSheet.prototype.merge = function (r1, c1, r2, c2) { this.merges.push(xl_col_(c1) + r1 + ':' + xl_col_(c2) + r2); };
XlSheet.prototype.fillStyle = function (r1, c1, r2, c2, s) { // beri style pada seluruh sel rentang (agar border merge tampil)
  for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) {
    if (!this.rows[r] || !this.rows[r][c]) this.set(r, c, { s: s });
  }
};
XlSheet.prototype.xml = function () {
  var self = this, x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
  x.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  x.push('<dimension ref="A1:' + xl_col_(this.maxCol) + this.maxRow + '"/>');
  x.push('<sheetViews><sheetView workbookViewId="0" showGridLines="1">' +
    (this.freeze ? '<pane ySplit="' + this.freeze + '" topLeftCell="A' + (this.freeze + 1) + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (this.freeze + 1) + '" sqref="A' + (this.freeze + 1) + '"/>' : '') +
    '</sheetView></sheetViews>');
  x.push('<sheetFormatPr defaultColWidth="' + this.defaultColWidth + '" defaultRowHeight="' + this.defaultRowHeight + '" customHeight="1"/>');
  if (this.cols.length) {
    x.push('<cols>' + this.cols.map(function (c) { return '<col min="' + c[0] + '" max="' + c[1] + '" width="' + c[2] + '" customWidth="1"/>'; }).join('') + '</cols>');
  }
  x.push('<sheetData>');
  var rkeys = Object.keys(this.rows).map(Number).sort(function (a, b) { return a - b; });
  var hkeys = Object.keys(this.heights).map(Number);
  hkeys.forEach(function (h) { if (!self.rows[h]) rkeys.push(h); });
  rkeys = rkeys.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return !i || v !== a[i - 1]; });
  rkeys.forEach(function (r) {
    var ht = self.heights[r];
    x.push('<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>');
    var cells = self.rows[r] || {};
    Object.keys(cells).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
      var cell = cells[c], ref = xl_col_(c) + r, s = cell.s ? ' s="' + cell.s + '"' : '';
      var v = cell.v, f = cell.f;
      if (f) {
        if (typeof v === 'string') x.push('<c r="' + ref + '"' + s + ' t="str"><f>' + xl_esc_(f) + '</f><v>' + xl_esc_(v) + '</v></c>');
        else x.push('<c r="' + ref + '"' + s + '><f>' + xl_esc_(f) + '</f>' + (v === null || v === undefined || !isFinite(v) ? '' : '<v>' + v + '</v>') + '</c>');
      } else if (typeof v === 'number' && isFinite(v)) {
        x.push('<c r="' + ref + '"' + s + '><v>' + v + '</v></c>');
      } else if (v !== null && v !== undefined && v !== '') {
        x.push('<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xl_esc_(v) + '</t></is></c>');
      } else {
        x.push('<c r="' + ref + '"' + s + '/>');
      }
    });
    x.push('</row>');
  });
  x.push('</sheetData>');
  if (this.merges.length) x.push('<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
  x.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0" footer="0"/>');
  x.push('<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>');
  x.push('</worksheet>');
  return x.join('');
};

/* ---------- workbook ---------- */
function xl_workbook_(sheets, styles) {
  var files = [];
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  sheets.forEach(function (s, i) { ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; });
  ct += '</Types>';
  files.push({ name: '[Content_Types].xml', data: ct });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>';
  sheets.forEach(function (s, i) { wb += '<sheet name="' + xl_esc_(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; });
  wb += '</sheets>';
  var dn = '';
  sheets.forEach(function (s, i) {
    if (s.titleRows) dn += '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + xl_esc_(s.name) + '\'!$' + s.titleRows[0] + ':$' + s.titleRows[1] + '</definedName>';
  });
  if (dn) wb += '<definedNames>' + dn + '</definedNames>';
  wb += '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  files.push({ name: 'xl/workbook.xml', data: wb });
  var rel = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  sheets.forEach(function (s, i) { rel += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; });
  rel += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: rel });
  files.push({ name: 'xl/styles.xml', data: styles.xml() });
  sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml() }); });
  return xl_zip_(files);
}

/* =====================================================================
 *  LAPORAN RINCIAN + REKAP  (sesuai file Excel Dinkes)
 * ===================================================================== */
var XL_FMT_NUM = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@';
var XL_FMT_RP = '_-"Rp"* #,##0_-;\\-"Rp"* #,##0_-;_-"Rp"* "-"??_-;_-@';

/**
 * data = {
 *   judul1, judul2, subJudul (mis. "Realisasi s/d Tanggal 30 Sept 2026"), labelPagu ("PAGU MURNI"/"PAGU PERUBAHAN"),
 *   angkasLabel ("ANGGARAN KAS S/D SEPTEMBER 2026 "),
 *   units: [{nama, nodes:[{level:'program'|'kegiatan'|'sub', kode, uraian, pagu, real, angkas, leaf:bool}], pagu, real, angkas}],
 *   rekap: {judul, sub, rows:[{nama,pagu,real,angkas}], pad:{judul, rows:[{nama,target,real,angkas}]}},
 *   sheetRincian, sheetRekap
 * }
 * Setiap node sudah berisi total (agregat) dari backend.
 */
function xl_buildLaporan_(data) {
  var st = new XlStyles();
  var B = 'Bookman Old Style', med = { l: 'medium', r: 'medium', t: 'medium', b: 'medium' };
  var S = {
    title: st.xf({ font: B, sz: 14, b: 1, h: 'center', v: 'center' }),
    sub12: st.xf({ sz: 12, v: 'center' }),
    sub5: st.xf({ font: B, sz: 12, b: 1, v: 'center' }),
    head: st.xf({ font: B, sz: 12, b: 1, fill: 'FFFFFF', border: med, h: 'center', v: 'center', wrap: 1 })
  };
  function rowStyles(level) {
    var bold = level !== 'sub';
    var fill = { unit: 'FFFF00', program: '99CCFF', kegiatan: 'CCFFCC' }[level] || null;
    var base = { font: B, sz: 12, b: bold ? 1 : 0, border: med, v: 'center' };
    function mk(extra, withFill) { var o = {}; for (var k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; if (withFill && fill) o.fill = fill; return st.xf(o); }
    return {
      A: mk(level === 'urusan' || level === 'unit' ? { h: 'left', wrap: 1 } : { h: 'left' }, true), B: mk({ h: 'left', wrap: 1 }, true),
      C: mk({ fmt: XL_FMT_NUM, h: 'right' }, true), D: mk({ fmt: XL_FMT_NUM, h: 'right' }, true),
      E: mk({ fmt: XL_FMT_NUM }, true), F: mk({ fmt: '0.00', h: 'center', wrap: 1 }, true),
      G: mk({ fmt: XL_FMT_NUM, h: 'right' }, false), H: mk({ fmt: '0.00', h: 'center' }, false), I: mk({ fmt: '0.00', h: 'center' }, false)
    };
  }
  var sh = new XlSheet(data.sheetRincian || 'Rincian');
  sh.cols = [[1, 1, 22.29], [2, 2, 59.43], [3, 5, 26.43], [6, 6, 14.71], [7, 7, 29.43], [8, 8, 14.29], [9, 9, 13.29], [10, 10, 20.86], [11, 17, 8.57], [18, 26, 8.71]];
  sh.freeze = 8;
  [1, 2, 3, 4, 5].forEach(function (r) { sh.heights[r] = 15.75; });
  sh.set(1, 1, { v: data.judul1, s: S.title }); sh.merge(1, 1, 1, 9);
  sh.set(2, 1, { v: data.judul2, s: S.title }); sh.merge(2, 1, 2, 9);
  sh.set(3, 1, { s: S.sub12 }); sh.merge(3, 1, 3, 4);
  sh.set(4, 1, { s: S.sub12 }); sh.merge(4, 1, 4, 4);
  sh.set(5, 1, { v: data.subJudul, s: S.sub5 });
  var heads = ['KODE', 'Urusan/ Bidang Urusan/ Program/\nKegiatan/ Sub Kegiatan', data.labelPagu, 'REALISASI', 'SISA ANGGARAN', 'REALISASI (%)', data.angkasLabel, '  ANGKAS (%) ', 'DEVIASI (%)'];
  heads.forEach(function (h, i) { sh.set(6, i + 1, { v: h, s: S.head }); sh.merge(6, i + 1, 8, i + 1); });
  sh.fillStyle(6, 1, 8, 9, S.head);
  [6, 7, 8].forEach(function (r) { sh.heights[r] = 15.75; });

  var r = 9;
  function putRow(level, kode, uraian, pagu, real, angkas, opts) {
    opts = opts || {};
    var rs = rowStyles(level);
    var f = opts.f || {};
    sh.set(r, 1, { v: kode, s: rs.A });
    if (level === 'urusan' || level === 'unit' || opts.mergeAB) { sh.set(r, 2, { s: rs.B }); sh.merge(r, 1, r, 2); }
    else sh.set(r, 2, { v: uraian, s: rs.B });
    sh.set(r, 3, { v: pagu, s: rs.C });
    sh.set(r, 4, { v: real, f: f.D, s: rs.D });
    sh.set(r, 5, { v: pagu - real, f: 'C' + r + '-D' + r, s: rs.E });
    var fr = pagu ? real / pagu * 100 : 0, ha = pagu ? angkas / pagu * 100 : 0;
    sh.set(r, 6, { v: fr, f: 'IFERROR(D' + r + '/C' + r + '*100,0)', s: rs.F });
    sh.set(r, 7, { v: angkas, f: f.G, s: rs.G });
    sh.set(r, 8, { v: ha, f: 'IFERROR(G' + r + '/C' + r + '*100,0)', s: rs.H });
    sh.set(r, 9, { v: fr - ha, f: 'IFERROR(F' + r + '-H' + r + ',0)', s: rs.I });
    var len = String(uraian || '').length, lines = Math.max(1, Math.ceil(len / (level === 'sub' ? 52 : 46)));
    var base = { urusan: 33.75, bidang: 24, unit: 30.75, jumlah: 30.75 }[level] || 32.25;
    sh.heights[r] = Math.max(base, lines * 16.5 + 3);
    return r++;
  }
  var tot = { pagu: 0, real: 0, angkas: 0 };
  data.units.forEach(function (u) { tot.pagu += u.pagu; tot.real += u.real; tot.angkas += u.angkas; });
  var rowUrusan = r, rowBidang = r + 1;
  // placeholder rows; rumus diisi setelah baris unit diketahui
  putRow('urusan', 'URUSAN PEMERINTAHAN WAJIB YANG BERKAITAN DENGAN PELAYANAN DASAR', '', tot.pagu, tot.real, tot.angkas);
  putRow('urusan', 'URUSAN PEMERINTAHAN BIDANG KESEHATAN', '', tot.pagu, tot.real, tot.angkas);
  sh.heights[rowBidang] = 24;
  var unitRows = [];
  data.units.forEach(function (u) {
    var unitRow = r;
    unitRows.push(unitRow);
    putRow('unit', u.nama, '', u.pagu, u.real, u.angkas);
    // pagu unit/ angkas unit tetap angka (seperti Excel); realisasi = SUM anak langsung
    var stack = [{ level: 'unit', row: unitRow, kids: [] }];
    u.nodes.forEach(function (n) {
      var depth = { program: 1, kegiatan: 2, sub: 3 }[n.level];
      while (stack.length > depth) {
        var done = stack.pop();
        if (done.kids.length) sh.rows[done.row][4].f = 'SUM(' + done.kids.map(function (k) { return 'D' + k; }).join(',') + ')';
      }
      var rowN = r;
      putRow(n.level, n.kode, n.uraian, n.pagu, n.real, n.angkas);
      stack[stack.length - 1].kids.push(rowN);
      if (n.level !== 'sub') stack.push({ level: n.level, row: rowN, kids: [] });
    });
    while (stack.length) {
      var d = stack.pop();
      if (d.kids.length) sh.rows[d.row][4].f = 'SUM(' + d.kids.map(function (k) { return 'D' + k; }).join(',') + ')';
    }
  });
  var sumUnits = 'SUM(' + unitRows.map(function (x) { return 'D' + x; }).join(',') + ')';
  sh.rows[rowUrusan][4].f = 'SUM(D' + rowBidang + ')';
  sh.rows[rowBidang][4].f = sumUnits;
  var jr = r;
  putRow('jumlah', 'Jumlah', '', tot.pagu, tot.real, tot.angkas, { mergeAB: true, f: { D: sumUnits } });
  // Jumlah: gaya sesuai Excel (A tengah)
  sh.rows[jr][1].s = st.xf({ font: B, sz: 12, b: 1, border: med, h: 'center', v: 'center', wrap: 1 });
  sh.titleRows = [6, 8];

  /* ---- sheet rekap ---- */
  if (data.rekap) {
    var rk = new XlSheet(data.sheetRekap || 'Rekap');
    rk.cols = [[1, 1, 40], [2, 2, 20.29], [3, 3, 23.57], [4, 4, 21.14], [5, 5, 12.57], [6, 6, 19.71], [7, 7, 16.14], [8, 8, 15], [9, 9, 8]];
    var thin = { l: 'thin', r: 'thin', t: 'thin', b: 'thin' };
    var T = {
      title: st.xf({ sz: 14, b: 1, h: 'center', v: 'center' }),
      sub: st.xf({ sz: 12, b: 1, h: 'center', v: 'center' }),
      hdr: st.xf({ b: 1, h: 'center', v: 'center', border: thin }),
      txt: st.xf({ v: 'center', border: thin }),
      rp: st.xf({ v: 'center', border: thin, fmt: XL_FMT_RP }),
      pct: st.xf({ v: 'center', border: thin, h: 'center', fmt: '#,##0.00' }),
      txtB: st.xf({ b: 1, v: 'center', border: thin, h: 'center' }),
      rpB: st.xf({ b: 1, v: 'center', border: thin, fmt: XL_FMT_RP }),
      pctB: st.xf({ b: 1, v: 'center', border: thin, h: 'center', fmt: '#,##0.00' }),
      padT: st.xf({ b: 1, h: 'center', v: 'center', wrap: 1 })
    };
    rk.heights[2] = 18.75; rk.heights[3] = 18.75;
    rk.set(2, 1, { v: data.rekap.judul, s: T.title }); rk.merge(2, 1, 2, 8);
    rk.set(3, 1, { v: data.rekap.sub, s: T.sub }); rk.merge(3, 1, 3, 8);
    function table(hr, labels, rows, first, totalLabel, isPad) {
      labels.forEach(function (l, i) { rk.set(hr, i + 1, { v: l, s: T.hdr }); });
      rk.heights[hr] = hr === 6 ? 26.25 : 30;
      var rr = hr + 1;
      rows.forEach(function (x) {
        rk.set(rr, 1, { v: x.nama, s: T.txt });
        rk.set(rr, 2, { v: x.pagu, s: T.rp }); rk.set(rr, 3, { v: x.real, s: T.rp });
        rk.set(rr, 4, isPad ? { v: x.real - x.pagu, f: 'C' + rr + '-B' + rr, s: T.rp } : { v: x.pagu - x.real, f: 'B' + rr + '-C' + rr, s: T.rp });
        var pr = x.pagu ? x.real / x.pagu * 100 : 0, pa = x.pagu ? x.angkas / x.pagu * 100 : 0;
        rk.set(rr, 5, { v: pr, f: 'IFERROR(C' + rr + '/B' + rr + '*100,0)', s: T.pct });
        rk.set(rr, 6, { v: x.angkas, s: T.rp });
        rk.set(rr, 7, { v: pa, f: 'IFERROR(F' + rr + '/B' + rr + '*100,0)', s: T.pct });
        rk.set(rr, 8, { v: pr - pa, f: 'E' + rr + '-G' + rr, s: T.pct });
        rk.heights[rr] = 26.25;
        rr++;
      });
      var t = { pagu: 0, real: 0, angkas: 0 };
      rows.forEach(function (x) { t.pagu += x.pagu; t.real += x.real; t.angkas += x.angkas; });
      var a = hr + 1, z = rr - 1, pr2 = t.pagu ? t.real / t.pagu * 100 : 0, pa2 = t.pagu ? t.angkas / t.pagu * 100 : 0;
      rk.set(rr, 1, { v: totalLabel, s: T.txtB });
      rk.set(rr, 2, { v: t.pagu, f: 'SUM(B' + a + ':B' + z + ')', s: T.rpB });
      rk.set(rr, 3, { v: t.real, f: 'SUM(C' + a + ':C' + z + ')', s: T.rpB });
      rk.set(rr, 4, isPad ? { v: t.real - t.pagu, f: 'C' + rr + '-B' + rr, s: T.rpB } : { v: t.pagu - t.real, f: 'B' + rr + '-C' + rr, s: T.rpB });
      rk.set(rr, 5, { v: pr2, f: 'IFERROR(C' + rr + '/B' + rr + '*100,0)', s: T.pctB });
      rk.set(rr, 6, { v: t.angkas, f: 'SUM(F' + a + ':F' + z + ')', s: T.rpB });
      rk.set(rr, 7, { v: pa2, f: 'IFERROR(F' + rr + '/B' + rr + '*100,0)', s: T.pctB });
      rk.set(rr, 8, { v: pr2 - pa2, f: 'E' + rr + '-G' + rr, s: T.pctB });
      rk.heights[rr] = 31.5;
      return rr;
    }
    var endRow = table(6, ['UNIT', 'PAGU', 'REALISASI', 'SISA ANGGARAN', '% Realisasi', 'Anggaran Kas', '% Angkas', 'Deviasi (%)'], data.rekap.rows, 7, 'JUMLAH');
    var padRow = endRow + 3;
    if (data.rekap.pad) {
      rk.heights[padRow] = 36.75;
      rk.set(padRow, 1, { v: data.rekap.pad.judul, s: T.padT }); rk.merge(padRow, 1, padRow, 8);
      table(padRow + 1, ['UNIT', 'Target Pendapatan', 'Realisasi Pendapatan', '+/-', '% Realisasi', 'Anggaran Kas', '% Angkas', 'Deviasi (%)'], data.rekap.pad.rows, padRow + 2, 'JUMLAH', true);
    }
    return xl_workbook_([sh, rk], st);
  }
  return xl_workbook_([sh], st);
}
