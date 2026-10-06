import { H } from '../helpers.js';

export default {
  id: 'apex-1',
  short: 'Découvrir APEX',
  title: 'Découvrir Oracle APEX : architecture et environnement',
  level: 'Débutant',
  duration: '30 min',
  intro:
    'Oracle APEX (Application Express) est la plateforme low-code incluse dans la base Oracle. Elle permet de construire des applications web complètes avec du SQL et du PL/SQL.',
  objectives: [
    "Expliquer ce qu'est APEX et à quoi il sert",
    "Décrire l'architecture navigateur → ORDS → base de données",
    'Comprendre la hiérarchie instance, workspace, schéma, application, page',
    "Se repérer dans App Builder et SQL Workshop, et savoir où s'entraîner",
  ],
  content: `
    <p class="def"><b>Oracle APEX</b> est un environnement de développement <strong>low-code</strong>, gratuit avec toutes les éditions de la base Oracle, qui s'exécute <strong>dans</strong> la base de données. On y construit des applications web (formulaires, rapports, tableaux de bord, API REST) depuis un simple navigateur.</p>
    <p>Low-code ne veut pas dire « sans code » : les assistants génèrent l'essentiel, et l'on complète avec <strong>SQL</strong> (sources de données), <strong>PL/SQL</strong> (logique métier) et, si besoin, un peu de <strong>JavaScript</strong> et de CSS.</p>

    <h3>L'architecture</h3>
    <figure class="figure part-apex">
      <svg class="dg" viewBox="0 0 700 200" width="700" role="img" aria-label="Architecture APEX : navigateur, ORDS, base Oracle contenant le moteur APEX, les métadonnées et le schéma de données">
        <defs><marker id="ah-a1" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" class="arrow"/></marker></defs>
        <rect class="box-2" x="10" y="60" width="130" height="80" rx="8"/>
        <text x="75" y="95" text-anchor="middle" class="t-b">Navigateur</text>
        <text x="75" y="114" text-anchor="middle" class="t-s">HTML · JS · CSS</text>
        <path class="ln" d="M140 90h52" marker-end="url(#ah-a1)"/>
        <path class="ln" d="M196 112h-52" marker-end="url(#ah-a1)"/>
        <text x="168" y="82" text-anchor="middle" class="t-m">HTTPS</text>
        <rect class="box" x="196" y="60" width="140" height="80" rx="8"/>
        <text x="266" y="95" text-anchor="middle" class="t-b">ORDS</text>
        <text x="266" y="114" text-anchor="middle" class="t-s">serveur web Java</text>
        <path class="ln" d="M336 90h48" marker-end="url(#ah-a1)"/>
        <path class="ln" d="M388 112h-48" marker-end="url(#ah-a1)"/>
        <text x="362" y="82" text-anchor="middle" class="t-m">JDBC</text>
        <rect class="box-p" x="388" y="15" width="300" height="170" rx="10"/>
        <text x="538" y="38" text-anchor="middle" class="t-b">Base de données Oracle</text>
        <rect class="box" x="402" y="52" width="130" height="56" rx="6"/>
        <text x="467" y="76" text-anchor="middle" class="t-b">Moteur APEX</text>
        <text x="467" y="94" text-anchor="middle" class="t-s">packages PL/SQL</text>
        <rect class="box" x="544" y="52" width="130" height="56" rx="6"/>
        <text x="609" y="76" text-anchor="middle" class="t-b">Métadonnées</text>
        <text x="609" y="94" text-anchor="middle" class="t-s">définition des apps</text>
        <rect class="box-o" x="402" y="118" width="272" height="54" rx="6"/>
        <text x="538" y="141" text-anchor="middle" class="t-b">Votre schéma</text>
        <text x="538" y="159" text-anchor="middle" class="t-s">tables, vues, packages (l'étoile)</text>
      </svg>
      <figcaption>Trois tiers, mais toute la logique APEX vit dans la base.</figcaption>
    </figure>
    <ul>
      <li><strong>Le navigateur</strong> affiche les pages HTML générées et exécute le JavaScript fourni par APEX (bibliothèque <code>apex.*</code>, Oracle JET pour les graphiques).</li>
      <li><strong>ORDS</strong> (<i>Oracle REST Data Services</i>) est le serveur web Java qui reçoit les requêtes HTTP et les transmet à la base. Il sert aussi les API REST.</li>
      <li><strong>La base de données</strong> contient le moteur APEX (des packages PL/SQL), les <strong>métadonnées</strong> de vos applications, et vos données.</li>
    </ul>
    ${H.callout('info', 'Piloté par les métadonnées', "Une application APEX n'est pas du code généré puis compilé : c'est un ensemble de <strong>lignes dans des tables</strong> du référentiel APEX (pages, régions, items…). À chaque requête, le moteur lit ces métadonnées et produit la page. Conséquence : une modification dans l'App Builder est visible immédiatement, sans déploiement de fichiers. On peut même interroger ces métadonnées en SQL avec les vues <code>APEX_APPLICATIONS</code>, <code>APEX_APPLICATION_PAGES</code>, etc.")}

    <h3>La hiérarchie des objets</h3>
    ${H.tbl(
      ['Niveau', 'Rôle', 'Exemple'],
      [
        ['<b>Instance</b>', "Une installation d'APEX dans une base", "L'instance de production de l'entreprise"],
        [
          '<b>Workspace</b>',
          'Espace de travail isolé pour une équipe ; contient utilisateurs et applications',
          '<code>FINANCE</code>, <code>FORMATION</code>',
        ],
        [
          '<b>Schéma</b>',
          'Compte de base de données dont les objets sont accessibles au workspace (un workspace peut en avoir plusieurs)',
          '<code>DWH_VENTES</code>',
        ],
        [
          '<b>Application</b>',
          'Un ensemble de pages, identifié par un numéro et un alias',
          'App 100 « Pilotage des ventes »',
        ],
        ['<b>Page</b>', 'Un écran, identifié par un numéro', 'Page 1 Accueil, page 10 Rapport'],
        [
          '<b>Composants</b>',
          'Régions, items, boutons, processus, Dynamic Actions…',
          'Région « CA par région », item <code>P10_ANNEE</code>',
        ],
      ],
    )}

    <h3>Les outils du workspace</h3>
    <div class="cards">
      <div><b>App Builder</b>Créer et modifier les applications. Le <strong>Page Designer</strong> est l'éditeur principal : arborescence des composants à gauche, mise en page au centre, propriétés à droite.</div>
      <div><b>SQL Workshop</b>Object Browser (parcourir tables et vues), SQL Commands (exécuter une requête), SQL Scripts (lancer un script), Quick SQL, chargement de données CSV/Excel.</div>
      <div><b>Gallery</b>Applications exemples et <i>plug-ins</i> prêts à installer : très utile pour apprendre par l'exemple.</div>
      <div><b>Administration</b>Gestion des utilisateurs du workspace, surveillance de l'activité, journaux.</div>
    </div>

    <h3>Quick SQL : du texte aux tables</h3>
    <p>Dans SQL Workshop &gt; Utilities &gt; Quick SQL, une syntaxe abrégée génère le DDL complet (tables, clés, index, triggers, données de test). L'indentation crée des tables filles avec leur clé étrangère :</p>
    ${H.code(
      'text',
      `
      # settings = { prefix: "demo", semantics: "CHAR" }
      clients
        nom        vc100 /nn
        email      vc255 /unique
        segment    vc30  /check Particulier, Pro, Grand compte
        commandes
          date_commande date /nn
          montant       num  /nn
          statut        vc20 /default EN_COURS
    `,
    )}
    <p>Résultat : deux tables <code>demo_clients</code> et <code>demo_commandes</code>, une clé primaire par table, la clé étrangère <code>client_id</code>, la contrainte <code>CHECK</code> et la valeur par défaut.</p>

    <h3>Les URL APEX</h3>
    <p>Depuis APEX 20.1, les URL sont « lisibles » :</p>
    ${H.code(
      'text',
      `
      https://serveur/ords/r/formation/pilotage-ventes/tableau-de-bord?session=7061234567890
                          │  │         │               │
                          │  workspace alias de l'app  alias de la page
                          └─ r = routeur des applications
    `,
    )}
    <p>La syntaxe historique, toujours supportée et que vous croiserez souvent, est :</p>
    ${H.code(
      'text',
      `
      f?p=App:Page:Session:Request:Debug:ClearCache:Items:Valeurs:PrinterFriendly
      f?p=100:10:7061234567890::NO:RP,10:P10_ANNEE:2025
          │   │  │               │   │     │         └ valeur(s)
          │   │  │               │   │     └ item(s) à renseigner
          │   │  │               │   └ vider le cache (RP = pagination, 10 = page 10)
          │   │  │               └ mode debug
          │   │  └ identifiant de session
          │   └ page
          └ application
    `,
    )}

    <h3>Où s'entraîner</h3>
    <ul>
      <li><strong>apex.oracle.com</strong> : demandez un workspace gratuit en quelques minutes. Idéal pour ce parcours (usage non productif).</li>
      <li><strong>Oracle Cloud Free Tier</strong> : une base Autonomous Database « Always Free » avec APEX préinstallé.</li>
      <li><strong>En local</strong> : Oracle Database 23ai Free + ORDS, par exemple en conteneur Docker.</li>
    </ul>
    ${H.callout('tip', 'Pour la suite', 'Créez dès maintenant votre workspace, puis lancez le script <a href="sql/fil_rouge_ventes.sql" download><code>fil_rouge_ventes.sql</code></a> (fourni avec cette formation) dans SQL Workshop &gt; SQL Scripts. Il crée l\'étoile de ventes utilisée dans les notions APEX et le projet fil rouge.')}

    <h3>Quand choisir APEX ?</h3>
    ${H.tbl(
      ['Très adapté', 'Moins adapté'],
      [
        [
          'Applications de gestion et back-offices sur données Oracle',
          'Sites grand public très personnalisés graphiquement',
        ],
        ['Tableaux de bord et reporting (y compris sur un entrepôt)', 'Applications mobiles natives hors ligne'],
        ['Remplacement de fichiers Excel ou Access partagés', 'Systèmes sans base Oracle'],
        ['Prototypage rapide avec les métiers', 'Équipes sans compétence SQL'],
      ],
    )}
  `,
  keypoints: [
    "APEX est un outil low-code qui s'exécute dans la base Oracle ; on code en SQL et PL/SQL.",
    'Architecture : navigateur → ORDS → base (moteur APEX + métadonnées + votre schéma).',
    'Une application est un ensemble de métadonnées : les modifications sont immédiates.',
    'Hiérarchie : instance → workspace → schéma(s) → application → page → composants.',
    'URL : /ords/r/workspace/app/page ou la syntaxe f?p=App:Page:Session:…',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Quel est le rôle d'ORDS dans une architecture APEX ?",
      options: [
        'Stocker les données des applications',
        'Servir de serveur web qui transmet les requêtes HTTP à la base de données',
        'Compiler les applications APEX en Java',
        'Remplacer la base de données Oracle',
      ],
      answer: 1,
      explain:
        'ORDS (Oracle REST Data Services) est le serveur web Java placé entre le navigateur et la base. Il ne stocke rien et ne compile rien : il relaie les requêtes vers le moteur APEX, et sert aussi les API REST.',
    },
    {
      type: 'qcm',
      q: "Où est stockée la définition d'une application APEX (ses pages, régions, items) ?",
      options: [
        'Dans des fichiers HTML sur le serveur ORDS',
        "Dans des tables de métadonnées à l'intérieur de la base de données",
        "Dans le navigateur de l'utilisateur",
        'Dans un dépôt Git obligatoire',
      ],
      answer: 1,
      explain:
        "APEX est piloté par les métadonnées : l'application est un ensemble de lignes dans le référentiel APEX, dans la base. On peut l'exporter en fichier SQL pour la versionner, mais ce n'est pas là qu'elle s'exécute.",
    },
    {
      type: 'qcm',
      q: "Dans l'URL <code>f?p=200:15:9876543210::NO::P15_ID:42</code>, que représente <code>15</code> ?",
      options: ["Le numéro d'application", 'Le numéro de page', "La valeur de l'item", 'Le numéro de session'],
      answer: 1,
      explain:
        'Ordre des paramètres : Application (200) : <strong>Page (15)</strong> : Session (9876543210) : Request (vide) : Debug (NO) : ClearCache (vide) : Items (P15_ID) : Valeurs (42).',
    },
    {
      type: 'open',
      q: "Un développeur Java vous demande : « Concrètement, que se passe-t-il quand un utilisateur ouvre une page APEX ? » Décrivez le parcours de la requête, du clic à l'affichage.",
      hint: "Suivez le schéma d'architecture de gauche à droite, puis retour.",
      answer: `<ol>
        <li>Le navigateur envoie une requête HTTPS (URL avec workspace, application, page, session).</li>
        <li><strong>ORDS</strong> la reçoit et appelle, via JDBC, le moteur APEX dans la base.</li>
        <li>Le moteur APEX (PL/SQL) vérifie la <strong>session</strong> et l'<strong>authentification</strong>, puis les autorisations de la page.</li>
        <li>Il lit les <strong>métadonnées</strong> de la page : régions, items, conditions, processus « avant affichage ».</li>
        <li>Il exécute les calculs et les requêtes SQL des régions sur <strong>votre schéma</strong>.</li>
        <li>Il assemble le HTML à partir du thème (Universal Theme) et le renvoie via ORDS au navigateur.</li>
        <li>Le navigateur affiche la page et exécute le JavaScript (Dynamic Actions, graphiques). Les interactions suivantes passent par des soumissions de page ou des appels AJAX, selon le même chemin.</li>
      </ol>
      <p>Différence clé avec une appli Java classique : il n'y a pas de code applicatif déployé sur le serveur web, tout est interprété dans la base.</p>`,
      criteria: [
        "Rôle d'ORDS comme passerelle",
        'Session / sécurité vérifiées par le moteur',
        'Lecture des métadonnées de la page',
        'Exécution du SQL des régions et génération du HTML',
        'Retour au navigateur',
      ],
    },
    {
      type: 'open',
      q: 'Rédigez en syntaxe Quick SQL la description de deux tables pour une application de gestion de formations : <code>formations</code> (titre obligatoire, durée en heures, niveau parmi Débutant/Intermédiaire/Avancé) et <code>sessions</code> (filles de formations : date de début obligatoire, lieu, nombre de places, par défaut 12).',
      answer: `${H.code(
        'text',
        `
        formations
          titre        vc200 /nn
          duree_heures num
          niveau       vc20  /check Débutant, Intermédiaire, Avancé
          sessions
            date_debut date  /nn
            lieu       vc100
            nb_places  num   /default 12
      `,
      )}<p>L'indentation de <code>sessions</code> sous <code>formations</code> crée automatiquement la colonne <code>formation_id</code> et la clé étrangère. Quick SQL ajoute aussi les clés primaires (identité) et peut générer des données de test.</p>`,
      criteria: [
        'Deux tables, sessions indentée sous formations',
        '/nn sur les colonnes obligatoires',
        '/check pour le niveau',
        '/default 12 pour les places',
      ],
    },
  ],
};
