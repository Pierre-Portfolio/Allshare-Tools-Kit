// CRA — page de saisie du C.R.A (Oracle APEX, grille interactive), monde isolé de l'extension.
//
// Déclaré dans le manifest pour les adresses de la page de saisie (CRA_ORIGIN + CRA_PATH, voir lib/cra.js).
// Réglages du module CRA (chrome.storage.local, craSettings), appliqués dès qu'ils changent :
//  * autoHighlight : en arrivant sur la page, décoche la case de l'étoile jaune (surlignage des lignes,
//                    dans les réglages de la grille) si elle est cochée. Comme à la main : repliés, les
//                    réglages sont d'abord dépliés, la case n'est décochée qu'une fois qu'ils sont affichés
//                    (cliquée avant, APEX ne la prend pas en compte), puis ils sont repliés ;
//  * autoSave      : quand le focus quitte une ligne modifiée de la grille (autre ligne, bouton
//                    « Add Row », reste de la page), clique sur « Save ». Ouvrir une liste de valeurs,
//                    un calendrier ou un menu ne compte pas comme quitter la ligne.
(() => {
  const CRA_ORIGIN = 'https://dsb-cra.allshare-scenario.fr'; // = lib/cra.js
  const CRA_PATH = '/apex/r/allshare_wks/xaas/saisie-cra'; // = lib/cra.js, avec ou sans paramètres
  if (location.origin !== CRA_ORIGIN || location.pathname.replace(/\/+$/, '') !== CRA_PATH) return;
  if (window.__craContent) return;
  window.__craContent = true;

  const HIGHLIGHT = 'input.a-IG-controlsCheckbox[data-setting="highlight"]';
  const SETTINGS = '.a-IG-controlsContainer'; // réglages de la grille : filtres, étoile jaune, sommes…
  const POPUPS = '[role="dialog"], .ui-dialog, .a-Menu, .a-DatePicker-calendar, .ui-datepicker, .a-PopupLOV-dialog';
  const SETTLE_MS = 400; // le focus passe parfois par la grille entre deux cellules
  const WAIT_GRID_MS = 30000; // la grille interactive se construit après le chargement de la page

  let settings = { autoSave: false, autoHighlight: false };

  // ------------------------------------------------------------ Étoile jaune

  const POLL_MS = 100;
  const OPEN_MS = 3000; // réglages dépliés et affichés, case affichée
  const OPENED_MS = 300; // le temps qu'APEX finisse de déplier les réglages
  const CLICK_MS = 500; // le temps qu'APEX prenne la case en compte
  const MAX_CLICKS = 3; // case de nouveau cochée (réglages reconstruits) : cliquée encore, pas sans fin
  const UNCHECKED = 'unchecked';

  let highlightState = 'idle'; // 'running', puis 'done' : une seule fois par page

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Sonde `test` jusqu'à ce qu'il renvoie une valeur vraie, rendue ; null passé `ms` ou réglage désactivé. */
  async function waitFor(test, ms) {
    for (const end = Date.now() + ms; settings.autoHighlight; await sleep(POLL_MS)) {
      const value = test();
      if (value) return value;
      if (Date.now() >= end) break;
    }
    return null;
  }

  // Zone repliable d'APEX : contenu masqué (aria-hidden, display: none) et bouton qui le déplie (aria-controls)
  const contentOf = (area) => area.querySelector('.a-Collapsible-content');
  const isCollapsed = (area) =>
    area.classList.contains('is-collapsed') || contentOf(area)?.getAttribute('aria-hidden') === 'true';
  const isOpen = (area) => !isCollapsed(area) && (contentOf(area) || area).getClientRects().length > 0;
  function toggleOf(area) {
    const id = contentOf(area)?.id;
    return (
      (id && area.querySelector(`[aria-controls="${CSS.escape(id)}"]`)) ||
      area.querySelector('.a-Collapsible-toggle, .a-MediaBlock-graphic button')
    );
  }
  // APEX a pu reconstruire la zone : on reprend celle de la page
  const current = (area) => (area.isConnected ? area : document.querySelector(SETTINGS) || area);

  /** Case cochée à décocher, réglages affichés ; UNCHECKED si toutes décochées ; sinon null. */
  function boxToClick() {
    const boxes = [...document.querySelectorAll(HIGHLIGHT)];
    if (boxes.length && !boxes.some((box) => box.checked)) return UNCHECKED;
    return boxes.find((box) => box.checked && (!box.closest(SETTINGS) || isOpen(box.closest(SETTINGS)))) || null;
  }

  async function unhighlight() {
    if (highlightState !== 'idle') return;
    highlightState = 'running';
    let opened = null; // réglages repliés que l'extension a dépliés : repliés de nouveau ensuite
    let unchecked = false;
    // Grille construite après le chargement : la case, ou des réglages repliés vides (case affichée une fois dépliés)
    const emptyCollapsed = () => {
      const area = document.querySelector(SETTINGS);
      return area && isCollapsed(area) && !contentOf(area)?.childElementCount;
    };
    if (await waitFor(() => document.querySelector(HIGHLIGHT) || emptyCollapsed(), WAIT_GRID_MS)) {
      // 1. Réglages repliés : d'abord les déplier, comme à la main, et attendre qu'ils soient affichés
      const box = [...document.querySelectorAll(HIGHLIGHT)].find((b) => b.checked);
      const area = box ? box.closest(SETTINGS) : !document.querySelector(HIGHLIGHT) && document.querySelector(SETTINGS);
      const toggle = area && isCollapsed(area) && toggleOf(area);
      if (toggle) {
        opened = area;
        toggle.click();
        if (await waitFor(() => isOpen(current(area)), OPEN_MS)) await sleep(OPENED_MS);
      }
      // 2. Puis décocher la case, de nouveau si APEX l'affiche encore cochée
      for (let clicks = 0; ; clicks++) {
        const target = await waitFor(boxToClick, OPEN_MS);
        if (target === UNCHECKED) unchecked = true;
        if (!target || target === UNCHECKED || clicks === MAX_CLICKS) break;
        target.click(); // le clic passe par les gestionnaires d'APEX
        await sleep(CLICK_MS);
      }
    }
    // 3. Réglages repliés de nouveau
    const back = opened && current(opened);
    if (back && !isCollapsed(back)) toggleOf(back)?.click();
    highlightState = unchecked ? 'done' : 'idle'; // pas décochée (réglage désactivé…) : réessayée s'il est réactivé
  }

  // ------------------------------------------------------------ Save automatique

  let lastRow = null; // { grid, id, tr } : ligne de la grille où était le focus
  let timer = 0;
  let pending = null; // { row, at } : « Save » cliqué (par nous ou à la main), enregistrement en cours

  /** Ligne de la grille qui contient `node` (ou la cellule active, focus sur la grille elle-même), sinon null. */
  function rowOf(node) {
    if (!node || !node.closest) return null;
    let tr = node.closest('tr[data-id]');
    const view = !tr && node.closest('.a-GV');
    if (view) {
      const cell = view.querySelector('.a-GV-cell.is-focused, .a-GV-cell.is-active');
      tr = cell && cell.closest('tr[data-id]');
    }
    return tr ? { grid: tr.closest('.a-IG') || document.body, id: tr.dataset.id, tr } : null;
  }

  // Colonnes figées : une même ligne est faite de deux <tr> (même data-id)
  const sameRow = (a, b) => a.grid === b.grid && (a.id ? a.id === b.id : a.tr === b.tr);
  const rowParts = ({ grid, id, tr }) => (id ? grid.querySelectorAll(`tr[data-id="${CSS.escape(id)}"]`) : [tr]);
  const isChanged = (row) =>
    [...rowParts(row)].some((tr) => tr.classList.contains('is-updated') || tr.querySelector('.is-changed'));
  // Pas de second clic tant que la ligne enregistrée est encore marquée modifiée (10 s au plus) :
  // une ligne ajoutée serait envoyée deux fois
  const saving = () => pending && Date.now() - pending.at < 10000 && isChanged(pending.row);

  function save(row) {
    const button =
      row.grid.querySelector('button[data-action="save"]') || document.querySelector('button[data-action="save"]');
    if (!button || button.disabled || saving()) return;
    pending = { row, at: Date.now() };
    button.click();
  }

  function check() {
    const el = document.activeElement;
    if (el && el.closest(POPUPS)) return; // liste de valeurs, calendrier… : toujours sur la ligne
    const row = rowOf(el);
    if (settings.autoSave && lastRow && !(row && sameRow(row, lastRow)) && isChanged(lastRow)) save(lastRow);
    lastRow = row;
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(check, SETTLE_MS);
  };
  document.addEventListener('focusin', schedule, true);
  document.addEventListener('focusout', schedule, true);
  // « Save » cliqué à la main : la ligne quittée pour cliquer n'est pas enregistrée une seconde fois
  document.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted && lastRow && e.target.closest('button[data-action="save"]')) {
        pending = { row: lastRow, at: Date.now() };
      }
    },
    true,
  );

  // ------------------------------------------------------------ Réglages

  function apply(next) {
    const turnedOn = next.autoHighlight && !settings.autoHighlight;
    settings = { ...settings, ...next };
    if (turnedOn) unhighlight();
  }

  chrome.storage.local.get('craSettings').then(({ craSettings }) => apply(craSettings || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.craSettings) apply(changes.craSettings.newValue || {});
  });
})();
