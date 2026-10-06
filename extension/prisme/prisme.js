// Prisme · tableau de bord : résumé, lecture / conversion, et 4 vues du fichier
// (détails avec anomalies, données brutes, visuel d'Excel, CSV brut) + inspecteur de cellule.
import {
  analyze,
  binaryKind,
  colLetter,
  convert,
  convertedName,
  delimName,
  demoBytes,
  DEMO_NAME,
  DEFS,
  encodeAnsi,
  encodingStatus,
  excelRecords,
  excelValue,
  filterRows,
  fmtSize,
  hex,
  isAnsiChar,
  ansiByte,
  classify,
  locLabel,
  rowsWithIssues,
  sortedGroups,
  FAM_LABEL,
  SEV_LABEL,
  RX_ZERO_WIDTH,
} from '../lib/prisme.js';
import {
  addFile,
  download,
  getFileBytes,
  getFiles,
  getPrismeSettings,
  readFile,
  savePrismeSettings,
  updateSummary,
} from '../lib/prisme-files.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const VIEWS = ['details', 'raw', 'excel', 'text'];
const PANES = { details: 'paneDetails', raw: 'paneRaw', excel: 'paneExcel', text: 'paneText' };
const STEP = 1000; // lignes affichées par tranche
const TXT_MAX_LINES = 5000;

const state = {
  settings: null,
  files: [],
  id: null,
  name: '',
  bytes: null,
  res: null,
  encOverride: 'auto',
  delimOverride: 'auto',
  search: '',
  onlyIssues: false,
  showInvis: false,
  limit: STEP,
  rawLimit: STEP,
  xlLimit: STEP,
  xl: null,
  xlHelp: '',
  sel: null,
  view: 'details',
  dirty: new Set(VIEWS), // vues à recalculer à leur prochain affichage
};

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---------------------------------------------------------------- Chargement

async function init() {
  [state.settings, state.files] = await Promise.all([getPrismeSettings(), getFiles()]);
  state.view = VIEWS.includes(state.settings.view) ? state.settings.view : 'details';
  $('selExpected').value = state.settings.expected;
  $('chkCrlf').checked = !!state.settings.crlf;
  renderRecent();
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || (state.files[0] && state.files[0].id);
  if (!id) return showDrop();
  const entry = state.files.find((f) => f.id === id);
  const bytes = entry && (await getFileBytes(id));
  if (!bytes) {
    showDrop();
    return toast('Ce fichier ne fait plus partie des fichiers récents.');
  }
  setFile(entry.id, entry.name, bytes);
  if (params.get('issue')) focusIssue(params.get('issue'));
}

/** Fichier choisi ou déposé : refus des fichiers binaires, analyse puis ajout aux fichiers récents. */
async function openBytes(bytes, name) {
  const kind = binaryKind(bytes, name);
  if (kind) {
    showDrop();
    $('dropError').innerHTML = `<strong>« ${esc(name)} » n'est pas un fichier CSV : c'est ${kind}.</strong><br>
      Ce type de fichier est compressé ou binaire, son contenu ne peut pas être lu comme du texte.<br>
      Dans Excel : <em>Fichier › Enregistrer sous › « CSV (séparateur : point-virgule) (*.csv) »</em> — ce format est enregistré en ANSI.
      Ouvrez ensuite le fichier .csv obtenu.`;
    $('dropError').hidden = false;
    return;
  }
  const entry = await addFile(name, bytes, analyze(bytes, { expected: state.settings.expected }));
  state.files = await getFiles();
  renderRecent();
  setFile(entry.id, name, bytes);
}

function setFile(id, name, bytes) {
  Object.assign(state, {
    id,
    name,
    bytes,
    encOverride: 'auto',
    delimOverride: 'auto',
    limit: STEP,
    rawLimit: STEP,
    xlLimit: STEP,
    sel: null,
  });
  $('selEnc').value = 'auto';
  $('selDelim').value = 'auto';
  $('dropError').hidden = true;
  closeInspector();
  history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  document.title = `${name} · Prisme`;
  $('recentPick').value = id;
  reanalyze();
}

function reanalyze() {
  state.res = analyze(state.bytes, {
    expected: state.settings.expected,
    encOverride: state.encOverride,
    delimOverride: state.delimOverride,
  });
  state.dirty = new Set(VIEWS);
  renderAll();
}

function showDrop() {
  closeInspector();
  $('view').hidden = true;
  $('drop').hidden = false;
}

// ---------------------------------------------------------------- Affichage

