import { H } from '../helpers.js';

export default {
  id: 'olap-2',
  short: 'Entrepôt & ETL',
  title: 'Entrepôt de données et chaîne décisionnelle',
  level: 'Débutant',
  duration: '30 min',
  intro:
    "L'OLAP ne travaille pas sur les données brutes : il s'appuie sur un entrepôt alimenté par une chaîne de traitements. Voyons chaque maillon.",
  objectives: [
    "Donner la définition d'un data warehouse et ses 4 caractéristiques",
    "Décrire l'architecture type : sources, ETL, staging, entrepôt, datamarts, restitution",
    'Différencier ETL et ELT, chargement complet et incrémental',
    "Comparer les approches d'Inmon et de Kimball",
  ],
  content: `
    <p class="def"><b>Data warehouse</b> (entrepôt de données) : « une collection de données <strong>orientées sujet</strong>, <strong>intégrées</strong>, <strong>historisées</strong> et <strong>non volatiles</strong>, destinée à la prise de décision » (Bill Inmon, 1992).</p>
    <div class="cards">
      <div><b>Orientée sujet</b>Organisée par thème métier (ventes, clients, stocks) et non par application (ERP, CRM).</div>
      <div><b>Intégrée</b>Les codes, formats et référentiels des différentes sources sont harmonisés : un client = un identifiant.</div>
      <div><b>Historisée</b>Chaque donnée est rattachée à une date. On garde les années passées pour comparer.</div>
      <div><b>Non volatile</b>On ajoute des données, on ne les modifie pas et on ne les supprime pas au fil de l'eau.</div>
    </div>

    <h3>L'architecture décisionnelle type</h3>
    <figure class="figure part-olap">
      <svg class="dg" viewBox="0 0 820 180" width="820" role="img" aria-label="Chaîne décisionnelle : sources, ETL, staging, entrepôt, datamarts, restitution">
        <defs><marker id="ah-o2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" class="arrow"/></marker></defs>
        <rect class="box-2" x="10" y="15" width="100" height="30" rx="6"/><text x="60" y="34" text-anchor="middle">ERP</text>
        <rect class="box-2" x="10" y="55" width="100" height="30" rx="6"/><text x="60" y="74" text-anchor="middle">CRM</text>
        <rect class="box-2" x="10" y="95" width="100" height="30" rx="6"/><text x="60" y="114" text-anchor="middle">Site web</text>
        <rect class="box-2" x="10" y="135" width="100" height="30" rx="6"/><text x="60" y="154" text-anchor="middle">Fichiers</text>
        <path class="ln" d="M110 30 146 88" marker-end="url(#ah-o2)"/><path class="ln" d="M110 70 146 92" marker-end="url(#ah-o2)"/><path class="ln" d="M110 110 146 98" marker-end="url(#ah-o2)"/><path class="ln" d="M110 150 146 102" marker-end="url(#ah-o2)"/>
        <rect class="box-p" x="150" y="55" width="110" height="80" rx="8"/>
        <text x="205" y="80" text-anchor="middle" class="t-b">ETL / ELT</text>
        <text x="205" y="98" text-anchor="middle" class="t-s">extraire</text>
        <text x="205" y="112" text-anchor="middle" class="t-s">transformer</text>
        <text x="205" y="126" text-anchor="middle" class="t-s">charger</text>
        <path class="ln" d="M260 95h32" marker-end="url(#ah-o2)"/>
        <rect class="box-2" x="296" y="70" width="100" height="50" rx="8"/>
        <text x="346" y="92" text-anchor="middle" class="t-b">Staging</text>
        <text x="346" y="109" text-anchor="middle" class="t-s">zone de travail</text>
        <path class="ln" d="M396 95h32" marker-end="url(#ah-o2)"/>
        <rect class="box-o" x="432" y="45" width="120" height="100" rx="8"/>
        <text x="492" y="84" text-anchor="middle" class="t-b">Entrepôt</text>
        <text x="492" y="103" text-anchor="middle" class="t-s">intégré</text>
        <text x="492" y="119" text-anchor="middle" class="t-s">historisé</text>
        <path class="ln" d="M552 80 588 58" marker-end="url(#ah-o2)"/><path class="ln" d="M552 110 588 132" marker-end="url(#ah-o2)"/>
        <rect class="box" x="592" y="30" width="100" height="50" rx="8"/>
        <text x="642" y="52" text-anchor="middle" class="t-s">Datamart</text><text x="642" y="69" text-anchor="middle" class="t-b">Ventes</text>
        <rect class="box" x="592" y="110" width="100" height="50" rx="8"/>
        <text x="642" y="132" text-anchor="middle" class="t-s">Datamart</text><text x="642" y="149" text-anchor="middle" class="t-b">Finance</text>
        <path class="ln" d="M692 55h26" marker-end="url(#ah-o2)"/><path class="ln" d="M692 135h26" marker-end="url(#ah-o2)"/>
        <rect class="box-a" x="722" y="25" width="92" height="140" rx="8"/>
        <text x="768" y="50" text-anchor="middle" class="t-b">Restitution</text>
        <text x="768" y="78" text-anchor="middle" class="t-s">Apps APEX</text>
        <text x="768" y="98" text-anchor="middle" class="t-s">Rapports</text>
        <text x="768" y="118" text-anchor="middle" class="t-s">Cubes OLAP</text>
        <text x="768" y="138" text-anchor="middle" class="t-s">Excel, BI</text>
      </svg>
      <figcaption>La chaîne décisionnelle. APEX (module suivant) se place dans la colonne « Restitution ».</figcaption>
    </figure>

    <h4>1. Les sources</h4>
    <p>Bases OLTP (ERP, CRM, caisse), fichiers CSV/Excel, API web, logs. Elles ne sont <strong>jamais modifiées</strong> par la chaîne décisionnelle : on les lit, c'est tout.</p>
    <h4>2. L'ETL : Extract, Transform, Load</h4>
    <ul>
      <li><strong>Extract</strong> : lire les données sources (complètement, ou seulement ce qui a changé depuis la veille).</li>
      <li><strong>Transform</strong> : nettoyer (espaces, majuscules, valeurs nulles), dédoublonner, convertir (devises, unités), harmoniser les codes (« FR », « France », « 250 » deviennent un seul pays), calculer (montant HT = qté × prix), attribuer les <strong>clés de substitution</strong>.</li>
      <li><strong>Load</strong> : insérer dans les tables de l'entrepôt.</li>
    </ul>
    <p>Exemple de transformation en SQL, de la zone de staging vers une dimension :</p>
    ${H.code(
      'sql',
      `
      INSERT INTO dim_client (client_key, code_client, nom, pays, segment)
      SELECT seq_dim_client.NEXTVAL,                 -- clé de substitution
             s.code_client,
             INITCAP(TRIM(s.nom)),                   -- nettoyage
             CASE UPPER(TRIM(s.pays))                -- harmonisation des codes
               WHEN 'FR'     THEN 'France'
               WHEN 'FRANCE' THEN 'France'
               WHEN 'BE'     THEN 'Belgique'
               ELSE NVL(INITCAP(TRIM(s.pays)), 'Inconnu')
             END,
             NVL(s.segment, 'Non renseigné')         -- pas de NULL dans une dimension
      FROM   stg_clients s
      WHERE  NOT EXISTS (SELECT 1 FROM dim_client d
                         WHERE d.code_client = s.code_client);
    `,
    )}
    <h4>3. La zone de staging</h4>
    <p>Une zone tampon où l'on dépose les données brutes extraites avant de les transformer. Elle permet de relancer un traitement sans relire les sources et de tracer ce qui a été reçu.</p>
    <h4>4. L'entrepôt et les datamarts</h4>
    <p>L'entrepôt centralise les données intégrées et historisées. Un <strong>datamart</strong> est un sous-ensemble orienté vers un métier ou un service (ventes, RH, finance), plus petit et plus simple à interroger.</p>
    <h4>5. La restitution</h4>
    <p>Rapports, tableaux de bord, cubes OLAP, applications APEX, exports Excel : c'est la partie visible par les utilisateurs.</p>

    <h3>ETL ou ELT ?</h3>
    ${H.tbl(
      ['', 'ETL', 'ELT'],
      [
        ['Ordre', 'Extraire → Transformer → Charger', 'Extraire → Charger → Transformer'],
        [
          'Où se font les transformations ?',
          'Dans un outil dédié, hors de la base cible',
          'Dans la base cible, en SQL',
        ],
        ['Outils typiques', 'Informatica, Talend, ODI, SSIS', 'dbt, SQL/PL-SQL, Snowflake, BigQuery'],
        ['Intérêt', "Données déjà propres à l'arrivée", 'Profite de la puissance de la base, garde le brut'],
      ],
    )}
    ${H.callout('info', 'Chargement complet ou incrémental', "Un <strong>chargement complet</strong> vide et recharge tout : simple, mais long sur de gros volumes. Un <strong>chargement incrémental</strong> ne traite que les nouveautés (date de modification, numéro de séquence, journal de la base). C'est la norme en production pour les tables de faits.")}

    <h3>Inmon ou Kimball : deux écoles</h3>
    ${H.tbl(
      ['', 'Bill Inmon (top-down)', 'Ralph Kimball (bottom-up)'],
      [
        [
          'Point de départ',
          "Un entrepôt d'entreprise central, normalisé (3FN)",
          'Des datamarts dimensionnels, un processus métier à la fois',
        ],
        ['Modèle', 'Normalisé au centre, datamarts dimensionnels dérivés', 'Schémas en étoile partout'],
        [
          'Cohérence',
          'Assurée par le modèle central unique',
          'Assurée par des <strong>dimensions conformes</strong> partagées (la « bus matrix »)',
        ],
        ['Délai du premier résultat', 'Long (des mois)', 'Court (quelques semaines)'],
        ['Adapté à', 'Grandes organisations, forte gouvernance', 'Projets itératifs, PME, besoin rapide'],
      ],
    )}
    <p>En pratique, la plupart des projets actuels suivent Kimball (ou un mélange des deux). C'est l'approche de ce parcours.</p>
    ${H.callout('warn', 'Piège fréquent', "Construire l'entrepôt « au cas où », sans question métier précise. Un projet décisionnel part toujours des <strong>questions des utilisateurs</strong> : quelles décisions, quels indicateurs, à quelle fréquence ?")}
  `,
  keypoints: [
    'Entrepôt = orienté sujet, intégré, historisé, non volatil.',
    'Chaîne : sources → ETL/ELT → staging → entrepôt → datamarts → restitution.',
    'ELT transforme dans la base cible ; le chargement incrémental est la norme pour les faits.',
    "Inmon part d'un entrepôt central normalisé ; Kimball de datamarts en étoile reliés par des dimensions conformes.",
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Parmi ces propriétés, laquelle <strong>ne</strong> caractérise <strong>pas</strong> un entrepôt de données selon Inmon ?',
      options: ['Orienté sujet', 'Intégré', 'Historisé', 'Modifié en temps réel par les utilisateurs métier'],
      answer: 3,
      explain:
        'Un entrepôt est <strong>non volatil</strong> : les données y sont ajoutées par la chaîne de chargement, pas saisies ni modifiées par les utilisateurs. Les trois autres propriétés font partie de la définition.',
    },
    {
      type: 'qcm',
      q: 'Dans une approche <strong>ELT</strong>, où sont réalisées les transformations ?',
      options: [
        "Dans les bases sources, avant l'extraction",
        'Dans la base cible, après le chargement des données brutes',
        "Dans le navigateur de l'utilisateur",
        "Il n'y a pas de transformation en ELT",
      ],
      answer: 1,
      explain:
        "ELT = Extract, Load, Transform : on charge d'abord les données brutes dans la base cible (souvent puissante : Oracle, Snowflake…), puis on les transforme en SQL. On ne modifie jamais les sources.",
    },
    {
      type: 'qcm',
      q: "Qu'est-ce qu'un datamart ?",
      options: [
        'Une copie de sauvegarde de la base de production',
        'Un sous-ensemble de données décisionnelles centré sur un métier (ventes, RH…)',
        'Un outil de visualisation',
        "La zone de staging de l'ETL",
      ],
      answer: 1,
      explain:
        "Un datamart est un « petit entrepôt » thématique, plus simple à interroger. Chez Kimball, l'entrepôt est même l'union des datamarts reliés par des dimensions conformes.",
    },
    {
      type: 'open',
      q: "Vous intégrez les clients de deux sources : le CRM (<code>code_pays = 'FR'</code>, noms en majuscules, e-mails parfois vides) et l'ERP (<code>pays = 'France'</code>, certains clients présents dans les deux). Listez les transformations à prévoir dans l'ETL.",
      hint: 'Pensez format, codes, doublons, valeurs manquantes et identifiant.',
      answer: `<ul>
        <li><strong>Harmoniser les codes pays</strong> avec une table de correspondance (FR, France, FRA → France), ou mieux, vers un code ISO unique.</li>
        <li><strong>Normaliser les textes</strong> : <code>TRIM</code>, casse homogène (<code>INITCAP</code> pour les noms, <code>LOWER</code> pour les e-mails).</li>
        <li><strong>Dédoublonner</strong> : définir une règle de rapprochement (e-mail identique, ou nom + date de naissance + code postal) et choisir la source maîtresse pour chaque attribut.</li>
        <li><strong>Gérer les valeurs manquantes</strong> : remplacer les NULL par « Non renseigné » dans la dimension pour que les regroupements restent lisibles.</li>
        <li><strong>Créer une clé de substitution</strong> (<code>client_key</code>) indépendante des identifiants CRM et ERP, en conservant les codes d'origine pour la traçabilité.</li>
        <li><strong>Tracer et rejeter</strong> les lignes invalides dans une table d'erreurs plutôt que les perdre silencieusement.</li>
      </ul>`,
      criteria: [
        'Harmonisation des codes pays',
        'Nettoyage / casse',
        'Règle de dédoublonnage explicite',
        'Traitement des valeurs manquantes',
        'Clé de substitution unique',
        'Bonus : gestion des rejets',
      ],
    },
    {
      type: 'open',
      q: "Une PME de 80 personnes veut son premier tableau de bord commercial dans 3 mois. Recommanderiez-vous l'approche Inmon ou Kimball ? Justifiez en quelques lignes.",
      hint: 'Comparez délai, coût et capacité à évoluer ensuite.',
      answer: `<p><strong>Kimball.</strong> On commence par un seul processus métier (les ventes) modélisé en étoile, ce qui donne un premier résultat en quelques semaines et un modèle compréhensible par les utilisateurs. Pour garder la cohérence quand on ajoutera d'autres datamarts (achats, stocks), on conçoit dès le départ des <strong>dimensions conformes</strong> réutilisables (Temps, Produit, Client). Inmon imposerait de modéliser d'abord tout l'entrepôt d'entreprise en 3FN : long, coûteux et peu adapté à une PME sans équipe data dédiée.</p>`,
      criteria: [
        'Choix argumenté (Kimball attendu)',
        'Délai / livraison incrémentale',
        'Mention des dimensions conformes pour la suite',
        "Limite d'Inmon dans ce contexte",
      ],
    },
  ],
};
