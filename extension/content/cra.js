// CRA — page de saisie du C.R.A (Oracle APEX, grille interactive), monde isolé de l'extension.
//
// Déclaré dans le manifest pour les seules adresses commençant par CRA_PAGE (voir lib/cra.js).
// Réglages du module CRA (chrome.storage.local, craSettings), appliqués dès qu'ils changent :
//  * autoHighlight : en arrivant sur la page, coche la case de l'étoile jaune (surlignage des
//                    contrôles de la grille) si elle ne l'est pas ;
//  * autoSave      : quand le focus quitte une ligne modifiée de la grille (autre ligne, bouton
//                    « Add Row », reste de la page), clique sur « Save ». Ouvrir une liste de valeurs,
//                    un calendrier ou un menu ne compte pas comme quitter la ligne.
(() => {
  const CRA_PAGE = 'https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra?';
  if (!location.href.startsWith(CRA_PAGE) || window.__craContent) return;
  window.__craContent = true;

  const HIGHLIGHT = 'input.a-IG-controlsCheckbox[data-setting="highlight"]';
  const POPUPS = '[role="dialog"], .ui-dialog, .a-Menu, .a-DatePicker-calendar, .ui-datepicker, .a-PopupLOV-dialog';
  const SETTLE_MS = 400; // le focus passe parfois par la grille entre deux cellules
  const WAIT_GRID_MS = 30000; // la grille interactive se construit après le chargement de la page

  let settings = { autoSave: false, autoHighlight: false };

  // ------------------------------------------------------------ Étoile jaune

  let highlighted = false; // une seule fois par page

  function highlight() {
    const boxes = document.querySelectorAll(HIGHLIGHT);
    if (!boxes.length) return false;
    for (const box of boxes) if (!box.checked) box.click(); // le clic passe par les gestionnaires d'APEX
    highlighted = true;
    return true;
  }

  function highlightWhenReady() {
    if (highlighted || !settings.autoHighlight || highlight()) return;
    const observer = new MutationObserver(() => {
      if (!settings.autoHighlight || highlight()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), WAIT_GRID_MS);
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
    if (turnedOn) highlightWhenReady();
  }

  chrome.storage.local.get('craSettings').then(({ craSettings }) => apply(craSettings || {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.craSettings) apply(changes.craSettings.newValue || {});
  });
})();
