// Menu de l'application mesurée : pages proposées dans le formulaire d'Insight (champ « Page »)
// selon la version de l'application, d'après l'analyse des menus et sous-menus de 6 applications
// clientes (2 par version). Plus une page a été rencontrée dans ces applications, plus elle est haut
// dans la liste ; une page vue dans une seule application est proposée aussi, en dernier.

import { normName, nameKey, compareNames } from './names.js';

/**
 * Longueur maximale d'un libellé de la liste : au-delà, la liste déroulante devient plus large
 * que le panneau latéral et déborde sur la page.
 */
export const LABEL_MAX = 34;
/** Fin d'un libellé raccourci gardée en entier (derniers mots). */
const TAIL_MAX = 14;

/**
 * Libellé raccourci à LABEL_MAX caractères : début et derniers mots du nom
 * (« Ecart Budgétaire… par Rubriques »), qui distinguent deux pages au début commun.
 */
export function fitLabel(text) {
  if (text.length <= LABEL_MAX) return text;
  const words = text.split(' ');
  let tail = words.pop();
  while (words.length > 1 && tail.length + words.at(-1).length + 1 <= TAIL_MAX) tail = `${words.pop()} ${tail}`;
  if (tail.length > TAIL_MAX) return `${text.slice(0, LABEL_MAX - 1).trimEnd()}…`;
  const head = text.slice(0, LABEL_MAX - tail.length - 2).replace(/[\s\-–/,.]+$/, '');
  return `${head}… ${tail}`;
}

/** Versions de l'application couvertes par l'analyse, de la plus ancienne à la plus récente. */
export const VERSIONS = ['3.19.10', '3.24.01', '3.28.00'];
/** Applications examinées pour chaque version. */
export const APPS_PER_VERSION = 2;
/** Applications examinées en tout : les occurrences d'une page se comptent sur ce total. */
export const APPS_TOTAL = VERSIONS.length * APPS_PER_VERSION;

/** Page d'accueil : hors des menus, dans toutes les versions ; proposée tout en haut de la liste. */
export const HOME = 'Dashboard';

/**
 * Analyse des menus : [M (menu) ou S (sous-menu), libellé, nombre d'applications où il apparaît
 * en 3.19.10, 3.24.01 et 3.28.00].
 */
