// Test de bout en bout d'Allshare Tools Kit : charge l'extension dans Chromium (Playwright), sert deux
// applications de démonstration avec des délais connus, navigue, puis vérifie
// les mesures d'Insight, le rapport (cases rouges) et les exports, puis Capsule, Prisme, Training
// et la sauvegarde de toutes les données (export et import depuis l'accueil).
//
//   npm install && npm run test:e2e
//
// Les captures et le fichier Excel produit sont écrits dans tests/e2e/out/.

import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdirSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { moduleById } from '../../extension/lib/training.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionPath = join(root, 'extension');
const out = join(root, 'tests', 'e2e', 'out');
mkdirSync(out, { recursive: true });

// ---------- Applications de démonstration
const SERVER_DELAY = { appli1: 300, appli2: 600 }; // temps de réponse du serveur (SQL simulé)
const API_DELAY = 500; // appel de données après chargement
const SPA_API_DELAY = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Champ « Page » : « Saisie libre » dans la liste, puis le nom dans le champ texte. */
async function freePage(panel, name) {
  await panel.selectOption('#pagePick', '__free__');
  await panel.fill('#page', name);
}

function mpaPage(app, path) {
  const nav = ['', 'clients', 'clients/42', 'factures']
    .map((p) => `<a id="nav-${p.replace('/', '-') || 'home'}" href="/${app}/${p}">${p || 'accueil'}</a>`)
    .join(' | ');
  // appli1 charge ses données avec fetch(), appli2 avec XMLHttpRequest.
  const load =
    app === 'appli1'
      ? `fetch('/api/data?delay=${API_DELAY}').then(r => r.json()).then(show);`
      : `const x = new XMLHttpRequest(); x.open('GET', '/api/data?delay=${API_DELAY}'); x.onload = () => show(JSON.parse(x.responseText)); x.send();`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${app} ${path}</title></head><body>
<nav>${nav}</nav><main id="main">Chargement…</main>
<script>
function show(d) { const t = document.createElement('table'); for (let i = 0; i < d.rows; i++) t.insertRow().insertCell().textContent = 'ligne ' + i; main.replaceChildren(t); }
${load}
</script></body></html>`;
}

function spaPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SPA</title></head><body>
<nav><a id="spa-factures" data-spa href="/appli1/spa/factures">Factures</a> | <a id="spa-clients" data-spa href="/appli1/spa/clients">Clients</a></nav>
<button id="noop">Bouton sans navigation</button><main id="main"></main>
<script>
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-spa]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', a.href);
  render();
});
noop.onclick = () => main.classList.toggle('x');
function render() {
  main.textContent = 'Chargement…';
  fetch('/api/data?delay=${SPA_API_DELAY}').then(r => r.json()).then(d => { main.textContent = location.pathname + ' : ' + d.rows + ' lignes'; });
}
render();
</script></body></html>`;
}

// Page de saisie du C.R.A simulée (grille interactive APEX) : deux lignes réparties sur deux tableaux
// (colonnes figées), « Save » qui enregistre en 1 s, case du surlignage (étoile jaune) cochée, dans les
// réglages de la grille construits repliés après le chargement, liste de valeurs ouverte dans une boîte de dialogue.
// Comme APEX, les réglages sont reconstruits d'après le modèle en les dépliant : une case cliquée tant qu'ils
// sont repliés est perdue
function craPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Saisie CRA</title></head><body>
<div class="a-IG">
  <div class="a-IG-header">
    <button type="button" id="save" class="a-Button a-Toolbar-item" data-action="save" aria-label="Save">Save</button>
    <button type="button" id="addRow" class="a-Button a-Toolbar-item" data-action="selection-add-row">Add Row</button>
  </div>
  <div id="controls"></div>
  <div class="a-GV">
    <table><tr data-id="1"><td class="a-GV-cell"><input id="r1a"></td></tr><tr data-id="2"><td class="a-GV-cell"><input id="r2a"></td></tr></table>
    <table><tr data-id="1"><td class="a-GV-cell"><input id="r1b"></td></tr><tr data-id="2"><td class="a-GV-cell"><input id="r2b"></td></tr></table>
  </div>
</div>
<div role="dialog"><input id="lov" placeholder="Liste de valeurs"></div>
<script>
window.saves = 0;
window.highlight = true; // modèle de la grille : surlignage actif
window.highlightChanges = [];
window.toggles = 0;
const highlightBox = () => '<input id="CRA_GRID_ig_control_1" type="checkbox" class="a-IG-controlsCheckbox" data-setting="highlight"'
  + (window.highlight ? ' checked' : '') + '>';
setTimeout(() => {
  controls.innerHTML = '<div id="CRA_GRID_ig_report_settings" class="a-MediaBlock a-IG-controlsContainer a-Collapsible is-collapsed">'
    + '<div class="a-MediaBlock-graphic" role="heading"><button type="button" id="toggle" aria-expanded="false" aria-controls="a_Collapsible1_content"></button></div>'
    + '<div class="a-MediaBlock-content a-Collapsible-content" id="a_Collapsible1_content" aria-hidden="true" style="display: none">'
    + highlightBox() + '</div></div>';
  const area = CRA_GRID_ig_report_settings;
  toggle.addEventListener('click', () => {
    window.toggles++;
    const open = area.classList.toggle('is-expanded');
    area.classList.toggle('is-collapsed', !open);
    toggle.setAttribute('aria-expanded', open);
    a_Collapsible1_content.setAttribute('aria-hidden', !open);
    a_Collapsible1_content.style.display = open ? '' : 'none';
    if (open) a_Collapsible1_content.innerHTML = highlightBox();
  });
  // gestionnaire délégué : état des réglages (dépliés ?) au moment où la case change
  area.addEventListener('change', (e) => {
    window.highlight = e.target.checked;
    window.highlightChanges.push(area.classList.contains('is-expanded'));
  });
}, 300);
document.addEventListener('input', (e) => {
  const td = e.target.closest('td');
  td.classList.add('is-changed');
  td.closest('tr').classList.add('is-updated');
});
save.addEventListener('click', () => {
  window.saves++;
  setTimeout(() => document.querySelectorAll('.is-changed, .is-updated').forEach((n) => n.classList.remove('is-changed', 'is-updated')), 1000);
});
</script></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/sso') {
    // page hors application (autre origine), qui renvoie vers l'appli après 1,5 s
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(
      `<!doctype html><p>Connexion…</p><script>setTimeout(() => location.href = ${JSON.stringify(url.searchParams.get('next'))}, 1500)</script>`,
    );
  }
  if (url.pathname === '/api/data') {
    await sleep(Number(url.searchParams.get('delay')) || 0);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ rows: 50 }));
  }
  const [, app, ...rest] = url.pathname.split('/');
  if (!SERVER_DELAY[app]) {
    res.writeHead(404);
    return res.end('introuvable');
  }
  await sleep(SERVER_DELAY[app]);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(rest[0] === 'spa' ? spaPage() : mpaPage(app, rest.join('/')));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---------- Navigateur avec l'extension
const userDataDir = mkdtempSync(join(tmpdir(), 'allshare-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: process.env.HEADED ? false : true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1360, height: 900 },
});