function renderAll() {
  renderCards();
  renderIssues();
  renderView();
  $('drop').hidden = true;
  $('view').hidden = false;
}

function renderRecent() {
  const pick = $('recentPick');
  pick.hidden = state.files.length < 2;
  pick.replaceChildren(
    ...state.files.map((f) => Object.assign(document.createElement('option'), { value: f.id, textContent: f.name })),
  );
  if (state.id && !state.files.some((f) => f.id === state.id)) {
    pick.prepend(Object.assign(document.createElement('option'), { value: state.id, textContent: state.name }));
  }
  if (state.id) pick.value = state.id;
}

function renderCards() {
  const R = state.res;
  const d = R.dec;
  const enc = encodingStatus(R);
  const rowsBad = rowsWithIssues(R);
  const card = (k, v, s, cls = '') =>
    `<div class="card ${cls}"><div class="k">${k}</div><div class="v" title="${esc(String(v).replace(/<[^>]+>/g, ''))}">${v}</div><div class="s">${s}</div></div>`;
  const lowConf = R.dg.conf < 0.7 && state.delimOverride === 'auto';
  $('cards').innerHTML = [
    card('Fichier', esc(state.name), fmtSize(state.bytes.length)),
    card(
      'Encodage',
      esc(d.label).replace(/-/g, '\u2011'), // « UTF-8 » non coupé en fin de ligne
      enc.ok ? "Conforme à l'attendu" : R.options.expected === 'ansi' ? 'ANSI attendu' : 'UTF-8 attendu',
      enc.cls,
    ),
    card(
      'Séparateur',
      esc(delimName(R.delim)),
      state.delimOverride === 'auto' ? `détecté · confiance ${(R.dg.conf * 100).toFixed(0)} %` : 'forcé',
      lowConf ? 'warn' : '',
    ),
    card(
      'Fins de ligne',
      R.eol.label,
      `CRLF ${R.eol.crlf} · LF ${R.eol.lf} · CR ${R.eol.cr}`,
      R.eol.label === 'Mixtes' ? 'warn' : '',
    ),
    card('Lignes de données', nf.format(R.dataIdx.length), `${nf.format(R.recs.length)} enregistrement(s) au total`),
    card(
      'Colonnes',
      R.expected,
      R.maxCols > R.expected ? `jusqu'à ${R.maxCols} sur certaines lignes` : 'cohérent sur tout le fichier',
      R.maxCols > R.expected ? 'err' : 'ok',
    ),
    card(
      'Anomalies',
      `<span class="sev error">${R.counts.error}</span><span class="sev warning">${R.counts.warning}</span><span class="sev info">${R.counts.info}</span>`,
      `${rowsBad} ligne(s) concernée(s)`,
      R.counts.error ? 'err' : R.counts.warning ? 'warn' : 'ok',
    ),
  ].join('');
}

function renderIssues() {
  const R = state.res;
  const gs = sortedGroups(R);
  const n = (sev) => gs.filter((g) => g.sev === sev).length;
  $('issuesSummary').innerHTML =
    `Anomalies détectées <span class="sev error">${n('error')} type(s) d'erreur</span>` +
    `<span class="sev warning">${n('warning')} alerte(s)</span><span class="sev info">${n('info')} info(s)</span>`;
  if (!gs.length) {
    $('issues').innerHTML = '<div class="no-issue">✓ Aucune anomalie détectée.</div>';
    return;
  }
  const MAX = 120;
  const html = gs
    .map((g) => {
      const count = g.locs.length;
      const locs = g.locs
        .slice(0, MAX)
        .map(
          (l, i) =>
            `<button type="button" class="loc" data-g="${g.code}" data-i="${i}">${esc(locLabel(R, l))}</button>`,
        )
        .join('');
      const more = count > MAX ? `<span class="count">+ ${count - MAX} autres…</span>` : '';
      return `<div class="issue ${g.sev}" data-code="${g.code}">
      <div class="head"><span class="sev ${g.sev}">${SEV_LABEL[g.sev]}</span><span class="title">${esc(g.t)}</span>${count ? `<span class="count">${nf.format(count)} occurrence(s)</span>` : ''}</div>
      ${g.h ? `<div class="hint">${esc(g.h)}</div>` : ''}
      ${g.details.length ? `<div class="detail">${g.details.map(esc).join('<br>')}</div>` : ''}
      ${count ? `<div class="locs">${locs}${more}</div>` : ''}
    </div>`;
    })
    .join('');
  $('issues').innerHTML = `<div class="issue-list">${html}</div>`;
  if (!gs.some((g) => g.sev !== 'info')) {
    $('issues').insertAdjacentHTML(
      'afterbegin',
      '<div class="no-issue">✓ Aucune erreur ni alerte : uniquement des informations.</div>',
    );
  }
}

