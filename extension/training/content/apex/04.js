import { H } from '../helpers.js';

export default {
  id: 'apex-4',
  short: 'Formulaires & session state',
  title: 'Formulaires, items, listes de valeurs et session state',
  level: 'Débutant → Intermédiaire',
  duration: '40 min',
  intro:
    "Comprendre le session state, c'est comprendre comment APEX « se souvient » des valeurs entre deux pages. C'est la notion clé pour écrire des pages qui fonctionnent.",
  objectives: [
    'Construire un formulaire et comprendre ses processus automatiques',
    'Expliquer le session state et son cycle de vie',
    'Référencer un item avec la bonne syntaxe selon le contexte',
    'Créer des listes de valeurs, y compris en cascade',
  ],
  content: `
    <h3>La région Form</h3>
    <p>Une région <b>Form</b> est liée à une table, une vue ou une requête. Pour chaque colonne, APEX crée un item (<code>P20_PRODUIT_KEY</code>, <code>P20_LIBELLE</code>…). Deux processus font tout le travail :</p>
    ${H.tbl(
      ['Processus', 'Moment', 'Rôle'],
      [
        [
          '<b>Form – Initialization</b>',
          "Avant l'affichage (Pre-Rendering)",
          "Lit la ligne dont la clé est dans l'item clé primaire (<code>P20_PRODUIT_KEY</code>) et remplit les items",
        ],
        [
          '<b>Form – Automatic Row Processing (DML)</b>',
          'À la soumission (Processing)',
          'Selon le bouton cliqué : <code>INSERT</code>, <code>UPDATE</code> ou <code>DELETE</code>',
        ],
      ],
    )}
    <p>Les boutons portent une propriété <b>Database Action</b> (<i>SQL INSERT</i>, <i>SQL UPDATE</i>, <i>SQL DELETE</i>) : c'est ainsi que le processus DML sait quoi faire. APEX gère aussi la <strong>détection des mises à jour perdues</strong> : si quelqu'un a modifié la ligne entre l'affichage et l'enregistrement, l'utilisateur est prévenu au lieu d'écraser la modification.</p>
    ${H.callout('tip', 'Le couple rapport + formulaire', "Le motif le plus courant : une page liste (IR) avec une colonne lien vers une page formulaire modale, qui passe la clé : <code>P20_PRODUIT_KEY = #PRODUIT_KEY#</code>. À la fermeture de la modale, une Dynamic Action « Dialog Closed » rafraîchit la liste. L'assistant « Report with Form » génère tout cela.")}

    <h3>Le session state</h3>
    <p>HTTP est sans mémoire : chaque requête est indépendante. APEX conserve donc, <strong>côté serveur et par session</strong>, la valeur de chaque item : c'est le <strong>session state</strong>.</p>
    <ol>
      <li>À l'affichage, un item prend sa valeur dans le session state (ou dans sa <i>Source</i> / sa valeur par défaut).</li>
      <li>L'utilisateur modifie le champ : la nouvelle valeur n'existe <strong>que dans le navigateur</strong>.</li>
      <li>À la <strong>soumission</strong> de la page (ou via <i>Page Items to Submit</i> / <i>Items to Submit</i> en AJAX), la valeur est envoyée et enregistrée dans le session state.</li>
      <li>Les requêtes SQL et le PL/SQL côté serveur lisent alors cette valeur.</li>
    </ol>
    ${H.callout('warn', "L'erreur classique", "« J'ai changé l'année dans la liste mais le graphique affiche toujours l'ancienne ! » : la valeur n'a pas été envoyée au serveur. Solution : soumettre la page, ou lister l'item dans <b>Page Items to Submit</b> de la région rafraîchie.")}
    <p>Pour voir le session state : barre de développeur &gt; <b>Session</b>. Pour le vider : lien avec <b>Clear Cache</b> (numéros de pages) ou processus <i>Clear Session State</i>.</p>

    <h3>Référencer un item : quelle syntaxe, où ?</h3>
    ${H.tbl(
      ['Syntaxe', "Où l'utiliser", 'Exemple'],
      [
        [
          '<code>:P1_ANNEE</code>',
          "SQL et PL/SQL dans l'application (<strong>variable de liaison</strong>)",
          '<code>WHERE annee = :P1_ANNEE</code>',
        ],
        [
          '<code>&amp;P1_ANNEE.</code>',
          'Texte statique, HTML, titres, templates, URL (<strong>substitution</strong>, avec le point final)',
          'Titre de région : <code>Ventes &amp;P1_ANNEE.</code>',
        ],
        [
          "<code>V('P1_ANNEE')</code> / <code>NV(…)</code>",
          'Packages PL/SQL stockés, vues (lit le session state)',
          "<code>l_annee := NV('P1_ANNEE');</code>",
        ],
        ['<code>#COLONNE#</code>', 'Colonnes de rapports, liens, cartes', '<code>P20_ID = #PRODUIT_KEY#</code>'],
        [
          "<code>$v('P1_ANNEE')</code>",
          'JavaScript dans le navigateur',
          "<code>apex.item('P1_ANNEE').getValue()</code>",
        ],
      ],
    )}
    ${H.callout('warn', 'Jamais de &amp;ITEM. dans du SQL', "La substitution colle le texte tel quel dans la requête : c'est une porte ouverte à l'<strong>injection SQL</strong>, et la base doit analyser une nouvelle requête à chaque valeur. Dans le SQL, utilisez toujours <code>:ITEM</code>. Les advisors d'APEX le signalent.")}
    <h4>Chaînes de substitution intégrées</h4>
    ${H.tbl(
      ['Nom', 'Contenu'],
      [
        ['<code>APP_USER</code>', "Nom de l'utilisateur connecté (<code>:APP_USER</code> en SQL)"],
        ['<code>APP_ID</code>, <code>APP_PAGE_ID</code>', "Numéro de l'application, de la page courante"],
        ['<code>APP_SESSION</code>', 'Identifiant de session'],
        ['<code>REQUEST</code>', 'Nom du bouton qui a soumis la page (<code>SAVE</code>, <code>DELETE</code>…)'],
        ['<code>APP_IMAGES</code>, <code>APP_FILES</code>', 'Chemins des fichiers statiques'],
      ],
    )}

    <h3>Source et valeur par défaut d'un item</h3>
    <ul>
      <li><b>Source Type</b> : <i>Database Column</i> (formulaire), <i>Null</i>, <i>Static Value</i>, <i>SQL Query</i>, <i>PL/SQL Expression</i>, <i>Item</i>.</li>
      <li><b>Used</b> : <i>Only when current value in session state is null</i> (garde la saisie de l'utilisateur) ou <i>Always, replacing any existing value</i> (recalcule à chaque affichage).</li>
      <li><b>Default</b> : valeur initiale, par exemple l'année courante : <code>EXTRACT(YEAR FROM SYSDATE)</code> (type <i>Expression</i>).</li>
    </ul>

    <h3>Les listes de valeurs (LOV)</h3>
    <p>Une LOV fournit à un item de choix une <strong>valeur affichée</strong> (<i>display</i>) et une <strong>valeur retournée</strong> (<i>return</i>, stockée dans l'item).</p>
    ${H.code(
      'sql',
      `
      -- LOV dynamique : display = libellé, return = clé
      SELECT libelle      AS d,
             produit_key  AS r
      FROM   dim_produit
      WHERE  est_courant = 'O'
      ORDER  BY libelle;
    `,
    )}
    <p>Une LOV <strong>statique</strong> se déclare directement (<code>STATIC:Oui;O,Non;N</code>). Pour une <strong>LOV en cascade</strong>, l'item enfant déclare son <b>Parent Item(s)</b> : quand le parent change, APEX rafraîchit automatiquement la liste enfant.</p>
    ${H.code(
      'sql',
      `
      -- LOV de P7_MAGASIN, Parent Item = P7_REGION
      SELECT nom AS d, magasin_key AS r
      FROM   dim_magasin
      WHERE  region = :P7_REGION
      ORDER  BY nom;
    `,
    )}
    ${H.callout('info', 'Popup LOV', 'Au-delà de quelques dizaines de valeurs, préférez le type <b>Popup LOV</b> : fenêtre de recherche, colonnes multiples, chargement à la demande. Pour quelques valeurs, un <b>Radio Group</b> ou un <b>Switch</b> sont plus rapides à utiliser.')}
  `,
  keypoints: [
    'Form = Initialization (lecture) + Automatic Row Processing (DML) piloté par la Database Action des boutons.',
    'Le session state garde côté serveur la valeur des items ; une valeur modifiée dans le navigateur doit être soumise.',
    ":ITEM en SQL/PL-SQL, &ITEM. dans le HTML, V('ITEM') dans les packages, #COL# dans les rapports, $v() en JS.",
    'LOV = display + return ; cascade via Parent Item(s) ; Popup LOV pour les longues listes.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Dans la requête SQL d'une région, comment référencer l'item <code>P4_REGION</code> ?",
      options: [
        '<code>&amp;P4_REGION.</code>',
        '<code>:P4_REGION</code>',
        '<code>#P4_REGION#</code>',
        "<code>$v('P4_REGION')</code>",
      ],
      answer: 1,
      explain:
        "Dans le SQL et le PL/SQL de l'application, on utilise la <strong>variable de liaison</strong> <code>:P4_REGION</code> : sûre (pas d'injection) et performante (requête partagée). <code>&amp;…</code> est pour le HTML, <code>#…#</code> pour les colonnes de rapport, <code>$v</code> pour le JavaScript.",
    },
    {
      type: 'qcm',
      q: "Quel processus effectue l'<code>INSERT</code>/<code>UPDATE</code>/<code>DELETE</code> d'un formulaire généré ?",
      options: [
        'Form – Initialization',
        'Form – Automatic Row Processing (DML)',
        'Clear Session State',
        'Une Dynamic Action',
      ],
      answer: 1,
      explain:
        "Le processus <strong>Automatic Row Processing (DML)</strong> s'exécute à la soumission et choisit l'opération selon la <i>Database Action</i> du bouton cliqué. <i>Initialization</i> ne fait que lire la ligne avant l'affichage.",
    },
    {
      type: 'qcm',
      q: "L'utilisateur change la valeur de <code>P2_ANNEE</code> ; un processus PL/SQL AJAX lit <code>:P2_ANNEE</code> mais obtient l'ancienne valeur. Pourquoi ?",
      options: [
        'Les items ne sont pas lisibles en PL/SQL',
        "La nouvelle valeur n'a pas été envoyée au session state (item absent de « Items to Submit »)",
        'Il faut écrire &amp;P2_ANNEE. en PL/SQL',
        'La base de données met en cache les items pendant 24 h',
      ],
      answer: 1,
      explain:
        "La valeur modifiée n'existe que dans le navigateur tant qu'elle n'est pas soumise. Pour un appel AJAX (Dynamic Action <i>Execute Server-side Code</i>, rafraîchissement), il faut lister l'item dans <b>Items to Submit</b>.",
    },
    {
      type: 'open',
      q: "Vous créez un formulaire modal sur <code>dim_produit</code> (page 20) ouvert depuis un rapport (page 10). Décrivez ce qui se passe, composant par composant, quand l'utilisateur clique sur un produit, modifie son libellé puis clique sur « Enregistrer ».",
      answer: `<ol>
        <li><strong>Lien de la colonne</strong> (page 10) : ouvre la page 20 en passant <code>P20_PRODUIT_KEY = #PRODUIT_KEY#</code> et en vidant le cache de la page 20.</li>
        <li><strong>Form – Initialization</strong> (pre-rendering, page 20) : lit la ligne de <code>dim_produit</code> correspondant à <code>P20_PRODUIT_KEY</code> et remplit les items <code>P20_LIBELLE</code>, <code>P20_CATEGORIE</code>…</li>
        <li>L'utilisateur modifie <code>P20_LIBELLE</code> : la valeur n'est encore que dans le navigateur.</li>
        <li><strong>Bouton SAVE</strong> (Database Action = SQL UPDATE) : soumet la page, les valeurs passent dans le session state, <code>REQUEST = 'SAVE'</code>.</li>
        <li><strong>Validations</strong> éventuelles (libellé non vide…), puis <strong>Automatic Row Processing</strong> : <code>UPDATE dim_produit SET libelle = :P20_LIBELLE … WHERE produit_key = :P20_PRODUIT_KEY</code>, avec contrôle des mises à jour perdues.</li>
        <li><strong>Close Dialog</strong> (processus) ferme la modale ; sur la page 10, une Dynamic Action <i>Dialog Closed</i> rafraîchit le rapport et affiche le message de succès.</li>
      </ol>`,
      criteria: [
        'Passage de la clé par le lien (#COLONNE#)',
        'Initialization lit la ligne',
        'Soumission et session state',
        'DML automatique déclenché par le bouton',
        'Fermeture de la modale et rafraîchissement du rapport',
      ],
    },
    {
      type: 'open',
      q: 'Sur la page 7, <code>P7_REGION</code> (liste des régions) filtre <code>P7_MAGASIN</code> (liste des magasins de la région), qui filtre elle-même un rapport. Écrivez les deux requêtes de LOV et la clause WHERE du rapport, et indiquez les propriétés à régler.',
      answer: `${H.code(
        'sql',
        `
        -- LOV de P7_REGION
        SELECT DISTINCT region AS d, region AS r
        FROM   dim_magasin
        ORDER  BY 1;

        -- LOV de P7_MAGASIN  (Parent Item(s) = P7_REGION)
        SELECT nom AS d, magasin_key AS r
        FROM   dim_magasin
        WHERE  region = :P7_REGION
        ORDER  BY nom;

        -- Rapport : filtres optionnels
        WHERE (:P7_REGION  IS NULL OR m.region      = :P7_REGION)
        AND   (:P7_MAGASIN IS NULL OR m.magasin_key = :P7_MAGASIN)
      `,
      )}<ul>
        <li><code>P7_MAGASIN</code> : <b>Parent Item(s)</b> = <code>P7_REGION</code> (APEX vide et recharge la liste quand la région change).</li>
        <li>Les deux items : <b>Display Null Value</b> = Oui, libellé « Toutes ».</li>
        <li>Rapport : <b>Page Items to Submit</b> = <code>P7_REGION,P7_MAGASIN</code> et une Dynamic Action <i>Change</i> qui le rafraîchit (ou soumission de la page).</li>
      </ul>`,
      criteria: [
        'LOV régions avec display/return',
        'LOV magasins filtrée par :P7_REGION',
        'Parent Item(s) renseigné',
        'Filtres optionnels dans le rapport',
        'Page Items to Submit / rafraîchissement',
      ],
    },
  ],
};