const RAW = [
  ['M', 'Masse Salariale', 2, 2, 2],
  ['M', 'Fiche Salarié', 2, 2, 0],
  ['M', 'RH Suivi Effectifs', 2, 2, 0],
  ['M', 'KPI RH', 0, 1, 2],
  ['M', 'Listes des employés', 2, 1, 0],
  ['M', 'Administration', 1, 1, 0],
  ['M', 'Collaborateurs', 0, 0, 2],
  ['M', 'Hyp. Budgetaire', 0, 0, 2],
  ['M', 'Hyp. Budgétaires', 1, 1, 0],
  ['M', 'Hyp. Budgétaire', 0, 1, 0],
  ['M', 'Index F/H', 0, 1, 0],
  ['M', 'Index Égalité FH', 0, 1, 0],
  ['M', 'Listes Collaborateurs', 0, 1, 0],
  ['M', 'NAO', 1, 0, 0],
  ['M', 'Paramètres', 0, 1, 0],
  ['M', 'Publier', 0, 1, 0],
  ['M', 'Reporting Social', 0, 0, 1],
  ['S', 'Analyse des Salaires', 2, 2, 2],
  ['S', 'Ecart Réel', 2, 2, 2],
  ['S', 'Fiche Salarié', 2, 2, 2],
  ['S', 'Liste Annuelle des Salariés', 2, 2, 2],
  ['S', 'Liste Mensuelle des Salariés', 2, 2, 2],
  ['S', 'Livre de Paye', 2, 2, 2],
  ['S', 'Masse Salariale Croisée', 2, 2, 2],
  ['S', 'Tree-View', 2, 2, 2],
  ['S', 'Contrôles des Changements', 1, 2, 2],
  ['S', 'Contrôles Effectifs', 1, 2, 2],
  ['S', 'Ecart Budgétaire', 1, 2, 2],
  ['S', 'Pivot - Liste Mensuelle', 2, 2, 1],
  ['S', 'Pointage des Salariés', 2, 1, 2],
  ['S', 'Saisie Individuelle', 1, 2, 2],
  ['S', 'Absentéisme', 0, 2, 2],
  ['S', 'Embauches Prévisionnelles', 1, 1, 2],
  ['S', 'Modifications de Postes', 1, 1, 2],
  ['S', 'MS par Organisation', 1, 2, 1],
  ['S', 'Suivi Réel / Budget', 0, 2, 2],
  // Comptés avec les libellés coupés de l'analyse en 3.19.10 (« Saisie des enveloppes par rub... » / « ser... »)
  ['S', 'Saisie des enveloppes par rubrique', 1, 2, 1],
  ['S', 'Saisie des enveloppes par service', 1, 2, 1],
  ['S', 'Détail Paye par Salarié', 2, 1, 0],
  ['S', 'Effectif par Catégorie', 2, 1, 0],
  ['S', 'Effectifs Mensuels', 0, 1, 2],
  ['S', 'Hypothèses globales', 0, 1, 2],
  ['S', 'Liste par Rubrique', 0, 1, 2],
  ['S', 'Pyramide', 0, 1, 2],
  ['S', 'Pyramide des Ages', 2, 1, 0],
  ['S', 'Pyramide des Anciennetés', 2, 1, 0],
  ['S', 'Suivi des effectifs', 0, 1, 2],
  ['S', 'Turnover', 0, 1, 2],
  ['S', 'Index Egalité FH', 0, 1, 1],
  ['S', 'Liste par Rubriques', 1, 1, 0],
  ['S', 'Look & feel', 1, 1, 0],
  ['S', 'Paramétrage Avancé', 1, 1, 0],
  ['S', 'Pilotage du Reporting', 1, 1, 0],
  ['S', 'Pilotage module de Saisie', 1, 1, 0],
  ['S', 'Saisie zones de Texte', 1, 1, 0],
  ['S', 'Suivi Activités', 1, 1, 0],
  ['S', 'Traduction', 1, 1, 0],
  ['S', 'Téléchargement de fichiers', 1, 1, 0],
  ['S', 'Absentéisme - détail', 0, 1, 0],
  ['S', 'Analyse des Ecarts', 0, 0, 1],
  ['S', 'Analyse MS', 1, 0, 0],
  ['S', 'Autorisations sur les Dimensions', 0, 1, 0], // « Autorisations sur les Dimen... » dans l'analyse
  ['S', 'Barèmes', 0, 1, 0],
  ['S', 'BDESE', 0, 0, 1],
  ['S', 'Bilan Social', 0, 1, 0],
  ['S', 'Borne Effectif NAO', 1, 0, 0],
  ['S', 'Caractéristiques de la population', 0, 1, 0], // « Caractéristiques de la popul... » dans l'analyse
  ['S', 'Constantes par Catégorie / Contrat', 0, 1, 0],
  ['S', 'Constantes par contrat', 0, 1, 0],
  ['S', 'Constantes par Echelons', 0, 1, 0],
  ['S', 'Contrôle Sécurité', 1, 0, 0],
  ['S', 'Création de postes', 0, 1, 0],
  ['S', 'Ecart Budgétaire - Coûts par OD et par comptes', 0, 1, 0],
  ['S', 'Ecart Budgétaire - Coûts par OD et par Rubriques', 0, 1, 0],
  ['S', 'Effectif Permanent (Déc.)', 1, 0, 0],
  ['S', 'Effectifs CDI', 1, 0, 0],
  ['S', 'Evolution MS', 1, 0, 0],
  ['S', 'Exclusions NAO', 1, 0, 0],
  ['S', 'Exports listes', 0, 1, 0],
  ['S', 'Hypothèse maquette 1/2', 0, 1, 0],
  ['S', 'Hypothèse maquette 2/2', 0, 1, 0],
  ['S', 'Liste', 0, 1, 0],
  ['S', 'Liste annuelle', 0, 1, 0],
  ['S', 'Liste des entrées', 0, 1, 0],
  ['S', 'Liste des sorties', 0, 1, 0],
  ['S', 'Liste par Rubrique avec rub. paie', 0, 1, 0],
  ['S', 'Liste par rubriques (mensuel)', 0, 1, 0],
  ['S', 'MAJ des barèmes', 0, 1, 0],
  ['S', 'Modification Poste', 0, 1, 0],
  ['S', 'Montant Prime par Ancienneté / Catégorie', 0, 1, 0],
  ['S', 'Montants Cotisation retraite / chômage', 0, 1, 0],
  ['S', 'Montants par Catégorie', 0, 1, 0],
  ['S', 'Montants par Catégorie / Service', 0, 1, 0],
  ['S', 'Montants par Catégorie / Site', 0, 1, 0],
  ['S', 'Mouvements des effectifs CDI', 0, 1, 0],
  ['S', 'MS OD Comptables - Coûts par OD', 0, 1, 0],
  ['S', 'MS OD Comptables - Coûts par OD et par Rubriques', 0, 1, 0],
  ['S', 'MS par Centre de coût', 0, 0, 1],
  ['S', 'Notifications', 1, 0, 0],
  ['S', 'Paramètres', 0, 1, 0],
  ['S', 'Primes par Métier', 0, 1, 0],
  ['S', 'Publier', 0, 0, 1],
  ['S', 'Rapprochement embauches ext.', 0, 1, 0],
  ['S', 'Rapprochement mobilités', 0, 1, 0],
  ['S', 'Reporting RH', 0, 1, 0],
  ['S', 'Réintégration salariés NAO', 1, 0, 0],
  ['S', 'Saisie des enveloppes et taux par centre de coût', 0, 0, 1],
  ['S', 'Saisie des enveloppes et taux par rubrique', 0, 0, 1],
  ['S', 'Salaire Brut', 1, 0, 0],
  ['S', 'Salaire Conv./Inscrits', 1, 0, 0],
  ['S', 'Salaire Conv./Permanents', 1, 0, 0],
  ['S', 'Salariés sans poste', 0, 1, 0],
  ['S', 'Suivi des effectifs CDI', 0, 1, 0],
  ['S', 'Suivi des heures supplémentaires', 0, 1, 0],
  ['S', 'Suivi des mouvements', 0, 1, 0],
  ['S', 'Suivi des salariés', 0, 1, 0],
  ['S', 'Suivi des sorties', 0, 1, 0],
  ['S', 'SUM Réel / Budget', 1, 0, 0],
  ['S', 'Tableau de Bord', 0, 1, 0],
  ['S', 'Tblx de Bord Mensuel', 0, 1, 0],
  ['S', 'Tdb. Absentéisme', 0, 1, 0],
  ['S', 'Évolution des effectifs CDI', 0, 1, 0],
];

