import { getConfig, getMeasures, saveSettings, isMeasureKey } from '../lib/storage.js';
import { matchApp, pageKey } from '../lib/urls.js';
import { NETWORK_LABELS, fmtMs, fmtDate } from '../lib/format.js';
import { exportXlsx } from '../lib/export.js';

const $ = (id) => document.getElementById(id);
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
  } else if (!match) {
    box.append(
      el('span', { className: 'muted', textContent: 'Cet onglet ne fait partie d’aucune application suivie.' }),
    );
  } else {
    box.append(
      el('div', {}, el('strong', { textContent: match.app.name })),
      el('div', { className: 'page', textContent: pageKey(url, match.basePath, settings) }),
    );
  }
}

async function renderMeasures(apps) {
  const measures = await getMeasures();
  const names = new Map(apps.map((a) => [a.id, a.name]));
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  $('count').textContent = measures.length
    ? `· ${measures.length} (WiFi ${wifi} · Ethernet ${measures.length - wifi})`
    : '';
  const list = $('last');
  list.replaceChildren();
  const last = measures.slice(-5).reverse();
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
  if (changes.settings || changes.apps || Object.keys(changes).some(isMeasureKey)) render();
});

render();
