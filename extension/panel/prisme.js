// Prisme (panneau latéral) : dépôt d'un CSV, verdict en un coup d'œil, export ANSI / UTF-8,
// fichiers récents. Le détail complet s'ouvre dans le tableau de bord (prisme/prisme.html).
import {
  binaryKind,
  convert,
  convertedName,
  delimName,
  demoBytes,
  DEMO_NAME,
  encodingStatus,
  fmtSize,
  rowsWithIssues,
  sortedGroups,
  verdict,
  SEV_LABEL,
} from '../lib/prisme.js';
import {
  addFile,
  analyzeFile,
  confirmLarge,
  deleteFile,
  download,
  getFileBytes,
  getFiles,
  getPrismeSettings,
  openDashboard,
  readFile,
  savePrismeSettings,
  touchFile,
  updateSummary,
} from '../lib/prisme-files.js';
import { $, el, toast } from '../lib/dom.js';

const nf = new Intl.NumberFormat('fr-FR');
const fmtWhen = (ts) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const plural = (n, word) => `${nf.format(n)} ${word}${n > 1 ? 's' : ''}`;
const TOP_ISSUES = 5;

const state = {
  settings: null,
  files: [],
  current: null, // { entry, bytes, res }
  busy: false, // fichier en cours d'enregistrement par ce panneau
};

/** Pastilles erreurs / alertes / infos. */
function countPills(counts) {
  return ['error', 'warning', 'info']
    .filter((sev) => counts[sev])
    .map((sev) => el('span', { className: `sev ${sev}`, textContent: nf.format(counts[sev]), title: SEV_LABEL[sev] }));
}

// ---------------------------------------------------------------- Chargement

async function load() {
  [state.settings, state.files] = await Promise.all([getPrismeSettings(), getFiles()]);
  renderSettings();
  renderFiles();
  const top = state.files[0];
  if (!top) {
    state.current = null;
    return renderCurrent();
  }
  const cur = state.current;
  if (cur && cur.entry.id === top.id) {
    cur.entry = top;
    // Encodage attendu changé depuis le tableau de bord : nouvelle analyse du même fichier
    if (cur.res.options.expected !== state.settings.expected) {
      cur.res = await analyzeFile(cur.bytes, { expected: state.settings.expected });
    }
    return renderCurrent();
  }
  const bytes = await getFileBytes(top.id);
  if (!bytes) return deleteFile(top.id); // contenu perdu (données du navigateur effacées)
  state.current = { entry: top, bytes, res: await analyzeFile(bytes, { expected: state.settings.expected }) };
  renderCurrent();
}

let loadTimer = 0;
const scheduleLoad = () => {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => !state.busy && load(), 50);
};

