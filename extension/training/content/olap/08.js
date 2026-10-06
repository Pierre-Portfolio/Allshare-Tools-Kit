import { H } from '../helpers.js';

export default {
  id: 'olap-8',
  short: 'SQL analytique Oracle',
  title: "Le SQL analytique d'Oracle : ROLLUP, CUBE et fonctions de fenêtrage",
  level: 'Intermédiaire',
  duration: '50 min',
  intro:
    "Oracle sait produire des sous-totaux multidimensionnels et des calculs de type OLAP (rangs, cumuls, N-1, parts) directement en SQL. C'est ce que vous utiliserez dans vos rapports APEX.",
  objectives: [
    'Produire des sous-totaux avec ROLLUP, CUBE et GROUPING SETS',
    'Identifier les lignes de total avec GROUPING et GROUPING_ID',
    'Calculer rangs, parts, cumuls, moyennes mobiles et comparaisons N-1 avec OVER()',
    'Écrire un top-N par groupe',
  ],
  content: `
    <h3>1. Sous-totaux : ROLLUP</h3>
    <p><code>GROUP BY ROLLUP(a, b)</code> calcule en une seule requête les regroupements <strong>(a, b)</strong>, puis <strong>(a)</strong>, puis <strong>()</strong> le total général. Avec <em>n</em> colonnes, on obtient <em>n + 1</em> niveaux : c'est un roll-up le long d'une hiérarchie.</p>
    ${H.code(
      'sql',
      `
      SELECT m.region, p.categorie, SUM(f.montant_ht) AS ca
      FROM   fait_ventes f
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      GROUP  BY ROLLUP (m.region, p.categorie)
      ORDER  BY m.region, p.categorie;
    `,
    )}
    ${H.tbl(
      ['region', 'categorie', '#ca'],
      [
        ['Nord', 'Accessoires', '84'],
        ['Nord', 'Vélos', '192'],
        ['Nord', '<i>(null)</i>', '<b>276</b>'],
        ['Sud', 'Accessoires', '105'],
        ['Sud', 'Vélos', '276'],
        ['Sud', '<i>(null)</i>', '<b>381</b>'],
        ['__total__', '<i>(null)</i>', '<i>(null)</i>', '657'],
      ],
      'Les lignes de sous-total ont NULL dans les colonnes agrégées.',
    )}

    <h3>2. Toutes les combinaisons : CUBE</h3>
    <p><code>GROUP BY CUBE(a, b)</code> calcule <strong>toutes</strong> les combinaisons : (a, b), (a), (b), (). Avec <em>n</em> colonnes : 2<sup><em>n</em></sup> regroupements. C'est littéralement le cube OLAP et tous ses agrégats. Ici, on obtiendrait en plus le total par catégorie toutes régions confondues.</p>

    <h3>3. Sur mesure : GROUPING SETS</h3>
    <p>On liste exactement les regroupements voulus. <code>ROLLUP</code> et <code>CUBE</code> ne sont que des raccourcis de <code>GROUPING SETS</code>.</p>
    ${H.tbl(
      ['Écriture', 'Équivaut à', 'Nb de niveaux'],
      [
        ['<code>ROLLUP(a, b, c)</code>', '<code>GROUPING SETS((a,b,c), (a,b), (a), ())</code>', 'n + 1 = 4'],
        ['<code>CUBE(a, b)</code>', '<code>GROUPING SETS((a,b), (a), (b), ())</code>', '2<sup>n</sup> = 4'],
        ['<code>GROUPING SETS((a), (b))</code>', 'Total par a, puis total par b, sans détail croisé', '2'],
      ],
    )}
    ${H.code(
      'sql',
      `
      -- Un seul passage sur la table pour trois analyses différentes
      SELECT t.annee, m.region, p.categorie, SUM(f.montant_ht) AS ca
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      GROUP  BY GROUPING SETS ( (t.annee, m.region),
                                (t.annee, p.categorie),
                                (t.annee) );
    `,
    )}

    <h3>4. Reconnaître les totaux : GROUPING et GROUPING_ID</h3>
    <p>Problème : un NULL dans le résultat signifie-t-il « total » ou « valeur réellement vide » ? <code>GROUPING(col)</code> renvoie <strong>1</strong> si la colonne est agrégée sur cette ligne (ligne de total), <strong>0</strong> sinon. <code>GROUPING_ID(a, b)</code> combine ces bits en un nombre (0 = détail, 1 = total de a, 3 = total général).</p>
    ${H.code(
      'sql',
      `
      SELECT CASE WHEN GROUPING(m.region)    = 1 THEN 'Total général'
                  ELSE m.region END                                AS region,
             CASE WHEN GROUPING(p.categorie) = 1 AND GROUPING(m.region) = 0
                  THEN 'Sous-total ' || m.region
                  WHEN GROUPING(p.categorie) = 1 THEN NULL
                  ELSE p.categorie END                             AS categorie,
             SUM(f.montant_ht)                                     AS ca,
             GROUPING_ID(m.region, p.categorie)                    AS niveau
      FROM   fait_ventes f
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      GROUP  BY ROLLUP (m.region, p.categorie)
      ORDER  BY GROUPING(m.region), m.region, GROUPING(p.categorie), p.categorie;
    `,
    )}
    ${H.callout('tip', 'Filtrer un niveau', 'Pour ne garder que les sous-totaux par région : <code>HAVING GROUPING_ID(m.region, p.categorie) = 1</code>. Dans un rapport APEX, <code>niveau</code> servira à mettre les totaux en gras.')}

    <h3>5. Les fonctions de fenêtrage (analytiques)</h3>
    <p>Une fonction analytique calcule une valeur <strong>pour chaque ligne</strong> à partir d'un ensemble de lignes voisines (la <strong>fenêtre</strong>), sans regrouper les lignes. Syntaxe :</p>
    ${H.code(
      'sql',
      `
      fonction(expr) OVER (
        PARTITION BY ...     -- découpe en groupes indépendants (optionnel)
        ORDER BY ...         -- ordre dans chaque groupe (pour rangs, cumuls, LAG…)
        ROWS BETWEEN ...     -- bornes de la fenêtre (optionnel)
      )
    `,
    )}
    ${H.tbl(
      ['Besoin OLAP', 'Fonction', 'Exemple'],
      [
        [
          'Classement',
          '<code>RANK</code>, <code>DENSE_RANK</code>, <code>ROW_NUMBER</code>',
          'Rang du produit dans sa catégorie',
        ],
        [
          'Part du total',
          '<code>RATIO_TO_REPORT</code> ou <code>x / SUM(x) OVER ()</code>',
          'Poids de chaque région dans le CA',
        ],
        ['Cumul (YTD)', '<code>SUM(x) OVER (… ORDER BY … ROWS UNBOUNDED PRECEDING)</code>', 'CA cumulé depuis janvier'],
        [
          'Moyenne mobile',
          '<code>AVG(x) OVER (… ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)</code>',
          'Tendance lissée sur 3 mois',
        ],
        ['Comparaison N-1', '<code>LAG(x, n)</code> / <code>LEAD(x, n)</code>', "CA du même mois l'an dernier"],
        ['Première / dernière valeur', '<code>FIRST_VALUE</code>, <code>LAST_VALUE</code>', 'Stock de fin de période'],
      ],
    )}
    <p>Une requête complète qui combine agrégation et fonctions de fenêtrage (les fonctions analytiques s'appliquent <strong>après</strong> le <code>GROUP BY</code>, d'où les <code>SUM(SUM(…))</code>) :</p>
    ${H.code(
      'sql',
      `
      SELECT t.annee,
             t.mois_num,
             SUM(f.montant_ht)                                         AS ca_mois,
             -- cumul depuis le début de l'année
             SUM(SUM(f.montant_ht)) OVER (PARTITION BY t.annee
                                          ORDER BY t.mois_num
                                          ROWS UNBOUNDED PRECEDING)    AS ca_cumul_annee,
             -- même mois l'année précédente
             LAG(SUM(f.montant_ht)) OVER (PARTITION BY t.mois_num
                                          ORDER BY t.annee)            AS ca_mois_n_1,
             -- moyenne mobile 3 mois
             ROUND(AVG(SUM(f.montant_ht)) OVER (ORDER BY t.annee, t.mois_num
                                                ROWS BETWEEN 2 PRECEDING
                                                AND CURRENT ROW), 0)   AS moy_mobile_3m,
             -- part du mois dans l'année
             ROUND(100 * RATIO_TO_REPORT(SUM(f.montant_ht))
                         OVER (PARTITION BY t.annee), 1)               AS part_annee_pct
      FROM   fait_ventes f
      JOIN   dim_temps t ON t.date_key = f.date_key
      GROUP  BY t.annee, t.mois_num
      ORDER  BY t.annee, t.mois_num;
    `,
    )}
    ${H.callout('warn', 'LAG et mois manquants', "<code>LAG</code> prend la ligne précédente, pas « le mois précédent ». Si un mois n'a aucune vente, il n'existe pas dans le résultat et LAG décale tout. Solution : partir de <code>dim_temps</code> en <code>LEFT JOIN</code> vers les faits pour avoir toutes les périodes.")}

    <h4>Rang : RANK, DENSE_RANK, ROW_NUMBER</h4>
    ${H.tbl(
      ['Produit', '#CA', '#RANK', '#DENSE_RANK', '#ROW_NUMBER'],
      [
        ['Vélo route', '500', '1', '1', '1'],
        ['VTT', '500', '1', '1', '2'],
        ['Casque', '300', '3', '2', '3'],
        ['Gants', '100', '4', '3', '4'],
      ],
      "En cas d'égalité : RANK saute des rangs, DENSE_RANK non, ROW_NUMBER départage arbitrairement.",
    )}
    <h4>Top-N par groupe</h4>
    ${H.code(
      'sql',
      `
      SELECT categorie, libelle, ca, rang
      FROM  (SELECT p.categorie, p.libelle,
                    SUM(f.montant_ht) AS ca,
                    RANK() OVER (PARTITION BY p.categorie
                                 ORDER BY SUM(f.montant_ht) DESC) AS rang
             FROM   fait_ventes f
             JOIN   dim_produit p ON p.produit_key = f.produit_key
             GROUP  BY p.categorie, p.libelle)
      WHERE  rang <= 3                       -- on filtre APRÈS le calcul du rang
      ORDER  BY categorie, rang;
    `,
    )}
    <p>On ne peut pas écrire <code>WHERE rang &lt;= 3</code> dans la même requête que le <code>RANK()</code> : les fonctions analytiques sont évaluées après le <code>WHERE</code>. D'où la sous-requête. D'autres bases (Snowflake, BigQuery, DuckDB) proposent pour cela une clause <code>QUALIFY</code> ; la sous-requête, elle, fonctionne partout, Oracle compris.</p>
  `,
  keypoints: [
    'ROLLUP(a,b) → (a,b), (a), () ; CUBE(a,b) → toutes les combinaisons ; GROUPING SETS → sur mesure.',
    'GROUPING(col) = 1 sur les lignes où col est agrégée ; GROUPING_ID identifie le niveau.',
    'Fonction OVER(PARTITION BY … ORDER BY … ROWS …) : calcul par ligne sans regrouper.',
    'Cumul, moyenne mobile, LAG pour N-1, RATIO_TO_REPORT pour les parts, RANK pour les top-N (filtré dans une sous-requête).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Combien de niveaux de regroupement produit <code>GROUP BY ROLLUP(annee, trimestre, mois)</code> ?',
      options: ['3', '4', '6', '8'],
      answer: 1,
      explain:
        "ROLLUP sur n colonnes produit n + 1 niveaux : (annee, trimestre, mois), (annee, trimestre), (annee) et () le total général. C'est CUBE qui en produirait 2³ = 8.",
    },
    {
      type: 'qcm',
      q: 'Dans une requête avec <code>ROLLUP(region, categorie)</code>, que vaut <code>GROUPING(categorie)</code> sur la ligne « sous-total de la région Sud » ?',
      options: ['0', '1', 'NULL', 'Le nombre de catégories'],
      answer: 1,
      explain:
        'Sur une ligne de sous-total par région, la catégorie est agrégée : <code>GROUPING(categorie) = 1</code>, et <code>GROUPING(region) = 0</code> puisque la région est précisée.',
    },
    {
      type: 'qcm',
      q: 'Deux produits sont ex æquo en 2<sup>e</sup> position. Quel rang reçoit le produit suivant avec <code>DENSE_RANK()</code> ?',
      options: ['2', '3', '4', "Il n'a pas de rang"],
      answer: 1,
      explain:
        'DENSE_RANK ne laisse pas de trou : 1, 2, 2, <strong>3</strong>. RANK donnerait 1, 2, 2, 4. ROW_NUMBER donnerait 1, 2, 3, 4 en départageant arbitrairement.',
    },
    {
      type: 'open',
      q: 'Écrivez la requête qui affiche le CA 2025 par région et par catégorie, avec un sous-total par région libellé « Total &lt;région&gt; » et un total général libellé « TOTAL ».',
      hint: 'ROLLUP + GROUPING dans des CASE.',
      answer: `${H.code(
        'sql',
        `
        SELECT CASE WHEN GROUPING(m.region) = 1 THEN 'TOTAL'
                    ELSE m.region END                          AS region,
               CASE WHEN GROUPING(m.region) = 1 THEN NULL
                    WHEN GROUPING(p.categorie) = 1 THEN 'Total ' || m.region
                    ELSE p.categorie END                       AS categorie,
               SUM(f.montant_ht)                               AS ca
        FROM   fait_ventes f
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        JOIN   dim_produit p ON p.produit_key = f.produit_key
        WHERE  t.annee = 2025
        GROUP  BY ROLLUP (m.region, p.categorie)
        ORDER  BY GROUPING(m.region), m.region,
                  GROUPING(p.categorie), p.categorie;
      `,
      )}<p>Le tri sur <code>GROUPING(...)</code> place chaque sous-total juste après les lignes de sa région, et le total général en dernier.</p>`,
      criteria: [
        'GROUP BY ROLLUP(region, categorie)',
        'Libellés calculés avec GROUPING et non avec NVL (qui confondrait avec de vrais NULL)',
        'Filtre 2025 dans le WHERE',
        'Tri qui place correctement les totaux',
      ],
    },
    {
      type: 'open',
      q: 'Écrivez la requête qui donne, pour 2025, les <strong>3 meilleurs produits de chaque catégorie</strong> en CA, avec leur part (%) dans le CA de leur catégorie.',
      answer: `${H.code(
        'sql',
        `
        SELECT categorie, libelle, ca, part_cat_pct, rang
        FROM  (SELECT p.categorie,
                      p.libelle,
                      SUM(f.montant_ht) AS ca,
                      ROUND(100 * RATIO_TO_REPORT(SUM(f.montant_ht))
                                  OVER (PARTITION BY p.categorie), 1) AS part_cat_pct,
                      RANK() OVER (PARTITION BY p.categorie
                                   ORDER BY SUM(f.montant_ht) DESC)   AS rang
               FROM   fait_ventes f
               JOIN   dim_produit p ON p.produit_key = f.produit_key
               JOIN   dim_temps   t ON t.date_key    = f.date_key
               WHERE  t.annee = 2025
               GROUP  BY p.categorie, p.libelle)
        WHERE  rang <= 3
        ORDER  BY categorie, rang;
      `,
      )}<p>Point important : la part est calculée <strong>dans la sous-requête</strong>, sur toutes les lignes de la catégorie. Si on filtrait d'abord les 3 premiers, la part serait calculée sur ces 3 seulement et la somme ferait 100 %.</p>`,
      criteria: [
        "Sous-requête + filtre rang <= 3 à l'extérieur",
        'RANK (ou DENSE_RANK / ROW_NUMBER) avec PARTITION BY categorie',
        'Part calculée avant le filtre (RATIO_TO_REPORT ou SUM OVER)',
        'Filtre 2025',
      ],
    },
  ],
};
