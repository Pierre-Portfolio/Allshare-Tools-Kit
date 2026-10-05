import {
  getConfig,
  getMeasures,
  saveApps,
  saveSettings,
  deleteMeasures,
  exportBackup,
  importBackup,
  newId,
  isMeasureKey,
} from '../lib/storage.js';
import { parseBase } from '../lib/urls.js';
import { downloadBlob } from '../lib/export.js';
import { fileStamp } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const appsBox = $('apps');
const tpl = $('appTpl');

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------- Applications

function addAppCard(app = { id: newId(), name: '', baseUrls: [] }) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = app.id;
  node.querySelector('.name').value = app.name;
  node.querySelector('.urls').value = (app.baseUrls || []).join('\n');
  node.querySelector('.remove').addEventListener('click', () => removeApp(node));
  appsBox.append(node);
  return node;
}

async function removeApp(node) {
  const id = node.dataset.id;
  const name = node.querySelector('.name').value || 'cette application';
  const measures = (await getMeasures()).filter((m) => m.appId === id);
  const empty = !node.querySelector('.name').value.trim() && !node.querySelector('.urls').value.trim();
  const question = measures.length
    ? `Supprimer « ${name} » et ses ${measures.length} mesure(s) ?`
    : `Supprimer « ${name} » ?`;
  if (!(empty && !measures.length) && !confirm(question)) return;
  node.remove();
  const { apps } = await getConfig();
  await saveApps(apps.filter((a) => a.id !== id));
  if (measures.length) await deleteMeasures(measures.map((m) => m.id));
  toast('Application supprimée');
}

function readApps() {
  const apps = [];
  let valid = true;
  for (const node of appsBox.querySelectorAll('.app')) {
    const error = node.querySelector('.error');
    const name = node.querySelector('.name').value.trim();
    const lines = node
      .querySelector('.urls')
      .value.split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = lines.filter((l) => !parseBase(l));
    error.textContent = '';
    if (!name && !lines.length) continue; // carte vide : ignorée
    if (!name) error.textContent = 'Donnez un nom à l’application.';
    else if (!lines.length) error.textContent = 'Indiquez au moins une URL de base (http:// ou https://).';
    else if (invalid.length) error.textContent = `URL invalide : ${invalid.join(', ')}`;
    if (error.textContent) {
      valid = false;
      continue;
    }
    apps.push({ id: node.dataset.id, name, baseUrls: lines });
  }
  const names = apps.map((a) => a.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    toast('Deux applications portent le même nom.');
    valid = false;
  }
  return valid ? apps : null;
}

async function onSaveApps() {
  const apps = readApps();
  if (!apps) return;
  await saveApps(apps);
  const status = $('appsStatus');
  status.textContent = '✓ Enregistré';
  setTimeout(() => (status.textContent = ''), 2500);
}

// ---------- Réglages

const checkboxes = ['ignoreQuery', 'replaceIds', 'caseInsensitive', 'showOverlay'];

function renderSettings(settings) {
  $('quietMs').value = settings.quietMs;
  $('maxWaitS').value = Math.round(settings.maxWaitMs / 1000);
  $('ignoreSelectors').value = settings.ignoreSelectors;
  for (const id of checkboxes) $(id).checked = !!settings[id];
}

function bindSettings() {
  const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  $('quietMs').addEventListener('change', (e) => {
    const v = clamp(Math.round(Number(e.target.value)), 200, 10000, 1000);
    e.target.value = v;
    saveSettings({ quietMs: v }).then(() => toast('Réglage enregistré'));
  });
  $('maxWaitS').addEventListener('change', (e) => {
    const v = clamp(Math.round(Number(e.target.value)), 10, 900, 120);
    e.target.value = v;
    saveSettings({ maxWaitMs: v * 1000 }).then(() => toast('Réglage enregistré'));
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
    saveSettings({ ignoreSelectors: sel }).then(() => toast('Réglage enregistré'));
  });
  for (const id of checkboxes) {
    $(id).addEventListener('change', (e) =>
      saveSettings({ [id]: e.target.checked }).then(() => toast('Réglage enregistré')),
    );
  }
}

// ---------- Données

async function renderData() {
  const measures = await getMeasures();
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  $('dataSummary').textContent = measures.length
    ? `${measures.length} mesure(s) enregistrée(s) : ${wifi} en WiFi, ${measures.length - wifi} en Ethernet.`
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
      await renderApps();
    } catch (err) {
      toast(err.message || 'Import impossible');
    }
  });
  $('clearAll').addEventListener('click', async () => {
    const measures = await getMeasures();
    if (!measures.length || !confirm(`Supprimer définitivement les ${measures.length} mesure(s) ?`)) return;
    await deleteMeasures(measures.map((m) => m.id));
    toast('Mesures supprimées');
  });
}

async function renderApps() {
  const { apps } = await getConfig();
  appsBox.replaceChildren();
  apps.forEach((a) => addAppCard(a));
  if (!apps.length) addAppCard();
}

async function init() {
  const { settings } = await getConfig();
  await renderApps();
  renderSettings(settings);
  bindSettings();
  bindData();
  renderData();
  $('addApp').addEventListener('click', () => addAppCard().querySelector('.name').focus());
  $('saveApps').addEventListener('click', onSaveApps);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(isMeasureKey)) renderData();
  });
}

init();
