import {
  getConfig,
  getMeasures,
  saveApps,
  savePages,
  saveSettings,
  deleteMeasures,
  exportBackup,
  importBackup,
  newId,
  isMeasureKey,
} from '../lib/storage.js';
import { parseBase } from '../lib/urls.js';
import { parseAppList, mergeApps, appsToCsv, urlConflicts } from '../lib/apps.js';
import { buildModel, compareNames } from '../lib/report.js';
import { downloadBlob } from '../lib/export.js';
import { fileStamp } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR');

const state = {
  apps: [],
  pagesConfig: [],
  settings: null,
  measures: [],
  counts: new Map(), // appId -> nombre de mesures
  model: null,
  editing: null, // id de l'appli en cours d'édition, ou 'new'
  addingPage: false,
  query: '',
  bulk: null,
};

function el(tag, { dataset, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function load() {
  const { apps, settings, pages } = await getConfig();
  state.apps = apps;
  state.settings = settings;
  state.pagesConfig = pages;
  await loadMeasures();
}

async function loadMeasures() {
  state.measures = await getMeasures();
  state.counts = new Map();
  for (const m of state.measures) state.counts.set(m.appId, (state.counts.get(m.appId) || 0) + 1);
  state.model = buildModel(state.measures, state.apps, state.settings, state.pagesConfig);
}

// ---------------------------------------------------------------- Applications

function renderApps() {
  const tbody = $('appRows');
  const q = norm(state.query.trim());
  const conflicts = urlConflicts(state.apps);
  const apps = [...state.apps]
    .sort((a, b) => compareNames(a.name, b.name))
    .filter(
      (a) => !q || state.editing === a.id || norm(a.name).includes(q) || a.baseUrls.some((u) => norm(u).includes(q)),
    );

  const rows = [];
  if (state.editing === 'new') rows.push(editRow({ id: 'new', name: '', baseUrls: [] }));
  for (const app of apps) {
    if (state.editing === app.id) {
      rows.push(editRow(app));
      continue;
    }
    const others = conflicts.get(app.id);
    rows.push(
      el(
        'tr',
        {},
        el('td', { className: 'name', textContent: app.name }),
        el(
          'td',
          { className: 'urls mono' },
          ...app.baseUrls.flatMap((u, i) => (i ? [el('br'), u] : [u])),
          others
            ? el('div', { className: 'warn', textContent: `⚠ URL aussi déclarée par : ${others.join(', ')}` })
            : null,
        ),
        el('td', { className: 'num', textContent: nf.format(state.counts.get(app.id) || 0) }),
        el(
          'td',
          { className: 'actions' },
          el('button', { type: 'button', textContent: 'Modifier', dataset: { action: 'edit', id: app.id } }),
          ' ',
          el('button', {
            type: 'button',
            className: 'danger',
            textContent: 'Supprimer',
            dataset: { action: 'delete', id: app.id },
          }),
        ),
      ),
    );
  }
  tbody.replaceChildren(...rows);

  const empty = $('appEmpty');
  empty.hidden = rows.length > 0;
  empty.textContent = state.apps.length
    ? 'Aucune application ne correspond à la recherche.'
    : 'Aucune application : cliquez sur « Import en masse » pour coller votre liste depuis Excel, ou sur « + Ajouter ».';
  $('navApps').textContent = state.apps.length ? nf.format(state.apps.length) : '';
}

function editRow(app) {
  const name = el('input', {
    type: 'text',
    className: 'name-input',
    value: app.name,
    placeholder: 'Nom (ex. Client A)',
  });
  const urls = el('textarea', {
    value: app.baseUrls.join('\n'),
    placeholder: 'https://clienta.mondomaine.fr/\n(une URL par ligne)',
    rows: Math.max(2, app.baseUrls.length),
  });
  const error = el('div', { className: 'error' });
  const row = el(
    'tr',
    { className: 'editing', dataset: { id: app.id } },
    el('td', {}, name),
    el('td', {}, urls, error),
    el('td', { className: 'num', textContent: nf.format(state.counts.get(app.id) || 0) }),
    el(
      'td',
      { className: 'actions' },
      el('button', {
        type: 'button',
        className: 'primary',
        textContent: 'Enregistrer',
        dataset: { action: 'save', id: app.id },
      }),
      ' ',
      el('button', { type: 'button', textContent: 'Annuler', dataset: { action: 'cancel', id: app.id } }),
    ),
  );
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelEdit();
    if (e.key === 'Enter' && e.target === name) saveEdit(app.id, row);
  });
  setTimeout(() => name.focus(), 0);
  return row;
}