/** Fichier choisi ou déposé : refus des fichiers binaires, analyse puis enregistrement. */
async function openBytes(bytes, name) {
  const kind = binaryKind(bytes, name);
  if (kind) {
    $('dropError').hidden = false;
    $('dropError').replaceChildren(
      el('strong', { textContent: `« ${name} » n'est pas un fichier CSV : c'est ${kind}.` }),
      el('br'),
      'Dans Excel : Fichier › Enregistrer sous › « CSV (séparateur : point-virgule) (*.csv) », puis déposez le fichier .csv obtenu.',
    );
    return;
  }
  $('dropError').hidden = true;
  if (!confirmLarge(bytes, name)) return;
  state.busy = true;
  try {
    const res = await analyzeFile(bytes, { expected: state.settings.expected });
    const entry = await addFile(name, bytes, res);
    state.current = { entry, bytes, res };
    state.files = await getFiles();
  } finally {
    state.busy = false;
  }
  renderFiles();
  renderCurrent();
  $('result').scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------- Affichage

function renderSettings() {
  for (const b of $('expected').querySelectorAll('[data-expected]')) {
    b.setAttribute('aria-checked', String(b.dataset.expected === state.settings.expected));
  }
  $('crlf').checked = !!state.settings.crlf;
}

function fact(label, value, cls = '') {
  return [el('dt', { textContent: label }), el('dd', { className: cls, textContent: value })];
}

function renderCurrent() {
  const cur = state.current;
  $('result').hidden = !cur;
  $('drop').classList.toggle('compact', !!cur);
  $('dropTitle').textContent = cur ? 'Analyser un autre fichier' : 'Déposez un fichier CSV ici';
  if (!cur) return;
  const { entry, res } = cur;
  $('resName').textContent = entry.name;
  $('resName').title = entry.name;
  $('resMeta').textContent = `${fmtSize(entry.size)} · ${fmtWhen(entry.ts)}`;

  const v = verdict(res);
  const rows = rowsWithIssues(res);
  $('resVerdict').className = `v-verdict ${v}`;
  $('resVerdict').replaceChildren(
    el(
      'strong',
      {},
      v === 'ok'
        ? '✓ Aucune erreur ni alerte'
        : [
            res.counts.error ? plural(res.counts.error, 'erreur') : '',
            res.counts.warning ? plural(res.counts.warning, 'alerte') : '',
          ]
            .filter(Boolean)
            .join(' · '),
    ),
    el('span', { textContent: rows ? `${plural(rows, 'ligne')} concernée${rows > 1 ? 's' : ''}` : 'Fichier propre' }),
  );

  const enc = encodingStatus(res);
  const lowConf = res.options.delimOverride === 'auto' && res.dg.conf < 0.7;
  $('resFacts').replaceChildren(
    ...fact('Encodage', res.dec.label, enc.cls),
    ...fact('Séparateur', delimName(res.delim), lowConf ? 'warn' : ''),
    ...fact('Fins de ligne', res.eol.label, res.eol.label === 'Mixtes' ? 'warn' : ''),
    ...fact('Lignes', nf.format(res.dataIdx.length)),
    ...fact(
      'Colonnes',
      res.maxCols > res.expected ? `${res.expected} (jusqu'à ${res.maxCols})` : String(res.expected),
      res.maxCols > res.expected ? 'err' : '',
    ),
  );

  const problems = sortedGroups(res).filter((g) => g.sev !== 'info');
  $('resIssuesTitle').hidden = !problems.length;
  $('resIssues').replaceChildren(
    ...problems
      .slice(0, TOP_ISSUES)
      .map((g) =>
        el(
          'li',
          {},
          el(
            'button',
            { type: 'button', className: 'v-issue', title: g.h || g.t, dataset: { issue: g.code } },
            el('span', { className: `sev ${g.sev}`, textContent: SEV_LABEL[g.sev] }),
            el('span', { className: 'v-issue-t', textContent: g.t }),
            g.locs.length ? el('span', { className: 'muted', textContent: `×${nf.format(g.locs.length)}` }) : null,
          ),
        ),
      ),
    problems.length > TOP_ISSUES
      ? el('li', {
          className: 'hint',
          textContent: `+ ${problems.length - TOP_ISSUES} autre(s) dans le tableau de bord`,
        })
      : null,
  );
}

function renderFiles() {
  $('recentCount').textContent = state.files.length ? `(${state.files.length})` : '';
  $('recentEmpty').hidden = state.files.length > 0;
  $('files').replaceChildren(
    ...state.files.map((f) =>
      el(
        'li',
        { className: `pfile${state.current && state.current.entry.id === f.id ? ' current' : ''}` },
        el(
          'button',
          { type: 'button', className: 'pf-open', title: `Afficher « ${f.name} »`, dataset: { open: f.id } },
          el('strong', { className: 'pf-name', textContent: f.name }),
          el('span', {
            className: 'pf-meta',
            textContent: `${fmtSize(f.size)} · ${plural(f.summary.rows, 'ligne')} · ${fmtWhen(f.ts)}`,
          }),
        ),
        el('span', { className: 'pf-pills' }, ...countPills(f.summary.counts)),
        el('button', {
          type: 'button',
          className: 'pf-del',
          textContent: '✕',
          title: 'Retirer de la liste',
          dataset: { del: f.id },
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- Évènements

$('pick').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) openBytes(await readFile(file), file.name);
});
$('demo').addEventListener('click', () => openBytes(demoBytes(), DEMO_NAME));

// Glisser-déposer sur tout le panneau
for (const ev of ['dragenter', 'dragover']) {
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    $('drop').classList.add('over');
  });
}
document.addEventListener('dragleave', (e) => !e.relatedTarget && $('drop').classList.remove('over'));
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  $('drop').classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) openBytes(await readFile(file), file.name);
});

$('expected').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-expected]');
  if (!b || b.dataset.expected === state.settings.expected) return;
  state.settings = { ...state.settings, expected: b.dataset.expected };
  renderSettings();
  const cur = state.current;
  if (cur) {
    cur.res = await analyzeFile(cur.bytes, { expected: state.settings.expected });
    renderCurrent();
  }
  await savePrismeSettings({ expected: state.settings.expected });
  if (cur) await updateSummary(cur.entry.id, cur.res);
});
$('crlf').addEventListener('change', async (e) => {
  state.settings = await savePrismeSettings({ crlf: e.target.checked });
});

function exportAs(encoding) {
  if (!state.current) return;
  const { entry, res } = state.current;
  const { bytes, lost, suffix } = convert(res, encoding, $('crlf').checked);
  download(bytes, convertedName(entry.name, suffix));
  if (encoding === 'utf8') toast('Exporté en UTF-8 avec BOM');
  else
    toast(lost ? `Exporté en ANSI : ${plural(lost, 'caractère')} remplacé(s) par « ? »` : 'Exporté en ANSI sans perte');
}
$('expAnsi').addEventListener('click', () => exportAs('ansi'));
$('expUtf8').addEventListener('click', () => exportAs('utf8'));

$('dash').addEventListener('click', () => openDashboard(state.current.entry.id));
$('openDash').addEventListener('click', () => openDashboard(state.current ? state.current.entry.id : null));
$('resIssues').addEventListener('click', (e) => {
  const b = e.target.closest('[data-issue]');
  if (b) openDashboard(state.current.entry.id, b.dataset.issue);
});

$('files').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-del]');
  if (open) {
    await touchFile(open.dataset.open);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (del) {
    const f = state.files.find((x) => x.id === del.dataset.del);
    if (!f || !confirm(`Retirer « ${f.name} » des fichiers récents ?`)) return;
    await deleteFile(f.id);
    toast('Fichier retiré');
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.prismeFiles || changes.prismeSettings)) scheduleLoad();
});

load();