let failed = false;
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('Extension chargée :', extId);
  // Les API chrome.* sont attachées au service worker juste après son démarrage.
  for (let i = 0; i < 50 && !(await sw.evaluate(() => !!(globalThis.chrome && chrome.storage))); i++) await sleep(100);

  const storage = (fn, arg) => sw.evaluate(fn, arg);
  const measures = () =>
    storage(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all)
        .filter((k) => k.startsWith('m_'))
        .map((k) => all[k])
        .sort((a, b) => a.ts - b.ts);
    });
  async function waitCount(count, timeout = 10000) {
    const end = Date.now() + timeout;
    while ((await measures()).length !== count) {
      if (Date.now() > end) throw new Error(`attendu ${count} mesure(s)`);
      await sleep(150);
    }
  }
  async function waitMeasures(count, timeout = 15000) {
    const end = Date.now() + timeout;
    for (;;) {
      const list = await measures();
      if (list.length >= count) return list;
      if (Date.now() > end) throw new Error(`attendu ${count} mesure(s), obtenu ${list.length}`);
      await sleep(200);
    }
  }

  /** Valeur lue dans le service worker une fois égale à `expected` (les réglages s'écrivent après l'affichage). */
  async function waitStored(fn, expected, label, timeout = 5000) {
    let value;
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
      value = await storage(fn);
      if (value === expected) return;
    }
    assert.equal(value, expected, label);
  }

  for (const p of context.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();
  const session = () => storage(async () => (await chrome.storage.session.get('session')).session || null);
  async function waitSession(pred, label, timeout = 15000) {
    const end = Date.now() + timeout;
    for (;;) {
      const s = await session();
      if (pred(s)) return s;
      if (Date.now() > end) throw new Error(`session : ${label} non atteint (${JSON.stringify(s && s.state)})`);
      await sleep(100);
    }
  }
  const check = (m, expected, min, max, label) => {
    console.log(
      `  ${label.padEnd(44)} ${String(m.duration).padStart(5)} ms  [${m.app} › ${m.page} · ${m.network} · ${m.kind}/${m.trigger}]`,
    );
    for (const [k, v] of Object.entries(expected)) assert.equal(m[k], v, `${label} : ${k}`);
    assert.ok(m.duration >= min && m.duration <= max, `${label} : ${m.duration} ms hors de [${min}, ${max}]`);
  };

  // 1. Sans lancer l'enregistrement, rien n'est mesuré
  const page = await context.newPage();
  await page.goto(`${base}/appli1/`);
  await page.click('#nav-clients');
  await page.waitForLoadState('load');
  await sleep(2500);
  assert.equal((await measures()).length, 0, 'aucune mesure sans lancement');
  await page.goto(`${base}/appli1/`);
  const tabId = await storage(async (u) => (await chrome.tabs.query({ url: u + '/*' }))[0].id, base);

  // 2. Panneau (ouvert dans un onglet pour le test, ciblant l'onglet de l'appli)
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 860 });
  await panel.goto(`chrome-extension://${extId}/panel/panel.html?tabId=${tabId}`);
  await panel.waitForSelector('#viewForm:not([hidden])');
  assert.deepEqual(
    await panel.locator('[data-network]').allTextContents(),
    ['Ethernet', 'WiFi'],
    'Ethernet en premier',
  );
  assert.equal(await panel.getAttribute('[data-network="ethernet"]', 'aria-checked'), 'true', 'Ethernet par défaut');
  await panel.click('[data-network="wifi"]');
  await panel.fill('#app', 'Appli 1');
  // Version application au-dessus du SID, obligatoire
  assert.ok(
    await panel.evaluate(() => {
      const [version, sid] = ['version', 'sid'].map((id) => document.getElementById(id));
      return !!(version.compareDocumentPosition(sid) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
    'version au-dessus du SID',
  );
  await freePage(panel, 'Clients');
  await panel.click('#arm');
  assert.match(await panel.textContent('#formError'), /Indiquez la version/, 'version obligatoire');
  assert.equal(await panel.evaluate(() => document.activeElement.id), 'version');
  assert.equal(await session(), null, 'rien de lancé sans version');
  await panel.fill('#sid', 'PRD');
  await panel.fill('#version', '5.3');
  // Liste des pages : un groupe par menu, dans l'ordre d'affichage, quelle que soit la version ;
  // champ texte masqué tant qu'on n'a pas choisi « Saisie libre »
  const pageOptions = () => panel.locator('#pagePick option').allTextContents();
  const menus = await panel.locator('#pagePick optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  assert.equal(menus.length, 13, 'un groupe par menu');
  assert.deepEqual(menus.slice(0, 4), ['NAO', 'Fiche Salarié', 'Listes Collaborateurs', 'Listes des employés']);
  assert.equal(await panel.locator('#pagePick option').count(), 107, '104 pages + accueil + choix vide + saisie libre');
  assert.deepEqual(
    (await pageOptions()).slice(0, 4),
    ['— Choisir une page —', 'Dashboard', '✎ Saisie libre (autre page)…', 'Effectifs CDI'],
    '« Dashboard » tout en haut, puis les sous-menus du premier menu',
  );
  assert.deepEqual(await panel.locator('#pagePick optgroup[label="Fiche Salarié"] option').allTextContents(), [
    'Fiche Salarié',
    'Détail Paye par Salarié',
  ]);
  await panel.selectOption('#pagePick', 'Liste Mensuelle des Salariés');
  assert.ok(await panel.isHidden('#page'), 'champ texte masqué');
  assert.equal(await panel.inputValue('#page'), 'Liste Mensuelle des Salariés', 'page reprise de la liste');
  await freePage(panel, 'Clients');
  await panel.click('#arm');
  await waitSession((s) => s && s.state === 'armed', 'armé');
  await panel.waitForSelector('#viewLive:not([hidden])');
  await page.waitForSelector('insight-indicator', { state: 'attached' });
  await panel.screenshot({ path: join(out, 'panel-pret.png') });

  // 3. Clic dans l'appli -> nouvelle page -> mesure
  await page.click('#nav-clients');
  let list = await waitMeasures(1);
  check(
    list[0],
    { app: 'Appli 1', sid: 'PRD', version: '5.3', page: 'Clients', network: 'wifi', kind: 'load', trigger: 'click' },
    800,
    3000,
    'WiFi · Clients (clic)',
  );
  assert.equal(list[0].startUrl, `${base}/appli1/`);
  assert.equal(list[0].url, `${base}/appli1/clients`, 'URL complète enregistrée');
  assert.equal(list[0].urlEnd, 'clients', "fin d'URL enregistrée");
  // Détail : repères Navigation Timing + appel fetch /api/data (500 ms), rangé à part de la mesure (d_<id>)
  assert.ok(!('detail' in list[0]), 'détail rangé à part');
  const d = await storage(async (id) => (await chrome.storage.local.get(`d_${id}`))[`d_${id}`], list[0].id);
  assert.equal(d.kind, 'load');
  assert.ok(d.marks.responseStart - d.marks.requestStart >= 250, 'attente serveur ≥ délai serveur');
  const apiCall = d.requests.find((r) => r.url.includes('/api/data'));
  assert.ok(apiCall && apiCall.duration >= 480, `appel /api/data mesuré (${apiCall && apiCall.duration} ms)`);
  console.log(
    `  Détail : attente serveur ${d.marks.responseStart - d.marks.requestStart} ms, /api/data ${apiCall.duration} ms, fin ${d.marks.end} ms`,
  );
  await panel.waitForSelector('#viewResult:not([hidden])');
  assert.match(await panel.textContent('#resValue'), /^\d+,\d\d s$/, 'résultat en secondes par défaut');
  assert.match(await panel.textContent('#resLabel'), /Appli 1 · PRD · 5\.3 › Clients · WiFi/);
  assert.match(await panel.textContent('#relaunchOther'), /Relancer en Ethernet/);
  await panel.screenshot({ path: join(out, 'panel-resultat.png') });
  await panel.click('#detail summary');
  await panel.waitForSelector('#detail .timings tbody tr');
  assert.match(await panel.textContent('#detail'), /Requête \(attente serveur\)/);
  await panel.screenshot({ path: join(out, 'panel-detail.png'), fullPage: true });
  await panel.click('#detail summary');

  // 4. « Relancer en Ethernet » : retour à la page de départ, le chargement de retour n'est pas mesuré
  await panel.click('#relaunchOther');
  await waitSession((s) => s && s.state === 'armed' && s.network === 'ethernet', 'réarmé en Ethernet');
  await page.waitForURL(`${base}/appli1/`);
  await page.waitForSelector('#nav-clients');
  await sleep(1500);
  assert.equal((await measures()).length, 1, 'le retour à la page de départ ne crée pas de mesure');
  await page.click('#nav-clients');
  list = await waitMeasures(2);
  check(
    list[1],
    { app: 'Appli 1', page: 'Clients', network: 'ethernet', trigger: 'click' },
    800,
    3000,
    'Ethernet · Clients (relance)',
  );

  // 5. « Page suivante » : la page suivante est proposée et l'enregistrement relancé aussitôt ;
  //    « Annuler » ramène au formulaire (client, SID, version et page suivante conservés)
  await panel.waitForSelector('#viewResult:not([hidden])');
  await panel.click('#next');
  await waitSession(
    (s) => s && s.state === 'armed' && s.page === 'Dashboard' && s.app === 'Appli 1' && s.network === 'ethernet',
    'réarmé sur la page suivante',
  );
  await panel.waitForSelector('#viewLive:not([hidden])');
  assert.match(await panel.textContent('#liveLabel'), /Appli 1 · PRD · 5\.3 › Dashboard · Ethernet/);
  await panel.click('#cancel');
  await waitSession((s) => s === null, 'annulé pour changer de page');
  await panel.waitForSelector('#viewForm:not([hidden])');
  assert.equal(await panel.inputValue('#app'), 'Appli 1');
  assert.equal(await panel.inputValue('#sid'), 'PRD', 'SID conservé');
  assert.equal(await panel.inputValue('#version'), '5.3', 'version conservée');
  assert.equal(await panel.isChecked('#specific'), false);
  assert.equal(await panel.inputValue('#pagePick'), 'Dashboard', 'page suivante : 1re page du menu');
  assert.ok(await panel.isHidden('#page'));
  await freePage(panel, 'Fiche client');
  await panel.check('#specific'); // « Page spécifique ? »
  await panel.press('#page', 'Enter');
  await waitSession(
    (s) => s && s.state === 'armed' && s.page === 'Fiche client' && s.specific === true,
    'armé Fiche client (spécifique)',
  );
  assert.match(await panel.textContent('#liveLabel'), /Fiche client \(spécifique\)/);
  await page.click('#nav-clients-42');
  list = await waitMeasures(3);
  check(
    list[2],
    { page: 'Fiche client', network: 'ethernet', specific: true },
    800,
    3000,
    'Ethernet · Fiche client (spéc.)',
  );

  // 6. SPA : un clic sans changement d'URL est ignoré, le clic de navigation est mesuré
  await page.goto(`${base}/appli1/spa/`);
  await panel.click('#next');
  await waitSession((s) => s && s.state === 'armed' && s.specific === false, 'page suivante armée, non spécifique');
  await panel.click('#cancel');
  await panel.waitForSelector('#viewForm:not([hidden])');
  assert.equal(await panel.isChecked('#specific'), false, 'page suivante : case décochée');
  await panel.click('[data-network="wifi"]');
  await freePage(panel, 'Factures');
  await panel.click('#arm');
  await waitSession((s) => s && s.state === 'armed' && s.page === 'Factures', 'armé SPA');
  await page.click('#noop');
  await sleep(1800);
  assert.equal((await measures()).length, 3, 'clic sans navigation ignoré');
  assert.equal((await session()).state, 'armed');
  await page.click('#spa-factures');
  list = await waitMeasures(4);
  check(
    list[3],
    { page: 'Factures', network: 'wifi', kind: 'spa', trigger: 'click' },
    400,
    2000,
    'WiFi · Factures (SPA)',
  );

  // 7. Annuler
  await panel.click('#next');
  await waitSession((s) => s && s.state === 'armed', 'page suivante armée');
  await panel.click('#cancel');
  await panel.waitForSelector('#viewForm:not([hidden])');
  assert.deepEqual(
    await panel.locator('#pagePick optgroup[label="Spécifiques à ce client"] option').allTextContents(),
    ['Fiche client'],
  );
  await panel.selectOption('#pagePick', 'Turnover');
  await panel.click('#arm');
  await waitSession((s) => s && s.state === 'armed' && s.page === 'Turnover', 'armé (page du menu)');
  await panel.click('#cancel');
  await waitSession((s) => s === null, 'annulé');
  await page.click('#spa-clients');
  await sleep(1800);
  assert.equal((await measures()).length, 4, 'pas de mesure après annulation');

  // 8. Suggestion du nom d'application d'après l'onglet (URL déclarée dans le référentiel)
  await storage(async (b) => {
    const { apps = [] } = await chrome.storage.local.get('apps');
    await chrome.storage.local.set({ apps: [...apps, { id: 'a2', name: 'Appli 2', baseUrls: [`${b}/appli2/`] }] });
  }, base);
  const page2 = await context.newPage();
  await page2.goto(`${base}/appli2/`);
  const tabId2 = await storage(async (u) => (await chrome.tabs.query({ url: u + '/appli2/*' }))[0].id, base);
  const panel2 = await context.newPage();
  await panel2.setViewportSize({ width: 380, height: 860 });
  await panel2.goto(`chrome-extension://${extId}/panel/panel.html?tabId=${tabId2}`);
  await panel2.waitForSelector('#appSuggest:not([hidden])');
  assert.match(await panel2.textContent('#appSuggestName'), /Appli 2/);
  await panel2.click('#appSuggestUse');
  assert.equal(await panel2.inputValue('#app'), 'Appli 2');
  assert.equal(await panel2.inputValue('#version'), '5.3', 'version du formulaire gardée (nouveau client)');
  // Pages spécifiques d'Appli 1 absentes de la liste d'Appli 2
  assert.equal(await panel2.locator('#pagePick option[value="Fiche client"]').count(), 0);
  await freePage(panel2, 'Clients');
  await panel2.click('#arm');
  await waitSession((s) => s && s.state === 'armed' && s.app === 'Appli 2', 'armé Appli 2');
  await page2.click('#nav-clients');
  list = await waitMeasures(5);
  check(list[4], { app: 'Appli 2', page: 'Clients', network: 'wifi' }, 1100, 3500, 'WiFi · Appli 2 · Clients (XHR)');
  await panel2.waitForSelector('#viewResult:not([hidden])');
  await panel2.screenshot({ path: join(out, 'panel-resultat-2.png') });

  // 9. Tableau de bord : 4 exports, CSV avec URL, suppressions par menu
  const report = await context.newPage();
  report.on('dialog', (dlg) => dlg.accept());
  await report.setViewportSize({ width: 1440, height: 900 });
  await report.goto(`chrome-extension://${extId}/report/report.html`);
  await report.waitForSelector('#matrix table');
  assert.equal(await report.locator('#matrix tbody tr').count(), 2, 'une ligne par client · SID · version');
  const download = async (file) => {
    const [d] = await Promise.all([report.waitForEvent('download'), report.click('#exGo')]);
    await d.saveAs(join(out, file));
    console.log(`  Export : ${d.suggestedFilename()}`);
    return d.suggestedFilename();
  };
  await report.selectOption('#exType', 'all');
  assert.match(await download('export-tout.xlsx'), /^insight-tout-.*\.xlsx$/);
  await report.selectOption('#exType', 'page');
  await report.selectOption('#exPage', 'Clients');
  assert.match(await download('export-page.xlsx'), /^insight-page-clients-/);
  await report.selectOption('#exType', 'client');
  await report.selectOption('#exClient', 'Appli 1');
  assert.match(await download('export-client.xlsx'), /^insight-client-appli-1-/);
  await report.selectOption('#exType', 'detail');
  await report.selectOption('#exPage', 'Clients');
  assert.match(await download('export-detail.xlsx'), /^insight-detail-clients-/);
  await report.selectOption('#exType', 'all');
  await report.click('#exFormat [data-format="csv"]');
  await report.check('#exFullUrl');
  await report.check('#exUrlEnd');
  assert.match(await download('export-tout.csv'), /\.csv$/);
  const csv = readFileSync(join(out, 'export-tout.csv'), 'utf8').replace('﻿', '').trim().split('\r\n');
  assert.match(csv[0], /;Page;Page spécifique;Réseau;/);
  assert.match(csv[0], /Fin d'URL;URL complète;Page de départ$/);
  assert.ok(
    csv.some((l) => l.includes(';Fiche client;Oui;Ethernet;')),
    'page spécifique dans le CSV',
  );
  assert.equal(csv.length, 1 + (await measures()).length);
  assert.ok(
    csv.some((l) => l.includes(';clients;') && l.includes(`${base}/appli1/clients`)),
    'URL dans le CSV',
  );
  await report.click('#exFormat [data-format="xlsx"]');
  await report.uncheck('#exFullUrl');
  await report.uncheck('#exUrlEnd');
  await report.click('#matrix .name >> nth=0');
  await report.waitForSelector('#detail[open] .dlg-body table');
  await report.click('#detail [data-close]');

  // Unité : secondes par défaut, millisecondes au choix (réglage partagé avec le panneau et les exports)
  const ethClients = '#matrix td[data-redo-page="Clients"][data-redo-net="ethernet"]';
  assert.match((await report.textContent(`${ethClients} >> nth=0`)).trim(), /^\d+,\d\d$/, 'secondes par défaut');
  await report.click('#units [data-unit="ms"]');
  await report.waitForFunction(
    (sel) => /^[\d\u202f]+$/.test(document.querySelector(sel).textContent.trim()),
    ethClients,
  );
  await waitStored(async () => (await chrome.storage.local.get('settings')).settings.unit, 'ms', 'unité enregistrée');
  await report.click('#units [data-unit="s"]');
  await report.waitForFunction((sel) => /,\d\d$/.test(document.querySelector(sel).textContent.trim()), ethClients);

  // Modifier une ligne (menu ⋯) : client, SID et version ; les mesures suivent
  await report.click('[data-line-menu] >> nth=0'); // Appli 1 · PRD · 5.3
  await report.click('#menu button:has-text("Modifier")');
  await report.waitForSelector('#edit[open]');
  assert.equal(await report.inputValue('#editClient'), 'Appli 1');
  assert.equal(await report.inputValue('#editSid'), 'PRD');
  await report.fill('#editSid', 'PROD');
  await report.fill('#editVersion', '5.3.1');
  assert.match(await report.textContent('#editNote'), /Les 4 mesure\(s\) de cette ligne seront mises à jour/);
  await report.screenshot({ path: join(out, 'dashboard-modifier.png') });
  await report.click('#editSave');
  await report.waitForFunction(() => !document.querySelector('#edit').open);
  await report.waitForFunction(() => document.querySelector('#matrix .sub').textContent === 'SID PROD · v. 5.3.1');
  const edited = (await measures()).filter((x) => x.app === 'Appli 1');
  assert.ok(edited.length === 4 && edited.every((x) => x.sid === 'PROD' && x.version === '5.3.1'), 'mesures modifiées');
  console.log('  Ligne modifiée : Appli 1 · PROD · 5.3.1 (4 mesures)');

  // Double-clic sur une case sans mesure : « Mesurer cette page ? » depuis la page de départ connue
  await report.dblclick('#matrix td[data-redo-page="Fiche client"][data-redo-net="wifi"] >> nth=0');
  await report.waitForSelector('#redo[open]');
  assert.equal(await report.textContent('#redoTitle'), 'Mesurer cette page ?');
  assert.equal(await report.textContent('#redoUrl'), `${base}/appli1/clients`);
  assert.ok(await report.isHidden('#redoReplaceBox'), 'rien à remplacer');
  await report.keyboard.press('Escape');
  await report.waitForFunction(() => !document.querySelector('#redo').open);

  // Double-clic sur une valeur : relancer la mesure dans un nouvel onglet ouvert sur la page de départ,
  // l'ancienne mesure est remplacée quand la nouvelle est enregistrée
  const oldCell = (await measures()).filter(
    (x) => x.app === 'Appli 1' && x.page === 'Clients' && x.network === 'ethernet',
  );
  assert.equal(oldCell.length, 1);
  const total = (await measures()).length;
  await report.dblclick(`${ethClients} >> nth=0`);
  await report.waitForSelector('#redo[open]');
  assert.equal(await report.textContent('#redoTitle'), 'Relancer cette mesure ?');
  assert.match(await report.textContent('#redoWhat'), /Appli 1 · PROD · 5\.3\.1 › Clients · Ethernet/);
  assert.equal(await report.textContent('#redoUrl'), `${base}/appli1/`);
  assert.ok(await report.isChecked('#redoReplace'), 'remplacement proposé par défaut');
  await report.screenshot({ path: join(out, 'dashboard-relancer.png') });
  const known = new Set(context.pages());
  await report.click('#redoGo');
  const armed = await waitSession(
    (s) => s && s.state === 'armed' && s.page === 'Clients' && s.network === 'ethernet' && s.tabId !== tabId,
    'relance armée depuis le tableau de bord',
  );
  assert.deepEqual([armed.app, armed.sid, armed.version], ['Appli 1', 'PROD', '5.3.1']);
  let redoPage;
  for (let i = 0; i < 50 && !redoPage; i++, await sleep(100)) {
    redoPage = context.pages().find((p) => !known.has(p) && p.url() === `${base}/appli1/`);
  }
  assert.ok(redoPage, 'page de départ ouverte dans un nouvel onglet');
  await redoPage.waitForSelector('#nav-clients');
  await redoPage.click('#nav-clients');
  let newCell = [];
  for (let end = Date.now() + 15000; ; await sleep(200)) {
    newCell = (await measures()).filter((x) => x.app === 'Appli 1' && x.page === 'Clients' && x.network === 'ethernet');
    if (newCell.length === 1 && newCell[0].id !== oldCell[0].id) break;
    if (Date.now() > end) throw new Error('relance : nouvelle mesure attendue à la place de l’ancienne');
  }
  check(
    newCell[0],
    { sid: 'PROD', version: '5.3.1', trigger: 'click', startUrl: `${base}/appli1/` },
    800,
    3000,
    'Ethernet · Clients (relance, tableau de bord)',
  );
  assert.equal((await measures()).length, total, 'ancienne mesure remplacée');
  await redoPage.close();
  await report.bringToFront();
  // Supprimer une page (menu ⋯ de l'en-tête) puis un client (menu ⋯ de la ligne)
  const before = (await measures()).length;
  await report.click('[data-page-menu="Factures"]');
  await report.click('#menu button:has-text("Supprimer la page")');
  await waitCount(before - 1);
  await report.waitForFunction(() => !document.querySelector('[data-page-menu="Factures"]'));
  await report.click('[data-line-menu] >> nth=1'); // Appli 2
  await report.click('#menu button:has-text("Supprimer le client")');
  await waitCount(before - 2);
  const left = await measures();
  assert.ok(!left.some((x) => x.app === 'Appli 2' || x.page === 'Factures'), 'page et client supprimés');
  console.log(`  Suppressions : page « Factures » et client « Appli 2 » (${left.length} mesures restantes)`);

  // 10. Réglages : import en masse (noms seuls acceptés), pages, renommage qui suit les mesures
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 900 });
  await options.goto(`chrome-extension://${extId}/options/options.html`);
  await options.waitForSelector('#appRows tr');
  await options.click('#bulkBtn');
  await options.fill('#bulkText', 'Nom\nAppli 3\nAppli 4\thttps://appli4.exemple.fr/\nAppli 5;pas-une-url ftp://x');
  const preview = await options.textContent('#bulkPreview');
  console.log('  Import en masse :', preview);
  assert.match(preview, /2 client\(s\) reconnu\(s\) : 2 nouveau\(x\), 0 existant\(s\)/);
  await options.click('#bulkGo');
  await options.waitForFunction(() => document.querySelectorAll('#appRows tr').length === 3);
  await options.click('#addPages');
  await options.fill('#addPagesText', 'Accueil\nClients\nTableau de bord');
  await options.click('#addPagesGo');
  await options.waitForFunction(() => document.querySelectorAll('#pageRows tr').length === 4);
  // Renommer « Fiche client » en « Fiche Client » puis « Détail client » : les mesures suivent
  const ficheInput = options.locator('#pageRows input[aria-label="Nom de la page Fiche client"]');
  await ficheInput.fill('Détail client');
  await ficheInput.press('Tab');
  // waitForFunction ne sait pas attendre une fonction async (une promesse est « vraie ») : attente côté Node
  const renamed = () =>
    storage(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all).some((k) => k.startsWith('m_') && all[k].page === 'Détail client');
    });
  for (let end = Date.now() + 10000; !(await renamed()); await sleep(100)) {
    if (Date.now() > end) throw new Error('mesures de la page renommée attendues');
  }
  const pagesNow = await storage(async () => (await chrome.storage.local.get('pages')).pages.map((p) => p.name));
  assert.ok(pagesNow.includes('Détail client') && !pagesNow.includes('Fiche client'), 'page renommée');
  console.log('  Référentiel :', JSON.stringify(pagesNow));

  // 11. Accueil « Quels outils ? » puis Capsule : sauvegarde des onglets ouverts, réouverture, suppression
  const tools = await context.newPage();
  await tools.setViewportSize({ width: 380, height: 640 });
  // Raccourci clavier avec un formulaire incomplet : Insight direct
  await storage(() => chrome.storage.session.set({ panelTool: { tool: 'insight', at: Date.now() } }));
  await tools.goto(`chrome-extension://${extId}/panel/home.html`);
  await tools.waitForURL(/\/panel\/panel\.html$/);
  for (let i = 0; i < 50 && (await storage(() => chrome.storage.session.get('panelTool'))).panelTool; i++)
    await sleep(100);
  assert.ok(
    !(await storage(() => chrome.storage.session.get('panelTool'))).panelTool,
    'demande du raccourci satisfaite',
  );
  await tools.click('.back');
  await tools.waitForURL(/\/panel\/home\.html\?choose$/);
  assert.deepEqual(await tools.locator('.tool strong').allTextContents(), [
    'Capsule',
    'Insight',
    'Training',
    'Prisme',
    'CRA',
  ]);
  assert.equal(
    await tools.evaluate(() => document.body.firstElementChild.textContent.trim()),
    'Quels outils ?',
    'rien au-dessus de « Quels outils ? »',
  );
  await tools.waitForFunction(() => document.querySelector('#insightCount').textContent !== '');
  const insightCount = await tools.textContent('#insightCount');
  assert.match(insightCount, /^\d+ clients? et \d+ pages? sauvegardés$/, 'clients et pages d’Insight');
  console.log(`  Accueil : Insight « ${insightCount} »`);
  await tools.click('#toolCapsule');
  await tools.waitForSelector('#saveOpen');
  assert.equal(await tools.getAttribute('#saved', 'open'), null, 'sessions repliées au départ');
  // Une autre fenêtre Chrome : ses onglets ne font pas partie de la sauvegarde
  const otherUrl = `${base}/appli1/autre-fenetre`;
  const otherWin = await storage((url) => chrome.windows.create({ url, focused: false }).then((w) => w.id), otherUrl);
  for (let i = 0; i < 50 && !context.pages().some((p) => p.url() === otherUrl); i++) await sleep(100);
  assert.ok(
    context.pages().some((p) => p.url() === otherUrl),
    'autre fenêtre ouverte',
  );
  const webUrls = context
    .pages()
    .map((p) => p.url())
    .filter((u) => u.startsWith('http') && u !== otherUrl);
  await tools.click('#saveOpen');
  assert.equal(
    await tools.textContent('#saveWhat'),
    `Onglets de cette fenêtre à enregistrer : ${webUrls.length} onglets.`,
  );
  await tools.click('#saveGo');
  assert.match(await tools.textContent('#saveError'), /titre/, 'titre obligatoire');
  await tools.fill('#saveTitle', 'Recette Appli 1');
  await tools.fill('#saveClient', 'appli  1'); // rattaché au client « Appli 1 » d'Insight
  await tools.fill('#saveComment', 'Reprendre les mesures Ethernet');
  await tools.click('#saveGo');
  await tools.waitForSelector('#saveForm', { state: 'hidden' });
  const caps = await storage(async () => (await chrome.storage.local.get('capsules')).capsules);
  assert.equal(caps.length, 1);
  assert.equal(caps[0].title, 'Recette Appli 1');
  assert.equal(caps[0].client, 'Appli 1', 'client associé');
  assert.equal(caps[0].comment, 'Reprendre les mesures Ethernet');
  assert.deepEqual(caps[0].tabs.map((t) => t.url).sort(), [...webUrls].sort(), 'onglets de cette fenêtre seulement');
  assert.equal(caps[0].spans.length, 1, 'ouverte dans cette fenêtre (temps d’ouverture dans CRA)');
  assert.ok(caps[0].spans[0].wins.length === 1 && !caps[0].spans[0].to);
  await storage((id) => chrome.windows.remove(id), otherWin);
  await tools.waitForFunction(() => document.querySelector('#savedCount').textContent === '(1)');
  await tools.click('#saved > summary');
  await tools.click('.capsule .cap-title');
  await tools.waitForSelector('.cap-links li');
  assert.equal(await tools.textContent('.cap-client'), 'Appli 1');
  await tools.screenshot({ path: join(out, 'capsule.png') });
  const pagesBefore = context.pages().length;
  await tools.click('.cap-actions [data-open]');
  for (let i = 0; i < 100; i++) {
    if (webUrls.every((u) => context.pages().filter((p) => p.url() === u).length === 2)) break;
    await sleep(100);
  }
  const reopened = context.pages().slice(pagesBefore);
  assert.deepEqual(reopened.map((p) => p.url()).sort(), [...webUrls].sort(), 'onglets rouverts');
  const reopenedCap = (await storage(async () => (await chrome.storage.local.get('capsules')).capsules))[0];
  assert.equal(reopenedCap.opens.length, 1, 'réouverture notée (capsules du jour dans CRA)');
  for (const p of reopened) await p.close();
  const spansOf = async () =>
    (await storage(async () => (await chrome.storage.local.get('capsules')).capsules))[0].spans;
  for (let i = 0; i < 50 && !(await spansOf())[1]?.to; i++) await sleep(100);
  const spans = await spansOf();
  assert.equal(spans.length, 2, 'sauvegarde puis réouverture');
  assert.ok(!spans[0].to, 'fenêtre de la sauvegarde toujours ouverte');
  assert.ok(spans[1].to >= spans[1].from && !spans[1].wins, 'fenêtre rouverte fermée : fin de la période');
  console.log(`  Capsule : ${webUrls.length} onglets sauvegardés puis rouverts, fenêtre refermée`);
  tools.once('dialog', (d) => d.accept());
  await tools.click('.cap-actions .danger');
  await tools.waitForSelector('#savedEmpty:not([hidden])');
  // Session cochée (plus active) : barrée ; filtre Toutes / Actives / Inactives ; ordre par glisser-déposer
  await storage(
    (tabs) =>
      chrome.storage.local.set({
        capsules: ['Recette A', 'Recette B', 'Recette C'].map((title, i) => ({
          id: `cap${i}`,
          ts: 3 - i,
          title,
          client: '',
          comment: '',
          tabs,
        })),
      }),
    [{ url: `${base}/appli1/a`, title: 'A', win: 0, pinned: false }],
  );
  await tools.waitForFunction(() => document.querySelector('#savedCount').textContent === '(3)');
  const capTitles = () => tools.locator('.cap-item .cap-title').allTextContents();
  const storedCaps = () => storage(async () => (await chrome.storage.local.get('capsules')).capsules);
  const capIds = async () => (await storedCaps()).map((c) => c.id);
  assert.deepEqual(await capTitles(), ['Recette A', 'Recette B', 'Recette C']);
  await tools.check('.cap-item[data-id="cap1"] .cap-done');
  await tools.waitForSelector('.cap-item.done[data-id="cap1"]');
  assert.equal(await tools.getAttribute('[data-id="cap1"] .capsule', 'open'), null, 'cocher ne déplie pas la session');
  assert.equal(
    await tools.$eval('.cap-item.done .cap-title', (e) => getComputedStyle(e).textDecorationLine),
    'line-through',
  );
  assert.deepEqual(
    await capTitles(),
    ['Recette A', 'Recette C', 'Recette B'],
    'rangée sous la dernière session active',
  );
  assert.deepEqual(
    (await storedCaps()).map((c) => [c.id, !!c.done]),
    [
      ['cap0', false],
      ['cap2', false],
      ['cap1', true],
    ],
    'case et ordre enregistrés',
  );
  assert.deepEqual(await tools.locator('#capFilter button').allTextContents(), [
    'Toutes (3)',
    'Actives (2)',
    'Inactives (1)',
  ]);
  await tools.click('#capFilter [data-filter="inactive"]');
  assert.deepEqual(await capTitles(), ['Recette B']);
  await tools.click('#capFilter [data-filter="active"]');
  assert.deepEqual(await capTitles(), ['Recette A', 'Recette C']);
  await tools.click('#capFilter [data-filter="all"]');
  // Recherche : tous les mots, sans majuscules ; aucune session trouvée
  await tools.fill('#capSearch', 'RECETTE  b');
  assert.deepEqual(await capTitles(), ['Recette B']);
  await tools.fill('#capSearch', 'zzz');
  assert.deepEqual(await capTitles(), []);
  assert.equal(await tools.textContent('#filterEmpty'), 'Aucune session ne correspond à « zzz ».');
  await tools.fill('#capSearch', '');
  assert.deepEqual(await capTitles(), ['Recette A', 'Recette C', 'Recette B']);
  // Recette C glissée au-dessus de Recette A, puis Recette A en dessous de Recette B
  const capHeight = async (id) => (await tools.locator(`.cap-item[data-id="${id}"]`).boundingBox()).height;
  await tools.dragAndDrop('[data-id="cap2"] .cap-title', '.cap-item[data-id="cap0"]', {
    targetPosition: { x: 60, y: 4 },
  });
  assert.deepEqual(await capTitles(), ['Recette C', 'Recette A', 'Recette B']);
  await tools.dragAndDrop('[data-id="cap0"] .cap-title', '.cap-item[data-id="cap1"]', {
    targetPosition: { x: 60, y: (await capHeight('cap1')) - 4 },
  });
  assert.deepEqual(await capTitles(), ['Recette C', 'Recette B', 'Recette A']);
  for (let i = 0; i < 50 && (await capIds()).join() !== 'cap2,cap1,cap0'; i++) await sleep(100);
  assert.deepEqual(await capIds(), ['cap2', 'cap1', 'cap0'], 'ordre enregistré');
  await tools.reload();
  await tools.click('#saved > summary');
  assert.deepEqual(await capTitles(), ['Recette C', 'Recette B', 'Recette A'], 'ordre gardé à la réouverture');
  assert.equal(await tools.isChecked('[data-id="cap1"] .cap-done'), true);
  await tools.screenshot({ path: join(out, 'capsule-liste.png') });
  console.log('  Capsule : session cochée, barrée et rangée sous les actives, recherche, filtre, glisser-déposer');
  // Pages d'une session : ajoutées (adresse saisie, onglet affiché) puis retirée
  const pagesOf = async (id) => (await storedCaps()).find((c) => c.id === id).tabs.map((t) => t.url);
  const waitPages = async (id, n) => {
    for (let i = 0; i < 50 && (await pagesOf(id)).length !== n; i++) await sleep(100);
  };
  const toastIs = (re) =>
    tools.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
  const addInput = '[data-id="cap0"] .cap-add input';
  await tools.click('[data-id="cap0"] .cap-title');
  await tools.fill(addInput, 'chrome://settings');
  await tools.press(addInput, 'Enter');
  await toastIs(/^Adresse non valide/);
  await tools.fill(addInput, `${base}/appli1/b`);
  await tools.click('[data-id="cap0"] .cap-add [type="submit"]');
  await waitPages('cap0', 2);
  assert.deepEqual(await pagesOf('cap0'), [`${base}/appli1/a`, `${base}/appli1/b`], 'adresse ajoutée');
  await tools.waitForSelector('[data-id="cap0"] .cap-links li >> nth=1');
  assert.notEqual(await tools.getAttribute('[data-id="cap0"] .capsule', 'open'), null, 'session toujours dépliée');
  assert.equal(await tools.inputValue(addInput), '', 'champ vidé');
  await tools.fill(addInput, `${base}/appli1/b`);
  await tools.press(addInput, 'Enter');
  await toastIs(/déjà dans la session/);
  // Onglet affiché dans la fenêtre du panneau
  const shownUrl = `${base}/appli1/c`;
  const shownTab = await tools.evaluate((url) => chrome.tabs.create({ url, active: true }).then((t) => t.id), shownUrl);
  await tools.click('[data-id="cap0"] [data-add-current]');
  await waitPages('cap0', 3);
  await tools.evaluate((id) => chrome.tabs.remove(id), shownTab);
  assert.deepEqual(await pagesOf('cap0'), [`${base}/appli1/a`, `${base}/appli1/b`, shownUrl], 'onglet affiché ajouté');
  await tools.click('[data-id="cap0"] .cap-links li >> nth=0 >> .cap-remove');
  await waitPages('cap0', 2);
  assert.deepEqual(await pagesOf('cap0'), [`${base}/appli1/b`, shownUrl], 'page retirée');
  await tools.waitForFunction(() => document.querySelectorAll('[data-id="cap0"] .cap-links li').length === 2);
  await tools.screenshot({ path: join(out, 'capsule-pages.png') });
  console.log('  Capsule : pages ajoutées (adresse, onglet affiché) et retirée');
  // Titre modifié sur place : Échap annule, Entrée ou clic ailleurs enregistre
  const titleInput = '[data-id="cap0"] .cap-title-input';
  const titleOf = async (id) => (await storedCaps()).find((c) => c.id === id).title;
  await tools.click('[data-id="cap0"] [data-rename]');
  await tools.fill(titleInput, 'Abandonné');
  await tools.screenshot({ path: join(out, 'capsule-titre.png') });
  await tools.press(titleInput, 'Escape');
  await tools.waitForSelector('[data-id="cap0"] .cap-title');
  assert.equal(await tools.textContent('[data-id="cap0"] .cap-title'), 'Recette A', 'Échap : titre inchangé');
  await tools.click('[data-id="cap0"] [data-rename]');
  await tools.keyboard.press('End');
  await tools.keyboard.type('  bis '); // espaces tapés dans le résumé : la session ne se replie pas
  await tools.keyboard.press('Enter');
  for (let i = 0; i < 50 && (await titleOf('cap0')) !== 'Recette A bis'; i++) await sleep(100);
  assert.equal(await titleOf('cap0'), 'Recette A bis', 'titre enregistré, espaces nettoyés');
  await tools.waitForFunction(
    () => document.querySelector('[data-id="cap0"] .cap-title')?.textContent === 'Recette A bis',
  );
  assert.notEqual(await tools.getAttribute('[data-id="cap0"] .capsule', 'open'), null, 'session toujours dépliée');
  await tools.click('[data-id="cap0"] [data-rename]');
  await tools.fill(titleInput, 'Recette A ter');
  await tools.click('.tagline');
  for (let i = 0; i < 50 && (await titleOf('cap0')) !== 'Recette A ter'; i++) await sleep(100);
  assert.equal(await titleOf('cap0'), 'Recette A ter', 'clic ailleurs : titre enregistré');
  console.log('  Capsule : titre modifié sur place');

  // 12. Prisme : CSV refusé, fichier propre, exemple avec erreurs, export, tableau de bord
  await tools.setViewportSize({ width: 380, height: 1000 });
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);
  await tools.click('#toolPrisme');
  await tools.waitForSelector('#drop');
  assert.ok(await tools.isHidden('#result'), 'aucun fichier au départ');
  await tools.setInputFiles('#fileInput', {
    name: 'classeur.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]),
  });
  await tools.waitForSelector('#dropError:not([hidden])');
  assert.match(await tools.textContent('#dropError'), /n'est pas un fichier CSV : c'est un classeur Excel/);
  const salaries =
    'Matricule;Nom;Prénom;Salaire\r\nE1;MARTIN;Zoé;27410,00\r\nE2;PETIT;Hélène;31200,50\r\nE3;DURAND;Noël;29800,00\r\n';
  await tools.setInputFiles('#fileInput', {
    name: 'salaries.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(salaries, 'latin1'),
  });
  await tools.waitForSelector('#result:not([hidden])');
  assert.ok(await tools.isHidden('#dropError'));
  assert.equal(await tools.getAttribute('#resVerdict', 'class'), 'v-verdict ok');
  assert.match(await tools.textContent('#resVerdict'), /Aucune erreur ni alerte/);
  assert.match(await tools.textContent('#resFacts'), /ANSI \(Windows-1252\).*point-virgule.*CRLF/);
  await tools.click('#demo');
  await tools.waitForFunction(() => document.querySelector('#resName').textContent === 'exemple_avec_erreurs.csv');
  assert.equal(await tools.getAttribute('#resVerdict', 'class'), 'v-verdict error');
  assert.match(await tools.textContent('#resVerdict'), /7 erreurs · 15 alertes/);
  assert.equal(await tools.locator('#resIssues .v-issue').count(), 5);
  // Encodage attendu partagé avec le tableau de bord
  await tools.click('[data-expected="utf8"]');
  await tools.waitForFunction(() => document.querySelector('[data-expected="utf8"]').ariaChecked === 'true');
  await waitStored(
    async () => (await chrome.storage.local.get('prismeSettings')).prismeSettings?.expected,
    'utf8',
    'encodage attendu enregistré',
  );
  await tools.click('[data-expected="ansi"]');
  // Export ANSI, fins de ligne Windows
  const [exp] = await Promise.all([tools.waitForEvent('download'), tools.click('#expAnsi')]);
  assert.equal(exp.suggestedFilename(), 'exemple_avec_erreurs_ANSI.csv');
  await exp.saveAs(join(out, 'prisme-export-ansi.csv'));
  const exported = readFileSync(join(out, 'prisme-export-ansi.csv'));
  assert.ok(exported.toString('latin1').startsWith('Code;Libellé;'), 'export en ANSI');
  assert.ok(!/[^\r]\n/.test(exported.toString('latin1')), 'fins de ligne CRLF');
  console.log(`  Prisme : export ${exp.suggestedFilename()} (${exported.length} octets)`);
  await tools.click('#recent > summary');
  assert.equal(await tools.textContent('#recentCount'), '(2)');
  await tools.waitForFunction(() => !document.querySelector('#toast').classList.contains('show'));
  await sleep(300);
  await tools.screenshot({ path: join(out, 'prisme.png'), fullPage: true });

  // Tableau de bord : résumé, anomalies, inspecteur de cellule, 4 vues
  const [dash] = await Promise.all([context.waitForEvent('page'), tools.click('#dash')]);
  await dash.setViewportSize({ width: 1360, height: 900 });
  await dash.waitForSelector('#cards .card >> nth=6');
  assert.match(dash.url(), /\/prisme\/prisme\.html\?id=/);
  assert.equal(await dash.title(), 'exemple_avec_erreurs.csv · Prisme');
  assert.equal(await dash.getAttribute('#issuesBox', 'open'), null, 'anomalies repliées au départ');
  await dash.screenshot({ path: join(out, 'prisme-dashboard.png') });
  await dash.click('#issuesSummary');
  await dash.click('.issue[data-code="mojibake"] .loc >> nth=0');
  await dash.waitForSelector('#insp.open');
  assert.match(await dash.textContent('#inspTitle'), /^Ligne \d+ · /);
  assert.match(await dash.textContent('#inspBody'), /Caractères/);
  await sleep(400);
  await dash.screenshot({ path: join(out, 'prisme-inspecteur.png') });
  await dash.keyboard.press('Escape');
  await sleep(400);
  await dash.click('[data-view="excel"]');
  await dash.waitForSelector('#xlWrap .xlgrid');
  assert.match(await dash.textContent('#viewHelp'), /Simulation d'un double-clic/);
  await dash.click('#xlWrap td[data-xr="1"][data-xc="2"]');
  assert.equal(await dash.textContent('#xlName'), 'C2');
  assert.equal(await dash.textContent('#xlFormula'), '12,5');
  await dash.screenshot({ path: join(out, 'prisme-excel.png') });
  await dash.click('[data-view="raw"]');
  await dash.waitForSelector('#rawWrap table.rawdata');
  await dash.click('[data-view="text"]');
  assert.match(await dash.textContent('#txtWrap .txt-body'), /^Code;Libellé;Montant/);
  await dash.click('[data-view="details"]');
  await dash.selectOption('#selDelim', ',');
  await dash.waitForFunction(() => /virgule/.test(document.querySelector('#cards').textContent));
  await dash.selectOption('#selDelim', 'auto');
  // Une anomalie cliquée dans le panneau : le même onglet du tableau de bord s'ouvre dessus
  const pagesBeforeIssue = context.pages().length;
  await tools.click('#resIssues .v-issue >> nth=0');
  await dash.waitForURL(/[?&]issue=/);
  await dash.waitForSelector('#issuesBox[open] .issue.flash');
  assert.equal(context.pages().length, pagesBeforeIssue, 'onglet du tableau de bord réutilisé');
  await sleep(1800);
  await dash.emulateMedia({ colorScheme: 'dark' });
  await dash.screenshot({ path: join(out, 'prisme-dashboard-sombre.png') });
  await dash.close();
  console.log('  Prisme : panneau, tableau de bord et onglet réutilisé');
  // Accueil : compteurs sous chaque outil
  await tools.setViewportSize({ width: 380, height: 640 });
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);
  await tools.waitForFunction(() => document.querySelector('#prismeCount').textContent === '2 fichiers récents');
  await tools.mouse.move(370, 630);
  await tools.screenshot({ path: join(out, 'panel-outils.png') });
  // Retrait d'un fichier récent
  await tools.click('#toolPrisme');
  await tools.waitForSelector('#result:not([hidden])');
  await tools.click('#recent > summary');
  tools.once('dialog', (d) => d.accept());
  await tools.click('.pfile >> nth=1 >> .pf-del');
  await tools.waitForFunction(() => document.querySelector('#recentCount').textContent === '(1)');

  // 13. Training : modules, page de formation, progression enregistrée dans l'extension
  const rhModule = moduleById('rh');
  await tools.setViewportSize({ width: 380, height: 900 });
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);
  await tools.click('#toolTraining');
  await tools.waitForSelector('.t-module');
  assert.deepEqual(await tools.locator('.t-module .t-text strong').allTextContents(), ['Métier RH', 'OLAP', 'APEX']);
  assert.equal(await tools.textContent('#overallText'), '0 / 120 exercices · 0 %');
  const [course] = await Promise.all([context.waitForEvent('page'), tools.click('.t-module.rh .t-resume')]);
  await course.setViewportSize({ width: 1360, height: 900 });
  await course.waitForSelector('html[data-ready="1"]');
  assert.match(course.url(), /\/training\/training\.html\?m=rh$/);
  assert.equal(await course.title(), 'Le métier RH et ses indicateurs · Training');
  assert.equal(await course.locator('section.notion[data-notion]').count(), 8, '8 notions');
  assert.equal(await course.locator('.exo').count(), 50, '40 exercices + 10 questions d’examen');
  await course.screenshot({ path: join(out, 'training-rh.png') });
  // QCM juste puis QCM faux (options mélangées : la valeur garde l'index d'origine)
  const [ex1, ex2] = rhModule.notions[0].exercises;
  await course.check(`#rh-1-e1-o${ex1.answer}`);
  await course.click('[data-exo="rh-1-e1"] [data-act="check"]');
  await course.waitForSelector('[data-exo="rh-1-e1"].is-ok');
  const wrong = (ex2.answer + 1) % ex2.options.length;
  await course.check(`#rh-1-e2-o${wrong}`);
  await course.click('[data-exo="rh-1-e2"] [data-act="check"]');
  await course.waitForSelector('[data-exo="rh-1-e2"].is-bad');
  assert.match(await course.textContent('[data-exo="rh-1-e2"] .feedback'), /La bonne réponse est/);
  // Question ouverte : réponse saisie, correction, auto-évaluation
  await course.fill('#ta-rh-1-e4', 'DPAE, contrat, DSN, solde de tout compte');
  await course.click('[data-exo="rh-1-e4"] [data-act="show"]');
  await course.click('[data-exo="rh-1-e4"] [data-self="ok"]');
  assert.equal(await course.textContent('[data-tally="rh-1"]'), 'QCM 1/3 justes · 3/5 faits');
  assert.equal(await course.textContent('#progressText'), '3 / 40');
  const training = () => storage(async () => (await chrome.storage.local.get('training')).training);
  let saved = await training();
  assert.deepEqual(saved.qcm['rh-1-e1'], { pick: ex1.answer }, 'QCM enregistré');
  assert.equal(saved.qcm['rh-1-e2'].pick, wrong);
  assert.deepEqual(saved.open['rh-1-e4'], {
    text: 'DPAE, contrat, DSN, solde de tout compte',
    shown: true,
    self: 'ok',
  });
  // Rechargement : tout est restauré
  await course.reload();
  await course.waitForSelector('html[data-ready="1"]');
  await course.waitForSelector('[data-exo="rh-1-e1"].is-ok');
  await course.waitForSelector('[data-exo="rh-1-e2"].is-bad');
  assert.equal(await course.inputValue('#ta-rh-1-e4'), 'DPAE, contrat, DSN, solde de tout compte');
  // Panneau mis à jour en direct, puis « Reprendre » sur la dernière notion lue
  await tools.waitForFunction(() => document.querySelector('#overallText').textContent === '3 / 120 exercices · 3 %');
  assert.match(await tools.textContent('.t-module.rh .t-count'), /^3\/40 exercices · 8 %$/);
  await course.evaluate(() => document.getElementById('rh-3').scrollIntoView({ behavior: 'instant' }));
  await tools.waitForFunction(
    () => /^Reprendre : 3\. Effectifs/.test(document.querySelector('.t-module.rh .t-resume').textContent),
    null,
    { timeout: 10000 },
  );
  assert.equal((await training()).last.anchor, 'rh-3');
  // Un autre module s'ouvre dans le même onglet
  const pagesBeforeOlap = context.pages().length;
  await tools.click('.t-module.olap .t-resume');
  await course.waitForURL(/\?m=olap$/);
  await course.waitForSelector('html[data-ready="1"]');
  assert.equal(context.pages().length, pagesBeforeOlap, 'onglet de formation réutilisé');
  assert.equal(await course.textContent('.modules [aria-current="page"]'), 'OLAP');
  await course.screenshot({ path: join(out, 'training-olap.png') });
  // Laboratoire du cube (notion 5) : drill-down de l'année au trimestre
  await course.evaluate(() =>
    document.getElementById('cube-lab').scrollIntoView({ behavior: 'instant', block: 'center' }),
  );
  await course.selectOption('#lab-level', 'Trimestre');
  assert.match(await course.textContent('#lab-log'), /Drill-down/);
  assert.equal(await course.locator('#lab-table thead th').count(), 10, 'Région, 8 trimestres, Total');
  // Script SQL du projet fil rouge, téléchargeable
  const [sqlFile] = await Promise.all([course.waitForEvent('download'), course.click('.download')]);
  assert.equal(sqlFile.suggestedFilename(), 'fil_rouge_ventes.sql');
  // Sauvegarde de la progression (JSON), réinitialisation d'un module, import par fusion
  const [backupFile] = await Promise.all([course.waitForEvent('download'), course.click('#exportBtn')]);
  assert.match(backupFile.suggestedFilename(), /^training-progression-\d{8}\.json$/);
  const backupPath = join(out, 'training-progression.json');
  await backupFile.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(backup.format, 'allshare-training');
  assert.deepEqual(backup.progress.qcm['rh-1-e1'], { pick: ex1.answer });
  await course.evaluate(() => document.getElementById('olap-1').scrollIntoView({ behavior: 'instant' }));
  await course.click('[data-exo="olap-1-e1"] [data-act="reveal"]');
  await course.waitForSelector('[data-exo="olap-1-e1"] .feedback:not([hidden])');
  await course.click('#resetBtn');
  await course.click('#resetYes');
  await course.waitForSelector('[data-exo="olap-1-e1"] .feedback[hidden]', { state: 'attached' });
  saved = await training();
  assert.ok(!('olap-1-e1' in saved.qcm), 'module OLAP réinitialisé');
  assert.ok('rh-1-e1' in saved.qcm, 'module RH conservé');
  await storage(() => chrome.storage.local.remove('training'));
  await course.setInputFiles('#importInput', backupPath);
  await course.waitForFunction(() => document.querySelector('#toast').textContent === 'Progression importée');
  assert.equal(Object.keys((await training()).qcm).length, 2, 'progression réimportée');
  await course.close();
  // Accueil : compteur sous Training
  await tools.setViewportSize({ width: 380, height: 640 });
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);
  await tools.waitForFunction(() => document.querySelector('#trainingCount').textContent === '3 exercices faits · 3 %');
  console.log('  Training : 3 exercices faits, progression enregistrée, rechargée, exportée et réimportée');

  // 14. CRA : capsules du jour, réglages, page de saisie du C.R.A (grille APEX simulée)
  const todayAt = (h, m) => new Date(new Date().setHours(h, m, 0, 0)).getTime();
  // Recette A ter : rouverte hier et ce matin, encore ouverte (fenêtre « live ») ; Recette C : 45 min ce matin
  const liveWin = await storage(() => chrome.windows.create({ url: 'about:blank', focused: false }).then((w) => w.id));
  await storage(
    async ({ a, b, y, liveWin }) => {
      const { capsules } = await chrome.storage.local.get('capsules');
      const opens = { cap0: [y, b], cap2: [a] };
      const spans = { cap0: [{ from: y, wins: [liveWin] }], cap2: [{ from: a, to: a + 45 * 60000 }] };
      await chrome.storage.local.set({
        capsules: capsules.map((c) => (opens[c.id] ? { ...c, opens: opens[c.id], spans: spans[c.id] } : c)),
      });
    },
    { a: todayAt(8, 30), b: todayAt(9, 5), y: todayAt(12, 0) - 86400000, liveWin },
  );
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);
  await tools.waitForFunction(
    () => document.querySelector('#craCount').textContent === "2 capsules ouvertes aujourd'hui",
  );
  await tools.click('#toolCra');
  await tools.waitForSelector('.cra-item');
  assert.deepEqual(
    await tools.locator('.cra-item strong').allTextContents(),
    ['Recette A ter', 'Recette C'],
    'ouverte depuis la veille : en tête',
  );
  const craTimes = () => tools.locator('.cra-times').allTextContents();
  const [liveTimes, closedTimes] = await craTimes();
  const OPEN = String.raw`ouverte (< 1 min|\d+ min|\d+ h \d\d)`;
  assert.match(
    liveTimes,
    new RegExp(String.raw`^09:05 · 2 onglets · ${OPEN} \(en cours\)$`),
    'temps d’ouverture en cours',
  );
  assert.equal(closedTimes, '08:30 · 1 onglet · ouverte 45 min');
  await storage((id) => chrome.windows.remove(id), liveWin);
  await tools.waitForFunction(() => !document.querySelector('.cra-open').textContent.includes('en cours'));
  assert.match((await craTimes())[0], new RegExp(String.raw`^09:05 · 2 onglets · ${OPEN}$`), 'fenêtre fermée');
  await tools.screenshot({ path: join(out, 'cra-capsules.png') });
  const yesterday = new Date(todayAt(12, 0) - 86400000);
  await tools.fill('#craDay', yesterday.toLocaleDateString('sv-SE')); // AAAA-MM-JJ
  await tools.waitForFunction(() => document.querySelectorAll('.cra-item').length === 1);
  assert.deepEqual(await tools.locator('.cra-item strong').allTextContents(), ['Recette A ter'], 'la veille');
  assert.match(
    (await craTimes())[0],
    new RegExp(String.raw`^\d\d:\d\d · 2 onglets · ${OPEN}$`),
    'la veille : jusqu’à minuit',
  );
  await tools.check('#autoSave');
  await tools.check('#autoHighlight');
  for (let i = 0; i < 50; i++) {
    const s = await storage(async () => (await chrome.storage.local.get('craSettings')).craSettings);
    if (s && s.autoSave && s.autoHighlight) break;
    await sleep(100);
  }
  await tools.screenshot({ path: join(out, 'cra.png') });
  // Page de saisie : étoile jaune décochée à l'arrivée, « Save » cliqué en quittant une ligne modifiée
  await context.route('https://dsb-cra.allshare-scenario.fr/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: craPage() }),
  );
  const cra = await context.newPage();
  await cra.goto('https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra?session=4242');
  await cra.waitForFunction(() => window.highlight === false, null, { timeout: 10000 });
  assert.deepEqual(
    await cra.evaluate(() => window.highlightChanges),
    [true],
    'étoile jaune décochée, réglages dépliés',
  );
  assert.equal(await cra.evaluate(() => document.querySelector('[data-setting="highlight"]').checked), false);
  await cra.waitForFunction(() => window.toggles === 2);
  assert.equal(
    await cra.evaluate(() => document.getElementById('CRA_GRID_ig_report_settings').className.includes('is-collapsed')),
    true,
    'réglages repliés de nouveau',
  );
  const saves = () => cra.evaluate(() => window.saves);
  await cra.click('#r1a');
  await cra.keyboard.type('Projet X');
  await cra.click('#r1b'); // même ligne, colonnes figées
  await cra.click('#lov'); // liste de valeurs : toujours sur la ligne
  await cra.click('#r1b');
  await sleep(900);
  assert.equal(await saves(), 0, 'ligne en cours : pas d’enregistrement');
  await cra.keyboard.type('2');
  await cra.click('#r2a'); // ligne suivante
  await cra.waitForFunction(() => window.saves === 1);
  await sleep(1200);
  await cra.click('#r1a'); // ligne non modifiée quittée
  await sleep(900);
  assert.equal(await saves(), 1, 'ligne non modifiée : rien');
  await cra.keyboard.type('x');
  await cra.click('#save'); // à la main : pas de second clic pendant l'enregistrement
  await sleep(1500);
  assert.equal(await saves(), 2, 'Save à la main, pas de doublon');
  await storage(() => chrome.storage.local.set({ craSettings: { autoSave: false, autoHighlight: true } }));
  await cra.click('#r1a');
  await cra.keyboard.type('y');
  await cra.click('#r2a');
  await sleep(900);
  assert.equal(await saves(), 2, 'réglage désactivé : plus de clic');
  await storage(() => chrome.storage.local.set({ craSettings: { autoSave: true, autoHighlight: true } }));
  await cra.goto('https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/autre-page?session=4242');
  await sleep(1000);
  assert.equal(
    await cra.evaluate(() => document.querySelector('[data-setting="highlight"]').checked),
    true,
    'autre page',
  );
  await cra.close();
  await context.unroute('https://dsb-cra.allshare-scenario.fr/**');
  // Clients allshare-scenario.fr du jour : un client (sous-domaine) ouvert dans deux onglets, compté une fois ;
  // la saisie du C.R.A (dsb-cra) n'est pas un client
  const generali = 'https://dsb-generali.allshare-scenario.fr';
  await context.route(`${generali}/**`, (route) => {
    const p = new URL(route.request().url()).searchParams.get('p') || '';
    const body = `<!doctype html><meta charset="utf-8"><title>Generali · page ${p.split(':')[1]}</title><p>Client</p>`;
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  const clientTabs = [await context.newPage(), await context.newPage()];
  await clientTabs[0].goto(`${generali}/apex/f?p=100:1:4242`);
  await clientTabs[1].goto(`${generali}/apex/f?p=100:2:4242`);
  await sleep(1500);
  for (const t of clientTabs) await t.close();
  await context.unroute(`${generali}/**`);
  const craPages = () => storage(async () => (await chrome.storage.local.get('craPages')).craPages);
  for (let i = 0; i < 50 && (await craPages())?.open.length !== 0; i++) await sleep(100);
  const sitePages = await craPages();
  assert.deepEqual(Object.keys(sitePages.pages), ['dsb-generali.allshare-scenario.fr'], 'un seul client, sans dsb-cra');
  const { ms } = sitePages.pages['dsb-generali.allshare-scenario.fr'];
  assert.ok(ms > 1000, `temps d'ouverture du client (${ms} ms)`);
  assert.equal(await tools.getAttribute('#sitePages', 'open'), null, 'repliée au départ');
  await tools.click('#sitePages > summary');
  assert.equal(await tools.textContent('#pagesTotal'), '(1)');
  assert.deepEqual(await tools.locator('#pagesList strong').allTextContents(), ['dsb-generali']);
  assert.match(await tools.textContent('#pagesList .cra-url'), /^Dernière page : Generali · page [12]$/);
  assert.deepEqual(await tools.locator('#pagesList .cra-open').allTextContents(), ['< 1 min']);
  await tools.screenshot({ path: join(out, 'cra-pages.png'), fullPage: true });
  console.log(
    '  CRA : capsules du jour et temps d’ouverture, étoile jaune décochée, ligne enregistrée, clients du jour',
  );
  await tools.goto(`chrome-extension://${extId}/panel/home.html?choose`);

  // 15. Mes données : export de toutes les données depuis l'accueil, extension vidée, réimport
  await tools.setViewportSize({ width: 380, height: 900 });
  await tools.evaluate(() => localStorage.setItem('training.theme', 'dark'));
  const kitBefore = await storage(() => chrome.storage.local.get(null));
  const kitFileId = kitBefore.prismeFiles[0].id;
  const [kitFile] = await Promise.all([tools.waitForEvent('download'), tools.click('#exportAll')]);
  assert.match(kitFile.suggestedFilename(), /^allshare-tools-kit-donnees-\d{8}-\d{4}\.json$/);
  const kitPath = join(out, 'allshare-tools-kit-donnees.json');
  await kitFile.saveAs(kitPath);
  const kit = JSON.parse(readFileSync(kitPath, 'utf8'));
  assert.equal(kit.format, 'allshare-tools-kit');
  assert.deepEqual(kit.storage, kitBefore, 'tout chrome.storage.local');
  assert.ok(kit.prismeContents[kitFileId], 'contenu du fichier récent de Prisme');
  assert.equal(kit.localStorage['training.theme'], 'dark');
  await tools.waitForFunction(() => document.querySelector('#dataStatus').textContent !== '');
  assert.match(
    await tools.textContent('#dataStatus'),
    /^Fichier téléchargé : \d+ mesures Insight, 3 sessions Capsule, 1 fichier Prisme, \d+ réponses Training et les réglages\.$/,
  );
  await tools.screenshot({ path: join(out, 'panel-donnees.png'), fullPage: true });
  // Extension supprimée puis réinstallée : plus aucune donnée
  await tools.evaluate(async (id) => (await import('../lib/prisme-files.js')).deleteFileBytes(id), kitFileId);
  await tools.evaluate(() => localStorage.clear());
  await storage(() => chrome.storage.local.clear());
  await tools.reload();
  await tools.waitForSelector('#importAll');
  await tools.setInputFiles('#importAllFile', {
    name: 'autre.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await tools.waitForFunction(() => document.querySelector('#dataStatus').classList.contains('error'));
  assert.equal(await tools.textContent('#dataStatus'), "Ce fichier n'est pas une sauvegarde Allshare Tools Kit.");
  await tools.setInputFiles('#importAllFile', kitPath);
  await tools.waitForFunction(() => /^Données importées : /.test(document.querySelector('#dataStatus').textContent));
  // Identifiants des clients et des pages recréés, listes vides absentes : sans importance
  // capsuleAlive (dernier relevé de Chrome) est propre au poste de la sauvegarde : jamais repris
  const comparable = (s) =>
    Object.fromEntries(
      Object.entries(s)
        .filter(([k, v]) => !(Array.isArray(v) && !v.length) && k !== 'capsuleAlive')
        .map(([k, v]) => [k, k === 'apps' || k === 'pages' ? v.map(({ id, ...rest }) => rest) : v]),
    );
  const kitAfter = await storage(() => chrome.storage.local.get(null));
  assert.deepEqual(comparable(kitAfter), comparable(kitBefore), 'données restaurées');
  const restoredBytes = await tools.evaluate(
    async (id) => [...(await (await import('../lib/prisme-files.js')).getFileBytes(id))],
    kitFileId,
  );
  assert.equal(
    Buffer.from(restoredBytes).toString('base64'),
    kit.prismeContents[kitFileId],
    'fichier Prisme rouvrable',
  );
  assert.equal(await tools.evaluate(() => localStorage.getItem('training.theme')), 'dark');
  await tools.waitForFunction(() => document.querySelector('#trainingCount').textContent === '3 exercices faits · 3 %');
  assert.equal(await tools.textContent('#prismeCount'), '1 fichier récent');
  // Le même fichier une seconde fois : rien n'est doublé
  await tools.setInputFiles('#importAllFile', kitPath);
  await tools.waitForFunction(() => /^Rien de nouveau/.test(document.querySelector('#dataStatus').textContent));
  assert.equal(Object.keys(await storage(() => chrome.storage.local.get(null))).length, Object.keys(kitAfter).length);
  console.log(`  Mes données : ${Object.keys(kit.storage).length} clés exportées, restaurées après effacement`);
  await tools.close();

  // 15. Démo à l'échelle : 150 clients × 20 pages (captures pour le README)
  const demo = await storage(async () => {
    const PAGES = [
      'Accueil',
      'Clients',
      'Fiche client',
      'Factures',
      'Facture',
      'Commandes',
      'Commande',
      'Produits',
      'Stocks',
      'Fournisseurs',
      'Reporting',
      'Ventes',
      'Tableau de bord',
      'Utilisateurs',
      'Paramètres',
      'Recherche',
      'Exports',
      'Planning',
      'Contrats',
      'Devis',
    ];
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    const items = {};
    let id = 0;
    const apps = [];
    for (let i = 1; i <= 150; i++) {
      const app = `Client ${String(i).padStart(3, '0')}`;
      apps.push({ id: `a${i}`, name: app, baseUrls: [] });
      const slow = rnd() < 0.08 ? 2.4 : 0.85 + rnd() * 0.45; // quelques clients anormalement lents
      PAGES.forEach((page, p) => {
        const base = 300 + ((p * 7919) % 20) * 170;
        for (const network of ['wifi', 'ethernet']) {
          if (rnd() > (network === 'wifi' ? 0.92 : 0.7)) continue;
          for (let k = 0, count = 1 + Math.floor(rnd() * 2); k < count; k++) {
            const spike = rnd() < 0.03 ? 2.2 : 1;
            const duration = Math.round(
              base * slow * spike * (network === 'wifi' ? 1.15 + rnd() * 0.3 : 1) * (0.92 + rnd() * 0.16),
            );
            const timeout = rnd() < 0.004;
            const m = {
              id: `d${++id}`,
              ts: Date.now() - Math.floor(rnd() * 5 * 864e5),
              app,
              sid: i % 4 === 0 ? 'REC' : 'PRD',
              version: i % 6 === 0 ? '5.4' : '5.3',
              page,
              specific: page === 'Planning' && i % 3 === 0,
              network,
              duration: timeout ? 120000 : duration,
              timeout,
              kind: 'load',
              trigger: 'click',
              url: `https://client${i}.exemple.fr/${p}`,
              startUrl: `https://client${i}.exemple.fr/`,
            };
            items['m_' + m.id] = m;
          }
        }
      });
    }
    await chrome.storage.local.set({
      apps,
      pages: PAGES.map((name, i) => ({ id: `p${i}`, name, hidden: false })),
      settings: { network: 'wifi', stat: 'median', reportView: 'both' },
      draft: { app: 'Client 042', sid: 'PRD', version: '5.4', page: 'Factures' },
      ...items,
    });
    return { apps: apps.length, measures: id };
  });
  console.log(`  Démo : ${demo.apps} clients, ${demo.measures} mesures`);
  const t0 = Date.now();
  await report.reload();
  await report.waitForSelector('#matrix tbody tr >> nth=149');
  console.log(`  Aperçu 150 × 20 affiché en ${Date.now() - t0} ms`);
  await report.screenshot({ path: join(out, 'dashboard.png') });
  await report.click('[data-page-menu="Factures"]');
  await report.screenshot({ path: join(out, 'dashboard-menu.png'), clip: { x: 0, y: 0, width: 1440, height: 520 } });
  await report.keyboard.press('Escape');
  await report.emulateMedia({ colorScheme: 'dark' });
  await report.click('[data-view="wifi"]');
  await report.check('#anomalies');
  await report.waitForFunction(() => !document.querySelector('#matrix thead tr.h2'));
  await report.screenshot({ path: join(out, 'dashboard-sombre.png') });
  await report.emulateMedia({ colorScheme: 'light' });
  await report.selectOption('#exType', 'all');
  await download('demo-tout.xlsx');
  await report.selectOption('#exType', 'page');
  await report.selectOption('#exPage', 'Factures');
  await download('demo-page.xlsx');
  await report.selectOption('#exType', 'client');
  await report.selectOption('#exClient', 'Client 042');
  await download('demo-client.xlsx');

  await panel.reload();
  await panel.waitForSelector('#viewForm:not([hidden])');
  await panel.screenshot({ path: join(out, 'panel-formulaire.png') });
  await options.reload();
  await options.waitForSelector('#appRows tr >> nth=149');
  await options.screenshot({ path: join(out, 'options.png') });

  console.log('\nOK : test de bout en bout réussi');
} catch (e) {
  failed = true;
  console.error('\nÉCHEC :', e);
} finally {
  await context.close();
  server.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
