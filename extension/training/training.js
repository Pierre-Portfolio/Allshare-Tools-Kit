// Page de formation : un module (Métier RH, OLAP ou APEX) avec ses notions, exercices (QCM et
// questions ouvertes), examen, mémo, glossaire et ressources. La progression est enregistrée dans
// l'extension (chrome.storage.local, voir lib/training.js) et partagée avec le panneau latéral.
import { esc } from './content/helpers.js';
import { $, toast, downloadBlob } from '../lib/dom.js';
import {
  MODULES,
  moduleById,
  exoId,
  examId,
  moduleStats,
  examStats,
  optionOrder,
  resetModule,
  getProgress,
  saveProgress,
  normalize,
  mergeProgress,
  progressBackup,
  readProgressBackup,
  TRAINING_KEY,
} from '../lib/training.js';

const THEME_KEY = 'training.theme';
const LVL = { Débutant: 'lvl-1', 'Débutant → Intermédiaire': 'lvl-2', Intermédiaire: 'lvl-2' };

const params = new URLSearchParams(location.search);
let progress = normalize(null);
let lastWritten = ''; // dernière progression écrite par cette page (pour ignorer son propre écho)
const mod = moduleById(params.get('m')) || MODULES[0];
const notions = mod.notions;

// ---------------------------------------------------------------- Enregistrement

let saveTimer = 0;
function persist(now) {
  clearTimeout(saveTimer);
  const write = () => {
    saveTimer = 0;
    lastWritten = JSON.stringify(progress);
    saveProgress(progress);
  };
  if (now) write();
  else saveTimer = setTimeout(write, 400);
}

// Onglet fermé ou masqué juste après une frappe : la saisie en attente est enregistrée tout de suite.
const flush = () => saveTimer && persist(true);
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

// ---------------------------------------------------------------- Illustrations des modules

const HERO = {
  cube: `<svg class="hero-art" viewBox="0 0 250 230" role="img" aria-label="Cube OLAP à trois dimensions : Temps, Produit, Région. Une cellule est mise en évidence.">
      <path class="face-top" d="M125 20 215 65 125 110 35 65z"/>
      <path class="face-left" d="M35 65 125 110v100L35 165z"/>
      <path class="face-right" d="M215 65 125 110v100l90-45z"/>
      <path class="grid" d="M65 50l90 45M95 35l90 45M65 80l90-45M95 95l90-45"/>
      <path class="grid" d="M65 80v100M95 95v100M35 98.3l90 45M35 131.7l90 45"/>
      <path class="grid" d="M155 95v100M185 80v100M125 143.3l90-45M125 176.7l90-45"/>
      <path class="hi" d="M155 128.3 185 113.3v33.4l-30 15z"/>
      <path class="edge" d="M125 20 215 65v100l-90 45-90-45V65zM35 65l90 45 90-45M125 110v100"/>
      <text x="10" y="200">Temps</text><text x="190" y="215">Produit</text><text x="176" y="30">Région</text>
    </svg>`,
  pyramid: `<svg class="hero-art" viewBox="0 0 250 230" role="img" aria-label="Pyramide des âges : effectifs par tranche d'âge, hommes à gauche, femmes à droite.">
      <path class="axis" d="M125 18v172"/>
      <g>
        <rect class="bar-h" x="97" y="22" width="28" height="22" rx="3"/><rect class="bar-f" x="125" y="22" width="22" height="22" rx="3"/>
        <rect class="bar-h" x="70" y="50" width="55" height="22" rx="3"/><rect class="bar-f" x="125" y="50" width="48" height="22" rx="3"/>
        <rect class="bar-h" x="52" y="78" width="73" height="22" rx="3"/><rect class="bar-f" x="125" y="78" width="80" height="22" rx="3"/>
        <rect class="bar-h" x="40" y="106" width="85" height="22" rx="3"/><rect class="bar-f" x="125" y="106" width="92" height="22" rx="3"/>
        <rect class="bar-h" x="58" y="134" width="67" height="22" rx="3"/><rect class="bar-f" x="125" y="134" width="70" height="22" rx="3"/>
        <rect class="bar-h" x="88" y="162" width="37" height="22" rx="3"/><rect class="bar-f" x="125" y="162" width="41" height="22" rx="3"/>
      </g>
      <text x="4" y="37">60 +</text><text x="4" y="177">&lt; 25</text>
      <text class="t-strong" x="58" y="212">Hommes</text><text class="t-strong" x="140" y="212">Femmes</text>
    </svg>`,
  app: `<svg class="hero-art" viewBox="0 0 250 230" role="img" aria-label="Application web : une fenêtre avec des indicateurs, un graphique en barres et une courbe.">
      <rect class="win" x="10" y="20" width="230" height="190" rx="12"/>
      <path class="win-top" d="M10 32a12 12 0 0 1 12-12h206a12 12 0 0 1 12 12v12H10z"/>
      <circle class="dot" cx="26" cy="32" r="4"/><circle class="dot" cx="40" cy="32" r="4"/><circle class="dot" cx="54" cy="32" r="4"/>
      <rect class="col-2" x="26" y="58" width="58" height="30" rx="6"/><rect class="col-2" x="96" y="58" width="58" height="30" rx="6"/><rect class="col-2" x="166" y="58" width="58" height="30" rx="6"/>
      <rect class="col" x="34" y="150" width="18" height="44" rx="3"/><rect class="col" x="60" y="128" width="18" height="66" rx="3"/>
      <rect class="col" x="86" y="140" width="18" height="54" rx="3"/><rect class="col" x="112" y="112" width="18" height="82" rx="3"/>
      <path class="line" d="M146 178l22-26 20 12 22-38 14 8"/>
    </svg>`,
};

