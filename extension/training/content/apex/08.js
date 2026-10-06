import { H } from '../helpers.js';

export default {
  id: 'apex-8',
  short: 'Projet : dashboard OLAP',
  title: "Projet fil rouge : un tableau de bord OLAP dans APEX, jusqu'au déploiement",
  level: 'Intermédiaire',
  duration: '90 min',
  intro:
    "On assemble tout : l'étoile du module OLAP, le SQL analytique, les régions, les Dynamic Actions et la sécurité, pour livrer un vrai tableau de bord décisionnel, puis le déployer.",
  objectives: [
    'Installer le jeu de données en étoile dans son workspace',
    'Construire une page de pilotage : KPI, graphiques N / N-1, sous-totaux, filtres réactifs',
    'Mettre en place drill-down et drill-through entre pages',
    "Exporter, versionner et déployer l'application",
  ],
  content: `
    <h3>Le cahier des charges</h3>
    ${H.callout('analogy', 'Le client', "Une enseigne de 12 magasins de cycles répartis dans 4 régions veut un outil de pilotage : « Je veux voir en un coup d'œil le CA, la marge et leur évolution par rapport à l'an dernier, pouvoir zoomer sur une région, puis descendre jusqu'aux tickets. Mes directeurs régionaux ne doivent voir que leur région. »")}
    <p>Traduction OLAP : un cube <strong>Temps × Produit × Magasin</strong>, les mesures <strong>CA, marge, quantité, tickets</strong> ; des opérations de <strong>slice</strong> (année, région), <strong>drill-down</strong> (région → magasin), <strong>drill-through</strong> (vers les tickets), et une <strong>comparaison N-1</strong>.</p>

    <h3>Étape 1 : installer les données</h3>
    <p>Dans votre workspace : <b>SQL Workshop &gt; SQL Scripts &gt; Upload</b>, choisissez <a href="sql/fil_rouge_ventes.sql" download><code>fil_rouge_ventes.sql</code></a> (à télécharger ici), puis <b>Run</b>. Le script crée :</p>
    ${H.tbl(
      ['Objet', 'Contenu'],
      [
        ['<code>dim_temps</code>', 'Toutes les dates de 2023 à 2026'],
        ['<code>dim_produit</code>', '24 produits, 4 catégories (Vélos, VAE, Accessoires, Vêtements)'],
        ['<code>dim_magasin</code>', '12 magasins, 4 régions'],
        [
          '<code>fait_ventes</code>',
          'Environ 60 000 lignes de tickets générées de façon réaliste (saisonnalité, croissance)',
        ],
        ['<code>v_ventes_detail</code>', 'Vue aplatie pour les rapports interactifs'],
        ['<code>droits_region</code>', 'Table de sécurité par région (à compléter avec vos utilisateurs)'],
      ],
    )}

    <h3>Étape 2 : la page de pilotage (page 1)</h3>
    <figure class="figure part-apex">
      <svg class="dg" viewBox="0 0 640 300" width="640" role="img" aria-label="Maquette de la page de pilotage : filtres, 4 KPI, graphique mensuel, graphique par région, tableau par catégorie">
        <rect class="box-2" x="10" y="10" width="620" height="36" rx="6"/>
        <text x="24" y="33" class="t-m">P1_ANNEE [2025 ▾]    P1_REGION [Toutes ▾]</text>
        <rect class="box-p" x="10" y="56" width="146" height="54" rx="6"/><text x="83" y="78" text-anchor="middle" class="t-s">CA</text><text x="83" y="99" text-anchor="middle" class="t-b">4,82 M€</text>
        <rect class="box-p" x="168" y="56" width="146" height="54" rx="6"/><text x="241" y="78" text-anchor="middle" class="t-s">Évolution N-1</text><text x="241" y="99" text-anchor="middle" class="t-b">+7,9 %</text>
        <rect class="box-p" x="326" y="56" width="146" height="54" rx="6"/><text x="399" y="78" text-anchor="middle" class="t-s">Taux de marge</text><text x="399" y="99" text-anchor="middle" class="t-b">31,4 %</text>
        <rect class="box-p" x="484" y="56" width="146" height="54" rx="6"/><text x="557" y="78" text-anchor="middle" class="t-s">Tickets</text><text x="557" y="99" text-anchor="middle" class="t-b">18 240</text>
        <rect class="box" x="10" y="120" width="380" height="170" rx="6"/>
        <text x="24" y="140" class="t-b">CA mensuel N vs N-1</text>
        <path class="ln" d="M30 262 L80 240 L130 220 L180 196 L230 184 L280 200 L330 226 L375 244"/>
        <path class="ln-p" d="M30 256 L80 232 L130 206 L180 178 L230 168 L280 186 L330 214 L375 236"/>
        <text x="24" y="282" class="t-m">J  F  M  A  M  J  J  A  S  O  N  D</text>
        <rect class="box" x="402" y="120" width="228" height="80" rx="6"/>
        <text x="414" y="140" class="t-b">CA par région</text>
        <rect class="box-a" x="414" y="150" width="150" height="9"/><rect class="box-a" x="414" y="163" width="120" height="9"/>
        <rect class="box-a" x="414" y="176" width="96" height="9"/><rect class="box-a" x="414" y="189" width="70" height="9"/>
        <rect class="box" x="402" y="210" width="228" height="80" rx="6"/>
        <text x="414" y="230" class="t-b">Par catégorie (ROLLUP)</text>
        <text x="414" y="250" class="t-m">Vélos ........ 2,10 M€</text>
        <text x="414" y="266" class="t-m">VAE ......... 1,64 M€</text>
        <text x="414" y="282" class="t-m">Total ....... 4,82 M€</text>
      </svg>
      <figcaption>Maquette : filtres (slice), 4 KPI, tendance N / N-1, drill-down par région, sous-totaux par catégorie.</figcaption>
    </figure>
    <h4>2a. Les filtres</h4>
    <ul>
      <li><code>P1_ANNEE</code> : Select List, LOV <code>SELECT DISTINCT annee d, annee r FROM dim_temps WHERE annee &lt;= EXTRACT(YEAR FROM SYSDATE) ORDER BY 1 DESC</code>, défaut : année courante.</li>
      <li><code>P1_REGION</code> : Select List sur la LOV partagée des régions, valeur nulle « Toutes ».</li>
    </ul>
    <h4>2b. Les KPI (agrégation conditionnelle N / N-1)</h4>
    ${H.code(
      'sql',
      `
      WITH k AS (
        SELECT SUM(CASE WHEN t.annee = :P1_ANNEE     THEN f.montant_ht END) AS ca_n,
               SUM(CASE WHEN t.annee = :P1_ANNEE - 1 THEN f.montant_ht END) AS ca_n1,
               SUM(CASE WHEN t.annee = :P1_ANNEE     THEN f.marge      END) AS marge_n,
               COUNT(DISTINCT CASE WHEN t.annee = :P1_ANNEE THEN f.num_ticket END) AS tickets_n
        FROM   fait_ventes f
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        WHERE  t.annee IN (:P1_ANNEE, :P1_ANNEE - 1)
        AND   (:P1_REGION IS NULL OR m.region = :P1_REGION)
      )
      SELECT 'CA'            AS label, TO_CHAR(ca_n / 1e6, 'FM990D00') || ' M€' AS valeur FROM k
      UNION ALL
      SELECT 'Évolution N-1',          TO_CHAR(100 * (ca_n - ca_n1) / NULLIF(ca_n1, 0), 'S990D0') || ' %' FROM k
      UNION ALL
      SELECT 'Taux de marge',          TO_CHAR(100 * marge_n / NULLIF(ca_n, 0), 'FM990D0') || ' %' FROM k
      UNION ALL
      SELECT 'Tickets',                TO_CHAR(tickets_n, 'FM999G999') FROM k;
    `,
    )}
    <p>Région de type <b>Classic Report</b> avec le template <b>Badge List</b> (colonnes LABEL et VALEUR), ou région <b>Cards</b>. On calcule N et N-1 en <strong>un seul passage</strong> sur les faits grâce aux <code>CASE</code> dans les <code>SUM</code>.</p>
    <h4>2c. Tendance mensuelle N / N-1</h4>
    <p>Graphique en lignes, requête avec colonne <code>series</code> (voir notion 3) : une série par année. Ajoutez une seconde série « Moyenne mobile 3 mois » avec <code>AVG(…) OVER (… ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)</code> (module OLAP, notion 8).</p>
    <h4>2d. CA par région, avec drill-down</h4>
    ${H.code(
      'sql',
      `
      SELECT m.region AS label, SUM(f.montant_ht) AS value
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      WHERE  t.annee = :P1_ANNEE
      AND   (:P1_REGION IS NULL OR m.region = :P1_REGION)
      GROUP  BY m.region
      ORDER  BY value DESC;
    `,
    )}
    <p>Série &gt; <b>Link</b> : page 2, items <code>P2_REGION = &amp;LABEL.</code> et <code>P2_ANNEE = &amp;P1_ANNEE.</code>, Clear Cache = 2. Un clic sur une barre = drill-down vers le détail de la région.</p>
    <h4>2e. Tableau par catégorie avec sous-totaux</h4>
    <p>Classic Report sur une requête <code>GROUP BY ROLLUP(p.categorie, p.sous_categorie)</code>, construite comme celle de la notion 3 : libellés de totaux avec <code>GROUPING</code>, totaux en gras via <code>GROUPING_ID</code> et une expression HTML.</p>
    <h4>2f. La réactivité</h4>
    <p>Une DA <i>Change</i> sur <code>P1_ANNEE, P1_REGION</code> avec une action <b>Refresh</b> par région ; chaque région déclare <code>P1_ANNEE,P1_REGION</code> dans <i>Page Items to Submit</i>.</p>

    <h3>Étape 3 : les pages de détail</h3>
    <ul>
      <li><strong>Page 2 « Région »</strong> : graphique CA par magasin (drill-down suivant) + Faceted Search (catégorie, mois) + Cards des magasins.</li>
      <li><strong>Page 3 « Tickets »</strong> : Interactive Report sur <code>v_ventes_detail</code> filtré par région / magasin / mois reçus en paramètres : c'est le <strong>drill-through</strong>. Rapport sauvegardé public « Pivot par trimestre ».</li>
      <li><strong>Page 4 « Objectifs »</strong> : Interactive Grid éditable sur une table d'objectifs mensuels par magasin (réservée aux managers).</li>
    </ul>

    <h3>Étape 4 : sécurité</h3>
    <p>Remplacez <code>fait_ventes</code> par la vue sécurisée de la notion 7 dans toutes les sources, et protégez la page 4 par l'autorisation « Est manager ». Activez Session State Protection.</p>

    <h3>Étape 5 : performance</h3>
    <ul>
      <li>Une vue matérialisée mensuelle avec <code>ENABLE QUERY REWRITE</code> (module OLAP, notion 7) accélère KPI et graphiques sans toucher aux requêtes.</li>
      <li><b>Lazy Loading</b> sur les régions secondaires : la page s'affiche immédiatement, les régions se chargent ensuite.</li>
      <li>Mode <b>Debug</b> pour repérer la région la plus lente.</li>
    </ul>

    <h3>Étape 6 : exporter, versionner, déployer</h3>
    ${H.tbl(
      ['Étape', 'Comment'],
      [
        [
          "Exporter l'application",
          'App Builder &gt; Export / Import &gt; Export (fichier <code>f100.sql</code>), ou SQLcl',
        ],
        [
          'Embarquer les tables',
          "<b>Supporting Objects</b> : scripts d'installation (DDL, données de référence) exécutés à l'import",
        ],
        [
          'Versionner',
          'Export « split » (un fichier par page) ou format lisible (YAML/JSON des versions récentes) dans Git',
        ],
        ['Déployer', "Import dans le workspace cible, en conservant ou changeant l'ID d'application"],
      ],
    )}
    ${H.code(
      'text',
      `
      -- Avec SQLcl, connecté au schéma du workspace
      SQL> apex export -applicationid 100 -split -skipExportDate
      SQL> -- … commit Git …
      SQL> @f100/install.sql          -- sur l'environnement cible
    `,
    )}
    ${H.callout('tip', 'Pour aller plus loin', 'Exposez vos KPI en <strong>API REST</strong> avec ORDS (SQL Workshop &gt; RESTful Services) : un module <code>pilotage/</code>, un template <code>kpi/:annee</code>, un handler GET qui exécute la requête des KPI. Le même cube alimente alors APEX, Excel ou une autre application.')}
  `,
  keypoints: [
    'Un tableau de bord APEX = une traduction directe des opérations OLAP : slice (filtres), drill-down (liens de graphique), drill-through (IR de détail).',
    'Agrégation conditionnelle (SUM(CASE…)) pour N et N-1 en un seul passage ; ROLLUP pour les sous-totaux.',
    'Page Items to Submit + DA Refresh pour la réactivité ; vue sécurisée pour les droits ; MV pour la performance.',
    'Déploiement : export (+ Supporting Objects), SQLcl, Git.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Sur le graphique « CA par région » de la page 1, comment ouvrir la page 2 filtrée sur la région cliquée ?',
      options: [
        'Une Dynamic Action Page Load sur la page 2',
        'Un lien sur la série avec <code>P2_REGION = &amp;LABEL.</code>',
        'Un processus After Submit sur la page 1',
        'Une LOV en cascade',
      ],
      answer: 1,
      explain:
        "Chaque point d'une série de graphique peut être un lien. La substitution <code>&amp;LABEL.</code> (ou <code>&amp;VALUE.</code>, ou une colonne) transmet la valeur cliquée à un item de la page cible : c'est le drill-down.",
    },
    {
      type: 'qcm',
      q: "Pour installer l'application ET ses tables sur un autre environnement en une seule importation, on utilise :",
      options: [
        'Les Static Application Files',
        "Les Supporting Objects de l'application",
        'Le Theme Roller',
        'Un rapport sauvegardé',
      ],
      answer: 1,
      explain:
        "Les <strong>Supporting Objects</strong> contiennent les scripts d'installation (et de désinstallation) exécutés lors de l'import : tables, vues, packages, données de référence.",
    },
    {
      type: 'qcm',
      q: "Quelle technique permet de calculer le CA de l'année N et celui de N-1 en un seul passage sur la table de faits ?",
      options: [
        'Deux requêtes séparées jointes par UNION',
        '<code>SUM(CASE WHEN t.annee = :P1_ANNEE THEN f.montant_ht END)</code> et la même chose pour N-1',
        '<code>GROUP BY CUBE(annee)</code>',
        "<code>DISTINCT</code> sur l'année",
      ],
      answer: 1,
      explain:
        "L'<strong>agrégation conditionnelle</strong> filtre dans le <code>SUM</code> : une seule lecture des faits (restreinte aux deux années dans le WHERE) produit les deux mesures côte à côte, prêtes pour calculer l'évolution.",
    },
    {
      type: 'open',
      q: "Écrivez la requête d'une région « Top 5 magasins » de la page 1 : pour l'année <code>:P1_ANNEE</code> (et la région <code>:P1_REGION</code> si renseignée), le nom du magasin, son CA N, son CA N-1, l'évolution en % et son rang.",
      answer: `${H.code(
        'sql',
        `
        SELECT *
        FROM  (SELECT m.nom                                                         AS magasin,
                      SUM(CASE WHEN t.annee = :P1_ANNEE     THEN f.montant_ht END) AS ca_n,
                      SUM(CASE WHEN t.annee = :P1_ANNEE - 1 THEN f.montant_ht END) AS ca_n1,
                      ROUND(100 * (SUM(CASE WHEN t.annee = :P1_ANNEE     THEN f.montant_ht END)
                                 - SUM(CASE WHEN t.annee = :P1_ANNEE - 1 THEN f.montant_ht END))
                                / NULLIF(SUM(CASE WHEN t.annee = :P1_ANNEE - 1 THEN f.montant_ht END), 0), 1)
                                                                                    AS evol_pct,
                      RANK() OVER (ORDER BY SUM(CASE WHEN t.annee = :P1_ANNEE
                                                     THEN f.montant_ht END) DESC NULLS LAST) AS rang
               FROM   fait_ventes f
               JOIN   dim_temps   t ON t.date_key    = f.date_key
               JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
               WHERE  t.annee IN (:P1_ANNEE, :P1_ANNEE - 1)
               AND   (:P1_REGION IS NULL OR m.region = :P1_REGION)
               GROUP  BY m.nom)
        WHERE  rang <= 5
        ORDER  BY rang;
      `,
      )}<p>On combine l'agrégation conditionnelle (N / N-1), <code>NULLIF</code> pour éviter la division par zéro d'un magasin ouvert cette année, et <code>RANK()</code> filtré dans une requête englobante. Page Items to Submit : <code>P1_ANNEE,P1_REGION</code>.</p>`,
      criteria: [
        'Agrégation conditionnelle N et N-1',
        'Évolution en % avec protection de la division par zéro',
        'RANK() et filtre rang <= 5 dans une requête englobante',
        'Filtres :P1_ANNEE / :P1_REGION optionnel',
      ],
    },
    {
      type: 'open',
      q: "Synthèse : le directeur régional Occitanie se connecte, choisit 2025, clique sur la barre « Occitanie », puis sur le magasin « Montpellier », puis sur le mois de mai pour voir les tickets. Pour chaque étape, nommez l'opération OLAP et le mécanisme APEX qui la réalise.",
      answer: `${H.tbl(
        ['Action', 'Opération OLAP', 'Mécanisme APEX'],
        [
          [
            'Connexion',
            '(filtre de sécurité : slice imposé sur la région Occitanie)',
            'Authentification + vue sécurisée par <code>APP_USER</code> / Authorization Scheme',
          ],
          [
            'Choix de 2025',
            'Slice sur le temps',
            'Item <code>P1_ANNEE</code> + DA Change → Refresh des régions (Page Items to Submit)',
          ],
          [
            'Clic sur « Occitanie »',
            'Drill-down région → magasins',
            'Lien de série du graphique vers la page 2 (<code>P2_REGION = &amp;LABEL.</code>)',
          ],
          [
            'Clic sur « Montpellier »',
            'Slice sur le magasin + drill-down du temps (année → mois)',
            'Lien vers une page ou région mensuelle filtrée par <code>P2_MAGASIN</code>',
          ],
          [
            'Clic sur « Mai »',
            'Drill-through vers les lignes de faits',
            'Lien vers la page 3 : Interactive Report sur <code>v_ventes_detail</code> filtré par magasin et mois',
          ],
        ],
      )}`,
      criteria: [
        "Sécurité par région liée à l'utilisateur",
        "Slice pour l'année (item + refresh)",
        'Drill-down via lien de graphique',
        'Drill-through vers un rapport de détail',
        'Mécanismes APEX correctement nommés',
      ],
    },
  ],
};
