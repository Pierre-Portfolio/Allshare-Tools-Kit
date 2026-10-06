// Menu de l'application mesurée : pages standard proposées dans le formulaire
// (champ « Page »), dans l'ordre du menu, regroupées par rubrique.

/**
 * Longueur maximale d'un libellé de la liste : au-delà, la liste déroulante devient plus large
 * que le panneau latéral et déborde sur la page.
 */
export const LABEL_MAX = 34;

/** Libellé raccourci à LABEL_MAX caractères (« … »), pour les pages saisies librement. */
export const fitLabel = (text) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trimEnd()}…` : text);

/**
 * Page d'une sous-rubrique : affichée « Abrégé › Page » (nom complet de la sous-rubrique en
 * info-bulle), enregistrée sous son seul nom.
 */
const sub = (parent, name, short = parent) => ({ name, label: `${short} › ${name}`, title: `${parent} › ${name}` });

/**
 * Rubriques du menu, dans l'ordre. Une rubrique sans `pages` est un lien direct
 * (pas de sous-menu) : c'est elle-même la page.
 */
const RAW = [
  { title: 'Dashboard' },
  { title: 'Fiche Salarié', pages: ['Fiche Salarié', 'Détail Paye par Salarié'] },
  {
    title: 'Listes Collaborateurs',
    pages: [
      'Tree-View',
      'Liste Mensuelle',
      'Liste Annuelle',
      'Liste par Rubrique',
      'Pointage des Salariés',
      'Pivot - Liste Mensuelle',
    ],
  },
  {
    title: 'RH Suivi Effectifs',
    pages: [
      'Effectif par Catégorie',
      'Suivi des effectifs',
      'Pyramide - Ancienneté',
      'Pyramide - Age',
      'Analyse des Salaires',
      'Turn-Over',
    ],
  },
  {
    title: 'Masse Salariale',
    pages: [
      'Masse Salariale Croisée',
      'MS par Organisation',
      'Liste Annuelle (Diffusion)',
      'Ecart Réel',
      'Suivi Réel / Budget',
      'Ecart Budgétaire',
      'Ecart Budgétaire Bis',
      'Analyse des Ecarts',
      'Livre de Paye',
      'Diffusion CDG',
    ],
  },
  {
    title: 'Hyp. Budgétaires',
    pages: [
      'Modifications de Postes',
      'Embauches Prévisionnelles',
      'Saisie Individuelle',
      'Saisie des enveloppes par service',
      'Saisie des enveloppes par rubrique',
      'Hypothèses globales',
      'Contrôles Effectifs',
      'Contrôles des Changements',
    ],
  },
  { title: 'Index Egalité HF', pages: ['Barèmes', 'Liste', 'Tableau de Bord'] },
  { title: 'Absentéisme' },
  { title: 'Publisher' },
  {
    title: 'Finance',
    pages: [
      'Comptes Mensuels',
      'Comptes -Suivi Budgétaire',
      'Calcul Estimé',
      'Comptes par Organisation',
      'Suivi Réel Cumulé',
      sub('Méthode ABC - Synthèse', 'Coûts directs av Répart.', 'ABC'),
      'Saisies Budgétaires Finance',
      'Ecriture Budgétaire',
    ],
  },
];

/** Rubriques : { title, pages: [{ name, label, title? }] }, `pages` à null pour un lien direct. */
export const MENU = RAW.map((r) => ({
  title: r.title,
  pages: r.pages ? r.pages.map((p) => (typeof p === 'string' ? { name: p, label: p } : p)) : null,
}));

/** Liens directs en tête du menu (« Dashboard ») : affichés tout en haut de la liste. */
export const MENU_TOP = MENU.slice(
  0,
  MENU.findIndex((r) => r.pages),
);

/** Noms des pages du menu, dans l'ordre. */
export const MENU_PAGES = MENU.flatMap((r) => (r.pages ? r.pages.map((p) => p.name) : [r.title]));
