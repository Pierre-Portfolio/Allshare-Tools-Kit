// Last connection Users : dernière connexion de chaque utilisateur d'un journal de connexions, une ligne
// par connexion : « 13/04/2026;12:13:59;JEAN.DUPONT;GRP_CG_028;RW;244 » (date ; heure ; utilisateur ;
// groupe ; accès ; suite ignorée). Fonctions pures (testables avec Node), sauf la partie « Navigateur ».
//
// Dates JJ/MM/AAAA, MM/JJ/AAAA (certains postes écrivent « 04/19/2026 ») ou AAAA-MM-JJ, dans le même
// journal. Une date comme 05/04/2026 se lit dans les deux sens : elle suit le format des autres dates du
// même utilisateur, sinon celui qui la place au plus près de la ligne précédente du journal (lignes
// chronologiques), sinon JJ/MM/AAAA.

import { csvText } from './report.js';
import { compareNames } from './names.js';
import { fmtDate } from './format.js';

/** Inactif depuis au moins ce nombre de jours : en jaune, puis en orange. */
export const INACTIVE_WARN = 30;
export const INACTIVE_CRIT = 90;
/** Numéros des lignes ignorées gardés pour l'affichage. */
const MAX_IGNORED = 10;

const DAY = 864e5;
const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Texte d'un fichier : UTF-16 (avec BOM), UTF-8, sinon ANSI (Windows-1252). */
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Instant local, ou null si la date n'existe pas (31/02, mois 13…). */
function stamp(y, month, day, [h, mi, s]) {
  const d = new Date(y, month - 1, day, h, mi, s);
  return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? d.getTime() : null;
}

/** Une ligne du journal : utilisateur et lectures possibles de la date (null si la ligne n'en est pas une). */
function parseLine(text, line) {
  const sep = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
  const [date = '', time = '', user = '', group = '', access = ''] = text.split(sep).map((f) => f.trim());
  const t = TIME.exec(time);
  if (!t || !user) return null;
  const hms = [Number(t[1]), Number(t[2]), Number(t[3] || 0)];
  if (hms[0] > 23 || hms[1] > 59 || hms[2] > 59) return null;
  // dmy / mdy : lectures JJ/MM et MM/JJ (AAAA-MM-JJ rangée dans dmy) ; only : format prouvé par la date
  const entry = { line, user, key: user.toUpperCase(), group, access, dmy: null, mdy: null, only: null };
  const iso = ISO.exec(date);
  if (iso) {
    entry.dmy = stamp(Number(iso[1]), Number(iso[2]), Number(iso[3]), hms);
    return entry.dmy === null ? null : entry;
  }
  const m = SLASH.exec(date);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  entry.dmy = stamp(y, b, a, hms);
  entry.mdy = a === b ? null : stamp(y, a, b, hms); // 05/05 : même date dans les deux sens
  if (entry.dmy === null && entry.mdy === null) return null;
  if (a !== b) entry.only = entry.mdy === null ? 'dmy' : entry.dmy === null ? 'mdy' : null;
  return entry;
}

/** Lecture la plus proche d'un instant de référence. */
const closest = (e, ref) => (Math.abs(e.mdy - ref) < Math.abs(e.dmy - ref) ? 'mdy' : 'dmy');

/**
 * Lignes reconnues du journal, dates lues ; une première ligne non reconnue est un en-tête.
 * @returns {{entries: {line, ts, user, key, group, access, us: boolean}[], ignored: number[]}}
 *   line : numéro de ligne (à partir de 1), us : date lue au format MM/JJ/AAAA
 */
export function parseLog(text) {
  const entries = [];
  const ignored = [];
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/);
  let header = true;
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const e = parseLine(raw, i + 1);
    if (e) entries.push(e);
    else if (!header) ignored.push(i + 1);
    header = false;
  });

  // Format des dates de chaque utilisateur, d'après celles qui ne se lisent que dans un sens
  const votes = new Map();
  for (const e of entries) {
    if (!e.only) continue;
    if (!votes.has(e.key)) votes.set(e.key, { dmy: 0, mdy: 0 });
    votes.get(e.key)[e.only]++;
  }
  const read = entries.map((e) => {
    if (e.mdy === null) return 'dmy';
    if (e.dmy === null) return 'mdy';
    const v = votes.get(e.key);
    if (v && v.dmy && !v.mdy) return 'dmy';
    if (v && v.mdy && !v.dmy) return 'mdy';
    return null; // lue d'après les lignes voisines
  });
  entries.forEach((e, i) => read[i] && (e.ts = e[read[i]]));
  // Dates restantes : la lecture la plus proche de la ligne précédente (de la suivante en tête du journal)
  let prev = null;
  entries.forEach((e, i) => {
    if (!read[i]) {
      const ref = prev ?? entries.find((x, j) => j > i && read[j])?.ts;
      read[i] = ref === undefined ? 'dmy' : closest(e, ref);
      e.ts = e[read[i]];
    }
    prev = e.ts;
  });
  return { entries: entries.map(({ dmy, mdy, only, ...e }, i) => ({ ...e, us: read[i] === 'mdy' })), ignored };
}

