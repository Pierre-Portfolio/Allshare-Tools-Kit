// Panneau de mesure : formulaire -> attente du clic -> chrono -> résultat.
import {
  getConfig,
  getMeasures,
  getDetails,
  getSession,
  saveSettings,
  saveDraft,
  deleteMeasures,
  applyMeasureChanges,
} from '../lib/storage.js';
import {
  buildModel,
  cellStat,
  rate,
  coverage,
  missingPages,
  lineKey,
  lineLabel,
  anomaly,
  MIN_APPS_FOR_RATIO,
} from '../lib/report.js';
import { nameKey, normName, canonical, suggestApp, nextPage, compareNames } from '../lib/names.js';
import { HOME, PAGE_NAMES, pageChoices, fitLabel } from '../lib/menu.js';
import { phases } from '../lib/timing.js';
import { urlEnd } from '../lib/urls.js';
import { NETWORKS, NETWORK_LABELS, STATS, unitOf, fmtNum, fmtDuration, fmtDate } from '../lib/format.js';
import { $, el, toast } from '../lib/dom.js';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const params = new URLSearchParams(location.search);
const fixedTabId = params.has('tabId') ? Number(params.get('tabId')) : null; // ouverture dans un onglet (tests)
const FREE = '__free__'; // choix « Saisie libre » de la liste des pages

const state = {
  config: null,
  measures: [],
  model: null,
  session: null,
  formFilled: false,
  liveTimer: 0,
  suggestion: null,
  autoFilled: { sid: '', version: '' }, // valeurs SID / version pré-remplies (remplaçables)
};

/** Durée dans l'unité des réglages : « 1,23 s » ou « 1 234 ms ». */
const dur = (ms, digits) => fmtDuration(ms, unitOf(state.config && state.config.settings), digits);

const describe = (s) =>
  `${lineLabel({ client: s.app, sid: s.sid, version: s.version })} › ${s.page}${s.specific ? ' (spécifique)' : ''} · ${
    NETWORK_LABELS[s.network]
  }`;

/** « Page spécifique » déjà déclarée pour ce client et cette page (dernière mesure), sinon non. */
function knownSpecific(client, page) {
  const last = [...state.measures]
    .reverse()
    .find((m) => nameKey(m.app) === nameKey(client) && nameKey(m.page) === nameKey(page));
  return !!(last && last.specific);
}

function setSpecific(value) {
  $('specific').checked = !!value;
  saveDraft({ specific: !!value });
}

/** Pages des menus, puis pages connues hors menus (référentiel et mesures). */
function pageNames() {
  const names = [...PAGE_NAMES];
  const keys = new Set(names.map(nameKey));
  for (const p of state.model.allPages) if (!keys.has(nameKey(p.name))) names.push(p.name);
  return names;
}

/** Pages proposées pour un client (lib/menu.js) : les menus, puis ses pages spécifiques. */
const choicesFor = (client) => pageChoices({ client, measures: state.measures });

const formLine = () => lineKey($('app').value, $('sid').value, $('version').value);
const sessionLine = (s) => lineKey(s.app, s.sid, s.version);

const other = (network) => (network === 'wifi' ? 'ethernet' : 'wifi');
const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: e.message }));