const VIEW_HELP = {
  details:
    "Cliquez sur une cellule pour l'inspecter caractère par caractère, sur un emplacement d'anomalie pour y sauter.",
  raw: "Valeurs telles qu'elles sont dans le fichier, sans surlignage. Colonnes de largeur identique, retour à la ligne au-delà de 50 caractères.",
  text: 'Le contenu texte du fichier tel quel, ligne par ligne, comme dans le Bloc-notes.',
};

function renderView() {
  for (const b of $('views').querySelectorAll('[data-view]')) {
    b.setAttribute('aria-checked', String(b.dataset.view === state.view));
  }
  for (const [view, pane] of Object.entries(PANES)) $(pane).hidden = view !== state.view;
  $('detailTools').hidden = state.view !== 'details';
  $('btnCopyTxt').hidden = state.view !== 'text';
  if (state.dirty.has(state.view)) {
    ({ details: renderGrid, raw: renderRaw, excel: renderExcel, text: renderText })[state.view]();
    state.dirty.delete(state.view);
  }
  $('viewHelp').innerHTML = state.view === 'excel' ? state.xlHelp : esc(VIEW_HELP[state.view]);
}

/** Valeur affichée : espaces de bord, tabulations, insécables, invisibles et contrôles rendus visibles. */
function visual(v, showAll) {
  const lead = v.match(/^[ \t]*/)[0].length;
  const trail = lead === v.length ? 0 : v.match(/[ \t]*$/)[0].length;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    const code = v.charCodeAt(i);
    const edge = i < lead || i >= v.length - trail;
    if (ch === ' ') out += edge ? '<span class="ws-edge">·</span>' : showAll ? '<span class="ws">·</span>' : ' ';
    else if (ch === '\t') {
      out += edge
        ? '<span class="ws-edge">→</span>'
        : showAll
          ? '<span class="ws">→</span>'
          : '<span class="bad">⇥</span>';
    } else if (ch === ' ' || ch === ' ') out += '<span class="bad" title="Espace insécable">⍽</span>';
    else if (RX_ZERO_WIDTH.test(ch)) out += `<span class="bad" title="U+${hex(code, 4)}">ZW</span>`;
    else if (ch === '\r') out += '<span class="bad" title="CR">␍</span>';
    else if (ch === '\n') out += '<span class="bad" title="LF">␊</span>';
    else if (code < 0x20 || code === 0x7f) {
      out += `<span class="bad" title="U+${hex(code, 4)}">${String.fromCharCode(code === 0x7f ? 0x2421 : 0x2400 + code)}</span>`;
    } else if (code >= 0x80 && code <= 0x9f) out += `<span class="bad" title="U+${hex(code, 4)}">x${hex(code)}</span>`;
    else out += esc(ch);
  }
  return out;
}

const moreBar = (shown, total, more, all) =>
  `<div class="more">${nf.format(shown)} / ${nf.format(total)} lignes affichées · <button type="button" id="${more}">Afficher 1000 lignes de plus</button>${all ? ` <button type="button" id="${all}">Tout afficher</button>` : ''}</div>`;

