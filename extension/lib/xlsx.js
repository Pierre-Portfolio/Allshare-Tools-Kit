// Générateur minimal de fichiers Excel (.xlsx) sans dépendance.
//
// Un .xlsx est une archive ZIP de fichiers XML ; on l'écrit ici en mode
// « stocké » (sans compression), ce qu'Excel, LibreOffice et Google Sheets
// lisent sans problème.
//
// Feuille : { name, rows: [[cell]], cols: [largeurs], merges: ['A1:B1'],
//             freeze: { rows, cols }, autoFilter: 'A1:F20',
//             heights: { numéroDeLigne: hauteur },
//             scales: [{ ref: 'C6:D20', stops: [{ type: 'min' }, …], colors: ['FFFFFFFF', …] }] }
// Cellule : null | string | number | { v, s } où s est un nom de STYLES.

const enc = new TextEncoder();

export const STYLES = {
  default: 0,
  header: 1, // en-tête gras, fond bleu-gris, centré
  num: 2, // nombre entier « 1 234 »
  missing: 3, // case ROUGE : aucune mesure
  timeout: 4, // case grise : uniquement des mesures en timeout
  text: 5, // texte avec bordure
  title: 6, // titre
  muted: 7, // note en italique gris
  headerLeft: 8, // en-tête aligné à gauche
  pct: 9, // pourcentage « 12% »
  textBold: 10, // texte gras avec bordure (nom d'application)
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFBFBFBF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function esc(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 -> A, 25 -> Z, 26 -> AA… */
export function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(ref, cell) {
  if (cell === null || cell === undefined) return '';
  const c = typeof cell === 'object' ? cell : { v: cell };
  const style = STYLES[c.s] || 0;
  const s = style ? ` s="${style}"` : '';
  const v = c.v;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet) {
  const { rows = [], cols = [], merges = [], freeze, autoFilter, heights = {}, scales = [] } = sheet;

  let view = '<sheetView workbookViewId="0"/>';
  const ys = (freeze && freeze.rows) || 0;
  const xs = (freeze && freeze.cols) || 0;
  if (ys || xs) {
    const pane = ys && xs ? 'bottomRight' : ys ? 'bottomLeft' : 'topRight';
    const split = (xs ? ` xSplit="${xs}"` : '') + (ys ? ` ySplit="${ys}"` : '');
    view =
      `<sheetView workbookViewId="0"><pane${split} topLeftCell="${colName(xs)}${ys + 1}"` +
      ` activePane="${pane}" state="frozen"/><selection pane="${pane}"/></sheetView>`;
  }

  const colsXml = cols.length
    ? '<cols>' +
      cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') +
      '</cols>'
    : '';

  const rowsXml = rows
    .map((row, r) => {
      const cells = (row || []).map((cell, c) => cellXml(colName(c) + (r + 1), cell)).join('');
      const ht = heights[r + 1] ? ` ht="${heights[r + 1]}" customHeight="1"` : '';
      return `<row r="${r + 1}"${ht}>${cells}</row>`;
    })
    .join('');

  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews>${view}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    (autoFilter ? `<autoFilter ref="${autoFilter}"/>` : '') +
    (merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '') +
    scales.map(scaleXml).join('') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

/** Échelle de couleurs (mise en forme conditionnelle) : ne s'applique qu'aux nombres. */
function scaleXml(scale, i) {
  const stops = scale.stops
    .map((st) => `<cfvo type="${st.type}"${st.val !== undefined ? ` val="${st.val}"` : ''}/>`)
    .join('');
  const colors = scale.colors.map((c) => `<color rgb="${c}"/>`).join('');
  return (
    `<conditionalFormatting sqref="${scale.ref}"><cfRule type="colorScale" priority="${i + 1}">` +
    `<colorScale>${stops}${colors}</colorScale></cfRule></conditionalFormatting>`
  );
}

/** Nom de feuille valide pour Excel (31 caractères max, sans []:*?/\), unique. */
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s, i) => {
    const base =
      String(s.name || `Feuille ${i + 1}`)
        .replace(/[[\]:*?/\\]/g, ' ')
        .replace(/^'+|'+$/g, '')
        .trim()
        .slice(0, 31) || `Feuille ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Construit le fichier .xlsx et renvoie ses octets. */
export function buildXlsx(sheets, date = new Date()) {
  const names = sheetNames(sheets);
  const files = [
    {
      name: '[Content_Types].xml',
      data:
        XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        XML_HEAD +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zipStore(files, date);
}

// ---- ZIP (méthode 0 « stored »)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files, date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version nécessaire
    lv.setUint16(6, 0x0800, true); // noms en UTF-8
    lv.setUint16(8, 0, true); // stocké
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + end.length);
  let p = 0;
  for (const chunk of [...parts, ...central, end]) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}
