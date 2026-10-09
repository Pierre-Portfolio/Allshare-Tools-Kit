// Menu de l'application mesurée : pages proposées dans le formulaire d'Insight (champ « Page »),
// regroupées par menu dans l'ordre d'affichage de l'application. Menus et sous-menus relevés dans
// plusieurs applications clientes et réunis sans doublon : une page vue dans une seule application
// est rangée juste en dessous de celle qui la précède dans son menu ; une page rencontrée sous
// plusieurs menus est rangée dans celui où elle apparaît le plus souvent.

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

/** Page d'accueil : hors des menus ; proposée tout en haut de la liste. */
export const HOME = 'Dashboard';

/** Menus, dans l'ordre d'affichage, et leurs sous-menus (pages), dans l'ordre d'affichage. */
export const MENU = [
  {
    title: 'NAO',
    pages: [
      'Effectifs CDI',
      'Salaire Conv./Inscrits',
      'Salaire Conv./Permanents',
      'Effectif Permanent (Déc.)',
      'Salaire Brut',
      'Borne Effectif NAO',
      'Exclusions NAO',
      'Réintégration salariés NAO',
    ],
  },
  { title: 'Fiche Salarié', pages: ['Fiche Salarié', 'Détail Paye par Salarié'] },
  { title: 'Listes Collaborateurs', pages: ['Liste par Rubrique avec rub. paie'] },
  {
    title: 'Listes des employés',
    pages: [
      'Tree-View',
      'Liste Mensuelle des Salariés',
      'Liste Annuelle des Salariés',
      'Liste des entrées',
      'Liste des sorties',
      'Liste par Rubrique',
      'Pointage des Salariés',
      'Pivot - Liste Mensuelle',
      'Exports listes',
      'Liste par rubriques (mensuel)',
      'Suivi des salariés',
      'Hypothèse maquette 1/2',
      'Hypothèse maquette 2/2',
    ],
  },
  {
    title: 'RH Suivi Effectifs',
    pages: [
      'Effectif par Catégorie',
      'Pyramide des Anciennetés',
      'Pyramide des Ages',
      'Analyse des Salaires',
      'Absentéisme - détail',
    ],
  },
  { title: 'Index F/H', pages: ['Index Egalité FH', 'MAJ des barèmes', 'Liste annuelle'] },
  { title: 'Publier', pages: ['Tblx de Bord Mensuel', 'Paramètres', 'Tdb. Absentéisme', 'Bilan Social'] },
  {
    title: 'KPI RH',
    pages: ['Turnover', 'Absentéisme', 'Effectifs Mensuels', 'Suivi des effectifs', 'Pyramide', 'Publier'],
  },
  { title: 'Index Égalité FH', pages: ['Tableau de Bord', 'Barèmes', 'Liste'] },
  {
    title: 'Masse Salariale',
    pages: [
      'Masse Salariale Croisée',
      'MS par Centre de coût',
      'MS OD Comptables - Coûts par OD',
      'MS OD Comptables - Coûts par OD et par Rubriques',
      'Analyse MS',
      'MS par Organisation',
      'Suivi des heures supplémentaires',
      'Reporting RH',
      'Ecart Réel',
      'Evolution MS',
      'SUM Réel / Budget',
      'Suivi Réel / Budget',
      'Ecart Budgétaire',
      'Analyse des Ecarts',
      'Ecart Budgétaire - Coûts par OD et par comptes',
      'Ecart Budgétaire - Coûts par OD et par Rubriques',
      'Livre de Paye',
    ],
  },
  {
    title: 'Administration',
    pages: [
      'Saisie zones de Texte',
      'Pilotage du Reporting',
      'Pilotage module de Saisie',
      'Téléchargement de fichiers',
      'Look & feel',
      'Traduction',
      'Suivi Activités',
      'Autorisations sur les Dimensions',
      'Contrôle Sécurité',
      'Notifications',
      'Paramétrage Avancé',
    ],
  },
  {
    title: 'Hyp. Budgétaires',
    pages: [
      'Modification Poste',
      'Création de postes',
      'Suivi des sorties',
      'Suivi des mouvements',
      'Modifications de Postes',
      'Embauches Prévisionnelles',
      'Saisie Individuelle',
      'Saisie des enveloppes et taux par centre de coût',
      'Saisie des enveloppes et taux par rubrique',
      'Saisie des enveloppes par service',
      'Saisie des enveloppes par rubrique',
      'Hypothèses globales',
      'Constantes par Echelons',
      'Montants par Catégorie / Service',
      'Montants par Catégorie',
      'Montants par Catégorie / Site',
      'Constantes par contrat',
      'Constantes par Catégorie / Contrat',
      'Primes par Métier',
      'Montant Prime par Ancienneté / Catégorie',
      'Montants Cotisation retraite / chômage',
      'Contrôles Effectifs',
      'Contrôles des Changements',
      'Caractéristiques de la population',
      'Mouvements des effectifs CDI',
      'Évolution des effectifs CDI',
      'Rapprochement embauches ext.',
      'Rapprochement mobilités',
      'Salariés sans poste',
      'Suivi des effectifs CDI',
    ],
  },
  { title: 'Reporting Social', pages: ['BDESE'] },
];

/** Noms des pages, page d'accueil comprise, dans l'ordre de la liste (orthographe de référence). */
export const PAGE_NAMES = [HOME, ...MENU.flatMap((m) => m.pages)];
const PAGE_KEYS = new Set(PAGE_NAMES.map(nameKey));

/**
 * Pages proposées, par groupes : un groupe par menu (sous-menus dans l'ordre d'affichage), puis
 * les pages déclarées spécifiques pour ce client. La page d'accueil (HOME), toujours proposée,
 * est dans `order` mais dans aucun groupe.
 */
export function pageChoices({ client = '', measures = [] } = {}) {
  const groups = MENU.map((m) => ({ label: m.title, pages: m.pages.map((name) => ({ name, label: name })) }));
  if (normName(client)) {
    const specific = new Map();
    for (const m of measures) {
      if (!m || !m.specific || nameKey(m.app) !== nameKey(client) || !normName(m.page)) continue;
      const key = nameKey(m.page);
      if (!PAGE_KEYS.has(key) && !specific.has(key)) specific.set(key, normName(m.page));
    }
    if (specific.size) {
      groups.push({
        label: 'Spécifiques à ce client',
        pages: [...specific.values()]
          .sort(compareNames)
          .map((name) => ({ name, label: name, title: 'Page spécifique de ce client' })),
      });
    }
  }
  return { groups, order: [HOME, ...groups.flatMap((g) => g.pages.map((p) => p.name))] };
}