const KINDS = { M: 'menu', S: 'sous-menu' };

/**
 * Pages de l'analyse : { name, kinds, counts (applications par version), total (sur APPS_TOTAL) }.
 * Un libellé à la fois menu et sous-menu (« Fiche Salarié ») est une seule page.
 */
export const PAGES = (() => {
  const byKey = new Map();
  for (const [kind, name, ...counts] of RAW) {
    const page = byKey.get(nameKey(name));
    if (!page) {
      byKey.set(nameKey(name), { name, kinds: [KINDS[kind]], counts });
    } else {
      if (!page.kinds.includes(KINDS[kind])) page.kinds.push(KINDS[kind]);
      page.counts = page.counts.map((n, i) => Math.max(n, counts[i]));
    }
  }
  return [...byKey.values()].map((p) => ({ ...p, total: p.counts.reduce((sum, n) => sum + n, 0) }));
})();
const PAGE_KEYS = new Set(PAGES.map((p) => nameKey(p.name)));

/** Noms des pages connues de l'analyse, page d'accueil comprise (orthographe de référence). */
export const PAGE_NAMES = [HOME, ...PAGES.map((p) => p.name)];

// ---------------------------------------------------------------- Versions

/** Numéros d'une version : « 3.28.00 » -> [3, 28, 0]. */
const numbers = (version) => (normName(version).match(/\d+/g) || []).map(Number);

