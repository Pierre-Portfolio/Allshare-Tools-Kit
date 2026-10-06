// Module APEX : construire des applications Oracle APEX (8 notions, examen, mémo, glossaire).
// Repris de la seconde partie de la formation OLAP & APEX Training.
import { H } from '../helpers.js';
import n1 from './01.js';
import n2 from './02.js';
import n3 from './03.js';
import n4 from './04.js';
import n5 from './05.js';
import n6 from './06.js';
import n7 from './07.js';
import n8 from './08.js';

export default {
  id: 'apex',
  label: 'APEX',
  title: 'Oracle APEX',
  tagline: 'Pages, rapports, formulaires, PL/SQL, Dynamic Actions, sécurité',
  eyebrow: 'Débutant → Intermédiaire',
  lede: "Transformer les données en applications web Oracle APEX, du premier rapport au tableau de bord OLAP sécurisé, puis le déployer. Le module OLAP n'est pas obligatoire, mais la dernière notion s'appuie sur son étoile de ventes.",
  intro:
    'Huit notions pour construire des applications Oracle APEX : pages, rapports, formulaires, logique PL/SQL, Dynamic Actions et sécurité. La dernière notion assemble tout dans un tableau de bord OLAP complet.',
  hero: 'app',
  notions: [n1, n2, n3, n4, n5, n6, n7, n8],

  exam: [
    {
      q: "Où s'exécute le code PL/SQL d'un processus APEX ?",
      options: ['Dans le navigateur', 'Dans ORDS', 'Dans la base de données Oracle', 'Sur un serveur Node.js'],
      answer: 2,
      explain:
        "Le moteur APEX et votre code PL/SQL s'exécutent dans la base. ORDS ne fait que relayer les requêtes HTTP (notion 1).",
    },
    {
      q: "Quelle écriture utiliser dans la requête SQL d'un rapport pour filtrer sur l'item P4_ANNEE ?",
      options: [
        '<code>WHERE annee = &amp;P4_ANNEE.</code>',
        '<code>WHERE annee = :P4_ANNEE</code>',
        '<code>WHERE annee = #P4_ANNEE#</code>',
        "<code>WHERE annee = $v('P4_ANNEE')</code>",
      ],
      answer: 1,
      explain:
        "Variable de liaison <code>:P4_ANNEE</code> : sûre et performante. La substitution <code>&amp;…</code> dans le SQL ouvre la porte à l'injection (notions 4 et 7).",
    },
    {
      q: 'À la soumission, une validation échoue. Que se passe-t-il ?',
      options: [
        "Les processus s'exécutent quand même",
        "Les processus et branches ne s'exécutent pas ; la page se réaffiche avec le message",
        'La session est fermée',
        'Les données sont enregistrées puis annulées',
      ],
      answer: 1,
      explain:
        'Ordre : After Submit → Validations → Processus → Branches. Une validation en échec interrompt la suite (notion 5).',
    },
    {
      q: "Dans un Interactive Report, quelle action permet à l'utilisateur d'afficher les trimestres en colonnes et les régions en lignes ?",
      options: ['Highlight', 'Control Break', 'Pivot', 'Flashback'],
      answer: 2,
      explain:
        "Le <strong>Pivot</strong> de l'IR transforme les valeurs d'une colonne (trimestres) en colonnes, avec une agrégation : c'est l'opération OLAP du même nom (notion 3).",
    },
    {
      q: "Une action « Execute Server-side Code » calcule un total dans <code>:P1_TOTAL</code>. Comment l'afficher dans la page sans la recharger ?",
      options: [
        'Ajouter P1_TOTAL dans Items to Return',
        'Ajouter P1_TOTAL dans Page Items to Submit',
        'Utiliser &amp;P1_TOTAL. dans le PL/SQL',
        'Cocher Fire on Initialization',
      ],
      answer: 0,
      explain: '<b>Items to Return</b> renvoie les valeurs modifiées par le PL/SQL vers le navigateur (notion 6).',
    },
    {
      q: 'Un manager clique sur une barre « Occitanie » et arrive sur la liste des tickets de la région. Quelle opération OLAP a-t-il réalisée ?',
      options: ['Roll-up', 'Pivot', 'Drill-through', 'Dice'],
      answer: 2,
      explain:
        "Passer d'un agrégat aux lignes de détail qui le composent est un <strong>drill-through</strong>. S'il était arrivé sur le CA par magasin de la région, ce serait un drill-down (module OLAP, notion 5, et notion 8).",
    },
    {
      q: "Dans l'attribut <i>HTML Expression</i> d'une colonne de rapport, comment afficher la valeur de la colonne <code>CLIENT</code> ?",
      options: [
        '<code>:CLIENT</code>',
        '<code>&amp;CLIENT.</code>',
        '<code>#CLIENT#</code>',
        "<code>$v('CLIENT')</code>",
      ],
      answer: 2,
      explain:
        "Les colonnes d'un rapport se référencent avec <code>#COLONNE#</code>. <code>&amp;ITEM.</code> sert aux items dans le HTML, <code>:ITEM</code> au SQL et au PL/SQL, <code>$v</code> au JavaScript (notion 4).",
    },
    {
      q: 'Une Dynamic Action <i>Show / Hide</i> sur <code>P2_TYPE</code> fonctionne au changement de valeur, mais au chargement de la page tous les champs sont visibles. Quel réglage manque ?',
      options: ['Items to Return', 'Fire on Initialization', 'Page Items to Submit', 'Wait for Result'],
      answer: 1,
      explain:
        "<b>Fire on Initialization</b> exécute aussi l'action au chargement de la page : l'affichage correspond alors à la valeur initiale de l'item (notion 6).",
    },
    {
      q: "Un utilisateur modifie <code>P10_ID=42</code> en <code>P10_ID=43</code> dans l'URL pour voir une autre fiche. Quel réglage l'en empêche ?",
      options: [
        'Escape special characters',
        "Session State Protection (somme de contrôle sur les items de l'URL)",
        'Un index sur la clé primaire',
        'Le thème Universal Theme',
      ],
      answer: 1,
      explain:
        "La <strong>Session State Protection</strong> ajoute une somme de contrôle aux URL : une valeur modifiée à la main est refusée. Elle complète, sans les remplacer, les contrôles d'accès aux données (notion 7).",
    },
    {
      q: 'Où définir une seule fois une liste de valeurs (LOV) réutilisée par plusieurs pages ?',
      options: [
        'Dans la page globale (page 0)',
        'Dans Shared Components',
        'Dans SQL Workshop',
        'Dans chaque item, par copier-coller',
      ],
      answer: 1,
      explain:
        "Les <strong>Shared Components</strong> regroupent les éléments réutilisables : LOV, menus, schémas d'authentification et d'autorisation, fichiers statiques… Une modification s'applique partout (notion 2).",
    },
  ],

  memo: `
    <section>
      <h4>Référencer un item</h4>
      ${H.tbl(
        ['Contexte', 'Syntaxe'],
        [
          ['SQL, PL/SQL de page', '<code>:P1_ITEM</code>'],
          [
            'HTML, titres, URL',
            '<code>&amp;P1_ITEM.</code> (<code>!HTML</code>, <code>!ATTR</code>, <code>!JS</code>)',
          ],
          ['Package PL/SQL', "<code>V('P1_ITEM')</code>, <code>NV(…)</code>"],
          ['Colonne de rapport', '<code>#COLONNE#</code>'],
          ['JavaScript', "<code>$v('P1_ITEM')</code>, <code>$s('P1_ITEM', v)</code>"],
          ['Graphique (lien)', '<code>&amp;LABEL.</code>, <code>&amp;VALUE.</code>'],
        ],
      )}
      <h4>API JavaScript</h4>
      ${H.code(
        'js',
        `
        apex.item('P1_ANNEE').getValue();
        apex.item('P1_ANNEE').setValue('2025');
        apex.region('chart_ca').refresh();
        apex.message.showPageSuccess('Enregistré');
        apex.server.process('MON_CALLBACK', { x01: 'a' }, { dataType: 'json' })
          .done(function (d) { console.log(d); });
        apex.page.submit('SAVE');
      `,
      )}
    </section>
    <section>
      <h4>Cycle de vie</h4>
      ${H.tbl(
        ['Phase', 'Ordre'],
        [
          ['Affichage', 'Before Header → régions → After Footer'],
          ['Soumission', 'After Submit → Validations → Processus → Branches'],
        ],
      )}
      <h4>Réflexes</h4>
      ${H.tbl(
        ['Symptôme', 'Remède'],
        [
          ['Région pas à jour', 'Page Items to Submit + DA Refresh'],
          ['Valeur PL/SQL non affichée', 'Items to Return'],
          ['Show/Hide incohérent au chargement', 'Fire on Initialization'],
          ['URL modifiable', 'Session State Protection + checksum'],
          ['Code dupliqué', 'Package PL/SQL, LOV partagée'],
        ],
      )}
    </section>
  `,

  glossary: [
    {
      term: 'APEX',
      def: 'Oracle Application Express : plateforme low-code incluse dans la base Oracle pour créer des applications web.',
    },
    {
      term: 'ORDS',
      def: 'Oracle REST Data Services : serveur web Java entre le navigateur et la base ; sert aussi les API REST.',
    },
    {
      term: 'Workspace',
      def: 'Espace de travail APEX isolé, associé à un ou plusieurs schémas, contenant utilisateurs et applications.',
    },
    { term: 'Page Designer', def: "Éditeur principal d'une page : arborescence, layout et propriétés." },
    { term: 'Région', def: "Bloc de contenu d'une page : rapport, formulaire, graphique, cartes, HTML…" },
    { term: 'Item', def: 'Champ portant une valeur, nommé P<page>_<NOM> pour un item de page.' },
    { term: 'Session state', def: "Valeurs des items conservées côté serveur pour la session de l'utilisateur." },
    {
      term: 'LOV',
      def: "List of Values : liste de couples valeur affichée / valeur retournée, statique ou issue d'une requête.",
    },
    {
      term: 'Shared Components',
      def: "Composants réutilisables de l'application : LOV, menus, sécurité, fichiers statiques, templates…",
    },
    {
      term: 'Interactive Report',
      def: "Rapport exploré par l'utilisateur : filtres, ruptures, agrégats, Group By, Pivot, export, rapports sauvegardés.",
    },
    {
      term: 'Interactive Grid',
      def: 'Grille éditable type tableur avec enregistrement automatique des modifications.',
    },
    {
      term: 'Dynamic Action',
      def: 'Comportement déclaratif côté navigateur : événement, condition, actions vraies et fausses.',
    },
    {
      term: 'Ajax Callback',
      def: 'Processus PL/SQL appelé en JavaScript par apex.server.process, sans rechargement de page.',
    },
    {
      term: 'Validation',
      def: "Contrôle exécuté à la soumission avant les processus ; en cas d'échec, la page se réaffiche avec un message.",
    },
    {
      term: 'Processus',
      def: 'Code serveur exécuté à un point du cycle de vie (DML automatique, PL/SQL, e-mail…).',
    },
    { term: 'Branche', def: 'Redirection effectuée après le traitement de la page.' },
    {
      term: 'Authentication Scheme',
      def: "Méthode d'identification des utilisateurs (comptes APEX, LDAP, SSO, OAuth2…).",
    },
    {
      term: 'Authorization Scheme',
      def: "Règle nommée vrai/faux qui conditionne l'accès à une page, une région, un bouton, un processus.",
    },
    {
      term: 'Session State Protection',
      def: "Protection par somme de contrôle des valeurs d'items passées dans les URL.",
    },
    {
      term: 'Universal Theme',
      def: "Thème standard responsive d'APEX, personnalisable via Theme Roller et Template Options.",
    },
    {
      term: 'Supporting Objects',
      def: "Scripts d'installation joints à l'export d'une application (tables, données, packages).",
    },
  ],

  resources: [
    {
      title: 'Documentation Oracle APEX',
      url: 'https://docs.oracle.com/en/database/oracle/apex/',
      desc: 'Guides officiels : App Builder, API PL/SQL, API JavaScript.',
    },
    {
      title: 'apex.oracle.com',
      url: 'https://apex.oracle.com/',
      desc: 'Demander un workspace gratuit pour pratiquer.',
    },
    {
      title: 'Universal Theme',
      url: 'https://apex.oracle.com/ut',
      desc: 'Application de référence : templates, composants et classes CSS utilitaires.',
    },
    {
      title: 'Oracle Cloud Free Tier',
      url: 'https://www.oracle.com/cloud/free/',
      desc: 'Base Autonomous « Always Free » avec APEX préinstallé.',
    },
  ],
};