/** Vue « Détails » : grille surlignée selon la gravité des anomalies. */
function renderGrid() {
  const R = state.res;
  const { recs, header, expected, maxCols, cols, cellIss, cellSev, rowSev, rowIss } = R;
  let h = '<table class="cgrid" id="grid"><thead><tr><th class="rn" title="N° de ligne dans le fichier">Ligne</th>';
  for (let c = 0; c < maxCols; c++) {
    if (c >= expected) {
      h += `<th class="extra" data-c="${c}" title="Colonne sans en-tête : valeurs en trop"><div class="letter">${colLetter(c)}</div><div class="name">⚠ en trop +${c - expected + 1}</div><div class="meta">hors en-tête</div></th>`;
      continue;
    }
    const st = cols[c];
    const name = header[c] ? header[c].v : '';
    const pct = st.total ? Math.round((st.filled / st.total) * 100) : 0;
    const sv = cellSev.get(`0:${c}`);
    h += `<th data-c="${c}" data-r="0" class="${sv === 'error' ? 'bad-h' : ''}" title="${esc(`Colonne ${colLetter(c)} · type ${FAM_LABEL[st.dom]} · rempli ${pct} % · longueur max ${st.maxLen}`)}">
      <div class="letter">${colLetter(c)}</div>
      <div class="name">${name.trim() ? visual(name, state.showInvis) : '<span class="bad">sans nom</span>'}</div>
      <div class="meta"><span class="type">${FAM_LABEL[st.dom]}</span><span class="fill"><i style="width:${pct}%"></i></span>${pct} %</div></th>`;
  }
  h += '</tr></thead><tbody>';

  const rows = filterRows(R, { search: state.search, onlyIssues: state.onlyIssues });
  const shown = rows.slice(0, state.limit);
  const parts = [];
  for (const r of shown) {
    const rec = recs[r];
    const rs = rowSev.get(r);
    const dot = rs
      ? `<span class="dot" style="background:var(--${rs === 'error' ? 'err' : rs === 'warning' ? 'warn' : 'info'})"></span>`
      : '';
    const rowTitle = rowIss.has(r)
      ? rowIss
          .get(r)
          .map((k) => `• ${DEFS[k].t}`)
          .join('\n')
      : '';
    let tr = `<tr data-r="${r}" class="${rs ? `r-${rs}` : ''}${rec.empty ? ' emptyline' : ''}"><td class="rn" title="${esc(rowTitle)}">${dot}${rec.line}</td>`;
    if (rec.empty) {
      parts.push(`${tr}<td colspan="${maxCols}" data-c="0">— ligne vide —</td></tr>`);
      continue;
    }
    for (let c = 0; c < maxCols; c++) {
      const f = rec.fields[c];
      if (!f) {
        tr +=
          c < expected
            ? `<td class="missing" data-c="${c}" title="Valeur absente : la ligne a moins de colonnes que l'en-tête">absent</td>`
            : `<td data-c="${c}"></td>`;
        continue;
      }
      const k = `${r}:${c}`;
      const cs = cellSev.get(k);
      let cls = cs ? `c-${cs}` : '';
      if (c >= expected) cls += ' extra';
      if (c < expected && cols[c].dom === 'num') cls += ' num';
      if (!f.v) cls += ' empty-cell';
      const tip = cellIss.has(k)
        ? cellIss
            .get(k)
            .map((x) => `• ${DEFS[x].t}`)
            .join('\n')
        : '';
      tr += `<td class="${cls}" data-c="${c}"${tip ? ` title="${esc(tip)}"` : ''}>${visual(f.v, state.showInvis)}</td>`;
    }
    parts.push(`${tr}</tr>`);
  }
  h += `${parts.join('')}</tbody></table>`;
  if (!rows.length) h += '<div class="empty-state">Aucune ligne ne correspond aux filtres.</div>';
  if (rows.length > shown.length) h += moreBar(shown.length, rows.length, 'btnMore', 'btnAll');
  $('gridWrap').innerHTML = h;
  if ($('btnMore')) {
    $('btnMore').onclick = () => {
      state.limit += STEP;
      renderGrid();
    };
    $('btnAll').onclick = () => {
      state.limit = Infinity;
      renderGrid();
    };
  }
  if (state.sel) markSel();
}

/** Vue « Données brutes » : colonnes de largeur égale (50 caractères au plus, puis retour à la ligne). */
function renderRaw() {
  const { recs, header, maxCols } = state.res;
  const rows = recs.slice(1).filter((rec) => !rec.empty);
  const shown = rows.slice(0, state.rawLimit);
  let w = 8;
  for (const rec of [recs[0], ...shown]) {
    if (rec) for (const f of rec.fields) w = Math.max(w, ...f.v.split(/\r\n|\r|\n/).map((l) => l.length));
  }
  w = Math.min(w, 50);
  const colW = `calc(${w}ch + 22px)`;
  let h = `<table class="rawdata" style="width:calc(${maxCols} * (${w}ch + 22px))"><colgroup>${`<col style="width:${colW}">`.repeat(maxCols)}</colgroup><thead><tr>`;
  for (let c = 0; c < maxCols; c++) h += `<th>${esc(header[c] ? header[c].v : '')}</th>`;
  h += '</tr></thead><tbody>';
  h += shown
    .map((rec) => {
      let tr = '<tr>';
      for (let c = 0; c < maxCols; c++) tr += `<td>${rec.fields[c] ? esc(rec.fields[c].v) : ''}</td>`;
      return `${tr}</tr>`;
    })
    .join('');
  h += '</tbody></table>';
  if (rows.length > shown.length) h += moreBar(shown.length, rows.length, 'btnRawMore', 'btnRawAll');
  $('rawWrap').innerHTML = h;
  if ($('btnRawMore')) {
    $('btnRawMore').onclick = () => {
      state.rawLimit += STEP;
      renderRaw();
    };
    $('btnRawAll').onclick = () => {
      state.rawLimit = Infinity;
      renderRaw();
    };
  }
}

