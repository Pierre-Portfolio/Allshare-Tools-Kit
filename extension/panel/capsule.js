// Capsule : sessions d'onglets sauvegardées (repliées au départ), puis bouton
// « Sauvegarder cette session » (titre + commentaire facultatif).
// Une session cochée n'est plus active (barrée, rangée après les sessions actives) ; recherche et filtre
// Toutes / Actives / Inactives ; l'ordre des sessions se change par glisser-déposer ; titre modifiable ;
// pages retirées (×) ou ajoutées.
import {
  getCapsules,
  saveCapsule,
  updateCapsule,
  setDone,
  moveCapsule,
  deleteCapsule,
  reopenCapsule,
  filterCapsules,
  searchCapsules,
  reorder,
  toUrl,
  addTab,
  activeTab,
  currentTabs,
  describeTabs,
  host,
  clientNames,
} from '../lib/capsule.js';
import { getConfig, getMeasures } from '../lib/storage.js';
import { canonical, normName } from '../lib/names.js';

const $ = (id) => document.getElementById(id);
const fmtWhen = (ts) => new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
let capsules = [];
let clients = []; // clients d'Insight, proposés pour « Client associé »
let filter = 'all'; // filtre de la liste : 'all', 'active' ou 'inactive'
const FILTERS = { all: 'Toutes', active: 'Actives', inactive: 'Inactives' };

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
  const query = $('capSearch').value.trim();
  const filtered = filterCapsules(capsules, filter);
  const shown = searchCapsules(filtered, query);
  const inactive = capsules.filter((c) => c.done).length;
  const counts = { all: capsules.length, active: capsules.length - inactive, inactive };
  $('savedCount').textContent = capsules.length ? `(${capsules.length})` : '';
  $('savedEmpty').hidden = capsules.length > 0;
  $('capFilter').hidden = !capsules.length;
  $('capSearch').hidden = !capsules.length;
  for (const b of $('capFilter').querySelectorAll('[data-filter]')) {
    b.textContent = `${FILTERS[b.dataset.filter]} (${counts[b.dataset.filter]})`;
    b.setAttribute('aria-checked', String(b.dataset.filter === filter));
  }
  $('filterEmpty').hidden = !capsules.length || shown.length > 0;
  $('filterEmpty').textContent =
    filtered.length && query
      ? `Aucune session ne correspond à « ${query} ».`
      : filter === 'active'
        ? 'Aucune session active.'
        : 'Aucune session inactive.';
  // Sessions dépliées : elles le restent après un rechargement de la liste
  const open = new Set([...$('capsules').querySelectorAll('.capsule[open]')].map((d) => d.parentElement.dataset.id));
  $('capsules').replaceChildren(...shown.map((c) => item(c, open.has(c.id))));
}

