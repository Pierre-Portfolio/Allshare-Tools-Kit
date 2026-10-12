// Last connection Users (panneau latéral) : fichier texte déposé ou texte collé, tableau de la dernière
// connexion de chaque utilisateur (tri, recherche), exports Excel et CSV. Le dernier tableau reste affiché
// jusqu'à la fermeture de Chrome (chrome.storage.session).
import {
  lastConnections,
  decodeText,
  sortUsers,
  searchUsers,
  daysSince,
  agoText,
  inactivity,
  fmtWhen,
  summaryText,
  notesText,
  usersCsv,
  usersSheets,
  getLastConnection,
  saveLastConnection,
  clearLastConnection,
  SORT_DIR,
  INACTIVE_WARN,
  INACTIVE_CRIT,
} from '../lib/last-connection.js';
import { binaryKind } from '../lib/prisme.js';
import { buildXlsxCompressed } from '../lib/xlsx.js';
import { fileStamp } from '../lib/format.js';
import { $, el, toast, downloadBlob } from '../lib/dom.js';

const PASTED = 'Texte collé';
const nf = new Intl.NumberFormat('fr-FR');

const state = {
  saved: null, // { name, at, result }
  sort: { key: 'last', dir: -1 },
};

/** Utilisateurs affichés : recherche puis tri. */
const shown = () =>
  sortUsers(searchUsers(state.saved.result.users, $('lcSearch').value), state.sort.key, state.sort.dir);

function showError(...content) {
  $('lcError').hidden = !content.length;
  $('lcError').replaceChildren(...content);
}

// ---------------------------------------------------------------- Lecture

/** Texte lu : tableau généré et gardé, ou message si aucune connexion n'y est reconnue. */
async function analyze(text, name) {
  const result = lastConnections(text);
  if (!result.users.length) {
    showError(
      el('strong', {
        textContent: `Aucune connexion reconnue dans ${name === PASTED ? 'le texte collé' : `« ${name} »`}.`,
      }),
      el('br'),
      'Une ligne par connexion est attendue : date ; heure ; utilisateur ; groupe… par exemple ',
      el('code', { textContent: '13/04/2026;12:13:59;JEAN.DUPONT;GRP_CG_001;RO;244' }),
    );
    return false;
  }
  showError();
  state.saved = { name, at: Date.now(), result };
  state.sort = { key: 'last', dir: -1 };
  $('lcSearch').value = '';
  render();
  $('result').scrollIntoView({ block: 'nearest' });
  await saveLastConnection(name, result, state.saved.at);
  return true;
}

async function openFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = binaryKind(bytes, file.name);
  if (kind) {
    showError(
      el('strong', { textContent: `« ${file.name} » n'est pas un fichier texte : c'est ${kind}.` }),
      el('br'),
      'Enregistrez le journal en texte (.txt ou .csv), ou collez ses lignes ci-dessous.',
    );
    return;
  }
  await analyze(decodeText(bytes), file.name);
}

// ---------------------------------------------------------------- Affichage

function renderHead() {
  for (const th of $('lcTable').querySelectorAll('th[data-sort]')) {
    const on = th.dataset.sort === state.sort.key;
    th.setAttribute('aria-sort', on ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
}

function renderRows() {
  const users = shown();
  const now = Date.now();
  if (!users.length) {
    $('lcRows').replaceChildren(
      el(
        'tr',
        {},
        el('td', {
          className: 'left lc-none',
          colSpan: 5,
          textContent: `Aucun utilisateur ne correspond à « ${$('lcSearch').value.trim()} ».`,
        }),
      ),
    );
    return;
  }
  $('lcRows').replaceChildren(
    ...users.map((u) => {
      const days = daysSince(u.last, now);
      return el(
        'tr',
        {},
        el('td', { className: 'left' }, el('strong', { textContent: u.user })),
        el('td', { textContent: fmtWhen(u.last), title: fmtWhen(u.last, true) }),
        el('td', { className: `num ${inactivity(days)}`.trim(), textContent: agoText(days) }),
        el('td', { className: 'num', textContent: nf.format(u.count) }),
        el('td', { className: 'left', textContent: u.group }),
      );
    }),
  );
}

function render() {
  const { saved } = state;
  $('result').hidden = !saved;
  $('drop').classList.toggle('compact', !!saved);
  $('dropTitle').textContent = saved ? 'Lire un autre fichier' : 'Déposez un fichier texte ici';
  if (!saved) return;
  $('lcName').textContent = saved.name;
  $('lcName').title = saved.name;
  $('lcMeta').textContent = summaryText(saved.result);
  $('lcNotes').replaceChildren(...notesText(saved.result).map((n) => el('li', { textContent: n })));
  renderHead();
  renderRows();
}

// ---------------------------------------------------------------- Évènements

$('pick').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) openFile(file);
});

// Glisser-déposer sur tout le panneau : un fichier, ou du texte sélectionné ailleurs
for (const ev of ['dragenter', 'dragover']) {
  document.addEventListener(ev, (e) => {
    if (e.target === $('lcText')) return; // texte déposé dans la zone de saisie : comportement normal
    e.preventDefault();
    $('drop').classList.add('over');
  });
}
document.addEventListener('dragleave', (e) => !e.relatedTarget && $('drop').classList.remove('over'));
document.addEventListener('drop', (e) => {
  if (e.target === $('lcText')) return;
  e.preventDefault();
  $('drop').classList.remove('over');
  const file = e.dataTransfer.files[0];
  const text = e.dataTransfer.getData('text/plain');
  if (file) openFile(file);
  else if (text) analyze(text, PASTED);
});

const generate = () => {
  const text = $('lcText').value;
  if (!text.trim()) {
    showError(el('strong', { textContent: 'Collez d’abord les lignes du journal dans la zone de texte.' }));
    $('lcText').focus();
    return;
  }
  analyze(text, PASTED);
};
$('lcGo').addEventListener('click', generate);
$('lcText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    generate();
  }
});

$('lcSearch').addEventListener('input', renderRows);

$('lcTable')
  .querySelector('thead')
  .addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    state.sort = { key, dir: key === state.sort.key ? -state.sort.dir : SORT_DIR[key] };
    renderHead();
    renderRows();
  });

const exportName = () => `last-connection-users-${fileStamp()}`;
const exported = (n) => toast(`${n} utilisateur${n > 1 ? 's' : ''} exporté${n > 1 ? 's' : ''}`);

$('expCsv').addEventListener('click', () => {
  const users = shown();
  downloadBlob(usersCsv(users), `${exportName()}.csv`, 'text/csv;charset=utf-8');
  exported(users.length);
});
$('expXlsx').addEventListener('click', async () => {
  const users = shown();
  const now = new Date();
  downloadBlob(
    await buildXlsxCompressed(usersSheets(users, state.saved.result, state.saved.name, now.getTime()), now),
    `${exportName()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  exported(users.length);
});

$('lcClear').addEventListener('click', async () => {
  state.saved = null;
  render();
  await clearLastConnection();
  toast('Tableau effacé');
});

// Jour changé (panneau resté ouvert après minuit) : « Il y a » recalculé
setInterval(() => state.saved && renderRows(), 60 * 60000);

$('lcWarn').textContent = INACTIVE_WARN;
$('lcCrit').textContent = INACTIVE_CRIT;
getLastConnection().then((saved) => {
  if (state.saved) return; // tableau généré entre-temps
  state.saved = saved;
  render();
});
