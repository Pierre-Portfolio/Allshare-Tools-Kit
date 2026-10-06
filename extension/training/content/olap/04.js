import { H } from '../helpers.js';

export default {
  id: 'olap-4',
  short: 'Étoile, flocon, constellation',
  title: 'Schémas en étoile, en flocon et en constellation',
  level: 'Débutant → Intermédiaire',
  duration: '30 min',
  intro:
    "Les faits et les dimensions s'assemblent selon trois formes classiques. Choisir la bonne influence la simplicité des requêtes et les performances.",
  objectives: [
    'Dessiner et créer un schéma en étoile',
    "Expliquer ce qu'est un flocon et quand il se justifie",
    'Comprendre la constellation et les dimensions conformes',
    'Écrire une requête typique sur une étoile (star join)',
  ],
  content: `
    <h3>Le schéma en étoile</h3>
    <p>Une table de faits au centre, reliée directement à chaque dimension. Les dimensions sont <strong>dénormalisées</strong> : toute la hiérarchie produit (produit → sous-catégorie → catégorie) tient dans une seule table.</p>
    <figure class="figure part-olap">
      <svg class="dg" viewBox="0 0 560 300" width="560" role="img" aria-label="Schéma en étoile : fait_ventes au centre relié à dim_temps, dim_produit, dim_magasin, dim_client">
        <path class="ln-p" d="M280 150 105 60"/><path class="ln-p" d="M280 150 455 60"/>
        <path class="ln-p" d="M280 150 105 240"/><path class="ln-p" d="M280 150 455 240"/>
        <rect class="box-p" x="170" y="100" width="220" height="100" rx="8"/>
        <text x="280" y="122" text-anchor="middle" class="t-b">fait_ventes</text>
        <text x="280" y="142" text-anchor="middle" class="t-m">date_key · produit_key</text>
        <text x="280" y="158" text-anchor="middle" class="t-m">magasin_key · client_key</text>
        <text x="280" y="182" text-anchor="middle" class="t-m">quantite · montant · marge</text>
        <rect class="box" x="10" y="20" width="190" height="72" rx="8"/>
        <text x="105" y="43" text-anchor="middle" class="t-b">dim_temps</text>
        <text x="105" y="62" text-anchor="middle" class="t-m">jour · mois · trimestre</text>
        <text x="105" y="78" text-anchor="middle" class="t-m">année · férié</text>
        <rect class="box" x="360" y="20" width="190" height="72" rx="8"/>
        <text x="455" y="43" text-anchor="middle" class="t-b">dim_produit</text>
        <text x="455" y="62" text-anchor="middle" class="t-m">libellé · marque</text>
        <text x="455" y="78" text-anchor="middle" class="t-m">sous-catég. · catégorie</text>
        <rect class="box" x="10" y="208" width="190" height="72" rx="8"/>
        <text x="105" y="231" text-anchor="middle" class="t-b">dim_magasin</text>
        <text x="105" y="250" text-anchor="middle" class="t-m">nom · ville</text>
        <text x="105" y="266" text-anchor="middle" class="t-m">région · pays</text>
        <rect class="box" x="360" y="208" width="190" height="72" rx="8"/>
        <text x="455" y="231" text-anchor="middle" class="t-b">dim_client</text>
        <text x="455" y="250" text-anchor="middle" class="t-m">nom · segment</text>
        <text x="455" y="266" text-anchor="middle" class="t-m">tranche d'âge · ville</text>
      </svg>
      <figcaption>Étoile : une seule jointure entre le fait et chaque dimension.</figcaption>
    </figure>
    <p><strong>Avantages</strong> : requêtes simples (une jointure par axe), très lisible pour les utilisateurs métier, optimisations dédiées des bases de données (<i>star transformation</i> d'Oracle, index bitmap). <strong>Inconvénient</strong> : redondance dans les dimensions (le libellé « Électroménager » est répété sur chaque produit), négligeable car les dimensions sont petites comparées aux faits.</p>
    ${H.code(
      'sql',
      `
      CREATE TABLE fait_ventes (
        date_key     NUMBER(8)    NOT NULL REFERENCES dim_temps(date_key),
        produit_key  NUMBER       NOT NULL REFERENCES dim_produit(produit_key),
        magasin_key  NUMBER       NOT NULL REFERENCES dim_magasin(magasin_key),
        client_key   NUMBER       NOT NULL REFERENCES dim_client(client_key),
        num_ticket   VARCHAR2(20) NOT NULL,          -- dimension dégénérée
        quantite     NUMBER(10)   NOT NULL,
        montant_ht   NUMBER(12,2) NOT NULL,
        marge        NUMBER(12,2) NOT NULL
      );

      -- Index bitmap sur les clés étrangères : idéal pour les filtres combinés (Oracle Enterprise Edition)
      CREATE BITMAP INDEX bix_ventes_date    ON fait_ventes(date_key);
      CREATE BITMAP INDEX bix_ventes_produit ON fait_ventes(produit_key);
      CREATE BITMAP INDEX bix_ventes_magasin ON fait_ventes(magasin_key);
    `,
    )}
    <p>La requête typique, le <strong>star join</strong> : on filtre sur les dimensions, on regroupe par leurs attributs, on agrège les mesures du fait.</p>
    ${H.code(
      'sql',
      `
      SELECT t.trimestre,
             p.categorie,
             SUM(f.montant_ht)                     AS ca_ht,
             SUM(f.marge)                          AS marge,
             ROUND(SUM(f.marge) / SUM(f.montant_ht) * 100, 1) AS taux_marge_pct
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      WHERE  t.annee  = 2025
      AND    m.region = 'Occitanie'
      GROUP  BY t.trimestre, p.categorie
      ORDER  BY t.trimestre, ca_ht DESC;
    `,
    )}

    <h3>Le schéma en flocon (snowflake)</h3>
    <p>On <strong>normalise</strong> les dimensions : la hiérarchie est éclatée en plusieurs tables reliées entre elles.</p>
    <figure class="figure part-olap">
      <svg class="dg" viewBox="0 0 620 120" width="620" role="img" aria-label="Flocon : fait_ventes vers dim_produit vers dim_sous_categorie vers dim_categorie">
        <defs><marker id="ah-o4" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" class="arrow"/></marker></defs>
        <rect class="box-p" x="10" y="35" width="120" height="50" rx="8"/><text x="70" y="65" text-anchor="middle" class="t-b">fait_ventes</text>
        <path class="ln" d="M130 60h28" marker-end="url(#ah-o4)"/>
        <rect class="box" x="162" y="35" width="130" height="50" rx="8"/><text x="227" y="57" text-anchor="middle" class="t-b">dim_produit</text><text x="227" y="74" text-anchor="middle" class="t-m">sous_cat_key</text>
        <path class="ln" d="M292 60h28" marker-end="url(#ah-o4)"/>
        <rect class="box" x="324" y="35" width="140" height="50" rx="8"/><text x="394" y="57" text-anchor="middle" class="t-b">dim_sous_cat</text><text x="394" y="74" text-anchor="middle" class="t-m">categorie_key</text>
        <path class="ln" d="M464 60h28" marker-end="url(#ah-o4)"/>
        <rect class="box" x="496" y="35" width="114" height="50" rx="8"/><text x="553" y="65" text-anchor="middle" class="t-b">dim_categorie</text>
      </svg>
      <figcaption>Flocon : la dimension produit est découpée en trois tables.</figcaption>
    </figure>
    ${H.tbl(
      ['', 'Étoile', 'Flocon'],
      [
        ['Dimensions', 'Dénormalisées (une table par axe)', 'Normalisées (plusieurs tables par axe)'],
        ['Jointures', 'Une par dimension', 'Plusieurs par dimension'],
        ['Lisibilité métier', 'Excellente', 'Moyenne'],
        ['Redondance', 'Un peu dans les dimensions', 'Minimale'],
        ['Maintenance des hiérarchies', 'Mise à jour de plusieurs lignes', "Mise à jour d'une seule ligne"],
        ['Recommandation Kimball', 'Par défaut', 'À éviter, sauf cas particuliers'],
      ],
    )}
    ${H.callout('info', 'Quand le flocon se justifie', "<ul><li>Une sous-dimension très volumineuse et partagée (une table de géographie mondiale de 3 millions de lignes).</li><li>Un outil de restitution qui l'exige.</li><li>Une dimension « outrigger » : une date secondaire dans une dimension (date d'ouverture du magasin) qui réutilise dim_temps.</li></ul>")}

    <h3>La constellation (ou « galaxie »)</h3>
    <p>Plusieurs tables de faits partagent des dimensions communes. Exemple : <code>fait_ventes</code> et <code>fait_stocks</code> partagent <code>dim_temps</code>, <code>dim_produit</code> et <code>dim_magasin</code>.</p>
    <p>La condition pour que cela fonctionne : ces dimensions doivent être <strong>conformes</strong>, c'est-à-dire strictement identiques (mêmes clés, mêmes libellés) d'un fait à l'autre. On peut alors faire du <strong>drill-across</strong> : comparer ventes et stocks sur les mêmes axes.</p>
    ${H.code(
      'sql',
      `
      -- Drill-across : on agrège CHAQUE fait séparément, puis on joint les résultats
      WITH v AS (
        SELECT produit_key, SUM(quantite) AS qte_vendue
        FROM   fait_ventes WHERE date_key BETWEEN 20250301 AND 20250331
        GROUP  BY produit_key
      ), s AS (
        SELECT produit_key, SUM(qte_stock) AS stock_fin_mois
        FROM   fait_stocks WHERE date_key = 20250331
        GROUP  BY produit_key
      )
      SELECT p.categorie,
             SUM(v.qte_vendue)     AS vendu_mars,
             SUM(s.stock_fin_mois) AS stock_31_mars
      FROM   dim_produit p
      LEFT JOIN v ON v.produit_key = p.produit_key
      LEFT JOIN s ON s.produit_key = p.produit_key
      GROUP  BY p.categorie;
    `,
    )}
    ${H.callout('warn', 'Piège du « chasm trap »', "Ne joignez jamais deux tables de faits directement ligne à ligne : chaque vente serait multipliée par le nombre de lignes de stock correspondantes, et les sommes seraient fausses. Ce piège (deux faits reliés à la même dimension) s'appelle le <i>chasm trap</i> ; on le confond souvent avec le <i>fan trap</i>, qui naît d'une chaîne de jointures un-à-plusieurs. Agrégez d'abord chaque fait au même grain, puis joignez.")}

    <h3>La bus matrix</h3>
    <p>Outil de conception de Kimball : un tableau qui croise les processus métier (lignes) et les dimensions conformes (colonnes). Il sert de plan de route pour l'entrepôt.</p>
    ${H.tbl(
      ['Processus', 'Temps', 'Produit', 'Magasin', 'Client', 'Fournisseur'],
      [
        ['Ventes', '✓', '✓', '✓', '✓', ''],
        ['Stocks', '✓', '✓', '✓', '', ''],
        ['Achats', '✓', '✓', '', '', '✓'],
        ['Retours', '✓', '✓', '✓', '✓', ''],
      ],
    )}
  `,
  keypoints: [
    "Étoile : fait central + dimensions dénormalisées. C'est le choix par défaut.",
    'Flocon : dimensions normalisées, plus de jointures, à réserver aux cas particuliers.',
    'Constellation : plusieurs faits partagent des dimensions conformes, ce qui permet le drill-across.',
    "Deux faits ne se joignent jamais ligne à ligne : on agrège d'abord chacun au même grain.",
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Quelle est la caractéristique principale d'un schéma en étoile ?",
      options: [
        'Les dimensions sont normalisées en plusieurs tables',
        'La table de faits est reliée directement à des dimensions dénormalisées',
        "Il n'y a pas de table de faits",
        'Toutes les données sont dans une seule table',
      ],
      answer: 1,
      explain:
        "Dans l'étoile, chaque dimension est une seule table (dénormalisée) reliée par une jointure directe au fait central. Une table unique serait une « big flat table », un flocon aurait des dimensions éclatées.",
    },
    {
      type: 'qcm',
      q: 'Deux tables de faits partagent <code>dim_temps</code> et <code>dim_produit</code>. Quelle condition permet de comparer leurs chiffres de façon fiable ?',
      options: [
        'Que les deux faits aient le même nombre de lignes',
        'Que les dimensions partagées soient conformes (mêmes clés, mêmes libellés)',
        'Que les faits soient stockés dans le même tablespace',
        "Qu'on utilise un schéma en flocon",
      ],
      answer: 1,
      explain:
        "Les <strong>dimensions conformes</strong> garantissent qu'un même produit ou une même date ont la même clé et les mêmes attributs dans toute la constellation. C'est ce qui rend le drill-across possible.",
    },
    {
      type: 'qcm',
      q: 'Un analyste joint directement <code>fait_ventes</code> et <code>fait_stocks</code> sur <code>produit_key</code> puis fait <code>SUM(quantite)</code>. Que risque-t-il ?',
      options: [
        'Rien, le résultat est correct',
        'Une erreur de syntaxe SQL',
        'Des totaux gonflés, car les lignes se multiplient entre elles',
        'Des totaux trop faibles, car les NULL sont ignorés',
      ],
      answer: 2,
      explain:
        "C'est le <i>chasm trap</i> : chaque ligne de vente d'un produit est dupliquée autant de fois qu'il y a de lignes de stock pour ce produit. Il faut agréger chaque fait séparément (CTE ou sous-requêtes) puis joindre les résultats.",
    },
    {
      type: 'open',
      q: "Écrivez la requête SQL qui donne, pour l'année 2025, le chiffre d'affaires HT et la quantité vendue <strong>par région de magasin et par mois</strong>, sur l'étoile du cours. Triez par région puis par mois.",
      hint: 'Trois tables suffisent. Pensez à trier sur le numéro de mois, pas sur son libellé.',
      answer: `${H.code(
        'sql',
        `
        SELECT m.region,
               t.mois_num,
               t.mois_libelle,
               SUM(f.montant_ht) AS ca_ht,
               SUM(f.quantite)   AS quantite
        FROM   fait_ventes f
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        WHERE  t.annee = 2025
        GROUP  BY m.region, t.mois_num, t.mois_libelle
        ORDER  BY m.region, t.mois_num;
      `,
      )}<p>On garde <code>mois_num</code> dans le <code>GROUP BY</code> pour trier dans l'ordre chronologique : trier sur <code>mois_libelle</code> donnerait « Août, Avril, Décembre… ».</p>`,
      criteria: [
        'Jointures fait → dim_magasin et fait → dim_temps',
        "Filtre sur l'année dans dim_temps",
        'GROUP BY région + mois',
        'Tri chronologique correct (numéro de mois)',
      ],
    },
    {
      type: 'open',
      q: 'Votre base contient <code>dim_produit</code> avec 12 000 produits et les colonnes <code>sous_categorie</code> et <code>categorie</code>. Un DBA propose de passer en flocon « pour éviter la redondance ». Que lui répondez-vous ?',
      answer: `<p>La redondance est réelle mais <strong>négligeable</strong> : 12 000 lignes, quelques dizaines de catégories, soit quelques centaines de kilo-octets. En face, le flocon ajouterait deux jointures à <em>chaque</em> requête d'analyse, rendrait le modèle moins lisible pour les utilisateurs et outils BI, et priverait l'optimiseur de certaines optimisations d'étoile. Le vrai coût de l'étoile, c'est la mise à jour d'un libellé de catégorie sur plusieurs lignes : l'ETL le fait sans difficulté. On garde donc l'<strong>étoile</strong>, et on réserve le flocon aux très grosses sous-dimensions partagées.</p>`,
      criteria: [
        'Relativise le volume de la dimension',
        'Coût des jointures supplémentaires',
        'Lisibilité pour les utilisateurs',
        "Conclut sur l'étoile avec les exceptions possibles",
      ],
    },
  ],
};