// ---------------------------------------------------------------- Rendu des exercices

function renderQcm(ex, id, label) {
  const opts = optionOrder(id, ex.options.length)
    .map(
      (k) =>
        `<label class="opt" for="${id}-o${k}"><input type="radio" name="${id}" id="${id}-o${k}" value="${k}"><span>${ex.options[k]}</span></label>`,
    )
    .join('');
  return (
    `<div class="exo" data-exo="${id}" data-kind="qcm">` +
    `<div class="exo-top"><span class="kind">${label} · QCM</span><span class="state"></span></div>` +
    `<div class="q">${ex.q}</div>` +
    `<div class="opts" role="radiogroup">${opts}</div>` +
    '<div class="actions">' +
    '<button class="btn primary" type="button" data-act="check" disabled>Valider ma réponse</button>' +
    '<button class="btn ghost" type="button" data-act="reveal">Voir la correction</button>' +
    '<button class="btn ghost" type="button" data-act="retry" hidden>Réessayer</button>' +
    '</div>' +
    '<div class="feedback" hidden></div>' +
    '</div>'
  );
}

function renderOpen(ex, id, label) {
  const crit = (ex.criteria || []).map((c) => `<li>${c}</li>`).join('');
  return (
    `<div class="exo" data-exo="${id}" data-kind="open">` +
    `<div class="exo-top"><span class="kind">${label} · Question ouverte</span><span class="state"></span></div>` +
    `<div class="q">${ex.q}</div>` +
    (ex.hint ? `<p class="hint"><b>Piste :</b> ${ex.hint}</p>` : '') +
    `<label class="sr-only" for="ta-${id}">Votre réponse</label>` +
    `<textarea id="ta-${id}" data-ta="${id}" placeholder="Rédigez votre réponse ici. Elle est enregistrée dans l'extension."></textarea>` +
    '<div class="actions"><button class="btn primary" type="button" data-act="show">Voir la correction</button></div>' +
    '<div class="feedback" hidden>' +
    `<div class="model"><b>Correction proposée</b>${ex.answer}</div>` +
    (crit ? `<div class="criteria"><b>Points clés attendus</b><ul>${crit}</ul></div>` : '') +
    '<div class="selfeval"><span>Auto-évaluation :</span>' +
    '<button class="btn" type="button" data-self="ok">Je l\'avais</button>' +
    '<button class="btn" type="button" data-self="mid">En partie</button>' +
    '<button class="btn" type="button" data-self="bad">À revoir</button>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function renderExercises(list, idOf) {
  return list
    .map((ex, i) => {
      const id = idOf(i);
      const label = `Exercice ${i + 1}`;
      return ex.type === 'qcm' ? renderQcm(ex, id, label) : renderOpen(ex, id, label);
    })
    .join('');
}

// ---------------------------------------------------------------- Rendu d'une notion

function renderNotion(n, idx) {
  const prev = notions[idx - 1];
  const next = notions[idx + 1];
  const objectives = (n.objectives || []).map((o) => `<li>${o}</li>`).join('');
  const keypoints = (n.keypoints || []).map((k) => `<li>${k}</li>`).join('');
  return (
    `<section class="notion" id="${n.id}" data-notion="${n.id}">` +
    '<header class="notion-head">' +
    `<div class="eyebrow"><span>${mod.label} · Notion ${idx + 1} / ${notions.length}</span>` +
    `<span class="chip ${LVL[n.level] || ''}">${n.level}</span>` +
    `<span class="chip">${n.duration}</span></div>` +
    `<h2>${n.title}</h2>` +
    `<p class="intro">${n.intro}</p>` +
    '</header>' +
    (objectives ? `<div class="objectives"><h4>Objectifs</h4><ul>${objectives}</ul></div>` : '') +
    `<div class="prose">${n.content}</div>` +
    (keypoints ? `<div class="keypoints"><h4>À retenir</h4><ul>${keypoints}</ul></div>` : '') +
    '<div class="exercises">' +
    `<div class="ex-head"><h3>Exercices · ${n.short}</h3><span class="tally" data-tally="${n.id}"></span></div>` +
    renderExercises(n.exercises, (i) => exoId(n, i)) +
    '</div>' +
    '<nav class="notion-foot" aria-label="Navigation entre notions">' +
    (prev ? `<a href="#${prev.id}">← ${prev.short}</a>` : '<span></span>') +
    (next ? `<a href="#${next.id}">${next.short} →</a>` : '<a href="#examen">Examen du module →</a>') +
    '</nav>' +
    '</section>'
  );
}

function renderHero() {
  const mins = notions.reduce((s, n) => s + parseInt(n.duration, 10), 0);
  const exos = notions.reduce((s, n) => s + n.exercises.length, 0);
  return (
    '<section class="hero">' +
    '<div>' +
    `<p class="eyebrow">Training · ${mod.eyebrow}</p>` +
    `<h1>Module <em>${mod.label}</em></h1>` +
    `<p class="lede">${mod.lede}</p>` +
    '</div>' +
    (HERO[mod.hero] || '') +
    '</section>' +
    '<div class="paths">' +
    '<article class="path">' +
    `<h2>${mod.title}</h2>` +
    `<p>${mod.intro}</p>` +
    `<ol>${notions.map((n) => `<li><a href="#${n.id}">${n.title}</a></li>`).join('')}</ol>` +
    '<div class="meta-row">' +
    `<span class="meta">${notions.length} notions · ${exos} exercices · examen de ${mod.exam.length} questions · environ ${(Math.round(mins / 6) / 10).toLocaleString('fr-FR')} h</span>` +
    '<a class="resume" id="resumeLink" href="#" hidden></a>' +
    '</div>' +
    '</article>' +
    '</div>' +
    '<div class="howto">' +
    '<div><strong>Lire</strong>Chaque notion commence par ses objectifs, puis le cours avec schémas, tableaux et exemples réels.</div>' +
    '<div><strong>Pratiquer</strong>5 exercices par notion : 3 QCM corrigés automatiquement et 2 questions ouvertes avec correction détaillée.</div>' +
    "<div><strong>Mesurer</strong>Votre progression est enregistrée dans l'extension. Terminez par l'examen du module.</div>" +
    '</div>' +
    (mod.id !== 'rh'
      ? `<div class="callout info" style="margin-top:22px"><b>Projet fil rouge</b><div>Le script <a class="download" href="sql/fil_rouge_ventes.sql" download>fil_rouge_ventes.sql ↓</a> crée une étoile de ventes réaliste (12 magasins, 24 produits, environ 60 000 lignes de faits) pour pratiquer sur une base Oracle (Oracle 12c et plus, ou un workspace APEX gratuit).</div></div>`
      : '')
  );
}

function renderPartHead() {
  return (
    `<header class="part-head" id="partie">` +
    `<span class="tag">Module ${mod.label}</span>` +
    `<h2>${mod.title}</h2>` +
    `<p>${mod.intro}</p>` +
    '</header>'
  );
}

// ---------------------------------------------------------------- Annexes : examen, mémo, glossaire, ressources

function renderExtras() {
  let html = '';
  if (mod.exam && mod.exam.length) {
    html +=
      '<section class="notion" id="examen">' +
      `<header class="notion-head"><div class="eyebrow"><span>Bilan</span><span class="chip">${mod.exam.length} questions</span></div>` +
      `<h2>Examen du module ${mod.label}</h2><p class="intro">Des questions qui reprennent toutes les notions du module. Visez ${Math.ceil(mod.exam.length * 0.8)}/${mod.exam.length} avant de passer à la pratique.</p></header>` +
      '<div class="exam-result" id="examResult"></div>' +
      `<div class="exercises">${renderExercises(
        mod.exam.map((q) => ({ type: 'qcm', ...q })),
        (i) => examId(mod, i),
      )}</div>` +
      '</section>';
  }
  if (mod.memo) {
    html +=
      '<section class="notion" id="memo"><header class="notion-head"><div class="eyebrow"><span>Aide-mémoire</span></div>' +
      '<h2>Mémo express</h2><p class="intro">L\'essentiel à garder sous la main.</p></header>' +
      `<div class="memo">${mod.memo}</div></section>`;
  }
  if (mod.glossary && mod.glossary.length) {
    html +=
      '<section class="notion" id="glossaire"><header class="notion-head">' +
      `<div class="eyebrow"><span>Vocabulaire</span><span class="chip">${mod.glossary.length} termes</span></div>` +
      '<h2>Glossaire</h2></header>' +
      '<div class="prose" style="margin-top:0"><label class="sr-only" for="glossSearch">Filtrer le glossaire</label>' +
      '<input class="search" id="glossSearch" type="search" placeholder="Filtrer le glossaire…">' +
      '<dl class="gloss" id="glossList"></dl></div></section>';
  }
  if (mod.resources && mod.resources.length) {
    html +=
      '<section class="notion" id="ressources"><header class="notion-head"><div class="eyebrow"><span>Pour aller plus loin</span></div>' +
      '<h2>Ressources</h2></header><div class="resources">' +
      mod.resources
        .map((r) => `<a href="${r.url}" target="_blank" rel="noopener"><b>${r.title}</b><span>${r.desc}</span></a>`)
        .join('') +
      '</div></section>';
  }
  return html;
}

function renderGlossary(filter) {
  const list = $('glossList');
  if (!list) return;
  const f = (filter || '').trim().toLowerCase();
  const items = mod.glossary
    .filter((g) => !f || `${g.term} ${g.def}`.toLowerCase().includes(f))
    .sort((a, b) => a.term.localeCompare(b.term, 'fr'));
  list.innerHTML = items.length
    ? items.map((g) => `<div><dt>${g.term}</dt><dd>${g.def}</dd></div>`).join('')
    : `<span class="empty">Aucun terme ne correspond à « ${esc(filter)} ».</span>`;
}

// ---------------------------------------------------------------- Barre du haut et sommaire

function renderModules() {
  $('modules').innerHTML = MODULES.map(
    (m) => `<a href="?m=${m.id}" data-module="${m.id}"${m.id === mod.id ? ' aria-current="page"' : ''}>${m.label}</a>`,
  ).join('');
}

function renderRail() {
  const extras = [
    ['examen', 'Examen du module'],
    ['memo', 'Mémo express'],
    ['glossaire', 'Glossaire'],
    ['ressources', 'Ressources'],
  ].filter(([id]) => document.getElementById(id));
  $('rail').innerHTML =
    `<div><h3>Module ${mod.label} <span class="pct" id="railPct"></span></h3><ol>` +
    notions
      .map(
        (n, i) =>
          `<li><a href="#${n.id}" data-link="${n.id}"><span class="num" data-num="${n.id}">${i + 1}</span><span>${n.short}</span><span class="score" data-score="${n.id}"></span></a></li>`,
      )
      .join('') +
    '</ol></div>' +
    '<div class="part-extra"><h3>Bilan &amp; outils</h3><ul>' +
    extras
      .map(
        ([id, t]) =>
          `<li><a href="#${id}" data-link="${id}"><span class="num">·</span><span>${t}</span><span class="score" ${id === 'examen' ? 'id="railExam"' : ''}></span></a></li>`,
      )
      .join('') +
    '</ul></div>' +
    '<div class="part-extra"><h3>Autres modules</h3><ul>' +
    MODULES.filter((m) => m.id !== mod.id)
      .map(
        (m) =>
          `<li><a href="?m=${m.id}"><span class="num">›</span><span>${m.label}</span><span class="score" data-mod="${m.id}"></span></a></li>`,
      )
      .join('') +
    '</ul></div>' +
    '<div class="part-extra"><h3>Ma progression</h3></div>' +
    '<div class="backup"><button type="button" id="exportBtn" title="Télécharge vos réponses et scores des trois modules (fichier JSON)">Exporter</button>' +
    '<label class="button-like" title="Ajoute les réponses d\'une sauvegarde à celles de ce poste">Importer…<input id="importInput" type="file" accept="application/json,.json" hidden></label></div>' +
    '<button class="reset" type="button" id="resetBtn">Réinitialiser ce module</button>' +
    '<div class="reset-confirm" id="resetConfirm" hidden><span>Effacer vos réponses et scores du module ' +
    `${mod.label} ?</span>` +
    '<div class="row"><button class="btn primary" type="button" id="resetYes">Oui, effacer</button><button class="btn" type="button" id="resetNo">Annuler</button></div></div>';
}

// ---------------------------------------------------------------- État d'un exercice

function findExercise(id) {
  const exam = id.match(/^(.+)-exam-(\d+)$/);
  if (exam) {
    const q = mod.exam[parseInt(exam[2], 10) - 1];
    return q ? { type: 'qcm', ...q } : null;
  }
  const m = id.match(/^(.*)-e(\d+)$/);
  const n = m && notions.find((x) => x.id === m[1]);
  return n ? n.exercises[parseInt(m[2], 10) - 1] : null;
}

function paintQcm(el, ex, rec) {
  const inputs = el.querySelectorAll('input[type=radio]');
  const fb = el.querySelector('.feedback');
  const st = el.querySelector('.state');
  const btnCheck = el.querySelector('[data-act=check]');
  const btnReveal = el.querySelector('[data-act=reveal]');
  const btnRetry = el.querySelector('[data-act=retry]');
  el.querySelectorAll('.opt').forEach((l) => l.classList.remove('right', 'wrong', 'chosen'));
  el.classList.remove('is-ok', 'is-bad');
  if (!rec) {
    inputs.forEach((i) => {
      i.disabled = false;
      i.checked = false;
    });
    fb.hidden = true;
    st.textContent = '';
    st.className = 'state';
    btnCheck.hidden = false;
    btnCheck.disabled = true;
    btnReveal.hidden = false;
    btnRetry.hidden = true;
    return;
  }
  inputs.forEach((inp) => {
    const k = Number(inp.value);
    const label = inp.closest('.opt');
    inp.disabled = true;
    inp.checked = rec.pick === k;
    if (k === ex.answer) label.classList.add('right');
    else if (rec.pick === k) label.classList.add('wrong');
  });
  const correct = rec.pick === ex.answer;
  const revealedOnly = rec.pick === null || rec.pick === undefined;
  fb.hidden = false;
  fb.className = `feedback ${revealedOnly ? '' : correct ? 'ok' : 'bad'}`;
  fb.innerHTML =
    `<b>${revealedOnly ? 'Correction' : correct ? 'Bonne réponse' : 'Pas tout à fait'}</b>` +
    `<div>${revealedOnly || !correct ? `La bonne réponse est : <strong>${ex.options[ex.answer]}</strong>. ` : ''}${ex.explain}</div>`;
  st.textContent = revealedOnly ? 'Correction consultée' : correct ? 'Réussi' : 'À revoir';
  st.className = `state ${revealedOnly ? '' : correct ? 'ok' : 'bad'}`;
  if (!revealedOnly) el.classList.add(correct ? 'is-ok' : 'is-bad');
  btnCheck.hidden = true;
  btnReveal.hidden = true;
  btnRetry.hidden = false;
}

function paintOpen(el, rec) {
  const fb = el.querySelector('.feedback');
  const st = el.querySelector('.state');
  const btn = el.querySelector('[data-act=show]');
  const ta = el.querySelector('textarea');
  const text = rec && typeof rec.text === 'string' ? rec.text : '';
  if (ta.value !== text && document.activeElement !== ta) ta.value = text;
  const shown = !!(rec && rec.shown);
  fb.hidden = !shown;
  btn.textContent = shown ? 'Masquer la correction' : 'Voir la correction';
  el.querySelectorAll('[data-self]').forEach((b) => {
    b.className = `btn${rec && rec.self === b.dataset.self ? ` on-${b.dataset.self}` : ''}`;
  });
  const self = rec && rec.self;
  st.textContent =
    self === 'ok'
      ? 'Maîtrisé'
      : self === 'mid'
        ? 'Partiellement'
        : self === 'bad'
          ? 'À revoir'
          : shown
            ? 'Correction consultée'
            : '';
  st.className = `state ${self === 'ok' ? 'ok' : self === 'bad' ? 'bad' : ''}`;
}

function paintAll() {
  document.querySelectorAll('.exo').forEach((el) => {
    const id = el.dataset.exo;
    if (el.dataset.kind === 'qcm') paintQcm(el, findExercise(id), progress.qcm[id] || null);
    else paintOpen(el, progress.open[id]);
  });
  updateProgress();
}

// ---------------------------------------------------------------- Progression

function updateProgress() {
  const s = moduleStats(mod, progress);
  for (const ns of s.notions) {
    const n = ns.notion;
    const tally = document.querySelector(`[data-tally="${n.id}"]`);
    if (tally) tally.textContent = `QCM ${ns.qcmOk}/${ns.qcmTotal} justes · ${ns.done}/${ns.total} faits`;
    const score = document.querySelector(`[data-score="${n.id}"]`);
    if (score) score.textContent = ns.done ? `${ns.done}/${ns.total}` : '';
    const num = document.querySelector(`[data-num="${n.id}"]`);
    if (num) num.classList.toggle('done', ns.complete);
  }
  $('railPct').textContent = `${s.pct} %`;
  $('bar').style.width = `${s.total ? (s.done / s.total) * 100 : 0}%`;
  $('progressText').textContent = `${s.done} / ${s.total}`;
  const railExam = $('railExam');
  if (railExam) railExam.textContent = s.exam.done ? `${s.exam.ok}/${s.exam.total}` : '';
  for (const m of MODULES) {
    const cell = document.querySelector(`[data-mod="${m.id}"]`);
    if (cell) cell.textContent = `${moduleStats(m, progress).pct} %`;
  }
  const resume = $('resumeLink');
  if (resume) {
    resume.hidden = !s.started || !s.resume;
    if (s.resume) {
      resume.href = `#${s.resume.id}`;
      resume.textContent = `Reprendre : ${notions.indexOf(s.resume) + 1}. ${s.resume.short} →`;
    }
  }
  updateExam();
}

function updateExam() {
  const box = $('examResult');
  if (!box) return;
  const { done, ok, total } = examStats(mod, progress);
  let verdict = 'Répondez aux questions : le score se met à jour à chaque validation.';
  if (done === total) {
    const pct = ok / total;
    verdict =
      pct >= 0.8
        ? 'Excellent : vous maîtrisez ce module. Passez à la pratique sur un cas réel.'
        : pct >= 0.6
          ? 'Bon niveau. Relisez les notions des questions ratées, puis retentez.'
          : 'Reprenez les notions correspondantes (liens dans le sommaire) et refaites leurs exercices.';
  }
  box.innerHTML = `<span class="big">${ok} / ${total}</span><span>${done} question(s) traitée(s). ${verdict}</span>`;
}

// ---------------------------------------------------------------- Interactions

function bindExercises(root) {
  root.addEventListener('change', (e) => {
    const inp = e.target;
    if (inp.type !== 'radio') return;
    const exo = inp.closest('.exo');
    exo.querySelectorAll('.opt').forEach((l) => l.classList.toggle('chosen', l.contains(inp)));
    exo.querySelector('[data-act=check]').disabled = false;
  });

  root.addEventListener('input', (e) => {
    const ta = e.target.closest('textarea[data-ta]');
    if (!ta) return;
    const id = ta.dataset.ta;
    progress.open[id] = { ...progress.open[id], text: ta.value };
    persist();
  });

  root.addEventListener('click', (e) => {
    const copy = e.target.closest('.code .copy');
    if (copy) return copyCode(copy);
    const btn = e.target.closest('[data-act], [data-self]');
    if (!btn) return;
    const exo = btn.closest('.exo');
    if (!exo) return;
    const id = exo.dataset.exo;
    const ex = findExercise(id);
    if (!ex) return;
    const act = btn.dataset.act;
    if (act === 'check') {
      const picked = exo.querySelector('input[type=radio]:checked');
      if (!picked) return;
      progress.qcm[id] = { pick: Number(picked.value) };
      paintQcm(exo, ex, progress.qcm[id]);
    } else if (act === 'reveal') {
      progress.qcm[id] = { pick: null };
      paintQcm(exo, ex, progress.qcm[id]);
    } else if (act === 'retry') {
      delete progress.qcm[id];
      paintQcm(exo, ex, null);
    } else if (act === 'show') {
      const rec = { ...progress.open[id] };
      rec.shown = !rec.shown;
      progress.open[id] = rec;
      paintOpen(exo, rec);
    } else if (btn.dataset.self) {
      const rec = { ...progress.open[id], shown: true };
      rec.self = rec.self === btn.dataset.self ? null : btn.dataset.self;
      progress.open[id] = rec;
      paintOpen(exo, rec);
    }
    persist(true);
    updateProgress();
  });
}

function copyCode(btn) {
  const codeEl = btn.parentElement.querySelector('code');
  const done = (ok) => {
    btn.textContent = ok ? 'Copié' : 'Sélectionné';
    setTimeout(() => {
      btn.textContent = 'Copier';
    }, 1600);
  };
  const selectFallback = () => {
    const r = document.createRange();
    r.selectNodeContents(codeEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    done(false);
  };
  navigator.clipboard.writeText(codeEl.textContent).then(() => done(true), selectFallback);
}

// ---------------------------------------------------------------- Thème : système → clair → sombre

const THEME_ICONS = {
  system:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};
const THEME_LABEL = { system: 'Thème : système', light: 'Thème : clair', dark: 'Thème : sombre' };

function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  const btn = $('themeBtn');
  btn.innerHTML = THEME_ICONS[t];
  btn.title = THEME_LABEL[t];
  btn.setAttribute('aria-label', THEME_LABEL[t]);
}

// ---------------------------------------------------------------- Dernière notion lue

let lastTimer = 0;
function rememberNotion(anchor) {
  if (!notions.some((n) => n.id === anchor)) return;
  if (progress.last && progress.last.module === mod.id && progress.last.anchor === anchor) return;
  clearTimeout(lastTimer);
  lastTimer = setTimeout(() => {
    progress.last = { module: mod.id, anchor, ts: Date.now() };
    persist(true);
    updateProgress();
  }, 1500);
}

function scrollToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target) return;
  target.scrollIntoView();
  target.classList.remove('flash');
  void target.offsetWidth; // relance l'animation
  target.classList.add('flash');
}

