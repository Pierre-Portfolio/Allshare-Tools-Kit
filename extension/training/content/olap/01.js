import { H } from '../helpers.js';

export default {
  id: 'olap-1',
  short: 'OLTP vs OLAP',
  title: "OLTP vs OLAP : deux façons d'utiliser les données",
  level: 'Débutant',
  duration: '25 min',
  intro:
    "Avant de parler de cubes, il faut comprendre pourquoi les bases « de production » ne suffisent pas pour analyser l'activité d'une entreprise.",
  objectives: [
    'Définir OLTP et OLAP et citer leurs différences essentielles',
    "Reconnaître une question « analytique » d'une opération « transactionnelle »",
    'Connaître le vocabulaire de base : mesure, dimension, agrégat',
    'Situer les outils OLAP du marché',
  ],
  content: `
    <p class="def"><b>OLAP</b> (<i>Online Analytical Processing</i>) désigne l'ensemble des techniques qui permettent d'<strong>analyser rapidement de grands volumes de données historiques</strong> selon plusieurs axes (le temps, les produits, les clients, les régions…).</p>
    <p>Le terme a été popularisé en 1993 par Edgar F. Codd, l'inventeur du modèle relationnel. Il s'oppose à <strong>OLTP</strong> (<i>Online Transaction Processing</i>), le traitement des transactions du quotidien : passer une commande, encaisser un paiement, modifier une adresse.</p>

    <h3>Deux métiers, deux besoins</h3>
    ${H.callout('analogy', 'Analogie', "La <strong>caisse enregistreuse</strong> d'un magasin fait de l'OLTP : elle enregistre chaque vente, une par une, très vite et sans erreur. Le <strong>contrôleur de gestion</strong> qui, en fin de mois, veut savoir « quelles catégories progressent dans quelles régions par rapport à l'an dernier » fait de l'OLAP : il lit des millions de ventes pour produire quelques chiffres agrégés.")}
    <p>Ces deux usages ont des contraintes opposées. Une base OLTP doit supporter des milliers de petites écritures concurrentes et garantir la cohérence (propriétés ACID). Un système OLAP doit lire et agréger énormément de lignes, en quelques secondes, sans gêner la production.</p>

    ${H.tbl(
      ['Critère', 'OLTP (transactionnel)', 'OLAP (analytique)'],
      [
        ['Objectif', "Faire tourner l'activité", "Piloter et comprendre l'activité"],
        ['Utilisateurs', 'Opérationnels, applications, clients', 'Analystes, managers, direction, data scientists'],
        [
          'Opérations typiques',
          '<code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code> de quelques lignes',
          '<code>SELECT</code> avec <code>GROUP BY</code> sur des millions de lignes',
        ],
        [
          'Modèle de données',
          'Normalisé (3<sup>e</sup> forme normale), beaucoup de tables',
          'Dénormalisé, dimensionnel (étoile, cube)',
        ],
        [
          'Historique',
          "État courant (une adresse modifiée écrase l'ancienne)",
          'Historique complet sur plusieurs années',
        ],
        ['Fraîcheur', 'Temps réel', 'Souvent J-1, parfois quasi temps réel'],
        ['Volume lu par requête', 'Quelques lignes', 'Des milliers à des milliards de lignes'],
        ['Optimisé pour', 'Écriture rapide et cohérente', 'Lecture et agrégation rapides'],
        ['Exemple', '« Enregistrer la commande n° 45 812 »', '« CA par région et par trimestre, comparé à N-1 »'],
      ],
      "Les deux mondes coexistent : l'OLAP est alimenté à partir des bases OLTP.",
    )}

    <h3>Pourquoi ne pas analyser directement la base de production ?</h3>
    <p>C'est tentant, et c'est souvent ce qu'on fait au début. Mais on se heurte vite à quatre problèmes :</p>
    <ol>
      <li><strong>Performance</strong> : une requête qui parcourt 3 ans de ventes monopolise les disques et le CPU. Les caissiers attendent.</li>
      <li><strong>Complexité</strong> : un modèle normalisé répartit l'information sur des dizaines de tables. Une simple question métier demande 6 ou 8 jointures.</li>
      <li><strong>Historique</strong> : si un client déménage, l'ancienne région disparaît. Impossible de savoir où il habitait lors de ses achats de 2023.</li>
      <li><strong>Hétérogénéité</strong> : les données utiles vivent dans plusieurs systèmes (ERP, CRM, site web, fichiers Excel) avec des codes différents.</li>
    </ol>
    <p>Voici la même question, « CA 2025 par catégorie et par région », posée sur un modèle transactionnel :</p>
    ${H.code(
      'sql',
      `
      SELECT cat.libelle          AS categorie,
             reg.nom              AS region,
             SUM(l.qte * l.prix_unitaire) AS ca
      FROM   lignes_commande l
      JOIN   commandes  c   ON c.id_commande  = l.id_commande
      JOIN   produits   p   ON p.id_produit   = l.id_produit
      JOIN   categories cat ON cat.id_cat     = p.id_cat
      JOIN   clients    cl  ON cl.id_client   = c.id_client
      JOIN   adresses   a   ON a.id_adresse   = cl.id_adresse_actuelle -- adresse ACTUELLE : faux pour l'historique
      JOIN   villes     v   ON v.id_ville     = a.id_ville
      JOIN   regions    reg ON reg.id_region  = v.id_region
      WHERE  c.date_commande >= DATE '2025-01-01'
      AND    c.date_commande <  DATE '2026-01-01'
      AND    c.statut <> 'ANNULEE'
      GROUP  BY cat.libelle, reg.nom;
    `,
    )}
    <p>Et sur un modèle dimensionnel (que vous construirez dans les notions suivantes) :</p>
    ${H.code(
      'sql',
      `
      SELECT p.categorie, g.region, SUM(f.montant_ca) AS ca
      FROM   fait_ventes f
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      JOIN   dim_geo     g ON g.geo_key     = f.geo_key
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      WHERE  t.annee = 2025
      GROUP  BY p.categorie, g.region;
    `,
    )}
    <p>La requête est plus courte, plus rapide, et surtout <strong>juste</strong> : la région est celle du client <em>au moment de l'achat</em>.</p>

    <h3>Le vocabulaire de base</h3>
    <div class="cards">
      <div><b>Mesure</b>Une valeur numérique que l'on agrège : chiffre d'affaires, quantité, marge, nombre de clics.</div>
      <div><b>Dimension</b>Un axe d'analyse, qui répond à « par quoi ? » : par mois, par produit, par magasin, par client.</div>
      <div><b>Agrégat</b>Le résultat d'un calcul (somme, moyenne, comptage) d'une mesure sur un regroupement de dimensions.</div>
      <div><b>Cube</b>La représentation des mesures croisées par plusieurs dimensions : chaque cellule contient un agrégat.</div>
    </div>
    <p>Une astuce pour les repérer dans une question métier : les <strong>mesures</strong> sont ce que l'on compte ou additionne, les <strong>dimensions</strong> suivent les mots « par », « selon », « pour chaque ». Dans « le <u>nombre de commandes</u> <i>par canal</i> et <i>par semaine</i> », la mesure est le nombre de commandes, les dimensions sont le canal et la semaine.</p>

    <h3>Le test FASMI</h3>
    <p>Pour qualifier un outil d'OLAP, Nigel Pendse a proposé cinq critères, résumés par l'acronyme <strong>FASMI</strong> :</p>
    ${H.tbl(
      ['Lettre', 'Signification', 'En pratique'],
      [
        ['F', '<i>Fast</i>', 'Réponse en quelques secondes, même sur de gros volumes'],
        ['A', '<i>Analysis</i>', 'Calculs métiers : ratios, cumuls, comparaisons N-1, parts'],
        ['S', '<i>Shared</i>', 'Multi-utilisateurs, avec sécurité et confidentialité'],
        ['M', '<i>Multidimensional</i>', 'Vue conceptuelle en dimensions et hiérarchies'],
        ['I', '<i>Information</i>', 'Toutes les données nécessaires, quel que soit le volume'],
      ],
    )}

    <h3>Où trouve-t-on de l'OLAP aujourd'hui ?</h3>
    <ul>
      <li><strong>Moteurs de cubes « historiques »</strong> : Microsoft SQL Server Analysis Services (SSAS), Oracle Essbase, IBM Cognos TM1.</li>
      <li><strong>Dans la base Oracle</strong> : fonctions SQL <code>ROLLUP</code>/<code>CUBE</code>, vues matérialisées, <i>Analytic Views</i> (hiérarchies et mesures déclarées dans le dictionnaire).</li>
      <li><strong>Outils BI</strong> : Power BI (modèle tabulaire + DAX), Tableau, Qlik, Oracle Analytics.</li>
      <li><strong>Bases analytiques colonnaires</strong> : Snowflake, BigQuery, ClickHouse, Apache Druid, DuckDB. Elles stockent les données par colonne, ce qui rend les agrégations très rapides.</li>
    </ul>
    ${H.callout('tip', 'Bon réflexe', "Quel que soit l'outil, les concepts de ce parcours (faits, dimensions, grain, hiérarchies, agrégations) restent identiques. C'est eux qu'il faut maîtriser, l'outil vient ensuite.")}
  `,
  keypoints: [
    "OLTP fait tourner l'activité (petites écritures, état courant) ; OLAP l'analyse (grosses lectures, historique).",
    "Analyser directement la production pose des problèmes de performance, de complexité, d'historique et de dispersion des sources.",
    "Mesure = ce qu'on agrège ; dimension = « par quoi » on regarde.",
    'FASMI : Fast, Analysis, Shared, Multidimensional, Information.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Laquelle de ces opérations relève typiquement de l'OLAP ?",
      options: [
        'Enregistrer une nouvelle commande client',
        'Mettre à jour le stock après une livraison',
        "Comparer le chiffre d'affaires par région et par mois sur les 3 dernières années",
        'Supprimer un compte utilisateur à sa demande',
      ],
      answer: 2,
      explain:
        "Une analyse multi-axes (région × mois) sur un historique long, en lecture seule, avec agrégation : c'est la définition même de l'OLAP. Les trois autres sont des transactions unitaires (OLTP).",
    },
    {
      type: 'qcm',
      q: 'Dans la question « <i>Quel est le panier moyen par canal de vente et par trimestre ?</i> », quelle est la mesure ?',
      options: [
        'Le canal de vente',
        'Le trimestre',
        'Le panier moyen',
        "Il n'y a pas de mesure, seulement des dimensions",
      ],
      answer: 2,
      explain:
        "Le panier moyen est la valeur numérique calculée. Canal et trimestre suivent le mot « par » : ce sont les dimensions. À noter : le panier moyen est un ratio (CA ÷ nombre de commandes), on verra en notion 6 qu'il ne s'additionne pas.",
    },
    {
      type: 'qcm',
      q: "Pourquoi un modèle OLTP gère-t-il mal l'historique pour l'analyse ?",
      options: [
        "Parce qu'il ne peut pas stocker de dates",
        "Parce qu'il conserve surtout l'état courant : une mise à jour écrase l'ancienne valeur",
        "Parce que les bases OLTP suppriment automatiquement les données de plus d'un an",
        'Parce que le SQL ne sait pas filtrer sur une période',
      ],
      answer: 1,
      explain:
        "Un système transactionnel stocke l'état actuel. Si un client change de région, l'<code>UPDATE</code> efface l'ancienne région : ses achats passés sont alors rattachés à la mauvaise région. Les entrepôts de données résolvent cela avec les SCD (notion 6).",
    },
    {
      type: 'open',
      q: "Votre directeur commercial vous demande pourquoi il faut « un autre outil » alors que « toutes les données sont déjà dans l'ERP ». Rédigez-lui une réponse de 5 à 8 lignes, sans jargon.",
      hint: 'Pensez aux quatre problèmes vus dans le cours et donnez un exemple concret de son quotidien.',
      answer: `<p>« Les données sont bien dans l'ERP, mais l'ERP est conçu pour <strong>enregistrer</strong> les ventes, pas pour les <strong>analyser</strong>. Quand on lance une analyse sur 3 ans directement dessus, on ralentit la saisie des commandes pour tout le monde. De plus, l'ERP ne garde que la situation actuelle : si un client a changé de secteur commercial, ses ventes passées basculent dans le nouveau secteur et vos comparaisons N-1 deviennent fausses. Enfin, une partie des informations est ailleurs (CRM, site web, fichiers). Un entrepôt de données copie chaque nuit ces informations, les nettoie, garde l'historique et les organise pour que vos tableaux de bord s'affichent en quelques secondes, sans toucher à la production. »</p>`,
      criteria: [
        'Distingue enregistrer (OLTP) et analyser (OLAP)',
        "Mentionne l'impact sur les performances de la production",
        "Explique la perte d'historique avec un exemple",
        'Évoque les sources multiples',
        'Reste compréhensible par un non-technicien',
      ],
    },
    {
      type: 'open',
      q: "Pour un site e-commerce, proposez 3 questions métier relevant de l'OLAP. Pour chacune, identifiez la ou les mesures et les dimensions.",
      hint: 'Pensez ventes, marketing et logistique. Les dimensions suivent souvent le mot « par ».',
      answer: `${H.tbl(
        ['Question métier', 'Mesure(s)', 'Dimensions'],
        [
          ['CA et marge par catégorie de produit et par mois', 'CA, marge', 'Produit (catégorie), Temps (mois)'],
          [
            "Taux de conversion par source de trafic et par type d'appareil",
            'Nombre de visites, nombre de commandes (le taux se calcule à partir des deux)',
            'Source (SEO, pub, e-mail), Appareil',
          ],
          [
            'Délai moyen de livraison par transporteur et par région',
            'Somme des délais, nombre de colis (moyenne = somme ÷ nombre)',
            'Transporteur, Géographie (région)',
          ],
        ],
      )}<p>Remarquez que les ratios et moyennes se calculent à partir de mesures additives stockées séparément : c'est un principe clé qu'on approfondira en notion 6.</p>`,
      criteria: [
        'Trois questions orientées analyse (et non transaction)',
        'Mesures numériques correctement identifiées',
        'Dimensions cohérentes (au moins deux par question)',
        "Bonus : a remarqué qu'un taux ou une moyenne se calcule à partir de deux mesures",
      ],
    },
  ],
};
