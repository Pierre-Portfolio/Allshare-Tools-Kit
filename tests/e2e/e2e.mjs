// Test de bout en bout d'Allshare Tools Kit : charge l'extension dans Chromium (Playwright), sert deux
// applications de démonstration avec des délais connus, navigue, puis vérifie
// les mesures d'Insight, le rapport (cases rouges) et les exports, puis Capsule, Prisme et Training.
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
  await panel.fill('#sid', 'PRD');
  await panel.fill('#version', '5.3');
  // Liste des pages : menu par rubrique, champ texte masqué tant qu'on n'a pas choisi « Saisie libre »
  assert.equal(await panel.locator('#pagePick optgroup').count(), 7, 'rubriques du menu');
  assert.equal(await panel.locator('#pagePick option').count(), 48, '46 pages + choix vide + saisie libre');
  assert.deepEqual(
    (await panel.locator('#pagePick option').allTextContents()).slice(0, 3),
    ['— Choisir une page —', 'Dashboard', '✎ Saisie libre (autre page)…'],
    '« Dashboard » tout en haut',
  );
  assert.ok(await panel.isHidden('#page'), 'champ texte masqué');
  await panel.selectOption('#pagePick', 'Liste Mensuelle');
  assert.equal(await panel.inputValue('#page'), 'Liste Mensuelle', 'page reprise de la liste');
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
  // Détail : repères Navigation Timing + appel fetch /api/data (500 ms)
  const d = list[0].detail;
  assert.equal(d.kind, 'load');
  assert.ok(d.marks.responseStart - d.marks.requestStart >= 250, 'attente serveur ≥ délai serveur');
  const apiCall = d.requests.find((r) => r.url.includes('/api/data'));
  assert.ok(apiCall && apiCall.duration >= 480, `appel /api/data mesuré (${apiCall && apiCall.duration} ms)`);
  console.log(
    `  Détail : attente serveur ${d.marks.responseStart - d.marks.requestStart} ms, /api/data ${apiCall.duration} ms, fin ${d.marks.end} ms`,
  );
  await panel.waitForSelector('#viewResult:not([hidden])');
  assert.match(await panel.textContent('#resValue'), /ms/);
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
  await panel.selectOption('#pagePick', 'Turn-Over');
  await panel.click('#arm');
  await waitSession((s) => s && s.state === 'armed' && s.page === 'Turn-Over', 'armé (page du menu)');
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
  await panel2.selectOption('#pagePick', 'Clients'); // page déjà mesurée : groupe « Autres pages »
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
  await options.waitForFunction(async () => {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).some((k) => k.startsWith('m_') && all[k].page === 'Détail client');
  });
  const pagesNow = await storage(async () => (await chrome.storage.local.get('pages')).pages.map((p) => p.name));
  assert.ok(pagesNow.includes('Détail client') && !pagesNow.includes('Fiche client'), 'page renommée');
  console.log('  Référentiel :', JSON.stringify(pagesNow));

  // 11. Accueil « Quels outils ? » puis Capsule : sauvegarde des onglets ouverts, réouverture, suppression
  const tools = await context.newPage();
  await tools.setViewportSize({ width: 380, height: 640 });
  await storage(() => chrome.storage.session.set({ panelTool: 'insight' })); // raccourci clavier : Insight direct
  await tools.goto(`chrome-extension://${extId}/panel/home.html`);
  await tools.waitForURL(/\/panel\/panel\.html$/);
  await tools.click('.back');
  await tools.waitForURL(/\/panel\/home\.html\?choose$/);
  assert.deepEqual(await tools.locator('.tool strong').allTextContents(), ['Training', 'Capsule', 'Insight', 'Prisme']);
  assert.equal((await tools.textContent('.brandline')).trim(), 'Allshare Tools Kit');
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
  console.log(`  Capsule : ${webUrls.length} onglets sauvegardés puis rouverts`);
  for (const p of reopened) await p.close();
  tools.once('dialog', (d) => d.accept());
  await tools.click('.cap-actions .danger');
  await tools.waitForSelector('#savedEmpty:not([hidden])');

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
  assert.match(await tools.textContent('#resVerdict'), /10 erreurs · 15 alertes/);
  assert.equal(await tools.locator('#resIssues .v-issue').count(), 5);
  // Encodage attendu partagé avec le tableau de bord
  await tools.click('[data-expected="utf8"]');
  await tools.waitForFunction(() => document.querySelector('[data-expected="utf8"]').ariaChecked === 'true');
  assert.equal((await storage(() => chrome.storage.local.get('prismeSettings'))).prismeSettings.expected, 'utf8');
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
  await tools.close();

  // 14. Démo à l'échelle : 150 clients × 20 pages (captures pour le README)
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
