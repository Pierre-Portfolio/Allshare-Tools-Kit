// Test de bout en bout : charge l'extension dans Chromium (Playwright), sert deux
// applications de démonstration avec des délais connus, navigue, puis vérifie
// les mesures, le rapport (cases rouges) et l'export Excel.
//
//   npm install && npm run test:e2e
//
// Les captures et le fichier Excel produit sont écrits dans tests/e2e/out/.

import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdirSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

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
const userDataDir = mkdtempSync(join(tmpdir(), 'insigth-e2e-'));
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
  async function waitMeasures(count, timeout = 15000) {
    const end = Date.now() + timeout;
    for (;;) {
      const list = await measures();
      if (list.length >= count) return list;
      if (Date.now() > end) throw new Error(`attendu ${count} mesure(s), obtenu ${list.length}`);
      await sleep(200);
    }
  }

  // Configuration : deux applications quasi identiques
  await storage(async (b) => {
    await chrome.storage.local.set({
      apps: [
        { id: 'app1', name: 'Appli 1', baseUrls: [`${b}/appli1/`] },
        { id: 'app2', name: 'Appli 2', baseUrls: [`${b}/appli2/`] },
      ],
    });
  }, base);
  for (let i = 0; i < 50; i++) {
    const n = await storage(() => chrome.scripting.getRegisteredContentScripts().then((s) => s.length));
    if (n === 2) break;
    await sleep(100);
  }
  for (const p of context.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

  const page = await context.newPage();
  const expectRange = (m, min, max, label) => {
    console.log(
      `  ${label.padEnd(42)} ${String(m.duration).padStart(5)} ms  [${m.network}/${m.kind}/${m.trigger}] ${m.page}`,
    );
    assert.ok(m.duration >= min && m.duration <= max, `${label} : ${m.duration} ms hors de [${min}, ${max}]`);
  };

  // 1. Chargement initial (URL saisie) : départ = début de navigation
  await page.goto(`${base}/appli1/`);
  let list = await waitMeasures(1);
  expectRange(list[0], SERVER_DELAY.appli1 + API_DELAY, 3000, 'WiFi · appli1 / (URL saisie)');
  assert.equal(list[0].trigger, 'navigate');
  assert.equal(list[0].page, '/');

  // 2. Clic sur un lien -> nouvelle page HTML : départ = clic sur la page précédente
  await page.click('#nav-clients');
  list = await waitMeasures(2);
  expectRange(list[1], SERVER_DELAY.appli1 + API_DELAY, 3000, 'WiFi · appli1 /clients (clic)');
  assert.equal(list[1].trigger, 'click');
  assert.equal(list[1].kind, 'load');
  assert.equal(list[1].page, '/clients');
  assert.equal(await page.locator('insigth-indicator').count(), 1, "l'indicateur est affiché");
  await page.screenshot({ path: join(out, 'indicateur.png'), clip: { x: 760, y: 780, width: 600, height: 120 } });

  await page.click('#nav-clients-42');
  list = await waitMeasures(3);
  expectRange(list[2], SERVER_DELAY.appli1 + API_DELAY, 3000, 'WiFi · appli1 /clients/42 (clic)');
  assert.equal(list[2].page, '/clients/:id');

  // 2 bis. Clic vers une page hors application (SSO) qui revient sur l'appli :
  // le clic ne doit pas servir de départ (sinon le temps passé sur le SSO serait compté).
  const ssoHost = base.replace('127.0.0.1', 'localhost');
  await page.evaluate(
    (href) => {
      const a = document.createElement('a');
      a.id = 'sso';
      a.href = href;
      a.textContent = 'SSO';
      document.body.append(a);
    },
    `${ssoHost}/sso?next=${encodeURIComponent(`${base}/appli1/clients`)}`,
  );
  await sleep(1200);
  await page.click('#sso');
  list = await waitMeasures(4);
  expectRange(list[3], SERVER_DELAY.appli1 + API_DELAY, 1450, 'WiFi · appli1 /clients (retour du SSO)');
  assert.equal(list[3].trigger, 'navigate');
  await storage(async (id) => chrome.storage.local.remove('m_' + id), list[3].id);
  list = await waitMeasures(3);

  // 3. SPA : pushState + fetch
  await page.goto(`${base}/appli1/spa/`);
  list = await waitMeasures(4);
  await page.click('#noop'); // clic sans navigation : ne doit rien enregistrer
  await sleep(1800);
  assert.equal((await measures()).length, 4, 'un clic sans changement de page ne crée pas de mesure');
  await page.click('#spa-factures');
  list = await waitMeasures(5);
  expectRange(list[4], SPA_API_DELAY, 2000, 'WiFi · appli1 /spa/factures (SPA)');
  assert.equal(list[4].kind, 'spa');
  assert.equal(list[4].page, '/spa/factures');

  // 4. Ethernet, appli2 (XHR) — la page /factures n'est pas visitée -> case rouge
  await storage(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, network: 'ethernet' } });
  });
  await page.goto(`${base}/appli2/`);
  list = await waitMeasures(6);
  await page.click('#nav-clients');
  list = await waitMeasures(7);
  expectRange(list[6], SERVER_DELAY.appli2 + API_DELAY, 3500, 'Ethernet · appli2 /clients (clic, XHR)');
  assert.equal(list[6].network, 'ethernet');
  assert.equal(list[6].appId, 'app2');
  await page.goto(`${base}/appli1/clients`);
  list = await waitMeasures(8);

  // 5. Rapport : une ligne par application, cases rouges, tri, détail, export Excel
  const report = await context.newPage();
  await report.setViewportSize({ width: 1440, height: 900 });
  await report.goto(`chrome-extension://${extId}/report/report.html`);
  await report.waitForSelector('#matrix table');
  assert.equal(await report.locator('#matrix tbody tr').count(), 2, 'une ligne par application');
  const missing = await report.locator('#matrix td.missing').count();
  console.log(`  Rapport : ${missing} case(s) rouge(s) dans la matrice`);
  assert.ok(missing > 0);
  await report.click('#matrix thead tr.h2 th >> nth=0');
  assert.equal(await report.getAttribute('#matrix thead tr.h2 th >> nth=0', 'aria-sort'), 'ascending');
  await report.click('#matrix .app-link >> nth=0');
  await report.waitForSelector('#detail[open] .dlg-body table');
  await report.click('#detail [data-close]');

  const [download] = await Promise.all([report.waitForEvent('download'), report.click('#xlsx')]);
  const xlsxPath = join(out, 'export.xlsx');
  await download.saveAs(xlsxPath);
  assert.ok(existsSync(xlsxPath));
  console.log('  Export Excel :', xlsxPath);

  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 900 });
  await options.goto(`chrome-extension://${extId}/options/options.html`);
  await options.waitForSelector('#appRows tr');

  // 6. Sauvegarde JSON puis réimport (fusion sans doublon, appli reconnue par son nom)
  const restored = await options.evaluate(async () => {
    const s = await import('../lib/storage.js');
    const backup = await s.exportBackup();
    const ids = backup.measures.map((m) => m.id);
    await s.deleteMeasures(ids);
    backup.apps = backup.apps.map((a) => ({ ...a, id: 'autre-poste-' + a.id }));
    backup.measures = backup.measures.map((m) => ({ ...m, appId: 'autre-poste-' + m.appId }));
    const first = await s.importBackup(backup);
    const again = await s.importBackup(backup);
    const { apps } = await s.getConfig();
    const measures = await s.getMeasures();
    return { first, again, apps: apps.length, appIds: [...new Set(measures.map((m) => m.appId))].sort() };
  });
  console.log('  Sauvegarde / import :', JSON.stringify(restored));
  assert.deepEqual(restored.first, { added: 8, skipped: 0 });
  assert.deepEqual(restored.again, { added: 0, skipped: 8 });
  assert.equal(restored.apps, 2);
  assert.deepEqual(restored.appIds, ['app1', 'app2']);

  // 7. Import en masse depuis l'interface (copier-coller de deux colonnes Excel)
  await options.reload();
  await options.click('#bulkBtn');
  await options.fill(
    '#bulkText',
    `Nom\tURL\nAppli 1\t${base}/appli1bis/\nAppli 3\thttps://appli3.exemple.fr/\nhttps://appli4.exemple.fr/\nAppli 5\tpas-une-url`,
  );
  const preview = await options.textContent('#bulkPreview');
  console.log('  Import en masse :', preview);
  assert.match(preview, /3 application\(s\) reconnue\(s\) : 2 nouvelle\(s\), 1 existante\(s\)/);
  assert.match(preview, /1 ligne\(s\) en erreur/);
  await options.click('#bulkGo');
  await options.waitForFunction(() => document.querySelectorAll('#appRows tr').length === 4);
  const appsAfter = await storage(async () => (await chrome.storage.local.get('apps')).apps);
  assert.equal(appsAfter.length, 4);
  assert.deepEqual(appsAfter.find((a) => a.name === 'Appli 1').baseUrls, [`${base}/appli1/`, `${base}/appli1bis/`]);
  await options.fill('#appSearch', 'appli4');
  assert.equal(await options.locator('#appRows tr').count(), 1, 'la recherche filtre les applications');
  await options.fill('#appSearch', '');

  // 8. Libellé de page (en-tête de colonne) depuis l'interface
  const labelInput = options.locator('#pageRows input.label-input[placeholder="/clients"]');
  await labelInput.fill('Clients');
  await labelInput.press('Tab');
  await options.waitForFunction(async () => {
    const { pages = [] } = await chrome.storage.local.get('pages');
    return pages.some((p) => p.key === '/clients' && p.label === 'Clients');
  });
  console.log('  Libellé de page enregistré');

  // 9. Démo à l'échelle : 150 applications × 20 pages (captures pour le README)
  const demo = await storage(async () => {
    const PAGES = [
      ['/', 'Accueil'],
      ['/clients', 'Clients'],
      ['/clients/:id', 'Fiche client'],
      ['/factures', 'Factures'],
      ['/factures/:id', 'Facture'],
      ['/commandes', 'Commandes'],
      ['/commandes/:id', 'Commande'],
      ['/produits', 'Produits'],
      ['/stocks', 'Stocks'],
      ['/fournisseurs', 'Fournisseurs'],
      ['/reporting', 'Reporting'],
      ['/reporting/ventes', 'Ventes'],
      ['/tableau-de-bord', 'Tableau de bord'],
      ['/utilisateurs', 'Utilisateurs'],
      ['/parametres', 'Paramètres'],
      ['/recherche', 'Recherche'],
      ['/exports', 'Exports'],
      ['/planning', 'Planning'],
      ['/contrats', 'Contrats'],
      ['/devis', 'Devis'],
    ];
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    await chrome.storage.local.clear();
    const apps = [];
    const items = {};
    let id = 0;
    for (let i = 1; i <= 150; i++) {
      const n = String(i).padStart(3, '0');
      const app = { id: `demo${n}`, name: `Client ${n}`, baseUrls: [`https://client${n}.exemple.fr/`] };
      apps.push(app);
      const appFactor = 0.7 + rnd() * 1.1;
      PAGES.forEach(([key], p) => {
        const base = 250 + ((p * 7919) % 20) * 180;
        for (const network of ['wifi', 'ethernet']) {
          if (rnd() > (network === 'wifi' ? 0.9 : 0.62)) continue;
          const count = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < count; k++) {
            const timeout = rnd() < 0.006;
            const duration = Math.round(
              base * appFactor * (network === 'wifi' ? 1.15 + rnd() * 0.35 : 1) * (0.9 + rnd() * 0.2),
            );
            const m = {
              id: `d${++id}`,
              ts: Date.now() - Math.floor(rnd() * 7 * 864e5),
              appId: app.id,
              url: `https://client${n}.exemple.fr${key.replace(':id', String(100 + k))}`,
              page: key,
              network,
              duration: timeout ? 120000 : duration,
              kind: 'load',
              trigger: 'click',
              timeout,
            };
            items['m_' + m.id] = m;
          }
        }
      });
    }
    await chrome.storage.local.set({
      apps,
      pages: PAGES.map(([key, label]) => ({ key, label, hidden: false })),
      settings: { network: 'wifi', recording: true, stat: 'median', reportView: 'both' },
      ...items,
    });
    return { apps: apps.length, measures: id };
  });
  console.log(`  Démo : ${demo.apps} applications, ${demo.measures} mesures`);

  const t0 = Date.now();
  await report.reload();
  await report.waitForSelector('#matrix tbody tr >> nth=149');
  console.log(`  Rapport 150 × 20 affiché en ${Date.now() - t0} ms`);
  assert.equal(await report.locator('#matrix tbody tr').count(), 150);
  await report.screenshot({ path: join(out, 'rapport.png') });
  await report.click('[data-view="wifi"]');
  await report.waitForFunction(() => !document.querySelector('#matrix thead tr.h2'));
  await report.screenshot({ path: join(out, 'rapport-wifi.png') });
  await report.click('[data-view="both"]');
  await report.fill('#search', 'Client 04');
  await report.waitForFunction(() => document.querySelectorAll('#matrix tbody tr').length === 10);
  await report.click('#matrix .app-link >> nth=2');
  await report.waitForSelector('#detail[open] .dlg-body table');
  await report.screenshot({ path: join(out, 'detail.png') });
  await report.click('#detail [data-close]');

  const [bigDownload] = await Promise.all([report.waitForEvent('download'), report.click('#xlsx')]);
  await bigDownload.saveAs(join(out, 'export-demo.xlsx'));
  console.log('  Export Excel démo :', join(out, 'export-demo.xlsx'));

  // Popup ouvert sur une page d'une application (l'onglet actif est simulé pour la capture)
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 390, height: 600 });
  await popup.addInitScript(() => {
    chrome.tabs.query = async () => [{ url: 'https://client042.exemple.fr/factures/7' }];
  });
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForSelector('#tabInfo .progress');
  assert.equal(await popup.locator('#tabInfo .progress').count(), 2);
  await popup.screenshot({ path: join(out, 'popup.png') });

  await options.reload();
  await options.waitForSelector('#appRows tr >> nth=149');
  await options.screenshot({ path: join(out, 'options.png') });
  await options.locator('#pages').scrollIntoViewIfNeeded();
  await options.screenshot({ path: join(out, 'options-pages.png') });

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
