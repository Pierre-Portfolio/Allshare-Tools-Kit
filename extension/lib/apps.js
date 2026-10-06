// Référentiel : import en masse des applications et des pages (copier-coller
// depuis Excel ou fichier CSV), fusion, export, détection des URL en double.

import { parseBase } from './urls.js';
import { newId } from './storage.js';
import { normName, nameKey } from './names.js';

const URL_TOKEN = /^[a-z][a-z0-9+.-]*:\/\//i; // tout ce qui ressemble à une URL (seules http/https sont valides)

/** Nom par défaut d'une appli importée sans nom : hôte + chemin de base. */
export function defaultName(url) {
  const b = parseBase(url);
  return b ? b.hostname + b.path : String(url);
}

/**
 * Lit une liste d'applications, une par ligne :
 *   Nom                (nom seul)
 *   Nom;URL            (ou tabulation : copier-coller de 2 colonnes Excel)
 *   Nom;URL1 | URL2    (plusieurs URL de base)
 *   URL                (le nom est déduit de l'URL)
 * L'URL, facultative, sert à pré-remplir le nom de l'application d'après
 * l'onglet ouvert. Les lignes vides et celles commençant par # sont ignorées,
 * ainsi qu'une éventuelle ligne d'en-tête (« Nom;URL »).
 */
export function parseAppList(text) {
  const entries = [];
  const errors = [];
  let first = true;
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const isFirst = first;
      first = false;
      const hasUrl = /https?:\/\//i.test(line);
      const sep = /[;\t]/.test(line) ? /[;\t]/ : hasUrl ? /,/ : /$^/; // nom seul : pas de découpage
      const names = [];
      const urls = [];
      const bad = [];
      for (const part of line.split(sep)) {
        const p = part
          .trim()
          .replace(/^"(.*)"$/, '$1')
          .trim();
        if (!p) continue;
        const tokens = p.split(/[\s|]+/).filter(Boolean);
        if (tokens.some((t) => URL_TOKEN.test(t))) {
          for (const t of tokens) (parseBase(t) ? urls : bad).push(t);
        } else {
          names.push(p);
        }
      }
      if (isFirst && !urls.length && /^(nom|name|appli|application)s?\b/i.test(line)) return; // en-tête
      if (bad.length) {
        errors.push({ line: i + 1, text: line, reason: `URL invalide : ${bad.join(', ')}` });
        return;
      }
      const name = normName(names.join(' ')) || (urls.length ? defaultName(urls[0]) : '');
      if (!name) return;
      entries.push({ name, urls: [...new Set(urls)] });
    });
  return { entries, errors };
}

/**
 * Fusionne des entrées dans la liste existante : une application de même nom
 * (sans tenir compte de la casse) reçoit les nouvelles URL, sinon elle est créée.
 */
export function mergeApps(existing, entries) {
  const apps = existing.map((a) => ({ ...a, baseUrls: [...(a.baseUrls || [])] }));
  const byName = new Map(apps.map((a) => [nameKey(a.name), a]));
  let added = 0;
  let updated = 0;
  for (const e of entries) {
    const key = nameKey(e.name);
    let app = byName.get(key);
    if (!app) {
      app = { id: newId(), name: normName(e.name), baseUrls: [] };
      apps.push(app);
      byName.set(key, app);
      added++;
      app.baseUrls.push(...e.urls);
      continue;
    }
    const before = app.baseUrls.length;
    for (const u of e.urls) if (!app.baseUrls.includes(u)) app.baseUrls.push(u);
    if (app.baseUrls.length > before) updated++;
  }
  return { apps, added, updated };
}

/** Liste au format « Nom;URL » (réimportable), avec BOM pour Excel. */
export function appsToCsv(apps) {
  const lines = ['Nom;URL'];
  for (const a of apps) lines.push(`${a.name.replace(/[;\t\r\n]/g, ' ')};${(a.baseUrls || []).join(' | ')}`);
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const normBase = (u) => {
  const b = parseBase(u);
  return b ? (b.origin + b.path).toLowerCase() : null;
};

/** appId -> noms des autres applications qui déclarent la même URL de base. */
export function urlConflicts(apps) {
  const owners = new Map();
  for (const a of apps) {
    for (const u of a.baseUrls || []) {
      const k = normBase(u);
      if (!k) continue;
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k).add(a);
    }
  }
  const out = new Map();
  for (const set of owners.values()) {
    if (set.size < 2) continue;
    for (const a of set) {
      const others = [...set].filter((x) => x !== a).map((x) => x.name);
      out.set(a.id, [...new Set([...(out.get(a.id) || []), ...others])]);
    }
  }
  return out;
}

/** Liste de pages, une par ligne (ou une colonne copiée depuis Excel), sans doublon. */
export function parsePageList(text) {
  const seen = new Set();
  const names = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const name = normName(raw.split('\t')[0].replace(/^"(.*)"$/, '$1'));
      if (!name || name.startsWith('#') || seen.has(nameKey(name))) return;
      if (i === 0 && /^pages?$/i.test(name)) return; // en-tête
      seen.add(nameKey(name));
      names.push(name);
    });
  return names;
}