/** Compare deux versions numéro par numéro : « 3.28 » = « 3.28.00 » < « 3.30 ». */
export function compareVersions(a, b) {
  const x = numbers(a);
  const y = numbers(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] || 0) - (y[i] || 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** Même version : mêmes numéros (« 3.28 » et « 3.28.00 »), ou même texte pour une version sans numéro. */
export function sameVersion(a, b) {
  if (!normName(a) || !normName(b)) return false;
  return numbers(a).length && numbers(b).length ? compareVersions(a, b) === 0 : nameKey(a) === nameKey(b);
}

/**
 * Version de l'analyse dont les menus sont proposés : la version elle-même si elle a été analysée ;
 * sinon la dernière analysée avant elle (une nouvelle version garde l'essentiel des menus de la
 * précédente), la plus ancienne pour une version antérieure, la plus récente pour une version sans numéro.
 * @returns {{ ref: string, why: 'exact' | 'before' | 'oldest' | 'latest' } | null} null sans version
 */
export function analysedVersion(version) {
  if (!normName(version)) return null;
  if (!numbers(version).length) return { ref: VERSIONS.at(-1), why: 'latest' };
  const exact = VERSIONS.find((v) => compareVersions(v, version) === 0);
  if (exact) return { ref: exact, why: 'exact' };
  const before = VERSIONS.filter((v) => compareVersions(v, version) < 0).at(-1);
  return before ? { ref: before, why: 'before' } : { ref: VERSIONS[0], why: 'oldest' };
}

// ---------------------------------------------------------------- Pages proposées

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Groupe d'une page de l'analyse : nombre d'applications (sur 6) où elle a été rencontrée. */
function tierLabel(total) {
  const label = `${total}/${APPS_TOTAL} application${total > 1 ? 's' : ''}`;
  if (total === APPS_TOTAL) return `${label} · communes`;
  return total === 1 ? `${label} · rares` : label;
}

const kindText = (kinds) => (kinds.length > 1 ? 'Menu et sous-menu' : kinds[0] === 'menu' ? 'Menu' : 'Sous-menu');

/** Pages des mesures retenues, avec leurs clients ; les plus mesurées (en clients) d'abord. */
function tally(measures, keep) {
  const found = new Map();
  for (const m of measures) {
    if (!m || !normName(m.page) || !keep(m)) continue;
    const key = nameKey(m.page);
    if (!found.has(key)) found.set(key, { name: normName(m.page), clients: new Set() });
    found.get(key).clients.add(nameKey(m.app));
  }
  return [...found.values()].sort((a, b) => b.clients.size - a.clients.size || compareNames(a.name, b.name));
}

/**
 * Pages proposées pour une version, par groupes :
 *  1. les pages de l'analyse présentes dans cette version (ou dans la version analysée retenue,
 *     voir analysedVersion), de la plus courante à la plus rare : un groupe par nombre
 *     d'applications sur 6 (« 6/6 applications · communes » … « 1/6 application · rares ») ;
 *  2. les pages déjà mesurées sur cette version et absentes de ces groupes, les plus mesurées
 *     d'abord : une nouvelle version s'enrichit ainsi, au fil des mesures, des pages qui lui sont propres ;
 *  3. les pages déclarées spécifiques pour ce client.
 * La page d'accueil (HOME), toujours proposée, est dans `order` mais dans aucun groupe.
 * `available(page)` : la page existe-t-elle dans cette version ? Non seulement pour une page de
 * l'analyse absente de cette version et jamais mesurée dessus (toujours oui sans version).
 */
export function pageChoices({ version = '', client = '', measures = [] } = {}) {
  const analysed = analysedVersion(version);
  const offered = new Set([nameKey(HOME)]);
  const groups = [];
  const add = (label, pages) => {
    const fresh = pages.filter((p) => !offered.has(nameKey(p.name)));
    for (const p of fresh) offered.add(nameKey(p.name));
    if (fresh.length) groups.push({ label, pages: fresh });
    return fresh.length;
  };
  if (analysed) {
    const col = VERSIONS.indexOf(analysed.ref);
    const present = PAGES.filter((p) => p.counts[col] > 0).sort(
      (a, b) => b.counts[col] - a.counts[col] || compareNames(a.name, b.name),
    );
    for (let total = APPS_TOTAL; total > 0; total--) {
      add(
        tierLabel(total),
        present
          .filter((p) => p.total === total)
          .map((p) => ({
            name: p.name,
            label: p.kinds.includes('sous-menu') ? p.name : `${p.name} (menu)`,
            title:
              `${kindText(p.kinds)} · ${plural(total, 'application')} sur ${APPS_TOTAL}` +
              ` · ${p.counts[col]}/${APPS_PER_VERSION} en ${analysed.ref}`,
          })),
      );
    }
  }
  const v = normName(version);
  const measured = v
    ? add(
        `Mesurées en ${v} · hors analyse`,
        tally(measures, (m) => !m.specific && sameVersion(m.version, v)).map((p) => ({
          name: p.name,
          label: p.name,
          title: `Mesurée chez ${plural(p.clients.size, 'client')} en ${v}`,
        })),
      )
    : 0;
  if (normName(client)) {
    add(
      'Spécifiques à ce client',
      tally(measures, (m) => m.specific && nameKey(m.app) === nameKey(client)).map((p) => ({
        name: p.name,
        label: p.name,
        title: 'Page spécifique de ce client',
      })),
    );
  }
  return {
    analysed,
    measured,
    groups,
    order: [HOME, ...groups.flatMap((g) => g.pages.map((p) => p.name))],
    available: (name) => !analysed || offered.has(nameKey(name)) || !PAGE_KEYS.has(nameKey(name)),
  };
}