/**
 * Dernière connexion de chaque utilisateur (sans tenir compte des majuscules : « jean.dupont » et
 * « JEAN.DUPONT » sont le même utilisateur, écrit comme dans sa dernière ligne).
 * @returns {{users: {key, user, group, access, last, first, count}[], lines, ignored: number[],
 *   ignoredCount, usDates, from, to}} last / first : instants des connexions, group / access : ceux de la
 *   dernière ligne, lines : lignes reconnues, ignored : premiers numéros des lignes non reconnues,
 *   usDates : dates lues au format MM/JJ/AAAA, from / to : première et dernière date du journal
 */
export function lastConnections(text) {
  const { entries, ignored } = parseLog(text);
  const byUser = new Map();
  for (const e of entries) {
    const u = byUser.get(e.key);
    if (!u) {
      byUser.set(e.key, {
        key: e.key,
        user: e.user,
        group: e.group,
        access: e.access,
        last: e.ts,
        first: e.ts,
        count: 1,
      });
      continue;
    }
    u.count++;
    u.first = Math.min(u.first, e.ts);
    if (e.ts >= u.last) Object.assign(u, { user: e.user, group: e.group, access: e.access, last: e.ts });
  }
  const users = [...byUser.values()];
  return {
    users: sortUsers(users, 'last', -1),
    lines: entries.length,
    ignored: ignored.slice(0, MAX_IGNORED),
    ignoredCount: ignored.length,
    usDates: entries.filter((e) => e.us).length,
    from: users.length ? users.reduce((min, u) => Math.min(min, u.first), Infinity) : null,
    to: users.length ? users.reduce((max, u) => Math.max(max, u.last), -Infinity) : null,
  };
}

// ---------------------------------------------------------------- Tableau

/** Sens de tri au premier clic sur une colonne : dates et nombres du plus grand au plus petit. */
export const SORT_DIR = { user: 1, group: 1, last: -1, count: -1 };

