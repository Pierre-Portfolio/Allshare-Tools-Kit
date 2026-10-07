// Training : progression des modules (Métier RH, OLAP, APEX), partagée entre le panneau latéral
// et la page de formation.
//
// chrome.storage.local
//   training  {
//     qcm:  { [exercice]: { pick } }               réponse choisie (index d'origine ; null = correction consultée)
//     open: { [exercice]: { text, shown, self } }  question ouverte : réponse saisie, correction affichée,
//                                                  auto-évaluation 'ok' | 'mid' | 'bad'
//     last: { module, anchor, ts }                 dernière notion lue (bouton « Reprendre »)
//   }
//   Identifiants d'exercice : « olap-3-e2 » (notion olap-3, exercice 2), « rh-exam-4 » (examen du module rh).

import { MODULES, moduleById } from '../training/content/index.js';
import { showExtensionPage } from './tabs.js';

export { MODULES, moduleById };

export const TRAINING_KEY = 'training';

export const emptyProgress = () => ({ qcm: {}, open: {}, last: null });

/** Identifiant d'un exercice de notion (1er exercice = e1). */
export const exoId = (notion, i) => `${notion.id}-e${i + 1}`;

/** Identifiant d'une question d'examen (1re question = exam-1). */
export const examId = (module, i) => `${module.id}-exam-${i + 1}`;

/** Progression lue telle quelle, complétée si besoin (données anciennes ou absentes). */
export function normalize(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    qcm: p.qcm && typeof p.qcm === 'object' ? p.qcm : {},
    open: p.open && typeof p.open === 'object' ? p.open : {},
    last: p.last && p.last.module ? p.last : null,
  };
}

// ---------------------------------------------------------------- Statistiques

/** Un exercice est « fait » : QCM validé (ou correction consultée), question ouverte corrigée ou auto-évaluée. */
function isDone(ex, id, progress) {
  if (ex.type === 'qcm') return !!progress.qcm[id];
  const r = progress.open[id];
  return !!(r && (r.shown || r.self));
}

export function notionStats(notion, progress) {
  let qcmOk = 0;
  let qcmDone = 0;
  let qcmTotal = 0;
  let openDone = 0;
  let openTotal = 0;
  notion.exercises.forEach((ex, i) => {
    const id = exoId(notion, i);
    if (ex.type === 'qcm') {
      qcmTotal++;
      const r = progress.qcm[id];
      if (r) {
        qcmDone++;
        if (r.pick === ex.answer) qcmOk++;
      }
    } else {
      openTotal++;
      if (isDone(ex, id, progress)) openDone++;
    }
  });
  const done = qcmDone + openDone;
  const total = qcmTotal + openTotal;
  return { qcmOk, qcmDone, qcmTotal, openDone, openTotal, done, total, complete: total > 0 && done === total };
}

export function examStats(module, progress) {
  let done = 0;
  let ok = 0;
  (module.exam || []).forEach((q, i) => {
    const r = progress.qcm[examId(module, i)];
    if (r) {
      done++;
      if (r.pick === q.answer) ok++;
    }
  });
  return { done, ok, total: (module.exam || []).length };
}

/**
 * Progression d'un module : exercices des notions faits (l'examen est compté à part),
 * notions terminées et notion à reprendre (la dernière lue, sinon la première non terminée).
 */
export function moduleStats(module, progress) {
  let done = 0;
  let total = 0;
  let complete = 0;
  const notions = module.notions.map((n) => {
    const s = notionStats(n, progress);
    done += s.done;
    total += s.total;
    if (s.complete) complete++;
    return { notion: n, ...s };
  });
  const firstTodo = notions.find((s) => !s.complete);
  const last = progress.last && progress.last.module === module.id ? progress.last.anchor : null;
  const lastNotion = last && notions.find((s) => s.notion.id === last);
  const resume = (lastNotion && !lastNotion.complete ? lastNotion : firstTodo) || null;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    complete,
    notions,
    exam: examStats(module, progress),
    resume: resume ? resume.notion : null,
    started: done > 0 || !!lastNotion,
  };
}

export function overallStats(progress, modules = MODULES) {
  let done = 0;
  let total = 0;
  for (const m of modules) {
    const s = moduleStats(m, progress);
    done += s.done;
    total += s.total;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Compteur de l'accueil sous Training : « 42 exercices faits · 28 % », vide si rien n'est commencé. */
export function trainingCountText(progress, modules = MODULES) {
  const { done, pct } = overallStats(progress, modules);
  if (!done) return '';
  return `${done} exercice${done > 1 ? 's' : ''} fait${done > 1 ? 's' : ''} · ${pct} %`;
}

/** Oublie les réponses d'un module (bouton « Réinitialiser ce module »). */
export function resetModule(progress, moduleId) {
  const keep = (obj) => Object.fromEntries(Object.entries(obj).filter(([id]) => !id.startsWith(`${moduleId}-`)));
  return {
    qcm: keep(progress.qcm),
    open: keep(progress.open),
    last: progress.last && progress.last.module === moduleId ? null : progress.last,
  };
}

/**
 * Fusionne deux progressions (import d'une sauvegarde) : une réponse déjà présente localement est
 * gardée, les autres sont ajoutées ; la dernière notion lue est la plus récente des deux.
 */
export function mergeProgress(local, incoming) {
  const a = normalize(local);
  const b = normalize(incoming);
  const lastA = a.last ? a.last.ts || 0 : -1;
  const lastB = b.last ? b.last.ts || 0 : -1;
  return {
    qcm: { ...b.qcm, ...a.qcm },
    open: { ...b.open, ...a.open },
    last: lastB > lastA ? b.last : a.last,
  };
}

/** Fichier de sauvegarde de la progression (bouton « Exporter ma progression »). */
export const BACKUP_FORMAT = 'allshare-training';

export function progressBackup(progress, date = new Date()) {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: date.toISOString(), progress: normalize(progress) };
}

/** Lit une sauvegarde de progression ; lève une erreur si le fichier n'en est pas une. */
export function readProgressBackup(data) {
  if (!data || data.format !== BACKUP_FORMAT || !data.progress || typeof data.progress !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde de progression Training.");
  }
  return normalize(data.progress);
}

/**
 * Ordre d'affichage des options d'un QCM : mélangé, mais toujours le même pour un exercice donné
 * (la bonne réponse n'est pas toujours au même endroit, et l'ordre ne change pas d'une visite à l'autre).
 * Les réponses sont enregistrées avec l'index d'origine.
 */
export function optionOrder(id, n) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ---------------------------------------------------------------- Navigateur

export async function getProgress() {
  return normalize((await chrome.storage.local.get(TRAINING_KEY))[TRAINING_KEY]);
}

export async function saveProgress(progress) {
  await chrome.storage.local.set({ [TRAINING_KEY]: normalize(progress) });
}

/** Adresse de la page de formation sur un module (et, au besoin, une notion). */
export function trainingUrl(moduleId, anchor) {
  const base = chrome.runtime.getURL('training/training.html');
  return `${base}?m=${encodeURIComponent(moduleId)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}

/**
 * Ouvre la page de formation : réutilise son onglet s'il est déjà ouvert (même module : simple
 * changement d'ancre, sans rechargement), sinon en ouvre un nouveau.
 */
export function openTraining(moduleId, anchor) {
  return showExtensionPage(chrome.runtime.getURL('training/training.html'), trainingUrl(moduleId, anchor));
}
