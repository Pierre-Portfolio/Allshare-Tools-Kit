// Capsule : sessions d'onglets sauvegardées (repliées au départ), puis bouton
// « Sauvegarder cette session » (titre + commentaire facultatif).
import {
  getCapsules,
  saveCapsule,
  deleteCapsule,
  reopenCapsule,
  currentTabs,
  describeTabs,
  host,
} from '../lib/capsule.js';

const $ = (id) => document.getElementById(id);
const fmtWhen = (ts) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
let capsules = [];

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
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------------------------------------------------------------- Liste

async function load() {
  capsules = await getCapsules();
  render();
}

function render() {
  $('savedCount').textContent = capsules.length ? `(${capsules.length})` : '';
  $('savedEmpty').hidden = capsules.length > 0;
  $('capsules').replaceChildren(...capsules.map(item));
}

function item(c) {
  return el(
    'li',
    {},
    el(
      'details',
      { className: 'capsule' },
      el(
        'summary',
        {},
        el(
          'span',
          { className: 'cap-head' },
          el('strong', { className: 'cap-title', textContent: c.title }),
          el('span', { className: 'cap-meta', textContent: `${describeTabs(c.tabs)} · ${fmtWhen(c.ts)}` }),
        ),
        el('button', {
          type: 'button',
          className: 'reopen',
          textContent: 'Rouvrir',
          title: 'Rouvrir tous les onglets',
          dataset: { open: c.id },
        }),
      ),
      c.comment ? el('p', { className: 'cap-comment', textContent: c.comment }) : null,
      el(
        'ol',
        { className: 'cap-links' },
        ...c.tabs.map((t) =>
          el(
            'li',
            {},
            el('a', { href: t.url, textContent: t.title, title: t.url, dataset: { url: t.url } }),
            el('small', { textContent: host(t.url) }),
          ),
        ),
      ),
      el(
        'div',
        { className: 'cap-actions' },
        el('button', {
          type: 'button',
          className: 'primary',
          textContent: `↗ Tout rouvrir (${c.tabs.length})`,
          dataset: { open: c.id },
        }),
        el('button', { type: 'button', className: 'link danger', textContent: 'Supprimer', dataset: { del: c.id } }),
      ),
    ),
  );
}

$('capsules').addEventListener('click', async (e) => {
  const link = e.target.closest('[data-url]');
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-del]');
  if (link) {
    e.preventDefault();
    chrome.tabs.create({ url: link.dataset.url });
  } else if (open) {
    e.preventDefault(); // bouton dans le résumé : ne pas déplier
    const c = capsules.find((x) => x.id === open.dataset.open);
    if (!c) return;
    const n = await reopenCapsule(c);
    toast(n === c.tabs.length ? `${n} onglet(s) rouvert(s)` : `${n} / ${c.tabs.length} onglet(s) rouvert(s)`);
  } else if (del) {
    const c = capsules.find((x) => x.id === del.dataset.del);
    if (!c || !confirm(`Supprimer la session « ${c.title} » ?`)) return;
    await deleteCapsule(c.id);
    toast('Session supprimée');
  }
});

// ---------------------------------------------------------------- Sauvegarde

let pending = []; // onglets qui seront enregistrés

async function openForm() {
  pending = await currentTabs();
  $('saveWhat').textContent = pending.length
    ? `Onglets ouverts à enregistrer : ${describeTabs(pending)}.`
    : 'Aucune page web ouverte à enregistrer.';
  $('saveError').textContent = '';
  $('saveOpen').hidden = true;
  $('saveForm').hidden = false;
  $('saveTitle').focus();
}

function closeForm() {
  $('saveForm').hidden = true;
  $('saveOpen').hidden = false;
  $('saveTitle').value = '';
  $('saveComment').value = '';
}

$('saveOpen').addEventListener('click', openForm);
$('saveCancel').addEventListener('click', closeForm);
$('saveForm').addEventListener('keydown', (e) => e.key === 'Escape' && closeForm());
$('saveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('saveTitle').value.trim();
  if (!title) {
    $('saveError').textContent = 'Indiquez un titre.';
    return $('saveTitle').focus();
  }
  pending = await currentTabs(); // onglets ouverts au moment de l'enregistrement
  if (!pending.length) {
    $('saveError').textContent = 'Aucune page web ouverte à enregistrer.';
    return;
  }
  const c = await saveCapsule(title, $('saveComment').value, pending);
  closeForm();
  toast(`« ${c.title} » sauvegardée : ${describeTabs(c.tabs)}`);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.capsules) load();
});

load();