function cancelEdit() {
  state.editing = null;
  renderApps();
}

async function saveEdit(id, row) {
  const name = row.querySelector('.name-input').value.trim();
  const lines = row
    .querySelector('textarea')
    .value.split(/[\r\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = lines.filter((l) => !parseBase(l));
  const error = row.querySelector('.error');
  const duplicate = state.apps.some((a) => a.id !== id && a.name.trim().toLowerCase() === name.toLowerCase());
  error.textContent = !name
    ? 'Donnez un nom à l’application.'
    : duplicate
      ? 'Une autre application porte déjà ce nom.'
      : !lines.length
        ? 'Indiquez au moins une URL de base (http:// ou https://).'
        : invalid.length
          ? `URL invalide : ${invalid.join(', ')}`
          : '';
  if (error.textContent) return;
  const baseUrls = [...new Set(lines)];
  if (id === 'new') state.apps = [...state.apps, { id: newId(), name, baseUrls }];
  else state.apps = state.apps.map((a) => (a.id === id ? { ...a, name, baseUrls } : a));
  state.editing = null;
  await saveApps(state.apps);
  state.model = buildModel(state.measures, state.apps, state.settings, state.pagesConfig);
  renderApps();
  toast(id === 'new' ? 'Application ajoutée' : 'Application enregistrée');
}

async function deleteApp(id) {
  const app = state.apps.find((a) => a.id === id);
  if (!app) return;
  const ids = state.measures.filter((m) => m.appId === id).map((m) => m.id);
  const question = ids.length
    ? `Supprimer « ${app.name} » et ses ${ids.length} mesure(s) ?`
    : `Supprimer « ${app.name} » ?`;
  if (!confirm(question)) return;
  state.apps = state.apps.filter((a) => a.id !== id);
  await saveApps(state.apps);
  if (ids.length) await deleteMeasures(ids);
  await loadMeasures();
  renderApps();
  renderPages();
  toast('Application supprimée');
}

$('appRows').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-action]');
  if (!b) return;
  const { action, id } = b.dataset;
  if (action === 'edit') {
    state.editing = id;
    renderApps();
  } else if (action === 'cancel') cancelEdit();
  else if (action === 'save') saveEdit(id, b.closest('tr'));
  else if (action === 'delete') deleteApp(id);
});

$('addApp').addEventListener('click', () => {
  state.editing = 'new';
  renderApps();
  $('apps').scrollIntoView({ block: 'start' });
});

$('appSearch').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderApps();
});

