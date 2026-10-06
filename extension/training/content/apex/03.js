import { H } from '../helpers.js';

export default {
  id: 'apex-3',
  short: 'Rapports & graphiques',
  title: 'Rapports et visualisations : Classic, Interactive Report, Grid, Cards, Charts',
  level: 'Débutant',
  duration: '40 min',
  intro:
    "Afficher des données est le cœur d'APEX. Chaque type de région répond à un besoin différent ; bien choisir évite beaucoup de développement.",
  objectives: [
    'Choisir entre Classic Report, Interactive Report, Interactive Grid et Cards',
    "Exploiter les fonctions OLAP intégrées à l'Interactive Report",
    "Créer un graphique (Oracle JET) à partir d'une requête SQL",
    'Mettre en forme des colonnes : format, lien, expression HTML',
  ],
  content: `
    <h3>Choisir le bon type de région</h3>
    ${H.tbl(
      ['Région', 'Pour qui, pour quoi', 'Points forts', 'Limites'],
      [
        [
          '<b>Classic Report</b>',
          'Affichage simple et maîtrisé',
          'Léger, templates personnalisables, rendu exact de votre SQL',
          "Peu d'interactivité pour l'utilisateur",
        ],
        [
          '<b>Interactive Report</b> (IR)',
          'Utilisateurs qui explorent eux-mêmes',
          'Filtres, tri, ruptures, agrégats, <strong>pivot</strong>, <strong>group by</strong>, graphiques, rapports sauvegardés, export',
          'Lecture seule, un seul IR par page conseillé',
        ],
        [
          '<b>Interactive Grid</b> (IG)',
          'Saisie en masse type tableur',
          'Édition en ligne, ajout/suppression de lignes, master-detail',
          'Plus lourd, plus complexe à paramétrer',
        ],
        [
          '<b>Cards</b>',
          'Présentation visuelle',
          'Titre, sous-titre, badge, icône, image, actions',
          'Pas pour les gros volumes tabulaires',
        ],
        [
          '<b>Chart</b>',
          'Tendances et comparaisons',
          'Une vingtaine de types (barres, lignes, secteurs, combinés, jauges, Gantt…)',
          'Agréger dans le SQL, pas afficher le détail',
        ],
        [
          '<b>Faceted Search / Smart Filters</b>',
          'Filtrer vite par facettes',
          'Compteurs par valeur, filtres combinés',
          'Associé à un rapport ou des cartes',
        ],
      ],
    )}

    <h3>L'Interactive Report : un petit outil OLAP</h3>
    <p>Dans le menu <b>Actions</b> d'un IR, l'utilisateur final dispose de toutes les opérations vues dans le module OLAP, sans aucun code :</p>
    ${H.tbl(
      ['Action IR', 'Équivalent OLAP'],
      [
        ['Filter (colonne = valeur)', 'Slice / dice'],
        ['Control Break (rupture sur une colonne)', 'Regroupement par un niveau'],
        ['Aggregate (Sum, Avg, Count… par rupture)', 'Sous-totaux, comme ROLLUP'],
        ['Group By', "<code>GROUP BY</code> avec fonctions d'agrégat"],
        ['Pivot', "Rotation : valeurs d'une colonne en colonnes"],
        ['Chart', "Visualisation de l'agrégat"],
        ['Highlight', 'Mise en évidence conditionnelle'],
        ['Report &gt; Save Report', 'Sauvegarder une vue (privée, ou publique si autorisé)'],
      ],
    )}
    ${H.callout('tip', 'Source recommandée', "Donnez à l'IR une <strong>vue</strong> « aplatie » de l'étoile (fait joint à ses dimensions, colonnes renommées en langage métier). L'utilisateur explore alors le cube librement avec Group By et Pivot, sans connaître les jointures.")}
    ${H.code(
      'sql',
      `
      CREATE OR REPLACE VIEW v_ventes_detail AS
      SELECT t.date_jour      AS "Date",
             t.annee          AS "Année",
             t.trimestre      AS "Trimestre",
             t.mois_libelle   AS "Mois",
             m.region         AS "Région",
             m.nom            AS "Magasin",
             p.categorie      AS "Catégorie",
             p.libelle        AS "Produit",
             f.num_ticket     AS "Ticket",
             f.quantite       AS "Quantité",
             f.montant_ht     AS "CA HT",
             f.marge          AS "Marge"
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key;
    `,
    )}

    <h3>Les graphiques (Oracle JET)</h3>
    <p>Une région <b>Chart</b> contient une ou plusieurs <strong>séries</strong>. Chaque série a une source SQL qui renvoie au minimum une colonne <strong>libellé</strong> (axe X) et une colonne <strong>valeur</strong> (axe Y). On fait l'agrégation dans le SQL :</p>
    ${H.code(
      'sql',
      `
      -- Série « CA » d'un graphique en barres, filtrée par l'item P1_ANNEE
      SELECT m.region           AS label,
             SUM(f.montant_ht)  AS value
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      WHERE  t.annee = :P1_ANNEE
      GROUP  BY m.region
      ORDER  BY value DESC;
    `,
    )}
    <ul>
      <li><strong>Plusieurs séries</strong> : une série par mesure (CA et marge côte à côte) ou une colonne <i>Series Name</i> dans la requête pour générer automatiquement une série par valeur (une série par année, par exemple).</li>
      <li><strong>Page Items to Submit</strong> : déclarez <code>P1_ANNEE</code> dans la région pour que le graphique utilise la valeur courante lors d'un rafraîchissement.</li>
      <li><strong>Link</strong> : sur la série, une cible de lien (page 20 avec <code>P20_REGION = &amp;LABEL.</code>) transforme chaque barre en <strong>drill-down</strong>.</li>
      <li><strong>Types combinés</strong> : barres pour le CA, ligne pour le taux de marge sur un axe Y secondaire.</li>
    </ul>
    ${H.code(
      'sql',
      `
      -- Une série par année générée automatiquement (colonne SERIES)
      SELECT TO_CHAR(t.annee)   AS series,
             t.mois_libelle     AS label,
             SUM(f.montant_ht)  AS value
      FROM   fait_ventes f
      JOIN   dim_temps t ON t.date_key = f.date_key
      WHERE  t.annee IN (:P1_ANNEE, :P1_ANNEE - 1)
      GROUP  BY t.annee, t.mois_num, t.mois_libelle
      ORDER  BY t.mois_num;
    `,
    )}

    <h3>Mise en forme des colonnes</h3>
    ${H.tbl(
      ['Propriété', 'Exemple', 'Effet'],
      [
        ['Format Mask', '<code>FML999G999G990D00</code>', '1 234 567,89 € (selon les paramètres NLS)'],
        ['Format Mask', '<code>999G999G990</code>', 'Séparateur de milliers, sans décimale'],
        ['Link', 'Cible : page 30, <code>P30_ID = #PRODUIT_KEY#</code>', 'La cellule devient un lien'],
        [
          'HTML Expression',
          '<code>&lt;span class="#CSS_CLASS#"&gt;#CA#&lt;/span&gt;</code>',
          'Mise en forme calculée par la requête',
        ],
        ['Heading / Alignment', '« CA HT », aligné à droite', 'Lisibilité des nombres'],
      ],
    )}
    <p>La syntaxe <code>#COLONNE#</code> insère la valeur d'une colonne de la ligne courante. Exemple : mettre en gras les sous-totaux d'un <code>ROLLUP</code> dans un Classic Report :</p>
    ${H.code(
      'sql',
      `
      SELECT CASE WHEN GROUPING(m.region) = 1 THEN 'Total' ELSE m.region END AS region,
             CASE WHEN GROUPING(p.categorie) = 1 THEN '—'  ELSE p.categorie END AS categorie,
             SUM(f.montant_ht) AS ca,
             CASE WHEN GROUPING_ID(m.region, p.categorie) > 0
                  THEN 'u-bold' END AS css_class                  -- classe utilitaire de l'Universal Theme
      FROM   fait_ventes f
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      GROUP  BY ROLLUP (m.region, p.categorie)
      ORDER  BY GROUPING(m.region), m.region, GROUPING(p.categorie), p.categorie;
      -- Colonne CA  → HTML Expression : <span class="#CSS_CLASS#">#CA#</span>
      -- Colonne CSS_CLASS → Type : Hidden
    `,
    )}
    ${H.callout('warn', 'Échappement', 'Par défaut, APEX échappe les caractères spéciaux des valeurs affichées (protection XSS). Ne désactivez « Escape special characters » que si la colonne contient du HTML que <strong>vous</strong> avez construit à partir de données sûres (notion 7).')}

    <h3>Cards et Faceted Search</h3>
    <p>La région <b>Cards</b> associe à chaque ligne un titre, un sous-titre, un corps, un badge (par exemple le CA) et des actions. Combinée à une région <b>Faceted Search</b> (facettes Région, Catégorie, Année avec compteurs), elle offre en quelques minutes une interface d'exploration moderne : c'est un <strong>dice</strong> interactif.</p>
  `,
  keypoints: [
    "Classic = affichage maîtrisé ; IR = exploration par l'utilisateur ; IG = saisie type tableur ; Cards = visuel.",
    "L'IR offre filtres, ruptures, agrégats, Group By et Pivot : un mini-outil OLAP pour l'utilisateur final.",
    'Un graphique = des séries SQL (label, value, éventuellement series), agrégées dans la requête.',
    '#COLONNE# dans les liens et expressions HTML ; Page Items to Submit pour les filtres.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Les utilisateurs doivent corriger en masse des objectifs de vente directement dans un tableau, comme dans Excel. Quelle région choisir ?',
      options: ['Classic Report', 'Interactive Report', 'Interactive Grid', 'Chart'],
      answer: 2,
      explain:
        "L'<strong>Interactive Grid</strong> permet l'édition en ligne, l'ajout et la suppression de lignes, avec enregistrement automatique (DML). L'Interactive Report est en lecture seule.",
    },
    {
      type: 'qcm',
      q: "Dans la requête d'une série de graphique en barres, quelles colonnes sont indispensables ?",
      options: [
        'Une colonne ID et une colonne NAME',
        'Une colonne pour le libellé (axe X) et une pour la valeur (axe Y)',
        'Toutes les colonnes de la table de faits',
        'Aucune, le graphique se configure sans SQL',
      ],
      answer: 1,
      explain:
        "Une série a besoin d'au moins un <strong>libellé</strong> et d'une <strong>valeur</strong> (on les mappe dans les propriétés Label et Value). Une colonne Series Name optionnelle permet de générer plusieurs séries.",
    },
    {
      type: 'qcm',
      q: 'Un utilisateur a construit dans un IR un filtre sur 2025, une rupture par région et une somme du CA. Comment le retrouver demain ?',
      options: [
        "Faire une capture d'écran",
        'Actions &gt; Report &gt; Save Report',
        'Demander au développeur de modifier la requête',
        "Ce n'est pas possible dans APEX",
      ],
      answer: 1,
      explain:
        "Les <strong>rapports sauvegardés</strong> sont une fonction native de l'IR : chaque utilisateur peut enregistrer ses vues (privées), et le développeur peut définir des rapports primaires ou alternatifs pour tous.",
    },
    {
      type: 'open',
      q: "Écrivez la requête d'une série de graphique « CA mensuel » pour l'année choisie dans <code>P3_ANNEE</code> et la catégorie choisie dans <code>P3_CATEGORIE</code> (si <code>P3_CATEGORIE</code> est vide, toutes les catégories). Indiquez les réglages de la région à ne pas oublier.",
      hint: "Attention à l'ordre chronologique et au filtre optionnel.",
      answer: `${H.code(
        'sql',
        `
        SELECT t.mois_libelle      AS label,
               SUM(f.montant_ht)   AS value
        FROM   fait_ventes f
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        JOIN   dim_produit p ON p.produit_key = f.produit_key
        WHERE  t.annee = :P3_ANNEE
        AND   (:P3_CATEGORIE IS NULL OR p.categorie = :P3_CATEGORIE)
        GROUP  BY t.mois_num, t.mois_libelle
        ORDER  BY t.mois_num;
      `,
      )}<ul>
        <li>Mapper <b>Label</b> = LABEL et <b>Value</b> = VALUE dans la série.</li>
        <li>Renseigner <b>Page Items to Submit</b> : <code>P3_ANNEE,P3_CATEGORIE</code>, pour que le rafraîchissement utilise les valeurs courantes.</li>
        <li>Ajouter une Dynamic Action « Change » sur les deux items qui rafraîchit la région (notion 6).</li>
        <li>Format de la valeur (séparateur de milliers) et libellé d'axe « CA HT (€) ».</li>
      </ul>`,
      criteria: [
        'Variables de liaison :P3_ANNEE et :P3_CATEGORIE',
        'Filtre optionnel (IS NULL OR …)',
        'Tri par numéro de mois',
        'Page Items to Submit mentionné',
      ],
    },
    {
      type: 'open',
      q: "Pour chacun des trois besoins suivants, choisissez un type de région et justifiez : (a) la direction veut explorer les ventes par elle-même et exporter en Excel ; (b) le contrôle de gestion saisit les budgets mensuels par magasin ; (c) la page d'accueil affiche les 8 magasins avec leur CA du mois et leur évolution.",
      answer: `<ul>
        <li><strong>(a) Interactive Report</strong> sur la vue <code>v_ventes_detail</code> : filtres, Group By, Pivot, graphiques, rapports sauvegardés et téléchargement CSV/XLSX sont natifs.</li>
        <li><strong>(b) Interactive Grid</strong> éditable sur la table des budgets : saisie rapide en tableau, validation et enregistrement automatiques ; éventuellement une colonne magasin en lecture seule et des mois en colonnes.</li>
        <li><strong>(c) Cards</strong> : un magasin par carte avec le CA en badge et l'évolution en sous-titre (avec une icône ou une couleur selon le signe). Visuel, adapté à un petit nombre d'éléments. Un Classic Report avec template « Badge List » conviendrait aussi.</li>
      </ul>`,
      criteria: [
        "(a) Interactive Report justifié par l'exploration / export",
        '(b) Interactive Grid justifié par la saisie',
        '(c) Cards (ou Badge List) justifié par le côté visuel',
      ],
    },
  ],
};
