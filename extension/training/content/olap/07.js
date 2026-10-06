import { H } from '../helpers.js';

export default {
  id: 'olap-7',
  short: 'MOLAP, ROLAP & performance',
  title: 'Stockage et performance : MOLAP, ROLAP, HOLAP, vues matérialisées',
  level: 'Intermédiaire',
  duration: '40 min',
  intro:
    "Un cube est un concept. Physiquement, il faut le stocker et répondre vite. Voici les architectures possibles et les techniques d'accélération d'Oracle.",
  objectives: [
    'Comparer MOLAP, ROLAP et HOLAP',
    "Comprendre la pré-agrégation et l'explosion combinatoire",
    'Créer une vue matérialisée avec réécriture de requête (query rewrite)',
    'Connaître le partitionnement, le stockage colonne, et les langages MDX et DAX',
  ],
  content: `
    <h3>Trois architectures</h3>
    <div class="cards">
      <div><b>MOLAP</b><span>Multidimensional OLAP</span>Les données et les agrégats sont précalculés et stockés dans un format multidimensionnel propriétaire (tableaux). Ex. : Oracle Essbase, SSAS Multidimensionnel.</div>
      <div><b>ROLAP</b><span>Relational OLAP</span>Les données restent dans des tables relationnelles (étoile). Le moteur OLAP traduit chaque analyse en SQL. Ex. : Mondrian, Oracle Analytics sur base relationnelle.</div>
      <div><b>HOLAP</b><span>Hybrid OLAP</span>Le détail reste en relationnel, les agrégats sont stockés en multidimensionnel. Un drill-through va chercher le détail en SQL.</div>
    </div>
    ${H.tbl(
      ['Critère', 'MOLAP', 'ROLAP', 'HOLAP'],
      [
        ['Vitesse des requêtes', 'Excellente (précalculé)', 'Dépend de la base et des agrégats', "Bonne sur l'agrégé"],
        ['Volume supporté', 'Limité (des Go)', 'Très grand (To et plus)', 'Grand'],
        ['Temps de traitement', 'Long (« processing » du cube)', 'Nul ou faible', 'Moyen'],
        ['Fraîcheur des données', 'Après chaque traitement', 'Immédiate', 'Détail immédiat, agrégats après traitement'],
        ['Calculs complexes', 'Très riches (MDX, scripts)', 'Limités au SQL', "Riches sur l'agrégé"],
      ],
    )}
    <p>Aujourd'hui, la frontière s'estompe : les bases colonnaires et en mémoire (Oracle Database In-Memory, Snowflake, Power BI VertiPaq) rendent le ROLAP presque aussi rapide que le MOLAP, sans étape de traitement.</p>

    <h3>Pré-agréger : oui, mais pas tout</h3>
    <p>Le moyen le plus simple d'accélérer une requête d'agrégation est de l'avoir calculée à l'avance. Mais combien d'agrégats possibles ? Pour chaque dimension, on peut regrouper sur chacun de ses niveaux ou sur « Tous ». Le nombre de combinaisons est le <strong>produit</strong> des (niveaux + 1) :</p>
    ${H.tbl(
      ['Dimension', 'Niveaux', '#Choix (niveaux + « Tous »)'],
      [
        ['Temps', 'jour, mois, trimestre, année', '5'],
        ['Produit', 'produit, sous-catégorie, catégorie', '4'],
        ['Magasin', 'magasin, ville, région', '4'],
        ['Client', 'client, segment', '3'],
        ['__total__', 'Combinaisons', '', '5 × 4 × 4 × 3 = 240'],
      ],
    )}
    <p>Avec 10 dimensions, on dépasse le million : c'est l'<strong>explosion combinatoire</strong>. On ne précalcule donc que les agrégats <strong>les plus utilisés</strong>, et le moteur calcule les autres à partir de l'agrégat le plus proche (par exemple l'année à partir des mois).</p>

    <h3>Les vues matérialisées Oracle</h3>
    <p>Une <strong>vue matérialisée</strong> (MV) stocke physiquement le résultat d'une requête. Avec <code>ENABLE QUERY REWRITE</code>, l'optimiseur l'utilise <strong>automatiquement</strong> quand un utilisateur interroge les tables de base : l'application ne change pas, mais la requête lit quelques milliers de lignes au lieu de 500 millions.</p>
    ${H.code(
      'sql',
      `
      -- Journaux de modifications : permettent le rafraîchissement incrémental (FAST)
      CREATE MATERIALIZED VIEW LOG ON fait_ventes
        WITH ROWID, SEQUENCE (date_key, produit_key, montant_ht, quantite)
        INCLUDING NEW VALUES;

      CREATE MATERIALIZED VIEW mv_ventes_mois_produit
        BUILD IMMEDIATE                 -- calculée tout de suite
        REFRESH FAST ON DEMAND          -- mise à jour incrémentale, déclenchée par l'ETL
        ENABLE QUERY REWRITE            -- l'optimiseur peut s'en servir tout seul
      AS
      SELECT t.annee, t.mois_num, f.produit_key,
             SUM(f.montant_ht)   AS ca,
             SUM(f.quantite)     AS qte,
             COUNT(f.montant_ht) AS nb_montant,   -- requis pour le FAST refresh
             COUNT(*)            AS nb_lignes
      FROM   fait_ventes f
      JOIN   dim_temps t ON t.date_key = f.date_key
      GROUP  BY t.annee, t.mois_num, f.produit_key;

      -- En fin de chargement nocturne :
      BEGIN
        DBMS_MVIEW.REFRESH('MV_VENTES_MOIS_PRODUIT', method => 'F');  -- F = fast, C = complete
      END;
      /
    `,
    )}
    <p>Pour que la réécriture fonctionne aussi pour des niveaux supérieurs (trimestre, année), on déclare la hiérarchie à Oracle avec un objet <code>DIMENSION</code> :</p>
    ${H.code(
      'sql',
      `
      CREATE DIMENSION dim_temps_d
        LEVEL jour      IS dim_temps.date_key
        LEVEL mois      IS (dim_temps.annee, dim_temps.mois_num)
        LEVEL trimestre IS (dim_temps.annee, dim_temps.trimestre)
        LEVEL annee     IS dim_temps.annee
        HIERARCHY calendrier (jour CHILD OF mois CHILD OF trimestre CHILD OF annee);
    `,
    )}
    ${H.callout('tip', 'Vérifier la réécriture', "Lancez <code>EXPLAIN PLAN</code> sur votre requête : si la ligne <code>MAT_VIEW REWRITE ACCESS FULL</code> apparaît, la MV est utilisée. <code>DBMS_MVIEW.EXPLAIN_REWRITE</code> explique pourquoi elle ne l'est pas.")}

    <h3>Partitionnement</h3>
    <p>On découpe la table de faits en <strong>partitions par période</strong>. Une requête sur 2025 ne lit que les partitions de 2025 (<i>partition pruning</i>), et l'on peut archiver ou purger une année entière instantanément.</p>
    ${H.code(
      'sql',
      `
      CREATE TABLE fait_ventes_p (
        date_key    NUMBER(8) NOT NULL,
        date_vente  DATE      NOT NULL,
        produit_key NUMBER    NOT NULL,
        montant_ht  NUMBER(12,2)
      )
      PARTITION BY RANGE (date_vente)
      INTERVAL (NUMTOYMINTERVAL(1, 'MONTH'))        -- une partition créée automatiquement par mois
      ( PARTITION p_avant_2024 VALUES LESS THAN (DATE '2024-01-01') );
    `,
    )}

    <h3>Stockage en colonnes et compression</h3>
    <p>Une requête analytique lit peu de colonnes mais beaucoup de lignes. Un stockage <strong>par colonne</strong> ne lit que les colonnes utiles et compresse très bien (valeurs répétées). Oracle le propose avec <strong>Database In-Memory</strong> (<code>ALTER TABLE fait_ventes INMEMORY;</code>) et la compression HCC sur Exadata ; c'est aussi le principe de Snowflake, BigQuery, ClickHouse ou DuckDB.</p>

    <h3>Aperçu : interroger un cube en MDX et en DAX</h3>
    <p>Les moteurs MOLAP et tabulaires ont leurs propres langages. Vous n'aurez pas à les maîtriser dans ce parcours, mais savoir les lire aide beaucoup.</p>
    ${H.code(
      'mdx',
      `
      -- MDX (SSAS, Essbase) : axes explicites, membres entre crochets
      SELECT
        { [Measures].[CA], [Measures].[Marge] }          ON COLUMNS,
        NON EMPTY [Produit].[Catégorie].MEMBERS           ON ROWS
      FROM  [Ventes]
      WHERE ( [Temps].[Année].[2025], [Magasin].[Région].[Sud] )   -- le WHERE est un slice
    `,
    )}
    ${H.code(
      'text',
      `
      -- DAX (Power BI) : des mesures qui se recalculent selon le contexte de filtre
      Taux de marge := DIVIDE ( SUM ( Ventes[Marge] ), SUM ( Ventes[CA] ) )
      CA N-1        := CALCULATE ( SUM ( Ventes[CA] ), SAMEPERIODLASTYEAR ( 'Temps'[Date] ) )
    `,
    )}
    <p>Vous reconnaissez les principes de la notion 6 : le taux de marge est recalculé à partir des sommes, pas moyenné.</p>
  `,
  keypoints: [
    'MOLAP = précalculé et rapide mais limité ; ROLAP = SQL sur étoile, scalable ; HOLAP = mélange.',
    "Nombre d'agrégats possibles = produit des (niveaux + 1) : on ne précalcule que les plus utiles.",
    "Vue matérialisée + ENABLE QUERY REWRITE = accélération transparente pour l'application.",
    'Partitionner les faits par date, envisager le stockage colonne (In-Memory).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Quelle architecture conserve le <strong>détail</strong> en relationnel et les <strong>agrégats</strong> dans un format multidimensionnel ?',
      options: ['MOLAP', 'ROLAP', 'HOLAP', 'OLTP'],
      answer: 2,
      explain:
        "HOLAP (Hybrid OLAP) combine les deux : réponses rapides sur l'agrégé (partie MOLAP) et détail volumineux laissé dans la base relationnelle (partie ROLAP).",
    },
    {
      type: 'qcm',
      q: "Temps a 4 niveaux (jour, mois, trimestre, année), Produit 3 niveaux, Magasin 3 niveaux. En comptant « Tous » pour chaque dimension, combien de combinaisons d'agrégats sont possibles ?",
      options: ['10', '36', '80', '240'],
      answer: 2,
      explain:
        '(4 + 1) × (3 + 1) × (3 + 1) = 5 × 4 × 4 = <strong>80</strong>. Chaque dimension offre ses niveaux plus « Tous » (dimension absente du regroupement). 36 oublie le niveau « Tous ».',
    },
    {
      type: 'qcm',
      q: "Quelle clause permet à l'optimiseur Oracle d'utiliser automatiquement une vue matérialisée alors que la requête interroge les tables de base ?",
      options: [
        '<code>REFRESH FAST</code>',
        '<code>BUILD IMMEDIATE</code>',
        '<code>ENABLE QUERY REWRITE</code>',
        '<code>WITH ROWID</code>',
      ],
      answer: 2,
      explain:
        '<code>ENABLE QUERY REWRITE</code> autorise la réécriture. <code>REFRESH FAST</code> concerne la mise à jour incrémentale, <code>BUILD IMMEDIATE</code> le calcul initial, <code>WITH ROWID</code> les journaux de MV.',
    },
    {
      type: 'open',
      q: 'Écrivez une vue matérialisée <code>mv_ca_region_trimestre</code> qui donne le CA et la marge par région de magasin, année et trimestre, rafraîchie complètement chaque nuit et utilisable par la réécriture de requêtes.',
      answer: `${H.code(
        'sql',
        `
        CREATE MATERIALIZED VIEW mv_ca_region_trimestre
          BUILD IMMEDIATE
          REFRESH COMPLETE ON DEMAND
          ENABLE QUERY REWRITE
        AS
        SELECT m.region, t.annee, t.trimestre,
               SUM(f.montant_ht) AS ca,
               SUM(f.marge)      AS marge,
               COUNT(*)          AS nb_lignes
        FROM   fait_ventes f
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        GROUP  BY m.region, t.annee, t.trimestre;

        -- Dans le traitement nocturne, après le chargement des faits :
        BEGIN DBMS_MVIEW.REFRESH('MV_CA_REGION_TRIMESTRE', method => 'C'); END;
        /
      `,
      )}<p>On stocke la marge et le CA (additifs) et non le taux de marge : le taux se recalcule à la volée et reste juste à tout niveau.</p>`,
      criteria: [
        'REFRESH COMPLETE ON DEMAND + ENABLE QUERY REWRITE',
        'Jointures et GROUP BY corrects',
        'Mesures additives stockées (pas de ratio)',
        'Rafraîchissement déclenché après le chargement',
      ],
    },
    {
      type: 'open',
      q: 'La table <code>fait_ventes</code> contient 600 millions de lignes sur 8 ans. Les utilisateurs se plaignent : « le tableau de bord 2025 par catégorie met 2 minutes ». Proposez au moins trois optimisations, par ordre de priorité, en expliquant leur effet.',
      answer: `<ol>
        <li><strong>Partitionner</strong> les faits par mois ou par année : la requête sur 2025 ne lit plus que 1/8 des données (partition pruning).</li>
        <li><strong>Créer une vue matérialisée</strong> agrégée (mois × catégorie × région) avec <code>ENABLE QUERY REWRITE</code> : le tableau de bord lit quelques milliers de lignes, sans modification de l'application.</li>
        <li><strong>Index bitmap</strong> sur les clés étrangères du fait (et <i>star transformation</i> activée) pour les filtres combinés sur plusieurs dimensions.</li>
        <li><strong>Stockage colonne</strong> (Database In-Memory) ou compression pour réduire les lectures disque.</li>
        <li>Vérifier le plan d'exécution (<code>EXPLAIN PLAN</code>), les statistiques de l'optimiseur (<code>DBMS_STATS</code>) et que les jointures se font bien sur les clés de substitution.</li>
      </ol>`,
      criteria: [
        'Partitionnement par date',
        'Pré-agrégation (vue matérialisée) avec réécriture',
        'Indexation adaptée (bitmap)',
        "Justifie l'effet de chaque mesure",
        "Bonus : analyse du plan d'exécution / statistiques",
      ],
    },
  ],
};
