import {
  getConfig,
  getMeasures,
  saveApps,
  savePages,
  saveSettings,
  deleteMeasures,
  exportBackup,
  importBackup,
  renameEverywhere,
  deletePage,
  newId,
  applyMeasureChanges,
} from '../lib/storage.js';
import { parseBase } from '../lib/urls.js';
import { parseAppList, parsePageList, mergeApps, appsToCsv, urlConflicts } from '../lib/apps.js';
import { buildModel } from '../lib/report.js';
import { normName, nameKey, compareNames } from '../lib/names.js';
import { $, el, toast as showToast, downloadBlob } from '../lib/dom.js';
import { fileStamp, unitOf } from '../lib/format.js';

const nf = new Intl.NumberFormat('fr-FR');

const state = {
  apps: [],
  pages: [],
  settings: null,
  measures: [],
  model: null,
  editing: null, // id de l'appli en cours d'édition, ou 'new'
  query: '',
  bulk: null,
};

const toast = (text) => showToast(text, 2800);

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function load() {
  const [{ apps, pages, settings }, measures] = await Promise.all([getConfig(), getMeasures()]);
  Object.assign(state, { apps, pages, settings, measures });
  derive();
}

/** Modèle et compteurs par client, d'après les mesures et le référentiel en mémoire. */
function derive() {
  state.model = buildModel(state.measures, state.apps, state.pages);
  state.clientCounts = new Map();
  for (const m of state.measures) {
    state.clientCounts.set(nameKey(m.app), (state.clientCounts.get(nameKey(m.app)) || 0) + 1);
  }
}

/** « PRD (5.3, 5.2) · REC (5.3) » : SID et versions déjà mesurés pour ce client. */
function linesSummary(client) {
  const bySid = new Map();
  for (const l of state.model.lines) {
    if (nameKey(l.client) !== nameKey(client) || (!l.sid && !l.version)) continue;
    const sid = l.sid || '—';
    if (!bySid.has(sid)) bySid.set(sid, []);
    if (l.version) bySid.get(sid).push(l.version);
  }
  return [...bySid].map(([sid, versions]) => (versions.length ? `${sid} (${versions.join(', ')})` : sid)).join(' · ');
}

const countFor = (map, name) => map.get(nameKey(name)) || 0;

// ---------------------------------------------------------------- Applications

