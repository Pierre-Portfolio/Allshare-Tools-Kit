import { H } from '../helpers.js';

export default {
  id: 'olap-3',
  short: 'Faits, dimensions, grain',
  title: 'Modélisation dimensionnelle : faits, dimensions et grain',
  level: 'Débutant',
  duration: '35 min',
  intro:
    'La modélisation dimensionnelle (Ralph Kimball) organise les données en deux familles de tables : les faits, qui mesurent, et les dimensions, qui décrivent.',
  objectives: [
    'Appliquer la méthode en 4 étapes de Kimball',
    "Déclarer le grain d'une table de faits",
    'Distinguer table de faits et table de dimension',
    'Connaître les 3 types de tables de faits et le rôle des clés de substitution',
  ],
  content: `
    <h3>La méthode en 4 étapes</h3>
    <ol>
      <li><strong>Choisir le processus métier</strong> à modéliser : les ventes en magasin, les commandes web, les inscriptions, les appels au support.</li>
      <li><strong>Déclarer le grain</strong> : que représente <em>exactement</em> une ligne de la table de faits ?</li>
      <li><strong>Identifier les dimensions</strong> : qui, quoi, où, quand, comment, pourquoi ?</li>
      <li><strong>Identifier les faits</strong> (mesures) : combien ?</li>
    </ol>
    ${H.callout('warn', "L'étape la plus importante", "Le <strong>grain</strong>. Tant qu'il n'est pas écrit noir sur blanc (« une ligne = un article sur un ticket de caisse »), on ne peut pas choisir correctement les dimensions ni les mesures. Des grains mélangés dans une même table produisent des totaux faux.")}

    <h3>Le grain</h3>
    <p>Le grain est le <strong>niveau de détail</strong> d'une ligne de faits. Exemples :</p>
    <ul>
      <li>« Une ligne par article scanné sur un ticket de caisse » (grain <strong>atomique</strong> : le plus fin possible) ;</li>
      <li>« Une ligne par produit, par magasin et par jour » (grain agrégé) ;</li>
      <li>« Une ligne par compte bancaire et par fin de mois ».</li>
    </ul>
    <p>Kimball recommande de partir du grain <strong>le plus fin</strong> disponible : on peut toujours agréger ensuite, jamais redescendre dans un détail qu'on n'a pas stocké.</p>

    <h3>Table de faits et tables de dimension</h3>
    ${H.tbl(
      ['', 'Table de faits', 'Table de dimension'],
      [
        ['Rôle', 'Mesurer un événement ou un état', 'Décrire le contexte (qui, quoi, où, quand)'],
        [
          'Contenu',
          'Clés étrangères vers les dimensions + mesures numériques',
          'Clé de substitution + clé naturelle + attributs descriptifs (texte)',
        ],
        ['Forme', 'Étroite et très longue (millions de lignes)', 'Large (beaucoup de colonnes) et courte'],
        ['Évolution', 'On ajoute des lignes chaque jour', 'Évolue lentement (nouveaux produits, déménagements)'],
        [
          'Usage en requête',
          '<code>SUM</code>, <code>COUNT</code>, <code>AVG</code>…',
          '<code>WHERE</code>, <code>GROUP BY</code>, libellés des axes',
        ],
      ],
    )}
    <p>Un extrait de table de faits au grain « ligne de ticket » :</p>
    ${H.tbl(
      ['date_key', 'produit_key', 'magasin_key', 'num_ticket', '#quantite', '#montant_ht', '#marge'],
      [
        ['20250314', '1042', '7', 'T-88120', '2', '31,80', '9,20'],
        ['20250314', '2210', '7', 'T-88120', '1', '4,50', '1,10'],
        ['20250314', '1042', '3', 'T-51007', '1', '15,90', '4,60'],
      ],
      'Les clés pointent vers les dimensions ; num_ticket est une « dimension dégénérée » (voir plus bas).',
    )}

    <h3>Les dimensions</h3>
    <p>Une dimension porte des <strong>attributs textuels riches</strong> : ce sont eux qui apparaissent dans les filtres et en tête de lignes et de colonnes des rapports. Plus ils sont nombreux et propres, plus l'analyse est facile.</p>
    <ul>
      <li><strong>dim_produit</strong> : libellé, marque, sous-catégorie, catégorie, couleur, taille, prix catalogue, statut (actif/arrêté).</li>
      <li><strong>dim_magasin</strong> : nom, ville, département, région, pays, surface, type (centre-ville, périphérie).</li>
      <li><strong>dim_temps</strong> : date, jour de la semaine, semaine ISO, mois, trimestre, année, jour férié, période de soldes…</li>
    </ul>
    ${H.callout('tip', 'La dimension Temps', 'Elle existe dans presque tous les modèles. On la génère une fois pour toutes (par exemple 20 ans de dates) avec une clé lisible <code>AAAAMMJJ</code>. Les attributs métier (jours fériés, semaines de soldes, exercice fiscal) évitent des calculs compliqués dans chaque requête.')}
    ${H.code(
      'sql',
      `
      CREATE TABLE dim_temps (
        date_key      NUMBER(8)    PRIMARY KEY,   -- 20250314
        date_jour     DATE         NOT NULL,
        jour_semaine  VARCHAR2(10) NOT NULL,      -- 'Vendredi'
        semaine_iso   NUMBER(2)    NOT NULL,
        mois_num      NUMBER(2)    NOT NULL,
        mois_libelle  VARCHAR2(12) NOT NULL,      -- 'Mars'
        trimestre     VARCHAR2(2)  NOT NULL,      -- 'T1'
        annee         NUMBER(4)    NOT NULL,
        est_ferie     CHAR(1)      DEFAULT 'N'
      );

      -- Génération des dates de 2020 à 2030 en une requête
      INSERT INTO dim_temps (date_key, date_jour, jour_semaine, semaine_iso,
                             mois_num, mois_libelle, trimestre, annee)
      SELECT TO_NUMBER(TO_CHAR(d, 'YYYYMMDD')),
             d,
             TO_CHAR(d, 'fmDay', 'NLS_DATE_LANGUAGE=FRENCH'),
             TO_NUMBER(TO_CHAR(d, 'IW')),
             EXTRACT(MONTH FROM d),
             TO_CHAR(d, 'fmMonth', 'NLS_DATE_LANGUAGE=FRENCH'),
             'T' || TO_CHAR(d, 'Q'),
             EXTRACT(YEAR FROM d)
      FROM  (SELECT DATE '2020-01-01' + LEVEL - 1 AS d
             FROM   dual
             CONNECT BY LEVEL <= DATE '2031-01-01' - DATE '2020-01-01');
    `,
    )}

    <h3>Les clés de substitution (surrogate keys)</h3>
    <p>Chaque dimension a sa propre clé technique, un simple entier sans signification (<code>produit_key = 1042</code>), en plus de la <strong>clé naturelle</strong> venue de la source (<code>code_produit = 'SKU-7781'</code>). Pourquoi ?</p>
    <ul>
      <li><strong>Indépendance</strong> vis-à-vis des sources : deux ERP peuvent réutiliser le même code pour des produits différents.</li>
      <li><strong>Historisation</strong> : un même client peut avoir plusieurs lignes (plusieurs versions) dans la dimension, chacune avec sa clé (notion 6, SCD type 2).</li>
      <li><strong>Performance</strong> : jointures sur des entiers courts.</li>
      <li><strong>Membres spéciaux</strong> : une ligne <code>-1 = « Inconnu »</code> pour rattacher un fait dont la dimension est manquante, au lieu de le perdre.</li>
    </ul>

    <h3>Trois types de tables de faits</h3>
    ${H.tbl(
      ['Type', 'Une ligne =', 'Exemple', 'Mesures'],
      [
        ['Transactionnelle', 'Un événement ponctuel', 'Une ligne de ticket de caisse', 'Additives (quantité, montant)'],
        [
          'Snapshot périodique',
          'Un état à intervalle régulier',
          'Stock par produit et par entrepôt en fin de journée',
          'Souvent semi-additives (niveau de stock, solde)',
        ],
        [
          'Snapshot cumulatif',
          'Un processus avec des étapes, mis à jour à chaque étape',
          'Une commande : dates de commande, expédition, livraison',
          'Délais entre étapes, quantités',
        ],
      ],
    )}
    <p>On rencontre aussi des <strong>tables de faits sans mesure</strong> (<i>factless</i>) qui enregistrent seulement qu'un événement a eu lieu : la présence d'un étudiant à un cours, la couverture d'un produit par une promotion. On les exploite avec <code>COUNT(*)</code>.</p>

    <h3>La dimension dégénérée</h3>
    <p>Le numéro de ticket ou de commande n'a pas d'autre attribut que lui-même : inutile de créer une table <code>dim_ticket</code>. On le garde directement dans la table de faits. C'est une <strong>dimension dégénérée</strong>, utile pour regrouper les lignes d'un même ticket (calcul du panier moyen, par exemple).</p>
  `,
  keypoints: [
    'Méthode Kimball : processus métier → grain → dimensions → faits.',
    'Le grain définit ce que représente une ligne de faits ; partez du plus fin.',
    'Faits = clés + mesures numériques ; dimensions = attributs descriptifs pour filtrer et regrouper.',
    'Clés de substitution : indépendance des sources, historisation, membre « Inconnu ».',
    'Faits transactionnels, snapshots périodiques, snapshots cumulatifs (et factless).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Une fois le processus métier choisi, quelle est l'étape suivante de la méthode Kimball ?",
      options: ['Identifier les mesures', 'Déclarer le grain', "Choisir l'outil de restitution", 'Créer les index'],
      answer: 1,
      explain:
        'Processus → <strong>grain</strong> → dimensions → faits. Le grain conditionne tout le reste : il indique quelles dimensions ont un sens et à quel niveau les mesures sont enregistrées.',
    },
    {
      type: 'qcm',
      q: 'Laquelle de ces colonnes est une <strong>mesure</strong> à placer dans la table de faits des ventes ?',
      options: ['La couleur du produit', 'Le nom du magasin', 'La quantité vendue', 'Le jour de la semaine'],
      answer: 2,
      explain:
        "La quantité vendue est numérique et s'agrège (on la somme). Couleur, nom du magasin et jour de la semaine sont des attributs descriptifs : ils appartiennent respectivement à dim_produit, dim_magasin et dim_temps.",
    },
    {
      type: 'qcm',
      q: 'On veut suivre le niveau de stock de chaque produit dans chaque entrepôt, chaque soir. Quel type de table de faits ?',
      options: ['Transactionnelle', 'Snapshot périodique', 'Snapshot cumulatif', 'Table de dimension'],
      answer: 1,
      explain:
        "On photographie un <strong>état</strong> (le stock) à intervalle régulier (chaque soir) : c'est un snapshot périodique. Les mouvements de stock (entrées/sorties), eux, iraient dans une table transactionnelle.",
    },
    {
      type: 'open',
      q: "Une ville propose des vélos en libre-service. Chaque location enregistre : l'abonné, le vélo, la station de départ, la station d'arrivée, l'heure de départ et d'arrivée, et le prix payé. Proposez un modèle dimensionnel : grain, dimensions, mesures.",
      hint: 'Une même dimension peut jouer deux rôles (départ / arrivée).',
      answer: `<p><strong>Grain</strong> : une ligne = une location (un trajet).</p>
      <p><strong>Dimensions</strong> :</p>
      <ul>
        <li><code>dim_abonne</code> (type d'abonnement, tranche d'âge, commune de résidence) ;</li>
        <li><code>dim_velo</code> (modèle, électrique ou non, date de mise en service) ;</li>
        <li><code>dim_station</code> utilisée <strong>deux fois</strong> : <code>station_depart_key</code> et <code>station_arrivee_key</code> (c'est une <em>dimension de rôle</em>, ou <i>role-playing dimension</i>) ;</li>
        <li><code>dim_temps</code> (date de départ) et éventuellement <code>dim_heure</code> (tranche horaire), elle aussi en rôle départ/arrivée si besoin.</li>
      </ul>
      <p><strong>Mesures</strong> : durée en minutes, prix payé, distance estimée, et un compteur <code>nb_locations = 1</code> pratique pour les sommes.</p>`,
      criteria: [
        'Grain explicite : une location',
        'Au moins 4 dimensions pertinentes',
        'Station utilisée deux fois (départ / arrivée)',
        'Mesures numériques additives (durée, prix)',
      ],
    },
    {
      type: 'open',
      q: "Un collègue propose d'utiliser directement le code produit de l'ERP (<code>SKU-7781</code>) comme clé primaire de <code>dim_produit</code>. Donnez-lui trois arguments en faveur d'une clé de substitution.",
      answer: `<ol>
        <li><strong>Historisation</strong> : si le prix catalogue ou la catégorie d'un produit change et qu'on veut garder l'historique (SCD type 2), le même SKU aura plusieurs lignes. Il ne peut donc pas être clé primaire.</li>
        <li><strong>Indépendance des sources</strong> : un second ERP (rachat d'une filiale) peut utiliser le même code pour un autre article, ou l'ERP peut renuméroter ses codes.</li>
        <li><strong>Performance et place</strong> : un entier de 4 à 8 octets dans une table de faits de 500 millions de lignes est bien plus léger qu'une chaîne de caractères, et les jointures sont plus rapides.</li>
      </ol>
      <p>Bonus : la clé de substitution permet un membre <code>-1 « Inconnu »</code> pour ne jamais perdre de faits. Le SKU reste stocké dans la dimension comme <strong>clé naturelle</strong>.</p>`,
      criteria: [
        'Argument historisation (SCD)',
        'Argument indépendance vis-à-vis des sources',
        'Argument performance / stockage',
        'Garde la clé naturelle comme attribut',
      ],
    },
  ],
};