/**
 * Vue « Visuel d'Excel » : double-clic sur le fichier dans un Excel français. Colonnes de largeur
 * par défaut (64 px), nombres et dates alignés à droite, texte qui déborde sur les cellules vides.
 */
function renderExcel() {
  const { recs, notes } = excelRecords(state.bytes, state.res);
  const nRows = Math.min(recs.length, state.xlLimit);
  const nCols = recs.reduce((n, r) => Math.max(n, r.fields.length), 0);
  const cols = Math.max(nCols + 3, 20);
  const rows = nRows + 10;
  state.xl = { recs };
  const vals = recs.slice(0, nRows).map((rec) => rec.fields.map((f) => excelValue(f.v)));
  // Comme Excel : une colonne contenant une date est élargie pour l'afficher entièrement.
  const widths = Array.from({ length: cols }, (_, c) => (vals.some((v) => v[c] && v[c].date) ? 80 : 64));
  state.xlHelp = [
    "Simulation d'un double-clic sur le fichier dans Excel (paramètres régionaux français) : colonnes de largeur par défaut, nombres et dates alignés à droite, texte qui déborde sur les cellules vides.",
    ...notes.map((n) => `⚠ ${n}`),
  ]
    .map(esc)
    .join('<br>');

  let h = `<div class="xl-bar"><div class="xl-name" id="xlName">A1</div><div class="xl-fx">fx</div><div class="xl-formula" id="xlFormula"></div></div>`;
  h += `<div class="xl-scroll"><table class="xlgrid" style="width:${46 + widths.reduce((a, b) => a + b, 0)}px"><colgroup><col style="width:46px">${widths.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>`;
  h += '<thead><tr><th class="rh"></th>';
  for (let c = 0; c < cols; c++) h += `<th data-xc="${c}">${colLetter(c)}</th>`;
  h += '</tr></thead><tbody>';
  const parts = [];
  for (let r = 0; r < rows; r++) {
    const rv = r < nRows ? vals[r] : [];
    let tr = `<tr><th class="rh" data-xr="${r}">${r + 1}</th>`;
    for (let c = 0; c < cols; c++) {
      const x = rv[c];
      if (!x || x.v === '') {
        tr += `<td data-xr="${r}" data-xc="${c}"></td>`;
        continue;
      }
      const nextEmpty = !x.n && (!rv[c + 1] || rv[c + 1].v === '');
      tr += `<td data-xr="${r}" data-xc="${c}" class="${x.n ? 'n' : ''}${nextEmpty ? ' ov' : ''}">${esc(x.v)}</td>`;
    }
    parts.push(`${tr}</tr>`);
  }
  h += `${parts.join('')}</tbody></table></div>`;
  if (recs.length > nRows) h += moreBar(nRows, recs.length, 'btnXlMore');
  const sheet = (state.name.replace(/\.[^.]+$/, '') || 'Feuil1').slice(0, 31);
  h += `<div class="xl-tabs"><span class="xl-tab">${esc(sheet)}</span></div>`;
  h += '<div class="xl-status"><span>Prêt</span><span>100 %</span></div>';
  $('xlWrap').innerHTML = h;
  if ($('btnXlMore')) {
    $('btnXlMore').onclick = () => {
      state.xlLimit += STEP;
      renderExcel();
    };
  }
  selectXl(0, 0);
}

function selectXl(r, c) {
  const w = $('xlWrap');
  w.querySelectorAll('.sel, .on').forEach((e) => e.classList.remove('sel', 'on'));
  const td = w.querySelector(`td[data-xr="${r}"][data-xc="${c}"]`);
  if (td) td.classList.add('sel');
  w.querySelector(`thead th[data-xc="${c}"]`)?.classList.add('on');
  w.querySelector(`th.rh[data-xr="${r}"]`)?.classList.add('on');
  const rec = state.xl.recs[r];
  $('xlName').textContent = colLetter(c) + (r + 1);
  $('xlFormula').textContent = rec && rec.fields[c] ? excelValue(rec.fields[c].v).v : '';
}