async function targetTab() {
  try {
    if (fixedTabId) return await chrome.tabs.get(fixedTabId);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Données

/** Ouverture du panneau : tout est lu. */
async function load() {
  const [config, measures, session] = await Promise.all([getConfig(), getMeasures(), getSession()]);
  state.config = config;
  state.measures = measures;
  state.session = session;
  refresh();
}

function refresh() {
  state.model = buildModel(state.measures, state.config.apps, state.config.pages);
  render();
}

// Changements : les mesures sont mises à jour d'après l'évènement (sans relire toutes les mesures),
// seuls les réglages ou la session sont relus ; un seul rendu pour une rafale de changements.
const stale = { config: false, session: false };
let pendingUpdate = 0;
function scheduleUpdate() {
  clearTimeout(pendingUpdate);
  pendingUpdate = setTimeout(async () => {
    const { config, session } = stale;
    stale.config = stale.session = false;
    const [nextConfig, nextSession] = await Promise.all([config && getConfig(), session && getSession()]);
    if (config) state.config = nextConfig;
    if (session) state.session = nextSession;
    refresh();
  }, 80);
}

// ---------------------------------------------------------------- Rendu

function renderNetwork(network) {
  for (const b of document.querySelectorAll('[data-network]')) {
    b.setAttribute('aria-checked', String(b.dataset.network === network));
  }
}

function render() {
  const { settings } = state.config;
  renderNetwork(settings.network);
  renderNetHint(settings);

  const s = state.session;
  const view = !s ? 'form' : s.state === 'done' ? 'result' : 'live';
  $('viewForm').hidden = view !== 'form';
  $('viewLive').hidden = view !== 'live';
  $('viewResult').hidden = view !== 'result';
  if (view === 'form') renderForm();
  if (view === 'live') renderLive(s);
  if (view === 'result') renderResult(s);
  renderProgress(s ? sessionLine(s) : formLine(), s ? s.network : settings.network);
  renderLast();
}

function renderNetHint(settings) {
  const type = navigator.connection && navigator.connection.type;
  const hint = $('netHint');
  hint.className = 'hint';
  if (type === 'wifi' || type === 'ethernet') {
    hint.className = type === settings.network ? 'hint' : 'hint warn';
    hint.textContent =
      type === settings.network
        ? `Réseau détecté : ${NETWORK_LABELS[type]}.`
        : `Réseau détecté : ${NETWORK_LABELS[type]}. Pensez à basculer.`;
  } else {
    hint.textContent = 'Chrome ne détecte pas WiFi/Ethernet sur ce poste : choisissez le réseau utilisé.';
  }
}

function renderForm() {
  const { model, config } = state;
  $('appList').replaceChildren(...model.clients.map((name) => el('option', { value: name })));
  $('pageList').replaceChildren(...pageNames().map((name) => el('option', { value: name })));
  const refill = !state.formFilled;
  if (refill) {
    state.formFilled = true;
    $('app').value = config.draft.app || '';
    $('sid').value = config.draft.sid || '';
    $('version').value = config.draft.version || '';
    $('page').value = config.draft.page || '';
    $('specific').checked = !!config.draft.specific;
  }
  renderPagePick(refill);
  renderLineLists();
  updateSuggestion();
}

/**
 * Liste des pages : « Dashboard », « Saisie libre » (qui affiche le champ texte), puis un groupe par
 * menu (sous-menus dans l'ordre d'affichage) et les pages spécifiques au client. Le champ texte
 * (#page) garde toujours la page choisie. Libellés courts : la liste déroulante ne doit pas déborder
 * du panneau.
 */
function renderPagePick(refill) {
  const pick = $('pagePick');
  const free = !refill && pick.value === FREE; // saisie libre en cours : on la laisse ouverte
  const option = (value, text = value, title = '') =>
    el('option', { value, textContent: fitLabel(text), title: title || (fitLabel(text) !== text ? text : '') });
  pick.replaceChildren(
    option('', '— Choisir une page —'),
    option(HOME),
    option(FREE, '✎ Saisie libre (autre page)…'),
    ...choicesFor($('app').value).groups.map((g) =>
      el('optgroup', { label: g.label }, ...g.pages.map((p) => option(p.name, p.label, p.title))),
    ),
  );
  syncPagePick(free);
}

/** Positionne la liste sur la page du champ texte (saisie libre si elle n'y est pas). */
function syncPagePick(free = false) {
  const pick = $('pagePick');
  const input = $('page');
  const value = normName(input.value);
  const match =
    !free && value && [...pick.options].find((o) => o.value && o.value !== FREE && nameKey(o.value) === nameKey(value));
  if (match) {
    pick.value = match.value;
    input.value = match.value;
  } else {
    pick.value = free || value ? FREE : '';
  }
  input.hidden = pick.value !== FREE;
}

function focusPage() {
  if ($('page').hidden) return $('pagePick').focus();
  $('page').focus();
  $('page').select();
}

/** SID et versions proposés : ceux déjà vus pour ce client d'abord. */
function renderLineLists() {
  const client = nameKey($('app').value);
  const pick = (field) => {
    const mine = new Set();
    const all = new Set();
    for (const l of state.model.lines) {
      if (!l[field]) continue;
      (nameKey(l.client) === client ? mine : all).add(l[field]);
    }
    return [...mine, ...[...all].filter((v) => !mine.has(v)).sort(compareNames)];
  };
  $('sidList').replaceChildren(...pick('sid').map((v) => el('option', { value: v })));
  $('versionList').replaceChildren(...pick('version').map((v) => el('option', { value: v })));
}

/** Client choisi : SID et version repris de sa dernière mesure (si les champs sont vides ou pré-remplis). */
function prefillLine() {
  const client = nameKey($('app').value);
  const last = [...state.measures].reverse().find((m) => nameKey(m.app) === client);
  for (const field of ['sid', 'version']) {
    const input = $(field);
    if (input.value && input.value !== state.autoFilled[field]) continue; // saisi à la main
    const value = last ? last[field] || '' : '';
    input.value = value;
    state.autoFilled[field] = value;
  }
  renderLineLists();
  renderPagePick(false); // pages spécifiques du client
  saveDraft({ app: $('app').value, sid: $('sid').value, version: $('version').value });
  renderProgress(formLine(), state.config.settings.network);
}

async function updateSuggestion() {
  const box = $('appSuggest');
  const tab = await targetTab();
  const suggestion = tab && tab.url ? suggestApp(tab.url, state.config.apps, state.measures) : null;
  state.suggestion = suggestion;
  const typed = $('app').value;
  if (suggestion && !normName(typed)) {
    $('app').value = suggestion;
    prefillLine();
  }
  box.hidden = !suggestion || nameKey(suggestion) === nameKey($('app').value);
  $('appSuggestName').textContent = suggestion ? `« ${suggestion} »` : '';
}

function renderLive(s) {
  const live = document.querySelector('.live');
  const measuring = s.state === 'measuring' && s.startEpoch;
  live.classList.toggle('measuring', !!measuring);
  $('liveState').textContent =
    s.state === 'rearming'
      ? 'Retour à la page de départ…'
      : measuring
        ? 'Mesure en cours…'
        : 'Prêt : en attente de votre clic';
  $('liveLabel').textContent = describe(s);
  $('liveHint').textContent = measuring
    ? "Le chrono s'arrête tout seul quand la page est complètement affichée."
    : 'Cliquez dans la page sur le lien (ou le menu) qui ouvre cette page.';
  clearInterval(state.liveTimer);
  const tick = () => {
    const ms = measuring ? Math.max(0, Date.now() - s.startEpoch) : 0;
    $('liveTimer').textContent =
      `${(ms / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  };
  tick();
  if (measuring) state.liveTimer = setInterval(tick, 100);
}

function renderResult(s) {
  clearInterval(state.liveTimer);
  const { model, config } = state;
  const { settings } = config;
  const r = s.result || {};
  const deleted = !state.measures.some((m) => m.id === r.measureId);
  $('resLabel').textContent = describe(s);
  const line = sessionLine(s);
  showDetail(deleted ? null : r.measureId);

  const facts = [];
  const value = $('resValue');
  value.className = 'value';
  if (deleted) {
    value.textContent = 'Mesure supprimée';
  } else if (r.timeout) {
    value.textContent = `≥ ${dur(r.duration)}`;
    value.classList.add('crit');
    facts.push(el('li', { className: 'crit', textContent: 'Timeout : la page bougeait encore à la durée maximale.' }));
  } else {
    value.textContent = dur(r.duration);
    const stat = settings.stat;
    const mine = rate(model, line, s.page, s.network, stat, settings);
    // Même règle que le tableau de bord et les exports : médiane des clients ou seuils absolus des Réglages
    const level = anomaly(r.duration, mine.ref, settings) || '';
    if (level) value.classList.add(level);
    if (mine.ref && mine.ref.count >= MIN_APPS_FOR_RATIO && mine.ref.median > 0) {
      const ratio = r.duration / mine.ref.median;
      facts.push(
        el('li', {
          className: level,
          textContent: `Médiane des ${mine.ref.count} clients : ${dur(mine.ref.median)} (× ${ratio.toLocaleString('fr-FR', { maximumFractionDigits: 1 })})`,
        }),
      );
    } else if (level) {
      facts.push(el('li', { className: level, textContent: 'Au-delà du seuil fixé dans les Réglages.' }));
    }
    if (mine.count > 1)
      facts.push(
        el('li', {
          textContent: `${mine.count} mesures sur ce réseau · ${STATS[stat].toLowerCase()} ${dur(mine.value)}`,
        }),
      );
    const o = cellStat(model, line, s.page, other(s.network), stat);
    if (o.status === 'ok') {
      const pct = o.value > 0 ? Math.round(((r.duration - o.value) / o.value) * 100) : null;
      facts.push(
        el('li', {
          className: pct !== null && Math.abs(pct) >= settings.gapPct ? 'warn' : '',
          textContent:
            `${NETWORK_LABELS[other(s.network)]} : ${dur(o.value)}` +
            (pct !== null ? ` (${pct > 0 ? '+' : ''}${pct} % en ${NETWORK_LABELS[s.network]})` : ''),
        }),
      );
    } else {
      facts.push(el('li', { textContent: `Pas encore de mesure en ${NETWORK_LABELS[other(s.network)]}.` }));
    }
  }
  $('resFacts').replaceChildren(...facts);
  $('relaunchOther').textContent = `↻ Relancer en ${NETWORK_LABELS[other(s.network)]}`;
  $('relaunchHint').textContent =
    other(s.network) === 'ethernet'
      ? 'Branchez le câble Ethernet et coupez le WiFi, puis recliquez sur le même lien.'
      : 'Débranchez le câble Ethernet et activez le WiFi, puis recliquez sur le même lien.';
  $('relaunchSame').textContent = `↻ Refaire en ${NETWORK_LABELS[s.network]}`;
  $('deleteResult').hidden = deleted;
}

function progressRow(label, done, total, current) {
  const ratio = total ? done / total : 0;
  return el(
    'div',
    { className: `progress${current ? ' current' : ''}${total && done === total ? ' full' : ''}` },
    el('span', { className: 'net', textContent: label }),
    el('span', { className: 'track' }, el('i', { style: `width:${Math.round(ratio * 100)}%` })),
    el('span', { className: 'count', textContent: `${done}/${total}` }),
  );
}

/** Détail des temps de la mesure affichée, lu une seule fois (il est rangé à part des mesures). */
const shownDetail = { id: null, detail: null };
async function showDetail(id) {
  if (!id) return renderDetail(null);
  if (shownDetail.id !== id) {
    const detail = (await getDetails([id]))[id] || null;
    Object.assign(shownDetail, { id, detail });
  }
  const current = state.session && state.session.result && state.session.result.measureId;
  if (current === id) renderDetail(shownDetail.detail); // résultat toujours affiché
}

/** Détail du chargement (type « Load timings »), disponible juste après la mesure. */
function renderDetail(d) {
  $('detail').hidden = !d;
  if (!d) return;
  const rows = phases(d);
  const total = Math.max(1, ...rows.map((p) => p.end));
  const unit = unitOf(state.config.settings);
  const n = (v) => fmtNum(v, unit, 3);
  const table = el(
    'table',
    { className: 'timings' },
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { textContent: 'Étape' }),
        el('th', { className: 'n', textContent: `Début (${unit})` }),
        el('th', { className: 'n', textContent: `Durée (${unit})` }),
        el('th', { className: 'n', textContent: `Fin (${unit})` }),
        el('th'),
      ),
    ),
    el(
      'tbody',
      {},
      ...rows.map((p) =>
        el(
          'tr',
          { className: p.id === 'total' ? 'total' : p.sub ? 'sub' : p.id === 'request' ? 'key' : '' },
          el('td', {
            textContent: p.label,
            title: p.id === 'request' ? 'Temps de réponse du serveur (requêtes SQL comprises)' : '',
          }),
          el('td', { className: 'n', textContent: n(p.start) }),
          el('td', { className: 'n', textContent: n(p.duration) }),
          el('td', { className: 'n', textContent: n(p.end) }),
          el(
            'td',
            {},
            el(
              'div',
              { className: 'bar' },
              el('i', { style: `left:${(p.start / total) * 100}%;width:${(p.duration / total) * 100}%` }),
            ),
          ),
        ),
      ),
    ),
  );
  const slowest = [...(d.requests || [])].sort((a, b) => b.duration - a.duration).slice(0, 5);
  $('detailBody').replaceChildren(
    table,
    slowest.length
      ? el(
          'div',
          { className: 'reqs' },
          el('h4', { textContent: `Requêtes les plus lentes (${d.requestCount || slowest.length} au total)` }),
          el(
            'ul',
            {},
            ...slowest.map((r) =>
              el(
                'li',
                {},
                el('strong', { textContent: dur(r.duration, 3) }),
                el('span', { className: 'url', textContent: urlEnd(r.url) || r.url, title: r.url }),
              ),
            ),
          ),
        )
      : '',
  );
}

/** Avancement de la ligne sur les pages du tableau de bord. */
function renderProgress(line, network) {
  const box = $('progress');
  const { model } = state;
  const found = model.lines.find((l) => l.key === line);
  if (!found || !model.pages.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const rows = NETWORKS.map((n) => {
    const c = coverage(model, line, [n.id]);
    return progressRow(n.label, c.done, c.total, n.id === network);
  });
  const missing = missingPages(model, line, network);
  const formView = !state.session;
  const shown = missing.slice(0, 15);
  box.replaceChildren(
    el(
      'div',
      { className: 'prog-head' },
      el('strong', { textContent: lineLabel(found) }),
      el('span', { className: 'muted', textContent: 'pages mesurées' }),
    ),
    ...rows,
    missing.length
      ? el('div', { className: 'todo-title', textContent: `Reste à mesurer en ${NETWORK_LABELS[network]} :` })
      : el('div', {
          className: 'todo-title done',
          textContent: `✓ Toutes les pages sont mesurées en ${NETWORK_LABELS[network]}.`,
        }),
    missing.length
      ? el(
          'div',
          { className: 'chips' },
          ...shown.map((p) =>
            formView
              ? el('button', {
                  type: 'button',
                  className: 'chip',
                  textContent: p.name,
                  title: 'Choisir cette page',
                  dataset: { page: p.name },
                })
              : el('span', { className: 'chip', textContent: p.name }),
          ),
          missing.length > shown.length
            ? el('span', { className: 'chip more', textContent: `+${missing.length - shown.length}` })
            : null,
        )
      : '',
  );
}

function renderLast() {
  const last = state.measures.slice(-5).reverse();
  $('count').textContent = state.measures.length ? `· ${nf.format(state.measures.length)} au total` : '';
  $('last').replaceChildren(
    ...(last.length
      ? last.map((m) =>
          el(
            'li',
            {},
            el('span', {
              className: 'what',
              textContent: `${lineLabel({ client: m.app, sid: m.sid, version: m.version })} › ${m.page}`,
              title: m.url,
            }),
            el('span', { className: 'value', textContent: m.timeout ? `≥ ${dur(m.duration)}` : dur(m.duration) }),
            el('button', {
              type: 'button',
              className: 'del',
              textContent: '✕',
              title: 'Supprimer cette mesure',
              dataset: { del: m.id },
            }),
            el('span', {
              className: 'meta',
              textContent: `${NETWORK_LABELS[m.network]} · ${fmtDate(m.ts)}${m.specific ? ' · page spécifique' : ''}`,
            }),
          ),
        )
      : [el('li', {}, el('span', { className: 'muted', textContent: 'Aucune mesure pour le moment.' }))]),
  );
}

// ---------------------------------------------------------------- Actions

async function arm() {
  const app = normName($('app').value);
  const sid = normName($('sid').value);
  const version = normName($('version').value);
  const page = canonical($('page').value, pageNames());
  $('formError').textContent = '';
  if (!app) return showError('Indiquez le client.', 'app');
  if (!version) return showError("Indiquez la version de l'application.", 'version');
  if (!page) return showError('Choisissez la page.', $('page').hidden ? 'pagePick' : 'page');
  const tab = await targetTab();
  if (!tab) return showError('Aucun onglet actif.');
  const specific = $('specific').checked;
  await saveDraft({ app, sid, version, page, specific });
  $('arm').disabled = true;
  const res = await send({
    type: 'arm',
    tabId: tab.id,
    app,
    sid,
    version,
    page,
    specific,
    network: state.config.settings.network,
  });
  $('arm').disabled = false;
  if (!res || !res.ok) showError((res && res.error) || 'Impossible de lancer la mesure.');
}

function showError(text, focusId) {
  $('formError').textContent = text;
  if (focusId) $(focusId).focus();
}

async function goNext() {
  const s = state.session;
  if (!s) return;
  // Ordre des pages du référentiel, puis pages proposées (menus dans l'ordre d'affichage) qui n'y sont pas encore.
  const known = new Set(state.model.allPages.map((p) => nameKey(p.name)));
  const order = [
    ...state.model.pages.map((p) => p.name),
    ...choicesFor(s.app).order.filter((name) => !known.has(nameKey(name))),
  ];
  const done = new Set(
    order
      .filter((name) => cellStat(state.model, sessionLine(s), name, s.network, 'avg').status !== 'missing')
      .map(nameKey),
  );
  const next = nextPage(order, s.page, done);
  await saveDraft({
    app: s.app,
    sid: s.sid || '',
    version: s.version || '',
    page: next,
    specific: knownSpecific(s.app, next),
  });
  state.formFilled = false; // reprendre les valeurs du brouillon
  await send({ type: 'finish' });
  await load();
  // Page suivante trouvée : l'enregistrement est relancé aussitôt, il ne reste qu'à cliquer
  // sur cette page dans l'application (« Annuler » ramène au formulaire pour la changer).
  if (next) await arm();
  else focusPage();
}

async function relaunch(network) {
  const res = await send({ type: 'relaunch', network });
  if (!res || !res.ok) toast((res && res.error) || 'Impossible de relancer la mesure.');
}

// ---------------------------------------------------------------- Évènements

for (const b of document.querySelectorAll('[data-network]')) {
  b.addEventListener('click', () => {
    // Mise à jour immédiate (sans attendre l'écriture) pour qu'un « Lancer » juste après parte sur ce réseau.
    state.config.settings = { ...state.config.settings, network: b.dataset.network };
    renderNetwork(b.dataset.network);
    renderProgress(state.session ? sessionLine(state.session) : formLine(), b.dataset.network);
    saveSettings({ network: b.dataset.network });
  });
}
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  arm();
});
let draftTimer = 0;
for (const id of ['app', 'sid', 'version', 'page']) {
  $(id).addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(
      () => saveDraft({ app: $('app').value, sid: $('sid').value, version: $('version').value, page: $('page').value }),
      300,
    );
    if (id === 'app') {
      $('appSuggest').hidden = !state.suggestion || nameKey(state.suggestion) === nameKey($('app').value);
    }
    renderProgress(formLine(), state.config.settings.network);
  });
}
$('app').addEventListener('change', prefillLine);
$('page').addEventListener('change', () => setSpecific(knownSpecific($('app').value, $('page').value)));
$('pagePick').addEventListener('change', () => {
  const pick = $('pagePick').value;
  $('page').hidden = pick !== FREE;
  if (pick === FREE) return focusPage(); // champ pré-rempli avec la page en cours, prêt à être remplacé
  $('page').value = pick;
  saveDraft({ page: pick });
  setSpecific(knownSpecific($('app').value, pick));
});
$('specific').addEventListener('change', (e) => saveDraft({ specific: e.target.checked }));
$('appSuggestUse').addEventListener('click', () => {
  $('app').value = state.suggestion || '';
  $('appSuggest').hidden = true;
  prefillLine();
  $('page').focus();
});
$('progress').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-page]');
  if (!chip) return;
  $('page').value = chip.dataset.page;
  syncPagePick();
  saveDraft({ page: chip.dataset.page });
  setSpecific(knownSpecific($('app').value, chip.dataset.page));
  $('arm').focus();
});
$('cancel').addEventListener('click', () => send({ type: 'cancel' }));
$('relaunchOther').addEventListener('click', () => relaunch(other(state.session.network)));
$('relaunchSame').addEventListener('click', () => relaunch(state.session.network));
$('next').addEventListener('click', goNext);
$('deleteResult').addEventListener('click', async () => {
  const id = state.session && state.session.result && state.session.result.measureId;
  if (id) {
    await deleteMeasures([id]);
    toast('Mesure supprimée');
  }
});
$('last').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  await deleteMeasures([b.dataset.del]);
  toast('Mesure supprimée');
});
$('openExports').addEventListener('click', () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') }),
);
$('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.session) {
    stale.session = true;
    scheduleUpdate();
  }
  if (area !== 'local' || !state.config) return;
  const measures = applyMeasureChanges(state.measures, changes);
  if (measures) state.measures = measures;
  if (changes.settings || changes.apps || changes.pages) stale.config = true;
  if (measures || stale.config) scheduleUpdate();
});
if (!fixedTabId) {
  chrome.tabs.onActivated.addListener(() => !state.session && updateSuggestion());
  chrome.tabs.onUpdated.addListener((_id, info) => info.url && !state.session && updateSuggestion());
}

chrome.storage.session.remove('panelTool'); // demande du raccourci clavier satisfaite
load();
