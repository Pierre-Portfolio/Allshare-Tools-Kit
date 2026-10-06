import { H } from '../helpers.js';

export default {
  id: 'olap-6',
  short: 'Hiérarchies, mesures, SCD',
  title: 'Hiérarchies, types de mesures et dimensions à évolution lente',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "Trois sujets qui font la différence entre un modèle qui « marche » et un modèle qui donne des chiffres justes : les hiérarchies, l'additivité des mesures, et l'historique des dimensions.",
  objectives: [
    'Reconnaître les types de hiérarchies (équilibrée, irrégulière, parent-enfant)',
    'Classer une mesure : additive, semi-additive, non additive',
    "Éviter les erreurs d'agrégation sur les ratios et les stocks",
    'Choisir et implémenter un type de SCD (0, 1, 2, 3)',
  ],
  content: `
    <h3>1. Les hiérarchies</h3>
    <p>Une hiérarchie organise les attributs d'une dimension en <strong>niveaux</strong> du plus fin au plus agrégé. C'est elle qui rend possibles le roll-up et le drill-down.</p>
    ${H.tbl(
      ['Type', 'Description', 'Exemple'],
      [
        ['Équilibrée (<i>balanced</i>)', 'Tous les chemins ont la même profondeur', 'Jour → Mois → Trimestre → Année'],
        [
          'Irrégulière (<i>ragged</i>)',
          'Un niveau peut manquer pour certains membres',
          "Ville → Région → Pays, mais le Luxembourg n'a pas de région",
        ],
        [
          'Parent-enfant (<i>unbalanced</i>)',
          'Profondeur variable, chaque membre pointe vers son parent',
          'Organigramme : employé → manager → directeur → PDG',
        ],
        [
          'Multiples',
          "Plusieurs chemins d'agrégation dans une même dimension",
          'Temps calendaire (mois, trimestre) et temps ISO (semaine, année ISO)',
        ],
      ],
    )}
    ${H.callout('warn', 'Attention aux semaines', 'Une semaine peut être à cheval sur deux mois ou deux années. Semaine et mois appartiennent donc à <strong>deux hiérarchies différentes</strong> de la dimension Temps. Ne faites jamais de roll-up « semaine → mois ».')}
    <p>Une hiérarchie parent-enfant se parcourt en SQL Oracle avec <code>CONNECT BY</code> (ou une CTE récursive) :</p>
    ${H.code(
      'sql',
      `
      SELECT LPAD(' ', 2 * (LEVEL - 1)) || nom AS organigramme,
             LEVEL                            AS niveau,
             SYS_CONNECT_BY_PATH(nom, ' / ')  AS chemin
      FROM   dim_employe
      START  WITH manager_key IS NULL          -- la racine (PDG)
      CONNECT BY PRIOR employe_key = manager_key
      ORDER  SIBLINGS BY nom;
    `,
    )}

    <h3>2. Additivité des mesures</h3>
    <p>Toutes les mesures ne s'additionnent pas selon toutes les dimensions. C'est l'erreur la plus fréquente dans les tableaux de bord.</p>
    ${H.tbl(
      ['Type', 'Règle', 'Exemples', 'Comment agréger'],
      [
        [
          '<b>Additive</b>',
          'Se somme selon toutes les dimensions',
          'Quantité, CA, marge, nombre de commandes',
          '<code>SUM</code>',
        ],
        [
          '<b>Semi-additive</b>',
          'Se somme selon certaines dimensions, <em>pas selon le temps</em>',
          'Niveau de stock, solde bancaire, effectif',
          'Somme par produit/magasin ; sur le temps : dernière valeur, moyenne, min ou max',
        ],
        [
          '<b>Non additive</b>',
          'Ne se somme jamais',
          'Taux de marge, prix unitaire, pourcentage, nombre de clients distincts',
          'Recalculer à partir de composantes additives',
        ],
      ],
    )}
    <h4>Le piège de la moyenne des taux</h4>
    ${H.tbl(
      ['Magasin', '#CA (k€)', '#Marge (k€)', '#Taux de marge'],
      [
        ['A', '100', '30', '30 %'],
        ['B', '900', '90', '10 %'],
        ['__total__', 'Région', '1 000', '120', '12 %'],
      ],
      'Moyenne des taux : (30 % + 10 %) / 2 = 20 %. Faux. Le vrai taux régional est 120 / 1 000 = 12 %.',
    )}
    <p>Règle d'or : <strong>on stocke les composantes additives</strong> (marge, CA) et on calcule le ratio <strong>après</strong> agrégation : <code>SUM(marge) / SUM(ca)</code>, jamais <code>AVG(taux)</code>.</p>
    <h4>Les stocks : semi-additifs</h4>
    <p>Stock de 50 le lundi, 50 le mardi, 50 le mercredi : il n'y a pas 150 articles en stock. Sur la dimension temps, on prend la <strong>valeur de fin de période</strong> (ou la moyenne) :</p>
    ${H.code(
      'sql',
      `
      -- Stock de fin de mois par catégorie : on ne garde que le dernier jour de chaque mois
      SELECT t.annee, t.mois_num, p.categorie, SUM(s.qte_stock) AS stock_fin_mois
      FROM   fait_stocks s
      JOIN   dim_temps   t ON t.date_key    = s.date_key
      JOIN   dim_produit p ON p.produit_key = s.produit_key
      WHERE  t.date_jour = LAST_DAY(t.date_jour)      -- dernier jour du mois
      GROUP  BY t.annee, t.mois_num, p.categorie;

      -- Stock MOYEN du mois : somme sur les produits, puis moyenne sur les jours
      SELECT annee, mois_num, AVG(stock_jour) AS stock_moyen
      FROM  (SELECT t.annee, t.mois_num, t.date_key, SUM(s.qte_stock) AS stock_jour
             FROM   fait_stocks s JOIN dim_temps t ON t.date_key = s.date_key
             GROUP  BY t.annee, t.mois_num, t.date_key)
      GROUP  BY annee, mois_num;
    `,
    )}
    ${H.callout('info', 'Les comptages distincts', '120 clients distincts en janvier et 130 en février ne font pas 250 clients sur deux mois : certains ont acheté les deux mois. <code>COUNT(DISTINCT client_key)</code> se recalcule à chaque niveau, directement sur les faits.')}

    <h3>3. Les dimensions à évolution lente (SCD)</h3>
    <p>Les attributs d'une dimension changent : un client déménage, un produit change de catégorie, un commercial change de secteur. Que fait-on de l'ancienne valeur ? Kimball a codifié les réponses sous le nom de <strong>Slowly Changing Dimensions</strong>.</p>
    ${H.tbl(
      ['Type', 'Principe', 'Historique', 'Usage'],
      [
        [
          '<b>SCD 0</b>',
          'On ne modifie jamais',
          "Valeur d'origine figée",
          'Date de naissance, date de première commande',
        ],
        [
          '<b>SCD 1</b>',
          "On écrase l'ancienne valeur",
          'Aucun',
          "Correction d'une faute de frappe, attribut sans intérêt historique",
        ],
        [
          '<b>SCD 2</b>',
          'On ajoute une nouvelle ligne (nouvelle version)',
          'Complet',
          'Région, segment, catégorie : tout ce qui sert à analyser le passé',
        ],
        [
          '<b>SCD 3</b>',
          'On ajoute une colonne « valeur précédente »',
          'Une seule valeur précédente',
          'Réorganisation commerciale : comparer ancien et nouveau découpage',
        ],
      ],
    )}
    <h4>SCD 2 en détail</h4>
    <p>Le client C-042 habitait à Lyon et déménage à Nantes le 1<sup>er</sup> juin 2025 :</p>
    ${H.tbl(
      ['client_key', 'code_client', 'ville', 'region', 'date_debut', 'date_fin', 'est_courant'],
      [
        ['1187', 'C-042', 'Lyon', 'Auvergne-Rhône-Alpes', '2019-03-10', '2025-05-31', 'N'],
        ['2301', 'C-042', 'Nantes', 'Pays de la Loire', '2025-06-01', '9999-12-31', 'O'],
      ],
      'Deux lignes, deux clés de substitution, une seule clé naturelle.',
    )}
    <p>Les ventes d'avant juin portent <code>client_key = 1187</code> (Lyon), celles d'après portent <code>2301</code> (Nantes). Le CA par région est donc <strong>juste dans le temps</strong>. Et pour avoir le total d'un client toutes versions confondues, on regroupe sur <code>code_client</code>.</p>
    ${H.code(
      'plsql',
      `
      -- 1) Fermer la version courante des clients dont la région a changé
      UPDATE dim_client d
      SET    d.date_fin    = TRUNC(SYSDATE) - 1,
             d.est_courant = 'N'
      WHERE  d.est_courant = 'O'
      AND    EXISTS (SELECT 1 FROM stg_clients s
                     WHERE  s.code_client = d.code_client
                     AND    s.region     <> d.region);

      -- 2) Insérer la nouvelle version (et les nouveaux clients)
      INSERT INTO dim_client (client_key, code_client, nom, ville, region,
                              date_debut, date_fin, est_courant)
      SELECT seq_dim_client.NEXTVAL, s.code_client, s.nom, s.ville, s.region,
             TRUNC(SYSDATE), DATE '9999-12-31', 'O'
      FROM   stg_clients s
      WHERE  NOT EXISTS (SELECT 1 FROM dim_client d
                         WHERE d.code_client = s.code_client
                         AND   d.est_courant = 'O');
    `,
    )}
    ${H.callout('tip', 'Au chargement des faits', 'Pour attribuer la bonne clé à une vente, on cherche la version valide <em>à la date de la vente</em> : <code>JOIN dim_client d ON d.code_client = s.code_client AND s.date_vente BETWEEN d.date_debut AND d.date_fin</code>.')}
    <p>Les types combinés existent aussi : le <strong>type 6</strong> (1 + 2 + 3) ajoute à chaque version une colonne « valeur actuelle » écrasée partout, pour analyser au choix avec la valeur historique ou la valeur d'aujourd'hui.</p>
  `,
  keypoints: [
    'Hiérarchies équilibrées, irrégulières, parent-enfant ; semaine et mois sont deux hiérarchies distinctes.',
    'Additive : SUM partout. Semi-additive : pas de SUM sur le temps. Non additive : recalcul à partir des composantes.',
    'Ratio agrégé = SUM(numérateur) / SUM(dénominateur), jamais AVG(ratio).',
    'SCD 1 écrase, SCD 2 versionne (dates + indicateur courant), SCD 3 garde la valeur précédente.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Le <strong>solde d'un compte bancaire</strong> en fin de journée est une mesure :",
      options: ['Additive', 'Semi-additive', 'Non additive', "Ce n'est pas une mesure"],
      answer: 1,
      explain:
        "On peut additionner les soldes de plusieurs comptes à une même date (total des encours), mais pas les soldes d'un même compte sur plusieurs jours. Additive sur certaines dimensions, pas sur le temps : <strong>semi-additive</strong>.",
    },
    {
      type: 'qcm',
      q: "Quel type de SCD permet de conserver <strong>tout l'historique</strong> des régions d'un client ?",
      options: ['SCD 0', 'SCD 1', 'SCD 2', 'SCD 3'],
      answer: 2,
      explain:
        "Le type 2 crée une nouvelle ligne (avec une nouvelle clé de substitution et des dates de validité) à chaque changement. Le type 3 ne garde qu'une valeur précédente, le type 1 écrase, le type 0 ne change jamais.",
    },
    {
      type: 'qcm',
      q: "La table de faits stocke <code>ca</code> et <code>marge</code> par magasin. Comment obtenir le taux de marge d'une région ?",
      options: [
        '<code>AVG(marge / ca)</code>',
        '<code>SUM(marge) / SUM(ca)</code>',
        '<code>SUM(marge / ca)</code>',
        '<code>MAX(marge) / MAX(ca)</code>',
      ],
      answer: 1,
      explain:
        "Un ratio est non additif : on agrège d'abord numérateur et dénominateur (additifs), puis on divise. <code>AVG(marge/ca)</code> donne le même poids à un petit et à un gros magasin, ce qui fausse le résultat.",
    },
    {
      type: 'open',
      q: 'Trois agences : Paris (CA 500 k€, 25 clients distincts), Lille (CA 200 k€, 10 clients), Lyon (CA 300 k€, 15 clients). 4 clients ont acheté à la fois à Paris et à Lille. Calculez le CA total, le nombre de clients distincts total et le panier moyen par client. Expliquez les pièges.',
      hint: "Le CA est additif. Le nombre de clients distincts ne l'est pas.",
      answer: `<ul>
        <li><strong>CA total</strong> = 500 + 200 + 300 = <strong>1 000 k€</strong> (mesure additive).</li>
        <li><strong>Clients distincts</strong> = 25 + 10 + 15 − 4 = <strong>46</strong>, et non 50 : les 4 clients communs ne doivent être comptés qu'une fois. En SQL, on recalcule <code>COUNT(DISTINCT client_key)</code> au niveau total au lieu de sommer les comptages par agence.</li>
        <li><strong>CA moyen par client</strong> = 1 000 / 46 ≈ <strong>21,7 k€</strong>. Ni la moyenne des moyennes par agence ((20 + 20 + 20) / 3 = 20 k€), ni 1 000 / 50 = 20 k€ ne sont justes.</li>
      </ul>`,
      criteria: [
        'CA total = 1 000 k€',
        'Clients distincts = 46 (et pas 50)',
        'Panier ≈ 21,7 k€ calculé après agrégation',
        'Explique pourquoi le comptage distinct est non additif',
      ],
    },
    {
      type: 'open',
      q: "Dans <code>dim_produit</code> (SCD 2 : <code>date_debut</code>, <code>date_fin</code>, <code>est_courant</code>), le produit <code>SKU-7781</code> passe de la catégorie « Jardin » à « Extérieur » aujourd'hui. Écrivez les deux ordres SQL nécessaires.",
      answer: `${H.code(
        'sql',
        `
        -- 1) Clore la version courante
        UPDATE dim_produit
        SET    date_fin    = TRUNC(SYSDATE) - 1,
               est_courant = 'N'
        WHERE  code_produit = 'SKU-7781'
        AND    est_courant  = 'O';

        -- 2) Créer la nouvelle version à partir de l'ancienne
        INSERT INTO dim_produit (produit_key, code_produit, libelle, marque,
                                 categorie, date_debut, date_fin, est_courant)
        SELECT seq_dim_produit.NEXTVAL, code_produit, libelle, marque,
               'Extérieur', TRUNC(SYSDATE), DATE '9999-12-31', 'O'
        FROM   dim_produit
        WHERE  code_produit = 'SKU-7781'
        AND    date_fin     = TRUNC(SYSDATE) - 1;   -- la version que l'on vient de clore
      `,
      )}<p>Les ventes passées restent rattachées à l'ancienne clé (catégorie « Jardin ») : l'historique des rapports ne change pas. Les nouvelles ventes utiliseront la nouvelle clé.</p>`,
      criteria: [
        'UPDATE qui ferme la version courante (date_fin + est_courant)',
        "INSERT d'une nouvelle ligne avec nouvelle clé de substitution",
        'Dates de validité cohérentes et sans chevauchement',
        "Explique l'effet sur les ventes passées",
      ],
    },
  ],
};