/** Vue « CSV brut » : texte du fichier avec numéros de ligne. */
function renderText() {
  const lines = state.res.dec.text.split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const shown = lines.slice(0, TXT_MAX_LINES);
  let body = esc(shown.join('\n'));
  if (lines.length > shown.length) {
    body += `\n\n… ${nf.format(lines.length - shown.length)} ligne(s) suivante(s) non affichée(s)`;
  }
  $('txtWrap').innerHTML =
    `<pre class="txt-gutter">${shown.map((_, i) => i + 1).join('\n')}</pre><pre class="txt-body">${body}</pre>`;
}

// ---------------------------------------------------------------- Inspecteur de cellule

function openInspector(r, c) {
  const R = state.res;
  const rec = R.recs[r];
  if (!rec) return;
  state.sel = { r, c };
  markSel();
  const f = rec.fields[c];
  const colName =
    c >= R.expected ? `en trop +${c - R.expected + 1}` : (R.header[c] && R.header[c].v.trim()) || 'sans nom';
  $('inspTitle').textContent = `${r === 0 ? 'En-tête' : `Ligne ${rec.line}`} · ${colLetter(c)} « ${colName} »`;

  let h = '';
  // Anomalies de la cellule, puis de la ligne
  const cellCodes = R.cellIss.get(`${r}:${c}`) || [];
  const rowCodes = (R.rowIss.get(r) || []).filter((k) => !cellCodes.includes(k));
  const issueBox = (k, suffix = '') => {
    const g = R.groups.get(k);
    return `<div class="issue ${g.sev}"><div class="head"><span class="sev ${g.sev}">${SEV_LABEL[g.sev]}</span><span class="title">${esc(g.t)}${suffix}</span></div>${g.h ? `<div class="hint">${esc(g.h)}</div>` : ''}</div>`;
  };
  if (cellCodes.length || rowCodes.length) {
    h += "<h3>Anomalies</h3><div class='ilist'>";
    h += cellCodes.map((k) => issueBox(k)).join('');
    h += rowCodes
      .map((k) =>
        issueBox(k, k === 'dup-row' && rec.dupOf ? ` (identique à la ligne ${rec.dupOf})` : ' — sur la ligne'),
      )
      .join('');
    h += '</div>';
  }

  // Valeur
  if (f) {
    const cl = classify(f.v);
    h += `<h3>Valeur</h3><div class="valbox">${f.v ? visual(f.v, true) : '<span class="ws">(vide)</span>'}</div>`;
    h += `<div class="kv">
      <div>Longueur</div><div>${[...f.v].length} caractère(s)</div>
      <div>Type détecté</div><div>${FAM_LABEL[cl.fam]}${cl.sub ? ` · ${esc(cl.sub)}` : ''}</div>
      <div>Entre guillemets</div><div>${f.q ? 'oui' : 'non'}</div>
      <div>Octets ANSI</div><div>${[...f.v].every(isAnsiChar) ? encodeAnsi(f.v).bytes.length : 'non convertible'}</div>
      <div>Octets UTF-8</div><div>${new TextEncoder().encode(f.v).length}</div>
    </div>`;
  } else if (c < R.expected) {
    h += `<h3>Valeur</h3><div class="valbox"><span class="bad">absente</span> — la ligne ne contient que ${rec.fields.length} valeur(s) pour ${R.expected} colonnes.</div>`;
  }

  // Ligne brute avec ses séparateurs
  const raw = R.dec.text.slice(rec.start, rec.end);
  let fi = 0;
  const delimSet = new Set(rec.delims);
  const openSeg = () => `<span class="fi${fi === c ? ' cur' : ''}">`;
  let rawHtml = openSeg();
  for (let i = rec.start; i < rec.end; i++) {
    if (delimSet.has(i)) {
      fi++;
      rawHtml += `</span><span class="dl${fi >= R.expected ? ' over' : ''}" title="Séparateur n°${fi}">${esc(R.delim === '\t' ? '⇥' : R.delim)}</span>${openSeg()}`;
    } else rawHtml += visual(R.dec.text[i], true);
  }
  rawHtml += '</span>';
  h += `<h3>Ligne brute (${rec.fields.length} valeur(s), ${rec.delims.length} séparateur(s) — attendu ${R.expected - 1})</h3><div class="raw">${raw.length ? rawHtml : '<span class="ws">(vide)</span>'}</div>`;

  // Caractères un par un
  if (f && f.v) {
    const chars = [...f.v].slice(0, 300);
    const te = new TextEncoder();
    h += `<h3>Caractères (${chars.length}${[...f.v].length > 300 ? ' premiers' : ''})</h3><table class="chars"><tr><th>Car.</th><th>Unicode</th><th>ANSI</th><th>UTF-8</th><th></th></tr>`;
    h += chars
      .map((ch) => {
        const cp = ch.codePointAt(0);
        const ansi = ansiByte(ch);
        const u8 = [...te.encode(ch)].map((b) => hex(b)).join(' ');
        const note =
          cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)
            ? 'contrôle'
            : cp === 0xa0 || cp === 0x202f
              ? 'insécable'
              : cp === 0x20
                ? 'espace'
                : cp === 0xfffd
                  ? 'remplacement'
                  : RX_ZERO_WIDTH.test(ch)
                    ? 'invisible'
                    : '';
        return `<tr class="${ansi === undefined ? 'nonansi' : ''} ${cp > 127 ? 'nonascii' : ''}"><td>${visual(ch, true)}</td><td>U+${hex(cp, 4)}</td><td>${ansi === undefined ? '✗' : hex(ansi)}</td><td>${u8}</td><td>${note}</td></tr>`;
      })
      .join('');
    h += '</table>';
  }
  $('inspBody').innerHTML = h;
  $('insp').classList.add('open');
}