function item(c, open) {
  return el(
    'li',
    { className: c.done ? 'cap-item done' : 'cap-item', draggable: true, dataset: { id: c.id } },
    el(
      'details',
      { className: 'capsule', open },
      el(
        'summary',
        {},
        el('input', {
          type: 'checkbox',
          className: 'cap-done',
          checked: !!c.done,
          title: c.done ? 'Session inactive : décocher pour la réactiver' : 'Cocher si la session n’est plus active',
          dataset: { done: c.id },
        }),
        el(
          'span',
          { className: 'cap-head', title: 'Cliquer pour voir les onglets, glisser pour changer l’ordre' },
          el('strong', { className: 'cap-title', textContent: c.title }),
          el(
            'span',
            { className: 'cap-meta' },
            c.client
              ? el('span', { className: 'tag cap-client', textContent: c.client, title: 'Client associé' })
              : null,
            `${describeTabs(c.tabs)} · ${fmtWhen(c.ts)}`,
          ),
        ),
        el('button', {
          type: 'button',
          className: 'reopen',
          textContent: 'Rouvrir',
          title: 'Rouvrir tous les onglets',
          disabled: !c.tabs.length,
          dataset: { open: c.id },
        }),
      ),
      c.comment ? el('p', { className: 'cap-comment', textContent: c.comment }) : null,
      c.tabs.length
        ? el(
            'ol',
            { className: 'cap-links' },
            ...c.tabs.map((t, i) =>
              el(
                'li',
                {},
                el(
                  'div',
                  { className: 'cap-link' },
                  el('a', { href: t.url, textContent: t.title, title: t.url, dataset: { url: t.url } }),
                  el('small', { textContent: host(t.url) }),
                  el('button', {
                    type: 'button',
                    className: 'cap-remove',
                    textContent: '×',
                    title: 'Retirer cette page de la session',
                    dataset: { remove: String(i) },
                  }),
                ),
              ),
            ),
          )
        : el('p', { className: 'hint cap-none', textContent: 'Aucune page dans cette session.' }),
      el(
        'form',
        { className: 'cap-add', autocomplete: 'off', noValidate: true },
        el('input', {
          type: 'text',
          placeholder: 'Adresse à ajouter (https://…)',
          title: 'Adresse de la page à ajouter à la session',
          spellcheck: false,
        }),
        el('button', { type: 'submit', textContent: 'Ajouter' }),
        el('button', {
          type: 'button',
          className: 'link',
          textContent: '＋ Ajouter l’onglet affiché',
          title: 'Ajouter la page affichée dans cette fenêtre',
          dataset: { addCurrent: c.id },
        }),
      ),
      el(
        'div',
        { className: 'cap-actions' },
        el('button', {
          type: 'button',
          className: 'primary',
          textContent: `↗ Tout rouvrir (${c.tabs.length})`,
          disabled: !c.tabs.length,
          dataset: { open: c.id },
        }),
        el(
          'span',
          { className: 'cap-edit' },
          el('button', {
            type: 'button',
            className: 'link',
            textContent: '✎ Renommer',
            title: 'Modifier le titre de la session',
            dataset: { rename: c.id },
          }),
          el('button', { type: 'button', className: 'link danger', textContent: 'Supprimer', dataset: { del: c.id } }),
        ),
      ),
    ),
  );
}

/** Ajoute une page à une session ; false si elle y est déjà. */
async function addPage(c, tab) {
  const tabs = addTab(c.tabs, tab);
  if (!tabs) {
    toast('Cette page est déjà dans la session');
    return false;
  }
  await updateCapsule(c.id, { tabs });
  toast(`Page ajoutée : ${tabs[tabs.length - 1].title}`);
  return true;
}

const capsuleOf = (node) => capsules.find((c) => c.id === node.closest('.cap-item').dataset.id);

$('capsules').addEventListener('click', async (e) => {
  const link = e.target.closest('[data-url]');
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-del]');
  const remove = e.target.closest('[data-remove]');
  const addCurrent = e.target.closest('[data-add-current]');
  const rename = e.target.closest('[data-rename]');
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
  } else if (remove) {
    const c = capsuleOf(remove);
    const i = Number(remove.dataset.remove);
    if (!c || !c.tabs[i]) return;
    await updateCapsule(c.id, { tabs: c.tabs.filter((_, k) => k !== i) });
    toast(`Page retirée : ${c.tabs[i].title}`);
  } else if (addCurrent) {
    const c = capsuleOf(addCurrent);
    const tab = await activeTab();
    if (!tab) return toast('L’onglet affiché ne peut pas être ajouté (page interne de Chrome)');
    if (c) await addPage(c, tab);
  } else if (rename) {
    startRename(rename.closest('.cap-item'));
  }
});

$('capsules').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const url = toUrl(input.value);
  if (!url) {
    toast('Adresse non valide : une page web (https://…) ou un fichier local');
    return input.focus();
  }
  const c = capsuleOf(e.target);
  if (c && (await addPage(c, { url }))) input.value = '';
});

$('capsules').addEventListener('change', (e) => {
  const box = e.target.closest('[data-done]');
  if (box) setDone(box.dataset.done, box.checked);
});

// Saisie (adresse, titre) : la session ne se déplace pas quand on sélectionne le texte du champ
$('capsules').addEventListener('focusin', (e) => {
  if (e.target.matches('input[type="text"]')) e.target.closest('.cap-item').draggable = false;
});
$('capsules').addEventListener('focusout', (e) => {
  if (e.target.matches('input[type="text"]')) e.target.closest('.cap-item').draggable = true;
});

// ---------------------------------------------------------------- Titre modifié sur place

let renaming = null; // champ du titre en cours de modification