$('exportApps').addEventListener('click', () => {
  const apps = [...state.apps].sort((a, b) => compareNames(a.name, b.name));
  downloadBlob(appsToCsv(apps), `insigth-applications-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
});

// ---------------------------------------------------------------- Import en masse

function previewBulk() {
  const parsed = parseAppList($('bulkText').value);
  state.bulk = parsed;
  const known = new Set(state.apps.map((a) => a.name.trim().toLowerCase()));
  const existing = parsed.entries.filter((e) => known.has(e.name.trim().toLowerCase())).length;
  const parts = [];
  if (parsed.entries.length) {
    parts.push(
      `${nf.format(parsed.entries.length)} application(s) reconnue(s) : ${nf.format(parsed.entries.length - existing)} nouvelle(s), ${nf.format(existing)} existante(s)`,
    );
  }
  if (parsed.errors.length) parts.push(`${parsed.errors.length} ligne(s) en erreur`);
  $('bulkPreview').textContent = parts.join(' · ');
  $('bulkErrors').replaceChildren(
    ...parsed.errors
      .slice(0, 30)
      .map((er) => el('li', { textContent: `Ligne ${er.line} : ${er.reason} — ${er.text}` })),
  );
  $('bulkGo').disabled = !parsed.entries.length;
}

$('bulkBtn').addEventListener('click', () => {
  $('bulkText').value = '';
  previewBulk();
  $('bulk').showModal();
  $('bulkText').focus();
});
$('bulkText').addEventListener('input', previewBulk);
$('bulkFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('bulkText').value = await file.text();
  previewBulk();
});
$('bulkGo').addEventListener('click', async () => {
  if (!state.bulk || !state.bulk.entries.length) return;
  const { apps, added, updated } = mergeApps(state.apps, state.bulk.entries);
  state.apps = apps;
  await saveApps(apps);
  state.model = buildModel(state.measures, state.apps, state.settings, state.pagesConfig);
  $('bulk').close();
  renderApps();
  toast(`${added} application(s) ajoutée(s), ${updated} mise(s) à jour`);
});

// ---------------------------------------------------------------- Pages (colonnes du rapport)

function currentPages() {
  return state.model ? state.model.allPages : [];
}

async function writePages(list, { render = true } = {}) {
  state.pagesConfig = list.map((p) => ({ key: p.key, label: p.label !== p.key ? p.label : '', hidden: !!p.hidden }));
  await savePages(state.pagesConfig);
  state.model = buildModel(state.measures, state.apps, state.settings, state.pagesConfig);
  if (render) renderPages(); // pas de re-rendu pendant la saisie des libellés (garde le focus)
}

function normalizeKey(raw) {
  let k = String(raw).trim();
  if (!k) return '';
  if (!k.startsWith('/')) k = '/' + k;
  if (k.length > 1) k = k.replace(/\/+$/, '');
  return state.settings.caseInsensitive !== false ? k.toLowerCase() : k;
}

function renderPages() {
  const tbody = $('pageRows');
  const pages = currentPages();
  const rows = [];
  if (state.addingPage) {
    const key = el('input', { type: 'text', className: 'label-input mono', placeholder: '/factures' });
    const label = el('input', { type: 'text', className: 'label-input', placeholder: 'Libellé (facultatif)' });
    const add = async () => {
      const k = normalizeKey(key.value);
      if (!k) return key.focus();
      if (pages.some((p) => p.key === k)) {
        toast('Cette page existe déjà');
        return;
      }
      state.addingPage = false;
      await writePages([...pages, { key: k, label: label.value.trim() || k, hidden: false }]);
      toast('Page ajoutée');
    };
    const row = el(
      'tr',
      { className: 'editing' },
      el('td'),
      el('td', {}, label),
      el('td', {}, key),
      el('td'),
      el('td'),
      el(
        'td',
        { className: 'actions' },
        el('button', { type: 'button', className: 'primary', textContent: 'Ajouter', onclick: add }),
        ' ',
        el('button', {
          type: 'button',
          textContent: 'Annuler',
          onclick: () => {
            state.addingPage = false;
            renderPages();
          },
        }),
      ),
    );
    row.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    setTimeout(() => key.focus(), 0);
    rows.push(row);
  }
  pages.forEach((p, i) => {
    const count = state.model.pageCounts.get(p.key) || 0;
    const label = el('input', {
      type: 'text',
      className: 'label-input',
      value: p.label !== p.key ? p.label : '',
      placeholder: p.key,
      ariaLabel: `Libellé de ${p.key}`,
    });
    label.addEventListener('change', () => {
      const list = currentPages().map((x) => (x.key === p.key ? { ...x, label: label.value.trim() || x.key } : x));
      writePages(list, { render: false }).then(() => toast('Libellé enregistré'));
    });
    const visible = el('input', { type: 'checkbox', checked: !p.hidden, ariaLabel: `Afficher ${p.key}` });
    visible.addEventListener('change', () =>
      writePages(currentPages().map((x) => (x.key === p.key ? { ...x, hidden: !visible.checked } : x))),
    );
    const move = (delta) => {
      const list = [...currentPages()];
      const j = i + delta;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      writePages(list);
    };
    rows.push(
      el(
        'tr',
        { className: p.hidden ? 'hidden-page' : '' },
        el(
          'td',
          { className: 'order' },
          el('button', {
            type: 'button',
            textContent: '↑',
            title: 'Monter',
            disabled: i === 0,
            onclick: () => move(-1),
          }),
          ' ',
          el('button', {
            type: 'button',
            textContent: '↓',
            title: 'Descendre',
            disabled: i === pages.length - 1,
            onclick: () => move(1),
          }),
        ),
        el('td', {}, label),
        el('td', { className: 'mono', textContent: p.key }),
        el('td', { className: 'num', textContent: nf.format(count) }),
        el('td', { className: 'center' }, visible),
        el(
          'td',
          { className: 'actions' },
          p.configured && !count
            ? el('button', {
                type: 'button',
                className: 'danger',
                textContent: 'Retirer',
                onclick: () => writePages(currentPages().filter((x) => x.key !== p.key)),
              })
            : null,
        ),
      ),
    );
  });
  tbody.replaceChildren(...rows);
  $('pageEmpty').hidden = rows.length > 0;
  const shown = pages.filter((p) => !p.hidden).length;
  $('navPages').textContent = pages.length ? `${shown}${shown < pages.length ? `/${pages.length}` : ''}` : '';
}

$('addPage').addEventListener('click', () => {
  state.addingPage = true;
  renderPages();
});
$('resetPages').addEventListener('click', async () => {
  if (
    !state.pagesConfig.length ||
    !confirm('Revenir à l’ordre alphabétique et effacer les libellés et pages attendues ?')
  )
    return;
  state.pagesConfig = [];
  await savePages([]);
  state.model = buildModel(state.measures, state.apps, state.settings, []);
  renderPages();
  toast('Pages réinitialisées');
});

// ---------------------------------------------------------------- Réglages

const checkboxes = ['ignoreQuery', 'replaceIds', 'caseInsensitive', 'showOverlay'];

function renderSettings(settings) {
  $('quietMs').value = settings.quietMs;
  $('maxWaitS').value = Math.round(settings.maxWaitMs / 1000);
  $('ignoreSelectors').value = settings.ignoreSelectors;
  for (const id of checkboxes) $(id).checked = !!settings[id];
}

async function updateSetting(patch) {
  state.settings = await saveSettings(patch);
  toast('Réglage enregistré');
  if (['ignoreQuery', 'replaceIds', 'caseInsensitive'].some((k) => k in patch)) {
    state.model = buildModel(state.measures, state.apps, state.settings, state.pagesConfig);
    renderPages();
  }
}

function bindSettings() {
  const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  $('quietMs').addEventListener('change', (e) => {
    const v = clamp(Math.round(Number(e.target.value)), 200, 10000, 1000);
    e.target.value = v;
    updateSetting({ quietMs: v });
  });
  $('maxWaitS').addEventListener('change', (e) => {
    const v = clamp(Math.round(Number(e.target.value)), 10, 900, 120);
    e.target.value = v;
    updateSetting({ maxWaitMs: v * 1000 });
  });
  $('ignoreSelectors').addEventListener('change', (e) => {
    const sel = e.target.value.trim();
    if (sel) {
      try {
        document.createDocumentFragment().querySelector(sel);
      } catch {
        toast('Sélecteur CSS invalide');
        return;
      }
    }
    updateSetting({ ignoreSelectors: sel });
  });
  for (const id of checkboxes) $(id).addEventListener('change', (e) => updateSetting({ [id]: e.target.checked }));
}

// ---------------------------------------------------------------- Données

function renderData() {
  const measures = state.measures;
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  $('dataSummary').textContent = measures.length
    ? `${nf.format(measures.length)} mesure(s) enregistrée(s) : ${nf.format(wifi)} en WiFi, ${nf.format(measures.length - wifi)} en Ethernet.`
    : 'Aucune mesure enregistrée.';
}

function bindData() {
  $('exportJson').addEventListener('click', async () => {
    const data = await exportBackup();
    downloadBlob(JSON.stringify(data, null, 2), `insigth-sauvegarde-${fileStamp()}.json`, 'application/json');
  });
  $('importJson').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { added, skipped } = await importBackup(JSON.parse(await file.text()));
      toast(`${added} mesure(s) importée(s)${skipped ? `, ${skipped} déjà présente(s) ou invalide(s)` : ''}`);
      await load();
      renderAll();
    } catch (err) {
      toast(err.message || 'Import impossible');
    }
  });
  $('clearAll').addEventListener('click', async () => {
    const ids = state.measures.map((m) => m.id);
    if (!ids.length || !confirm(`Supprimer définitivement les ${nf.format(ids.length)} mesure(s) ?`)) return;
    await deleteMeasures(ids);
    toast('Mesures supprimées');
  });
}

// ---------------------------------------------------------------- Initialisation

function renderAll() {
  renderApps();
  renderPages();
  renderData();
}

let pending = 0;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some(isMeasureKey)) return;
  clearTimeout(pending);
  pending = setTimeout(async () => {
    await loadMeasures();
    renderData();
    if (!state.addingPage) renderPages();
    if (state.editing === null) renderApps();
  }, 300);
});

(async () => {
  await load();
  renderSettings(state.settings);
  bindSettings();
  bindData();
  renderAll();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