function markSel() {
  document.querySelectorAll('#grid .sel').forEach((e) => e.classList.remove('sel'));
  if (!state.sel) return;
  const tr =
    state.sel.r === 0
      ? document.querySelector('#grid thead tr')
      : document.querySelector(`#grid tr[data-r="${state.sel.r}"]`);
  tr?.querySelector(`[data-c="${state.sel.c}"]`)?.classList.add('sel');
}

function closeInspector() {
  $('insp').classList.remove('open');
  state.sel = null;
  markSel();
}

// ---------------------------------------------------------------- Navigation vers une anomalie

function setView(view) {
  state.view = view;
  renderView();
  savePrismeSettings({ view });
}

function jumpTo(loc) {
  if (loc.r === undefined) return;
  if (state.view !== 'details') setView('details');
  if (loc.r > 0) {
    let rows = filterRows(state.res, { search: state.search, onlyIssues: state.onlyIssues });
    if (!rows.includes(loc.r)) {
      state.search = '';
      $('search').value = '';
      state.onlyIssues = false;
      $('chkIssues').checked = false;
      rows = filterRows(state.res);
    }
    const idx = rows.indexOf(loc.r);
    if (idx >= state.limit) state.limit = idx + 200;
    renderGrid();
  }
  const tr =
    loc.r === 0 ? document.querySelector('#grid thead tr') : document.querySelector(`#grid tr[data-r="${loc.r}"]`);
  if (!tr) return;
  const target = (loc.c !== undefined && tr.querySelector(`[data-c="${loc.c}"]`)) || tr;
  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  target.classList.remove('flash');
  void target.offsetWidth;
  target.classList.add('flash');
  openInspector(loc.r, loc.c !== undefined ? loc.c : 0);
}

/** Ouverture depuis le panneau sur une anomalie : liste dépliée, anomalie mise en évidence. */
function focusIssue(code) {
  if (state.view !== 'details') setView('details');
  $('issuesBox').open = true;
  const box = document.querySelector(`.issue[data-code="${CSS.escape(code)}"]`);
  if (!box) return;
  box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  box.classList.add('flash');
}

// ---------------------------------------------------------------- Export

function exportAs(encoding) {
  const { bytes, lost, suffix } = convert(state.res, encoding, $('chkCrlf').checked);
  download(bytes, convertedName(state.name, suffix));
  if (encoding === 'utf8') toast('Exporté en UTF-8 avec BOM');
  else {
    toast(
      lost
        ? `Exporté en ANSI : ${nf.format(lost)} caractère(s) non convertible(s) remplacé(s) par « ? »`
        : 'Exporté en ANSI (Windows-1252) sans perte',
    );
  }
}

// ---------------------------------------------------------------- Évènements

const openPicker = () => $('fileInput').click();
$('btnOpen').addEventListener('click', openPicker);
$('btnOpen2').addEventListener('click', openPicker);
$('btnDemo').addEventListener('click', () => openBytes(demoBytes(), DEMO_NAME));
$('btnDemo2').addEventListener('click', () => openBytes(demoBytes(), DEMO_NAME));
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) openBytes(await readFile(file), file.name);
});
$('recentPick').addEventListener('change', async (e) => {
  const entry = state.files.find((f) => f.id === e.target.value);
  const bytes = entry && (await getFileBytes(entry.id));
  if (bytes) setFile(entry.id, entry.name, bytes);
});

