import { getConfig, getMeasures, saveSettings, isMeasureKey } from '../lib/storage.js';
import { matchApp, pageKey } from '../lib/urls.js';
import { NETWORKS, NETWORK_LABELS, fmtMs, fmtDate } from '../lib/format.js';
import { exportXlsx, loadModel } from '../lib/export.js';
import { coverage, missingPages } from '../lib/report.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR');
const netButtons = [...document.querySelectorAll('[data-network]')];

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

async function activeTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && tab.url ? tab.url : '';
  } catch {
    return '';
  }
}

function renderNetwork(settings) {
  for (const b of netButtons) b.setAttribute('aria-checked', String(b.dataset.network === settings.network));
  $('recording').checked = settings.recording;
  $('recordingLabel').textContent = settings.recording ? 'Enregistrement' : 'En pause';

  // Chrome n'expose le type de connexion que sur ChromeOS / Android.
  const type = navigator.connection && navigator.connection.type;
  const hint = $('netHint');
  hint.className = 'hint';
  if (type === 'wifi' || type === 'ethernet') {
    if (type !== settings.network) {
      hint.className = 'hint warn';
      hint.textContent = `Réseau détecté : ${NETWORK_LABELS[type]}. Pensez à basculer.`;
    } else {
      hint.textContent = `Réseau détecté : ${NETWORK_LABELS[type]}.`;
    }
  } else {
    hint.textContent = 'Chrome ne détecte pas WiFi/Ethernet sur ce système : sélectionnez le réseau avant de mesurer.';
  }
}

function progressRow(label, done, total, current) {
  const ratio = total ? done / total : 0;
  return el(
    'div',
    { className: `progress${current ? ' current' : ''}${total && done === total ? ' full' : ''}` },
    el('span', { className: 'net', textContent: label }),
    el('span', { className: 'track' }, el('i', { style: `width:${Math.round(ratio * 100)}%` })),
    el('span', { className: 'count', textContent: `${done}/${total}` }),
  );
}

async function renderTab(apps, settings) {
  const box = $('tabInfo');
  const url = await activeTabUrl();
  const match = url ? matchApp(url, apps, settings) : null;
  box.replaceChildren();
  if (!apps.length) {
    box.append(
      'Aucune application configurée. ',
      el('button', { className: 'link', textContent: 'Ajouter', onclick: openOptions }),
    );
    return;
  }
  if (!match) {
    box.append(
      el('span', { className: 'muted', textContent: 'Cet onglet ne fait partie d’aucune application suivie.' }),
    );
    return;
  }
  const { model } = await loadModel();
  const appId = match.app.id;
  box.append(
    el(
      'div',
      { className: 'tab-head' },
      el('strong', { textContent: match.app.name }),
      el('span', { className: 'page', textContent: pageKey(url, match.basePath, settings) }),
    ),
  );
  if (!model.pages.length) return;
  for (const n of NETWORKS) {
    const c = coverage(model, appId, [n.id]);
    box.append(progressRow(n.label, c.done, c.total, n.id === settings.network));
  }
  const missing = missingPages(model, appId, settings.network);
  if (missing.length) {
    const shown = missing.slice(0, 12);
    box.append(
      el('div', { className: 'todo-title', textContent: `Reste à mesurer en ${NETWORK_LABELS[settings.network]} :` }),
      el(
        'div',
        { className: 'chips' },
        ...shown.map((p) => el('span', { className: 'chip', title: p.key, textContent: p.label })),
        ...(missing.length > shown.length
          ? [el('span', { className: 'chip more', textContent: `+${missing.length - shown.length}` })]
          : []),
      ),
    );
  } else {
    box.append(
      el('div', {
        className: 'todo-title done',
        textContent: `✓ Toutes les pages sont mesurées en ${NETWORK_LABELS[settings.network]}.`,
      }),
    );
  }
}

async function renderMeasures(apps) {
  const measures = await getMeasures();
  const names = new Map(apps.map((a) => [a.id, a.name]));
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  $('count').textContent = measures.length ? `· ${nf.format(measures.length)} au total (WiFi ${nf.format(wifi)})` : '';
  const list = $('last');
  list.replaceChildren();
  const last = measures.slice(-3).reverse();
  if (!last.length) {
    list.append(el('li', {}, el('span', { className: 'muted', textContent: 'Aucune mesure pour le moment.' })));
    return;
  }
  for (const m of last) {
    list.append(
      el(
        'li',
        {},
        el('span', { className: 'what', title: m.url, textContent: m.page }),
        el('span', { className: 'value', textContent: m.timeout ? `≥ ${fmtMs(m.duration)}` : fmtMs(m.duration) }),
        el('span', {
          className: 'meta',
          textContent: `${names.get(m.appId) || '?'} · ${NETWORK_LABELS[m.network]} · ${fmtDate(m.ts)}`,
        }),
      ),
    );
  }
}

async function render() {
  const { apps, settings } = await getConfig();
  renderNetwork(settings);
  await Promise.all([renderTab(apps, settings), renderMeasures(apps)]);
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

for (const b of netButtons) b.addEventListener('click', () => saveSettings({ network: b.dataset.network }));
$('recording').addEventListener('change', (e) => saveSettings({ recording: e.target.checked }));
$('extract').addEventListener('click', () => exportXlsx());
$('report').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') }));
$('options').addEventListener('click', openOptions);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings || changes.apps || changes.pages || Object.keys(changes).some(isMeasureKey)) render();
});

render();
