// Module OLAP : modélisation décisionnelle et SQL analytique (8 notions, examen, mémo, glossaire).
// Repris de la première partie de la formation OLAP & APEX Training.
import { H } from '../helpers.js';
import n1 from './01.js';
import n2 from './02.js';
import n3 from './03.js';
import n4 from './04.js';
import n5 from './05.js';
import n6 from './06.js';
import n7 from './07.js';
import n8 from './08.js';

export default {
  id: 'olap',
  label: 'OLAP',
  title: 'OLAP & modélisation décisionnelle',
  tagline: 'Entrepôt, étoile, cube, hiérarchies, SCD, ROLLUP / CUBE',
  eyebrow: 'Débutant → Intermédiaire',
  lede: "Penser les données en cubes, dimensions et mesures, puis les interroger en SQL analytique Oracle : de « c'est quoi un cube ? » aux sous-totaux, rangs et comparaisons N-1.",
  intro:
    "Huit notions pour passer de « c'est quoi un cube ? » à l'écriture de requêtes analytiques avec sous-totaux, rangs et comparaisons N-1. Chaque notion se termine par 5 exercices corrigés.",
  hero: 'cube',
  notions: [n1, n2, n3, n4, n5, n6, n7, n8],

  exam: [
    {
      q: "Que désigne le <strong>grain</strong> d'une table de faits ?",
      options: [
        'Le nombre de dimensions',
        'Ce que représente exactement une ligne de la table',
        'La taille de la table en Go',
        'Le niveau le plus agrégé de la hiérarchie temps',
      ],
      answer: 1,
      explain:
        "Le grain est la définition d'une ligne de faits (« une ligne = un article sur un ticket »). C'est la décision la plus importante de la modélisation (notion 3).",
    },
    {
      q: 'Le stock est de 40 unités chaque jour de la semaine. Quelle valeur afficher pour « stock de la semaine » ?',
      options: [
        '280 (somme des 7 jours)',
        '40 (valeur de fin de période ou moyenne)',
        '5,7 (280 / 49)',
        'On ne peut rien afficher',
      ],
      answer: 1,
      explain:
        'Le stock est <strong>semi-additif</strong> : il se somme entre produits ou magasins, mais pas sur le temps. On prend la dernière valeur (ou la moyenne) de la période (notion 6).',
    },
    {
      q: 'Combien de regroupements produit <code>GROUP BY CUBE(annee, region, categorie)</code> ?',
      options: ['3', '4', '6', '8'],
      answer: 3,
      explain:
        'CUBE sur n colonnes produit toutes les combinaisons : 2³ = <strong>8</strong>. ROLLUP en produirait n + 1 = 4 (notion 8).',
    },
    {
      q: 'Un client (SCD 2) a déménagé de Lyon à Nantes en juin. Une vente de mars est chargée en retard, en juillet. Quelle clé client utiliser ?',
      options: [
        'La clé de la version courante (Nantes)',
        'La clé de la version valide à la date de la vente (Lyon)',
        'La clé naturelle du client',
        'La clé -1 « Inconnu »',
      ],
      answer: 1,
      explain:
        'On cherche la version dont la période de validité contient la <strong>date de la vente</strong> : <code>date_vente BETWEEN date_debut AND date_fin</code>. La vente de mars reste rattachée à Lyon (notion 6).',
    },
    {
      q: 'Quelle table de faits choisir pour suivre chaque commande à travers ses étapes (commandée, expédiée, livrée) ?',
      options: ['Transactionnelle', 'Snapshot périodique', 'Snapshot cumulatif', 'Factless'],
      answer: 2,
      explain:
        'Le <strong>snapshot cumulatif</strong> a une ligne par commande, mise à jour à chaque étape, avec une date par jalon et des délais calculés (notion 3).',
    },
    {
      q: "Pourquoi Kimball recommande-t-il l'étoile plutôt que le flocon par défaut ?",
      options: [
        'Parce que le flocon ne supporte pas les hiérarchies',
        "Pour des requêtes plus simples et plus rapides, au prix d'une redondance négligeable dans les dimensions",
        "Parce que l'étoile n'a pas de clés étrangères",
        'Parce que le flocon interdit les dimensions conformes',
      ],
      answer: 1,
      explain:
        'Une jointure par dimension, un modèle lisible par les métiers, des optimisations dédiées. La redondance reste faible car les dimensions sont petites face aux faits (notion 4).',
    },
    {
      q: "Dans un cube Région × Catégorie × Temps, l'utilisateur ne garde que l'année 2025. Quelle opération a-t-il faite ?",
      options: ['Un slice', 'Un drill-down', 'Un pivot', 'Un drill-across'],
      answer: 0,
      explain:
        "Fixer <em>une</em> valeur sur <em>une</em> dimension, c'est un <strong>slice</strong> (une tranche du cube), soit un <code>WHERE t.annee = 2025</code>. Restreindre plusieurs dimensions à des sous-ensembles serait un dice (notion 5).",
    },
    {
      q: 'Que permet une vue matérialisée créée avec <code>ENABLE QUERY REWRITE</code> ?',
      options: [
        "D'empêcher toute modification de la table de faits",
        "À l'optimiseur de lire automatiquement l'agrégat précalculé, sans changer les requêtes",
        'De stocker la table de faits en colonnes',
        'De rafraîchir les données sources en temps réel',
      ],
      answer: 1,
      explain:
        "Avec la réécriture de requêtes, une requête écrite sur les faits détaillés est redirigée par l'optimiseur vers la vue matérialisée si elle peut y répondre : les rapports accélèrent sans être modifiés (notion 7).",
    },
    {
      q: 'Que renvoie <code>LAG(ca) OVER (PARTITION BY mois ORDER BY annee)</code> sur une ligne « mars 2025 » ?',
      options: ['Le CA de février 2025', 'Le CA de mars 2024', 'Le CA cumulé depuis janvier', 'Le CA moyen de mars'],
      answer: 1,
      explain:
        "Dans chaque partition (un mois donné), les lignes sont triées par année : <code>LAG</code> renvoie la ligne précédente, donc le <strong>même mois l'année précédente</strong>. C'est la base d'une comparaison N-1 (notion 8).",
    },
    {
      q: 'Où ranger le numéro de ticket de caisse dans une étoile des ventes ?',
      options: [
        'Dans une table dim_ticket avec une clé de substitution',
        'Dans la table de faits, comme dimension dégénérée',
        'Dans dim_temps',
        'Nulle part : il est inutile en décisionnel',
      ],
      answer: 1,
      explain:
        "Le numéro de ticket n'a pas d'autre attribut que lui-même : on le garde dans le fait (<strong>dimension dégénérée</strong>). Il sert à regrouper les lignes d'un même ticket, par exemple pour le panier moyen (notion 3).",
    },
  ],

  memo: `
    <section>
      <h4>Sous-totaux</h4>
      ${H.code(
        'sql',
        `
        GROUP BY ROLLUP(a, b)        -- (a,b) (a) ()        n+1 niveaux
        GROUP BY CUBE(a, b)          -- (a,b) (a) (b) ()    2^n niveaux
        GROUP BY GROUPING SETS((a), (b), ())
        GROUPING(a)        -- 1 si a est agrégée sur la ligne
        GROUPING_ID(a, b)  -- 0 détail, 1 total de a, 3 total général
      `,
      )}
      <h4>Fonctions de fenêtrage</h4>
      ${H.code(
        'sql',
        `
        RANK()       OVER (PARTITION BY cat ORDER BY ca DESC)
        SUM(ca)      OVER (PARTITION BY annee ORDER BY mois
                           ROWS UNBOUNDED PRECEDING)         -- cumul
        AVG(ca)      OVER (ORDER BY mois
                           ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
        LAG(ca)      OVER (PARTITION BY mois ORDER BY annee) -- N-1
        RATIO_TO_REPORT(ca) OVER (PARTITION BY region)       -- part
      `,
      )}
    </section>
    <section>
      <h4>Règles d'agrégation</h4>
      ${H.tbl(
        ['Mesure', 'Agrégation'],
        [
          ['Additive (CA, qté)', '<code>SUM</code> partout'],
          ['Semi-additive (stock)', 'Pas de SUM sur le temps'],
          ['Ratio (taux de marge)', '<code>SUM(num) / SUM(den)</code>'],
          ['Distinct (clients)', 'Recalculer <code>COUNT(DISTINCT)</code>'],
        ],
      )}
      <h4>Opérations</h4>
      ${H.tbl(
        ['Opération', 'SQL'],
        [
          ['Slice / dice', '<code>WHERE</code> (= / <code>IN</code>)'],
          ['Roll-up / drill-down', '<code>GROUP BY</code> niveau + haut / + bas'],
          ['Pivot', '<code>PIVOT (SUM(x) FOR col IN (…))</code>'],
          ['Drill-through', '<code>SELECT</code> détail du fait filtré'],
        ],
      )}
      <h4>SCD</h4>
      ${H.tbl(
        ['Type', 'Effet'],
        [
          ['0', 'Jamais modifié'],
          ['1', "Écrase (pas d'historique)"],
          ['2', 'Nouvelle ligne + dates de validité'],
          ['3', 'Colonne « valeur précédente »'],
        ],
      )}
    </section>
  `,

  glossary: [
    {
      term: 'OLAP',
      def: 'Online Analytical Processing : analyse rapide et multidimensionnelle de grands volumes de données historiques.',
    },
    {
      term: 'OLTP',
      def: "Online Transaction Processing : traitement des transactions du quotidien (commandes, paiements), optimisé pour l'écriture.",
    },
    {
      term: 'Data warehouse',
      def: 'Entrepôt de données orienté sujet, intégré, historisé et non volatil, alimenté par les sources pour la décision.',
    },
    { term: 'Datamart', def: "Sous-ensemble de l'entrepôt consacré à un métier (ventes, RH, finance)." },
    {
      term: 'ETL / ELT',
      def: "Extract, Transform, Load : chaîne d'alimentation. En ELT, les transformations se font dans la base cible après chargement.",
    },
    { term: 'Staging', def: "Zone tampon où l'on dépose les données extraites avant transformation." },
    {
      term: 'Fait',
      def: "Table centrale contenant les mesures d'un processus métier et les clés vers les dimensions.",
    },
    {
      term: 'Dimension',
      def: "Axe d'analyse (temps, produit, client) portant des attributs descriptifs pour filtrer et regrouper.",
    },
    { term: 'Mesure', def: 'Valeur numérique agrégeable (CA, quantité, marge).' },
    { term: 'Grain', def: "Niveau de détail d'une ligne de faits. À déclarer avant de choisir dimensions et mesures." },
    {
      term: 'Clé de substitution',
      def: "Surrogate key : identifiant technique entier d'une ligne de dimension, indépendant des sources.",
    },
    { term: 'Clé naturelle', def: 'Identifiant métier venant de la source (code produit, numéro client).' },
    { term: 'Schéma en étoile', def: 'Fait central relié directement à des dimensions dénormalisées.' },
    { term: 'Schéma en flocon', def: "Variante de l'étoile où les dimensions sont normalisées en plusieurs tables." },
    { term: 'Constellation', def: 'Plusieurs tables de faits partageant des dimensions conformes.' },
    {
      term: 'Dimension conforme',
      def: 'Dimension strictement identique partagée par plusieurs faits, permettant le drill-across.',
    },
    {
      term: 'Dimension dégénérée',
      def: 'Identifiant (n° de ticket) stocké directement dans le fait, sans table de dimension.',
    },
    {
      term: 'Hiérarchie',
      def: "Organisation des niveaux d'une dimension (jour → mois → année) qui permet roll-up et drill-down.",
    },
    {
      term: 'Cube',
      def: 'Représentation des mesures croisées par plusieurs dimensions ; chaque cellule est un agrégat.',
    },
    { term: 'Slice', def: 'Fixer une valeur sur une dimension pour extraire une tranche du cube.' },
    { term: 'Dice', def: 'Restreindre plusieurs dimensions à des sous-ensembles pour obtenir un sous-cube.' },
    { term: 'Roll-up', def: 'Agréger en montant dans une hiérarchie (mois → trimestre).' },
    { term: 'Drill-down', def: 'Détailler en descendant dans une hiérarchie (année → mois).' },
    { term: 'Drill-through', def: 'Afficher les lignes de détail qui composent une cellule agrégée.' },
    { term: 'Drill-across', def: 'Comparer des mesures de plusieurs faits sur des dimensions conformes.' },
    { term: 'Pivot', def: "Échanger les axes affichés d'un tableau croisé." },
    {
      term: 'Mesure semi-additive',
      def: "Mesure qu'on peut sommer sauf sur certaines dimensions, en général le temps (stock, solde).",
    },
    {
      term: 'SCD',
      def: "Slowly Changing Dimension : stratégie de gestion des changements d'attributs (type 1 écrase, type 2 versionne, type 3 garde la valeur précédente).",
    },
    {
      term: 'MOLAP / ROLAP / HOLAP',
      def: 'Stockage multidimensionnel précalculé, relationnel interrogé en SQL, ou hybride.',
    },
    {
      term: 'Vue matérialisée',
      def: "Résultat de requête stocké physiquement ; avec query rewrite, l'optimiseur l'utilise automatiquement.",
    },
    {
      term: 'ROLLUP / CUBE',
      def: 'Extensions du GROUP BY produisant des sous-totaux hiérarchiques (n+1) ou toutes les combinaisons (2^n).',
    },
    {
      term: 'Fonction analytique',
      def: 'Fonction avec OVER() qui calcule par ligne sur une fenêtre de lignes : rang, cumul, LAG, part du total.',
    },
    {
      term: 'Chasm trap',
      def: 'Piège de deux faits joints par une dimension commune : les lignes se multiplient et les sommes sont gonflées. On agrège chaque fait avant de joindre.',
    },
  ],

  resources: [
    {
      title: 'Oracle Live SQL',
      url: 'https://livesql.oracle.com/',
      desc: "Exécuter du SQL Oracle dans le navigateur pour s'entraîner aux requêtes analytiques.",
    },
    {
      title: 'Oracle Data Warehousing Guide',
      url: 'https://docs.oracle.com/en/database/oracle/oracle-database/19/dwhsg/',
      desc: 'Vues matérialisées, dimensions, ROLLUP/CUBE, fonctions analytiques, partitionnement.',
    },
    {
      title: 'Kimball : techniques de modélisation',
      url: 'https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/',
      desc: 'Le catalogue des techniques dimensionnelles (grain, SCD, types de faits…).',
    },
    {
      title: 'The Data Warehouse Toolkit',
      url: 'https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/',
      desc: 'Kimball & Ross, la référence de la modélisation dimensionnelle.',
    },
  ],
};