// Glisser-déposer sur toute la page
let dragDepth = 0;
const showDrag = (on) => {
  $('drop').classList.toggle('over', on);
  $('dragOverlay').hidden = !on || $('view').hidden;
};
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  showDrag(true);
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) showDrag(false);
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  showDrag(false);
  const file = e.dataTransfer.files[0];
  if (file) openBytes(await readFile(file), file.name);
});

$('selExpected').addEventListener('change', async (e) => {
  state.settings = { ...state.settings, expected: e.target.value };
  if (state.bytes) reanalyze();
  await savePrismeSettings({ expected: state.settings.expected });
  if (state.bytes && state.encOverride === 'auto' && state.delimOverride === 'auto') {
    await updateSummary(state.id, state.res);
  }
});
$('selEnc').addEventListener('change', (e) => {
  state.encOverride = e.target.value;
  reanalyze();
});
$('selDelim').addEventListener('change', (e) => {
  state.delimOverride = e.target.value === '\\t' ? '\t' : e.target.value;
  reanalyze();
});
$('chkCrlf').addEventListener('change', async (e) => {
  state.settings = await savePrismeSettings({ crlf: e.target.checked });
});
$('btnExpAnsi').addEventListener('click', () => exportAs('ansi'));
$('btnExpUtf8').addEventListener('click', () => exportAs('utf8'));

$('views').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b && b.dataset.view !== state.view) setView(b.dataset.view);
});
let searchTimer;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value;
    state.limit = STEP;
    renderGrid();
  }, 150);
});
$('chkIssues').addEventListener('change', (e) => {
  state.onlyIssues = e.target.checked;
  state.limit = STEP;
  renderGrid();
});
$('chkInvis').addEventListener('change', (e) => {
  state.showInvis = e.target.checked;
  renderGrid();
});
$('btnCopyTxt').addEventListener('click', () =>
  navigator.clipboard.writeText(state.res.dec.text).then(
    () => toast('Contenu copié'),
    () => toast('Copie impossible'),
  ),
);

$('inspClose').addEventListener('click', closeInspector);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeInspector());

$('issues').addEventListener('click', (e) => {
  const l = e.target.closest('.loc');
  if (l) jumpTo(state.res.groups.get(l.dataset.g).locs[+l.dataset.i]);
});
$('gridWrap').addEventListener('click', (e) => {
  const cell = e.target.closest('td[data-c], th[data-c]');
  if (!cell) return;
  const tr = cell.closest('tr');
  openInspector(tr.dataset.r !== undefined ? +tr.dataset.r : 0, +cell.dataset.c);
});
$('xlWrap').addEventListener('mousedown', (e) => {
  const td = e.target.closest('td[data-xr]');
  if (td) selectXl(+td.dataset.xr, +td.dataset.xc);
});

// Surbrillance de la colonne survolée (pour comparer verticalement)
let hlCol = -1;
$('gridWrap').addEventListener('mouseover', (e) => {
  const cell = e.target.closest('td[data-c], th[data-c]');
  const c = cell && !cell.hasAttribute('colspan') ? +cell.dataset.c : -1;
  if (c === hlCol) return;
  hlCol = c;
  $('colHlStyle').textContent =
    c < 0
      ? ''
      : `#grid td[data-c="${c}"]:not([colspan]), #grid th[data-c="${c}"] { box-shadow: inset 0 0 0 9999px var(--colhl); }
     #grid th[data-c="${c}"] { border-bottom-color: var(--accent); }`;
});
$('gridWrap').addEventListener('mouseleave', () => {
  hlCol = -1;
  $('colHlStyle').textContent = '';
});

// Réglages et fichiers récents modifiés depuis le panneau
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.prismeFiles) {
    state.files = changes.prismeFiles.newValue || [];
    renderRecent();
  }
  const next = changes.prismeSettings && changes.prismeSettings.newValue;
  if (!next || !state.settings) return;
  if (next.crlf !== undefined) $('chkCrlf').checked = !!next.crlf;
  if (next.expected && next.expected !== state.settings.expected) {
    state.settings = { ...state.settings, expected: next.expected };
    $('selExpected').value = next.expected;
    if (state.bytes) reanalyze();
  }
});

init();
