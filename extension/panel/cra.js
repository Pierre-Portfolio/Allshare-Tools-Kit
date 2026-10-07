// CRA (panneau latéral) : capsules rouvertes ou sauvegardées le jour choisi (aujourd'hui par défaut),
// et réglages des automatismes de la page de saisie du C.R.A (content/cra.js).
import { getCapsules, describeTabs } from '../lib/capsule.js';
import { openedOn, getCraSettings, saveCraSettings } from '../lib/cra.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** Jour choisi, à minuit heure locale. */
function chosenDay() {
  const [y, m, d] = ($('craDay').value || isoDay(new Date())).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------- Capsules du jour

async function renderList() {
  const day = chosenDay();
  const rows = openedOn(await getCapsules(), day);
  const today = isoDay(day) === isoDay(new Date());
  $('craTotal').textContent = rows.length ? `(${rows.length})` : '';
  $('craEmpty').hidden = rows.length > 0;
  $('craEmpty').textContent = today
    ? "Aucune capsule ouverte aujourd'hui : elles apparaissent ici quand vous les rouvrez ou les sauvegardez."
    : 'Aucune capsule ouverte ce jour-là.';
  $('craList').replaceChildren(
    ...rows.map(({ capsule: c, events }) =>
      el(
        'li',
        { className: c.done ? 'cra-item done' : 'cra-item' },
        el(
          'div',
          { className: 'cra-title' },
          el('strong', { textContent: c.title }),
          c.client ? el('span', { className: 'tag', textContent: c.client, title: 'Client associé' }) : null,
        ),
        el('small', {
          className: 'cra-times',
          textContent: [
            ...events.map((e) => fmtTime(e.ts) + (e.saved ? ' (sauvegarde)' : '')),
            describeTabs(c.tabs),
          ].join(' · '),
        }),
      ),
    ),
  );
}

$('craDay').value = isoDay(new Date());
$('craDay').addEventListener('change', renderList);

// ---------------------------------------------------------------- Réglages

async function renderSettings() {
  const s = await getCraSettings();
  $('autoSave').checked = s.autoSave;
  $('autoHighlight').checked = s.autoHighlight;
}

$('autoSave').addEventListener('change', (e) => saveCraSettings({ autoSave: e.target.checked }));
$('autoHighlight').addEventListener('change', (e) => saveCraSettings({ autoHighlight: e.target.checked }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.capsules) renderList();
  if (changes.craSettings) renderSettings();
});

renderList();
renderSettings();
