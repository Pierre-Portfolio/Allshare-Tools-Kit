// CRA (panneau latéral) : capsules rouvertes ou sauvegardées le jour choisi (aujourd'hui par défaut),
// avec leur temps d'ouverture, réglages des automatismes de la page de saisie du C.R.A (content/cra.js),
// et pages allshare-scenario.fr ouvertes aujourd'hui (craPages, tenu par background.js).
import { getCapsules, describeTabs, host } from '../lib/capsule.js';
import { openedOn, fmtOpenTime, isoDay, pagesToday, getCraSettings, saveCraSettings } from '../lib/cra.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
    ...rows.map(({ capsule: c, events, open, live }) =>
      el(
        'li',
        { className: c.done ? 'cra-item done' : 'cra-item' },
        el(
          'div',
          { className: 'cra-title' },
          el('strong', { textContent: c.title }),
          c.client ? el('span', { className: 'tag', textContent: c.client, title: 'Client associé' }) : null,
        ),
        el(
          'small',
          { className: 'cra-times' },
          [...events.map((e) => fmtTime(e.ts) + (e.saved ? ' (sauvegarde)' : '')), describeTabs(c.tabs)].join(' · '),
          open > 0 ? ' · ' : null,
          open > 0
            ? el('b', {
                className: 'cra-open',
                textContent: `ouverte ${fmtOpenTime(open)}${live ? ' (en cours)' : ''}`,
                title:
                  'Temps d’ouverture dans la journée : de la sauvegarde ou de la réouverture à la fermeture de sa fenêtre',
              })
            : null,
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- Pages allshare-scenario.fr du jour

/** « dsb-cra.allshare-scenario.fr/apex/r/…/saisie-cra » : domaine et chemin, sans paramètres. */
function shortUrl(url) {
  try {
    return host(url) + new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

async function renderPages() {
  const pages = pagesToday((await chrome.storage.local.get('craPages')).craPages);
  $('pagesTotal').textContent = pages.length ? `(${pages.length})` : '';
  $('pagesEmpty').hidden = pages.length > 0;
  $('pagesList').replaceChildren(
    ...pages.map((p) =>
      el(
        'li',
        { className: 'cra-item', title: p.url },
        el(
          'div',
          { className: 'cra-title' },
          el('strong', { textContent: p.title || shortUrl(p.url) }),
          el('b', { className: 'cra-open', textContent: `${fmtOpenTime(p.ms)}${p.live ? ' (en cours)' : ''}` }),
        ),
        el('small', { className: 'cra-times cra-url', textContent: shortUrl(p.url) }),
      ),
    ),
  );
}

// Temps d'ouverture des capsules et des pages encore ouvertes : mis à jour chaque minute.
// Après minuit, le calendrier resté sur « aujourd'hui » passe au nouveau jour.
let today = isoDay(new Date());
setInterval(() => {
  const now = isoDay(new Date());
  if (now !== today) {
    if ($('craDay').value === today) $('craDay').value = now;
    today = now;
  }
  renderList();
  renderPages();
}, 60000);

$('craDay').value = today;
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
  if (changes.craPages) renderPages();
});

renderList();
renderSettings();
renderPages();