function renderApps() {
  const q = norm(state.query.trim());
  const conflicts = urlConflicts(state.apps);
  const apps = [...state.apps]
    .sort((a, b) => compareNames(a.name, b.name))
    .filter(
      (a) =>
        !q || state.editing === a.id || norm(a.name).includes(q) || (a.baseUrls || []).some((u) => norm(u).includes(q)),
    );
  const rows = [];
  if (state.editing === 'new') rows.push(editRow({ id: 'new', name: '', baseUrls: [] }));
  for (const app of apps) {
    if (state.editing === app.id) {
      rows.push(editRow(app));
      continue;
    }
    const others = conflicts.get(app.id);
    const urls = app.baseUrls || [];
    rows.push(
      el(
        'tr',
        {},
        el('td', { className: 'name', textContent: app.name }),
        el('td', { className: 'lines', textContent: linesSummary(app.name) || '—' }),
        el(
          'td',
          { className: 'urls mono' },
          ...(urls.length
            ? urls.flatMap((u, i) => (i ? [el('br'), u] : [u]))
            : [el('span', { className: 'muted', textContent: '—' })]),
          others
            ? el('div', { className: 'warn', textContent: `⚠ URL aussi déclarée par : ${others.join(', ')}` })
            : null,
        ),
        el('td', { className: 'num', textContent: nf.format(countFor(state.clientCounts, app.name)) }),
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
  $('appRows').replaceChildren(...rows);
  const empty = $('appEmpty');
  empty.hidden = rows.length > 0;
  empty.textContent = state.apps.length
    ? 'Aucun client ne correspond à la recherche.'
    : "Aucun client : ils s'ajoutent à chaque mesure, ou collez votre liste avec « Import en masse ».";
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
    value: (app.baseUrls || []).join('\n'),
    placeholder: 'Facultatif : https://clienta.mondomaine.fr/\n(une URL par ligne)',
    rows: Math.max(2, (app.baseUrls || []).length),
  });
  const error = el('div', { className: 'error' });
  const row = el(
    'tr',
    { className: 'editing', dataset: { id: app.id } },
    el('td', {}, name),
    el('td', { className: 'lines', textContent: linesSummary(app.name) || '—' }),
    el('td', {}, urls, error),
    el('td', { className: 'num', textContent: nf.format(countFor(state.clientCounts, app.name)) }),
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
  const name = normName(row.querySelector('.name-input').value);
  const lines = row
    .querySelector('textarea')
    .value.split(/[\r\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalid = lines.filter((l) => !parseBase(l));
  const error = row.querySelector('.error');
  error.textContent = !name ? 'Donnez un nom au client.' : invalid.length ? `URL invalide : ${invalid.join(', ')}` : '';
  if (error.textContent) return;
  const baseUrls = [...new Set(lines)];
  const old = state.apps.find((a) => a.id === id);
  const duplicate = state.apps.find((a) => a.id !== id && nameKey(a.name) === nameKey(name));
  if (id === 'new') {
    if (duplicate) {
      error.textContent = 'Ce client existe déjà.';
      return;
    }
    state.apps = [...state.apps, { id: newId(), name, baseUrls }];
    await saveApps(state.apps);
  } else {
    if (
      duplicate &&
      !confirm(`« ${duplicate.name} » existe déjà : fusionner « ${old.name} » avec elle (mesures comprises) ?`)
    )
      return;
    await saveApps(state.apps.map((a) => (a.id === id ? { ...a, baseUrls } : a)));
    if (old.name !== name) await renameEverywhere('app', old.name, name);
  }
  state.editing = null;
  await load();
  renderAll();
  toast(id === 'new' ? 'Client ajouté' : 'Client enregistré');
}

async function deleteApp(id) {
  const app = state.apps.find((a) => a.id === id);
  if (!app) return;
  const ids = state.measures.filter((m) => nameKey(m.app) === nameKey(app.name)).map((m) => m.id);
  const question = ids.length
    ? `Supprimer « ${app.name} » et ses ${ids.length} mesure(s) ?`
    : `Supprimer « ${app.name} » ?`;
  if (!confirm(question)) return;
  await saveApps(state.apps.filter((a) => a.id !== id));
  if (ids.length) await deleteMeasures(ids);
  await load();
  renderAll();
  toast('Client supprimé');
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
});
$('appSearch').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderApps();
});
$('exportApps').addEventListener('click', () => {
  const apps = [...state.apps].sort((a, b) => compareNames(a.name, b.name));
  downloadBlob(appsToCsv(apps), `insight-clients-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
});

// ---------------------------------------------------------------- Import en masse des applications

function previewBulk() {
  const parsed = parseAppList($('bulkText').value);
  state.bulk = parsed;
  const known = new Set(state.apps.map((a) => nameKey(a.name)));
  const existing = parsed.entries.filter((e) => known.has(nameKey(e.name))).length;
  const parts = [];
  if (parsed.entries.length) {
    parts.push(
      `${nf.format(parsed.entries.length)} client(s) reconnu(s) : ${nf.format(parsed.entries.length - existing)} nouveau(x), ${nf.format(existing)} existant(s)`,
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
  await saveApps(apps);
  $('bulk').close();
  await load();
  renderAll();
  toast(`${added} client(s) ajouté(s), ${updated} mis à jour`);
});

// ---------------------------------------------------------------- Pages

/** Pages du référentiel + pages mesurées absentes du référentiel (ajoutées à la fin). */
function pageList() {
  return state.model.allPages.map((p) => {
    const known = state.pages.find((x) => nameKey(x.name) === nameKey(p.name));
    return known ? { ...known } : { id: newId(), name: p.name, hidden: false };
  });
}

async function writePages(list) {
  state.pages = list;
  await savePages(list);
  state.model = buildModel(state.measures, state.apps, state.pages);
  renderPages();
}

function renderPages() {
  const pages = pageList();
  const rows = pages.map((p, i) => {
    const count = countFor(state.model.pageCounts, p.name);
    const name = el('input', {
      type: 'text',
      className: 'label-input',
      value: p.name,
      ariaLabel: `Nom de la page ${p.name}`,
    });
    name.addEventListener('change', async () => {
      const next = normName(name.value);
      if (!next || next === p.name) {
        name.value = p.name;
        return;
      }
      const clash = pages.find((x) => x !== p && nameKey(x.name) === nameKey(next));
      if (clash && !confirm(`« ${clash.name} » existe déjà : fusionner les deux pages (mesures comprises) ?`)) {
        name.value = p.name;
        return;
      }
      await savePages(pages);
      await renameEverywhere('page', p.name, next);
      await load();
      renderPages();
      toast('Page renommée');
    });
    const visible = el('input', {
      type: 'checkbox',
      checked: !p.hidden,
      ariaLabel: `Inclure ${p.name} dans les exports`,
    });
    visible.addEventListener('change', () =>
      writePages(pages.map((x) => (x === p ? { ...x, hidden: !visible.checked } : x))),
    );
    const move = (delta) => {
      const list = [...pages];
      const j = i + delta;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      writePages(list);
    };
    return el(
      'tr',
      { className: p.hidden ? 'hidden-page' : '' },
      el(
        'td',
        { className: 'order' },
        el('button', { type: 'button', textContent: '↑', title: 'Monter', disabled: i === 0, onclick: () => move(-1) }),
        ' ',
        el('button', {
          type: 'button',
          textContent: '↓',
          title: 'Descendre',
          disabled: i === pages.length - 1,
          onclick: () => move(1),
        }),
      ),
      el('td', {}, name),
      el('td', { className: 'num', textContent: nf.format(count) }),
      el('td', { className: 'center' }, visible),
      el(
        'td',
        { className: 'actions' },
        el('button', {
          type: 'button',
          className: 'danger',
          textContent: 'Supprimer',
          title: count ? 'Supprimer la page et ses mesures' : 'Retirer la page de la liste',
          onclick: async () => {
            if (!count) return writePages(pages.filter((x) => x !== p));
            if (!confirm(`Supprimer la page « ${p.name} » et ses ${count} mesure(s), pour tous les clients ?`)) return;
            await savePages(pages);
            await deletePage(p.name);
            await load();
            renderPages();
            toast('Page supprimée');
          },
        }),
      ),
    );
  });
  $('pageRows').replaceChildren(...rows);
  $('pageEmpty').hidden = rows.length > 0;
  const shown = pages.filter((p) => !p.hidden).length;
  $('navPages').textContent = pages.length ? `${shown}${shown < pages.length ? `/${pages.length}` : ''}` : '';
}

$('addPages').addEventListener('click', () => {
  $('addPagesBox').hidden = false;
  $('addPagesText').focus();
});
$('addPagesCancel').addEventListener('click', () => {
  $('addPagesBox').hidden = true;
  $('addPagesText').value = '';
});
$('addPagesGo').addEventListener('click', async () => {
  const pages = pageList();
  const names = parsePageList($('addPagesText').value).filter(
    (n) => !pages.some((p) => nameKey(p.name) === nameKey(n)),
  );
  await writePages([...pages, ...names.map((name) => ({ id: newId(), name, hidden: false }))]);
  $('addPagesBox').hidden = true;
  $('addPagesText').value = '';
  toast(`${names.length} page(s) ajoutée(s)`);
});
$('sortPages').addEventListener('click', () => writePages(pageList().sort((a, b) => compareNames(a.name, b.name))));

// ---------------------------------------------------------------- Réglages

const checkboxes = ['showOverlay'];
const numbers = {
  quietMs: { min: 200, max: 10000, fallback: 1000, read: (v) => Math.round(v), show: (s) => s.quietMs, key: 'quietMs' },
  maxWaitS: {
    min: 10,
    max: 900,
    fallback: 120,
    read: (v) => Math.round(v) * 1000,
    show: (s) => s.maxWaitMs / 1000,
    key: 'maxWaitMs',
  },
  warnRatio: { min: 1, max: 20, fallback: 1.5, read: (v) => v, show: (s) => s.warnRatio, key: 'warnRatio' },
  critRatio: { min: 1, max: 20, fallback: 2, read: (v) => v, show: (s) => s.critRatio, key: 'critRatio' },
  warnS: {
    min: 0,
    max: 600,
    fallback: 0,
    read: (v) => Math.round(v * 1000),
    show: (s) => s.warnMs / 1000,
    key: 'warnMs',
  },
  critS: {
    min: 0,
    max: 600,
    fallback: 0,
    read: (v) => Math.round(v * 1000),
    show: (s) => s.critMs / 1000,
    key: 'critMs',
  },
  gapPct: { min: 1, max: 1000, fallback: 50, read: (v) => Math.round(v), show: (s) => s.gapPct, key: 'gapPct' },
};

function renderSettings(settings) {
  for (const [id, n] of Object.entries(numbers)) $(id).value = n.show(settings);
  $('ignoreSelectors').value = settings.ignoreSelectors;
  $('unit').value = unitOf(settings);
  for (const id of checkboxes) $(id).checked = !!settings[id];
}

function bindSettings() {
  for (const [id, n] of Object.entries(numbers)) {
    $(id).addEventListener('change', async (e) => {
      const raw = Number(String(e.target.value).replace(',', '.'));
      const v = Number.isFinite(raw) ? Math.min(n.max, Math.max(n.min, raw)) : n.fallback;
      e.target.value = v;
      state.settings = await saveSettings({ [n.key]: n.read(v) });
      toast('Réglage enregistré');
    });
  }
  $('ignoreSelectors').addEventListener('change', async (e) => {
    const sel = e.target.value.trim();
    if (sel) {
      try {
        document.createDocumentFragment().querySelector(sel);
      } catch {
        toast('Sélecteur CSS invalide');
        return;
      }
    }
    state.settings = await saveSettings({ ignoreSelectors: sel });
    toast('Réglage enregistré');
  });
  $('unit').addEventListener('change', async (e) => {
    state.settings = await saveSettings({ unit: e.target.value });
    toast('Réglage enregistré');
  });
  for (const id of checkboxes) {
    $(id).addEventListener('change', async (e) => {
      state.settings = await saveSettings({ [id]: e.target.checked });
      toast('Réglage enregistré');
    });
  }
}

// ---------------------------------------------------------------- Données

function renderData() {
  const measures = state.measures;
  const ethernet = measures.filter((m) => m.network === 'ethernet').length;
  $('dataSummary').textContent = measures.length
    ? `${nf.format(measures.length)} mesure(s) enregistrée(s) : ${nf.format(ethernet)} en Ethernet, ${nf.format(measures.length - ethernet)} en WiFi.`
    : 'Aucune mesure enregistrée.';
}

function bindData() {
  $('exportJson').addEventListener('click', async () => {
    const data = await exportBackup();
    downloadBlob(JSON.stringify(data, null, 2), `insight-sauvegarde-${fileStamp()}.json`, 'application/json');
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

// Changements : mesures mises à jour d'après l'évènement (sans tout relire), référentiel relu au besoin
let pending = 0;
let catalogStale = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !state.model) return;
  const measures = applyMeasureChanges(state.measures, changes);
  if (measures) state.measures = measures;
  if (changes.apps || changes.pages) catalogStale = true;
  if (!measures && !catalogStale) return;
  clearTimeout(pending);
  pending = setTimeout(async () => {
    if (catalogStale) {
      catalogStale = false;
      const { apps, pages } = await getConfig();
      Object.assign(state, { apps, pages });
    }
    derive();
    renderData();
    if (document.activeElement && document.activeElement.closest('#pageRows')) return; // saisie en cours
    renderPages();
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