// ---------------------------------------------------------------- Démarrage

async function start() {
  document.title = `${mod.title} · Training`;
  document.body.classList.add(`mod-${mod.id}`);
  let theme = readTheme();
  applyTheme(theme);
  $('themeBtn').addEventListener('click', () => {
    theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* stockage indisponible : thème non mémorisé */
    }
  });

  progress = await getProgress();
  renderModules();
  $('content').innerHTML =
    `<div class="col">${renderHero()}${renderPartHead()}${notions.map(renderNotion).join('')}${renderExtras()}` +
    '<footer class="site-foot mod-foot"><span>Training · Allshare Tools Kit · progression enregistrée dans l\'extension.</span>' +
    '<span>Contenu OLAP et APEX repris de la formation OLAP &amp; APEX Training.</span></footer></div>';
  renderRail();
  renderGlossary('');
  for (const n of notions) {
    if (typeof n.mount !== 'function') continue;
    try {
      n.mount(document.getElementById(n.id));
    } catch (e) {
      console.error(n.id, e);
    }
  }
  bindExercises(document.body);
  paintAll();

  const gs = $('glossSearch');
  if (gs) gs.addEventListener('input', () => renderGlossary(gs.value));

  // Menu sur petit écran
  const rail = $('rail');
  const menuBtn = $('menuBtn');
  menuBtn.addEventListener('click', () => {
    const open = rail.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  rail.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      rail.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Réinitialisation du module (confirmation dans la page)
  const rb = $('resetBtn');
  const rc = $('resetConfirm');
  rb.addEventListener('click', () => {
    rc.hidden = false;
    rb.hidden = true;
  });
  $('resetNo').addEventListener('click', () => {
    rc.hidden = true;
    rb.hidden = false;
  });
  $('resetYes').addEventListener('click', () => {
    progress = resetModule(progress, mod.id);
    persist(true);
    document.querySelectorAll('.exo textarea').forEach((ta) => {
      ta.value = '';
    });
    paintAll();
    rc.hidden = true;
    rb.hidden = false;
    toast(`Module ${mod.label} réinitialisé`);
  });

  // Sauvegarde de la progression : export JSON, import par fusion (une réponse locale est conservée)
  $('exportBtn').addEventListener('click', () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(
      JSON.stringify(progressBackup(progress), null, 2),
      `training-progression-${stamp}.json`,
      'application/json',
    );
  });
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = readProgressBackup(JSON.parse(await file.text()));
      progress = mergeProgress(progress, incoming);
      persist(true);
      paintAll();
      toast('Progression importée');
    } catch (err) {
      toast(err instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : err.message);
    }
  });

  // Sommaire : section active, et dernière notion lue (bouton « Reprendre » du panneau)
  const links = new Map();
  document.querySelectorAll('[data-link]').forEach((a) => links.set(a.dataset.link, a));
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('active'));
        const a = links.get(en.target.id);
        if (a) {
          a.classList.add('active');
          const r = rail.getBoundingClientRect();
          const b = a.getBoundingClientRect();
          if (b.top < r.top || b.bottom > r.bottom) rail.scrollTop += b.top - r.top - r.height / 2;
        }
        rememberNotion(en.target.id);
      }
    },
    { rootMargin: '-30% 0px -65% 0px' },
  );
  document.querySelectorAll('section.notion').forEach((s) => io.observe(s));

  // Progression modifiée ailleurs (panneau, autre onglet) : on repeint sans toucher à la saisie en cours
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[TRAINING_KEY]) return;
    const next = normalize(changes[TRAINING_KEY].newValue);
    if (JSON.stringify(next) === lastWritten) return;
    progress = next;
    paintAll();
  });

  window.addEventListener('hashchange', scrollToHash);
  if (location.hash) scrollToHash();
  document.documentElement.dataset.ready = '1';
}

start();