/** Remplace le titre de la session par un champ : Entrée (ou clic ailleurs) enregistre, Échap annule. */
function startRename(li) {
  const c = capsules.find((x) => x.id === li.dataset.id);
  if (!c) return;
  renaming = el('input', {
    type: 'text',
    className: 'cap-title-input',
    value: c.title,
    maxLength: 120,
    title: 'Entrée pour enregistrer, Échap pour annuler',
  });
  li.querySelector('.cap-title').replaceWith(renaming);
  renaming.focus();
  renaming.select();
}

async function endRename(input, save) {
  if (input !== renaming) return; // déjà enregistré (Entrée puis perte du focus)
  renaming = null;
  const c = capsuleOf(input);
  const title = normName(input.value);
  if (!save || !c || !title || title === c.title) return render();
  await updateCapsule(c.id, { title });
  toast(`Session renommée : ${title}`);
}

$('capsules').addEventListener('keydown', (e) => {
  if (!e.target.matches('.cap-title-input')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    endRename(e.target, true);
  } else if (e.key === 'Escape') {
    endRename(e.target, false);
  }
});
// Espace tapé dans le champ : Chrome replierait la session (champ dans le résumé)
$('capsules').addEventListener('keyup', (e) => {
  if (e.key === ' ' && e.target.matches('.cap-title-input')) e.preventDefault();
});
$('capsules').addEventListener('focusout', (e) => {
  if (e.target.matches('.cap-title-input')) endRename(e.target, true);
});

$('capSearch').addEventListener('input', render);

$('capFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  filter = b.dataset.filter;
  render();
});

// ---------------------------------------------------------------- Glisser-déposer

let dragged = null; // identifiant de la session déplacée

function clearDrop() {
  for (const li of $('capsules').querySelectorAll('.drop-before, .drop-after')) {
    li.classList.remove('drop-before', 'drop-after');
  }
}

/** Session survolée et côté du dépôt (au-dessus ou en dessous), ou null. */
function dropTarget(e) {
  const li = e.target.closest('.cap-item');
  if (!dragged || !li || li.dataset.id === dragged) return null;
  const r = li.getBoundingClientRect();
  return { li, after: e.clientY > r.top + r.height / 2 };
}

$('capsules').addEventListener('dragstart', (e) => {
  if (!e.target.classList?.contains('cap-item')) return; // un lien d'onglet glissé, par exemple
  dragged = e.target.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.querySelector('.cap-title').textContent);
  e.target.classList.add('dragging');
});

$('capsules').addEventListener('dragover', (e) => {
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault(); // dépôt autorisé
  e.dataTransfer.dropEffect = 'move';
  t.li.classList.add(t.after ? 'drop-after' : 'drop-before');
});

$('capsules').addEventListener('dragleave', (e) => {
  if (!$('capsules').contains(e.relatedTarget)) clearDrop();
});

$('capsules').addEventListener('drop', (e) => {
  const t = dropTarget(e);
  clearDrop();
  if (!t) return;
  e.preventDefault();
  const id = dragged;
  dragged = null;
  capsules = reorder(capsules, id, t.li.dataset.id, t.after);
  render();
  moveCapsule(id, t.li.dataset.id, t.after);
});

$('capsules').addEventListener('dragend', (e) => {
  dragged = null;
  clearDrop();
  e.target.classList?.remove('dragging');
});

// ---------------------------------------------------------------- Sauvegarde

let pending = []; // onglets qui seront enregistrés

async function openForm() {
  const [{ apps }, measures] = await Promise.all([getConfig(), getMeasures()]);
  clients = clientNames(apps, measures);
  $('clientList').replaceChildren(...clients.map((name) => el('option', { value: name })));
  pending = await currentTabs();
  $('saveWhat').textContent = pending.length
    ? `Onglets de cette fenêtre à enregistrer : ${describeTabs(pending)}.`
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
  $('saveClient').value = '';
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
  pending = await currentTabs(); // onglets de la fenêtre au moment de l'enregistrement
  if (!pending.length) {
    $('saveError').textContent = 'Aucune page web ouverte à enregistrer.';
    return;
  }
  const c = await saveCapsule({
    title,
    client: canonical($('saveClient').value, clients), // « client a » -> « Client A »
    comment: $('saveComment').value,
    tabs: pending,
  });
  closeForm();
  toast(`« ${c.title} » sauvegardée : ${describeTabs(c.tabs)}`);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.capsules) load();
});

load();