/** Tri par colonne (dir : 1 croissant, -1 décroissant), à égalité par nom d'utilisateur. Fonction pure. */
export function sortUsers(users, key, dir = SORT_DIR[key] || 1) {
  const cmp =
    key === 'user' || key === 'group'
      ? (a, b) => compareNames(a[key] || '', b[key] || '')
      : (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
  return [...users].sort((a, b) => dir * cmp(a, b) || compareNames(a.user, b.user));
}

/** Texte comparé sans accents ni majuscules. */
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Utilisateurs dont le nom ou le groupe contiennent tous les mots cherchés. Fonction pure. */
export function searchUsers(users, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return users;
  return users.filter((u) => {
    const text = fold(`${u.user}\n${u.group}`);
    return words.every((w) => text.includes(w));
  });
}

const dayStart = (ts) => new Date(ts).setHours(0, 0, 0, 0);

/** Jours (calendaires) depuis un instant : 0 le jour même. */
export const daysSince = (ts, now = Date.now()) => Math.max(0, Math.round((dayStart(now) - dayStart(ts)) / DAY));

/** « aujourd'hui », « hier », « 45 j ». */
export const agoText = (days) => (days === 0 ? "aujourd'hui" : days === 1 ? 'hier' : `${days} j`);

/** Classe d'inactivité : '' , 'warn' (30 jours ou plus) ou 'crit' (90 jours ou plus). */
export const inactivity = (days) => (days >= INACTIVE_CRIT ? 'crit' : days >= INACTIVE_WARN ? 'warn' : '');

const pad = (n) => String(n).padStart(2, '0');
/** « 12/10/2026 ». */
export const fmtDay = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
/** « 12/10/2026 17:36 », ou « 12/10/2026 17:36:09 » avec les secondes. */
export const fmtWhen = (ts, seconds = false) => {
  const d = new Date(ts);
  return `${fmtDay(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
};

const nf = new Intl.NumberFormat('fr-FR');
const plural = (n, word) => `${nf.format(n)} ${word}${n > 1 ? 's' : ''}`;

/** « 48 utilisateurs · 1 152 connexions · du 13/04/2026 au 12/10/2026 ». */
export function summaryText(result) {
  const parts = [plural(result.users.length, 'utilisateur'), plural(result.lines, 'connexion')];
  if (result.from !== null) {
    const [from, to] = [fmtDay(result.from), fmtDay(result.to)];
    parts.push(from === to ? `le ${from}` : `du ${from} au ${to}`);
  }
  return parts.join(' · ');
}

/** Lignes non reconnues et dates américaines : « 2 lignes ignorées (format non reconnu) : 7, 12 ». */
export function notesText(result) {
  const notes = [];
  if (result.ignoredCount) {
    const more = result.ignoredCount > result.ignored.length ? '…' : '';
    notes.push(
      `${plural(result.ignoredCount, 'ligne')} ignorée${result.ignoredCount > 1 ? 's' : ''} (format non reconnu) : ` +
        `${result.ignored.join(', ')}${more}`,
    );
  }
  if (result.usDates) {
    notes.push(`${plural(result.usDates, 'date')} lue${result.usDates > 1 ? 's' : ''} au format MM/JJ/AAAA`);
  }
  return notes;
}

/** Compteur de l'accueil : « 48 utilisateurs dans le dernier tableau », vide sans tableau. */
export const lastConnectionCountText = (saved) =>
  saved && saved.result ? `${plural(saved.result.users.length, 'utilisateur')} dans le dernier tableau` : '';

// ---------------------------------------------------------------- Exports

const COLUMNS = [
  ['Utilisateur', (u) => u.user],
  ['Groupe', (u) => u.group],
  ['Dernière connexion', (u) => fmtDate(u.last)],
  ['Inactif depuis (jours)', (u, now) => daysSince(u.last, now)],
  ['Dernier accès', (u) => u.access],
  ['Connexions', (u) => u.count],
  ['Première connexion', (u) => fmtDate(u.first)],
];

/** CSV (point-virgule, UTF-8 avec BOM, lu tel quel par Excel) des utilisateurs, dans l'ordre donné. */
export function usersCsv(users, now = Date.now()) {
  const q = (v) => {
    const s = typeof v === 'number' ? String(v) : csvText(String(v ?? ''));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map(([h]) => q(h)), ...users.map((u) => COLUMNS.map(([, get]) => q(get(u, now))))];
  return '\uFEFF' + lines.map((l) => l.join(';')).join('\r\n') + '\r\n';
}

/** Classeur Excel : une feuille, titre, résumé, puis une ligne par utilisateur (filtres, volets figés). */
export function usersSheets(users, result, name, now = Date.now()) {
  const first = 4; // ligne Excel de l'en-tête
  return [
    {
      name: 'Dernières connexions',
      rows: [
        [{ v: 'Dernière connexion des utilisateurs', s: 'title' }],
        [{ v: `${name} · ${summaryText(result)} · exporté le ${fmtWhen(now)}`, s: 'muted' }],
        [{ v: `Inactif depuis : jaune à ${INACTIVE_WARN} jours ou plus, orange à ${INACTIVE_CRIT}.`, s: 'muted' }],
        COLUMNS.map(([h]) => ({ v: h, s: 'header' })),
        ...users.map((u) => {
          const days = daysSince(u.last, now);
          return [
            { v: u.user, s: 'textBold' },
            { v: u.group, s: 'text' },
            { v: fmtDate(u.last), s: 'text' },
            { v: days, s: inactivity(days) || 'num' },
            { v: u.access, s: 'text' },
            { v: u.count, s: 'num' },
            { v: fmtDate(u.first), s: 'text' },
          ];
        }),
      ],
      cols: [28, 16, 20, 12, 13, 12, 20],
      heights: { [first]: 30 },
      freeze: { rows: first, cols: 1 },
      autoFilter: `A${first}:G${first + Math.max(1, users.length)}`,
    },
  ];
}

// ---------------------------------------------------------------- Navigateur

/**
 * Dernier tableau, gardé jusqu'à la fermeture de Chrome (chrome.storage.session) : il reste affiché
 * quand on change d'outil, et rien n'est conservé ensuite.
 */
export async function getLastConnection() {
  return (await chrome.storage.session.get('lastConnection')).lastConnection || null;
}

export function saveLastConnection(name, result, at = Date.now()) {
  return chrome.storage.session.set({ lastConnection: { name, at, result } });
}

export const clearLastConnection = () => chrome.storage.session.remove('lastConnection');
