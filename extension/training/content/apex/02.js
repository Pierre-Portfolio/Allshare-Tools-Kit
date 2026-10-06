import { H } from '../helpers.js';

export default {
  id: 'apex-2',
  short: 'Première application',
  title: 'Créer sa première application : pages, régions, items, boutons',
  level: 'Débutant',
  duration: '35 min',
  intro:
    "On passe à la pratique : l'assistant de création, le Page Designer et les briques élémentaires qui composent chaque page.",
  objectives: [
    "Créer une application avec l'assistant Create Application",
    'Se repérer dans le Page Designer',
    'Distinguer régions, items, boutons et leurs rôles',
    "Connaître les composants partagés, la page globale et l'Universal Theme",
  ],
  content: `
    <h3>L'assistant Create Application</h3>
    <p>App Builder &gt; <b>Create</b> &gt; <b>New Application</b>. En un écran, on définit :</p>
    <ul>
      <li>le <strong>nom</strong> et l'apparence (thème, style, icône) ;</li>
      <li>les <strong>pages</strong> à générer : Dashboard, Interactive Report, Form, Faceted Search, Calendar, Cards, Master-Detail… chacune basée sur une table ou une requête ;</li>
      <li>les <strong>fonctionnalités</strong> : page « À propos », contrôle d'accès par rôles, journal d'activité, paramètres de configuration, préférences de thème ;</li>
      <li>les <strong>paramètres</strong> : schéma, authentification (comptes APEX par défaut), langue.</li>
    </ul>
    <p>Autres points de départ : <b>From a File</b> (charge un CSV/Excel dans une table et crée l'application dessus) et <b>Starter Apps</b> de la galerie.</p>
    ${H.callout('tip', 'Bonne pratique', "Laissez l'assistant générer beaucoup de pages dès le départ : il est plus rapide de supprimer une page inutile que d'en construire une à la main. Et activez la fonctionnalité « Access Control » : elle crée tables, pages d'administration et schémas d'autorisation par rôle.")}

    <h3>Le Page Designer</h3>
    <p>L'éditeur principal d'une page est divisé en trois volets :</p>
    <div class="cards">
      <div><b>À gauche : arborescence</b>Onglets <i>Rendering</i> (ce qui s'affiche), <i>Dynamic Actions</i>, <i>Processing</i> (ce qui s'exécute à la soumission), <i>Shared Components</i>.</div>
      <div><b>Au centre : Layout</b>La grille de la page, organisée en positions (Body, Breadcrumb Bar, Dialog Footer…). On y glisse des composants depuis la galerie.</div>
      <div><b>À droite : Property Editor</b>Toutes les propriétés du composant sélectionné : source SQL, conditions, apparence, sécurité.</div>
    </div>
    <p>Réflexes utiles : <kbd>Ctrl</kbd>+<kbd>S</kbd> pour enregistrer, le bouton <b>Save and Run Page</b> pour tester, et le champ de recherche en haut de l'arborescence pour retrouver un composant dans une page chargée.</p>

    <h3>Les briques d'une page</h3>
    ${H.tbl(
      ['Composant', 'Rôle', 'Exemples'],
      [
        [
          '<b>Région</b>',
          'Un bloc de contenu de la page, avec un titre et une source',
          'Rapport, formulaire, graphique, cartes, contenu statique, carte géographique',
        ],
        [
          '<b>Item</b>',
          'Un champ qui porte une valeur (saisie, filtre, valeur cachée)',
          '<code>P10_ANNEE</code> (liste déroulante), <code>P20_ID</code> (caché)',
        ],
        [
          '<b>Bouton</b>',
          'Déclenche une action : soumettre, rediriger, déclencher une Dynamic Action',
          'Enregistrer, Supprimer, Annuler, Exporter',
        ],
        [
          '<b>Processus</b>',
          'Code exécuté côté serveur (PL/SQL, DML automatique…)',
          'Insérer la ligne du formulaire, envoyer un e-mail',
        ],
        [
          '<b>Dynamic Action</b>',
          'Comportement côté navigateur en réponse à un événement',
          "Rafraîchir un graphique quand l'année change",
        ],
      ],
    )}
    <p>Convention de nommage importante : un item de page s'appelle <code>P&lt;numéro de page&gt;_&lt;NOM&gt;</code>. <code>P10_ANNEE</code> est l'item <code>ANNEE</code> de la page 10. Cela évite les collisions : chaque item est unique dans toute l'application.</p>

    <h4>Principaux types d'items</h4>
    ${H.tbl(
      ['Type', 'Usage'],
      [
        ['Text Field, Textarea, Number Field', 'Saisie libre'],
        ['Date Picker', 'Sélection de date (avec format)'],
        ['Select List, Popup LOV, Radio Group, Checkbox Group', 'Choix dans une liste de valeurs (LOV)'],
        ['Switch', 'Oui / Non'],
        ['Hidden', 'Valeur technique non affichée (clé primaire, paramètre)'],
        ['Display Only', 'Affichage non modifiable'],
      ],
    )}

    <h3>Les composants partagés (Shared Components)</h3>
    <p>Tout ce qui sert à plusieurs pages est défini une seule fois au niveau de l'application :</p>
    <ul>
      <li><strong>Listes de valeurs (LOV)</strong> : par exemple « Régions » = <code>SELECT DISTINCT region d, region r FROM dim_magasin ORDER BY 1</code>.</li>
      <li><strong>Navigation Menu</strong> : le menu latéral ou supérieur ; <strong>Breadcrumbs</strong> : le fil d'Ariane.</li>
      <li><strong>Authentication / Authorization Schemes</strong> : qui peut se connecter, qui a le droit de voir quoi (notion 7).</li>
      <li><strong>Application Items</strong> et <strong>Application Processes</strong> : valeurs et traitements globaux.</li>
      <li><strong>Static Application Files</strong>, <strong>Themes</strong>, <strong>Templates</strong>, <strong>Text Messages</strong> (traductions), <strong>REST Data Sources</strong>…</li>
    </ul>

    <h3>Pages particulières</h3>
    <ul>
      <li><strong>Page 0, la page globale</strong> : ses régions et composants s'affichent sur <em>toutes</em> les pages (bandeau d'information, pied de page commun).</li>
      <li><strong>Page 9999</strong> : la page de connexion générée par défaut.</li>
      <li><strong>Pages modales</strong> (<i>Modal Dialog</i>) : s'ouvrent par-dessus la page courante. Très utilisées pour les formulaires d'édition.</li>
    </ul>

    <h3>L'Universal Theme</h3>
    <p>Le thème standard d'APEX, responsive et accessible. On le personnalise sans écrire de CSS :</p>
    <ul>
      <li><strong>Template Options</strong> : pour chaque région ou bouton, des options visuelles (sans titre, accentuation, taille, icône).</li>
      <li><strong>Theme Roller</strong> : depuis la barre de développeur en exécution, modifiez couleurs et arrondis, puis enregistrez un <em>style</em>.</li>
      <li><strong>Grille à 12 colonnes</strong> : chaque région a une propriété <i>Column Span</i> (6 = demi-largeur) pour composer des tableaux de bord.</li>
      <li><strong>Icônes Font APEX</strong> : <code>fa-bar-chart</code>, <code>fa-table</code>, <code>fa-filter</code>…</li>
    </ul>
    ${H.callout('info', 'La barre de développeur', "Quand vous exécutez l'application en étant connecté à l'App Builder, une barre apparaît en bas de page : <i>Edit Page</i>, <i>Session</i> (voir les valeurs des items), <i>Debug</i> (trace détaillée), <i>Theme Roller</i>, <i>Quick Edit</i> (cliquer sur un élément pour ouvrir son édition). C'est votre meilleur outil de diagnostic.")}
  `,
  keypoints: [
    "L'assistant Create Application génère d'un coup pages, navigation, authentification et fonctionnalités.",
    'Page Designer : arborescence (gauche), layout (centre), propriétés (droite).',
    'Région = bloc de contenu ; item = champ avec une valeur (P10_ANNEE) ; bouton = action.',
    'Les éléments réutilisables (LOV, menu, sécurité) sont dans les Shared Components.',
    'Page 0 = page globale ; Theme Roller et Template Options pour le style sans CSS.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "À quoi sert la page 0 d'une application APEX ?",
      options: [
        "C'est la page de connexion",
        "Ses composants s'affichent sur toutes les pages de l'application",
        "C'est la page d'accueil obligatoire",
        'Elle contient les paramètres de la base de données',
      ],
      answer: 1,
      explain:
        'La page 0 est la <strong>page globale</strong> : une région placée dessus apparaît sur chaque page (sauf condition contraire). La page de connexion est générée par défaut en 9999.',
    },
    {
      type: 'qcm',
      q: 'Vous voulez une liste de régions réutilisable dans cinq pages différentes. Où la définir ?',
      options: [
        'Dans une région de contenu statique',
        'Dans les Shared Components, comme List of Values',
        'Dans chaque item, en recopiant la requête',
        'Dans un fichier CSS',
      ],
      answer: 1,
      explain:
        "Une <strong>LOV partagée</strong> se définit une fois dans Shared Components &gt; List of Values et se référence depuis tous les items qui en ont besoin. Une modification s'applique partout.",
    },
    {
      type: 'qcm',
      q: "Quel est le nom correct d'un item de filtre « année » placé sur la page 12 ?",
      options: ['<code>ANNEE</code>', '<code>ITEM_12_ANNEE</code>', '<code>P12_ANNEE</code>', '<code>:ANNEE12</code>'],
      answer: 2,
      explain:
        "La convention APEX est <code>P&lt;page&gt;_&lt;NOM&gt;</code>. Elle garantit un nom unique dans toute l'application et indique immédiatement sur quelle page vit l'item.",
    },
    {
      type: 'open',
      q: "Vous avez chargé l'étoile de ventes du fil rouge. Décrivez les étapes pour créer avec l'assistant une application avec : un tableau de bord, un rapport interactif sur les ventes et un formulaire de gestion des produits.",
      answer: `<ol>
        <li>App Builder &gt; Create &gt; <b>New Application</b>, nom « Pilotage des ventes ».</li>
        <li><b>Add Page</b> &gt; <b>Dashboard</b> : l'assistant crée une page avec des graphiques d'exemple, à rebrancher ensuite sur des requêtes de l'étoile.</li>
        <li><b>Add Page</b> &gt; <b>Interactive Report</b>, source : une vue <code>v_ventes_detail</code> (fait joint aux dimensions) ou une requête SQL.</li>
        <li><b>Add Page</b> &gt; <b>Interactive Report</b> sur <code>dim_produit</code> en cochant « Include Form » : on obtient la liste et le formulaire modal d'édition reliés.</li>
        <li>Features : cocher <b>Access Control</b> et <b>About Page</b>. Settings : vérifier le schéma et l'authentification.</li>
        <li><b>Create Application</b>, puis <b>Run</b> pour tester et ajuster dans le Page Designer.</li>
      </ol>`,
      criteria: [
        "Utilise l'assistant New Application",
        'Page Dashboard',
        'Interactive Report sur une vue ou requête des ventes',
        'Report + Form sur les produits',
        'Test / ajustements ensuite',
      ],
    },
    {
      type: 'open',
      q: 'Sur une page « Recherche de ventes », on trouve : un champ année, un champ région, un bouton Rechercher, un tableau de résultats et un graphique. Classez chaque élément (région, item, bouton) et expliquez comment ils interagissent.',
      answer: `<ul>
        <li><strong>Items</strong> : <code>P5_ANNEE</code> (Select List sur une LOV d'années) et <code>P5_REGION</code> (Select List sur la LOV partagée des régions).</li>
        <li><strong>Bouton</strong> : <code>RECHERCHER</code>, qui soumet la page (ou déclenche une Dynamic Action de rafraîchissement).</li>
        <li><strong>Régions</strong> : un rapport (Interactive Report) et un graphique. Leur requête SQL utilise les items comme filtres : <code>WHERE t.annee = :P5_ANNEE AND (m.region = :P5_REGION OR :P5_REGION IS NULL)</code>.</li>
      </ul>
      <p>Interaction : l'utilisateur choisit les valeurs, le bouton envoie ces valeurs au serveur (<em>session state</em>), et les régions se réaffichent avec les nouvelles valeurs de filtre. On améliorera cela en notion 6 avec une Dynamic Action qui rafraîchit sans recharger la page (en déclarant les items dans <i>Page Items to Submit</i>).</p>`,
      criteria: [
        'Deux items correctement identifiés',
        'Un bouton',
        'Deux régions (rapport + graphique)',
        'Les régions utilisent les items comme variables de liaison dans leur SQL',
      ],
    },
  ],
};
