import { H } from '../helpers.js';

export default {
  id: 'apex-6',
  short: 'Dynamic Actions & JS',
  title: 'Dynamic Actions et JavaScript : des pages réactives',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "Les Dynamic Actions (DA) ajoutent de l'interactivité côté navigateur sans recharger la page : afficher, masquer, rafraîchir, calculer, appeler le serveur en AJAX. Le plus souvent sans écrire une ligne de JavaScript.",
  objectives: [
    'Construire une Dynamic Action : événement, condition, actions vraies et fausses',
    'Rafraîchir des régions et échanger des valeurs avec le serveur (Items to Submit / Return)',
    "Utiliser l'API JavaScript apex.* pour les cas avancés",
    'Écrire un Ajax Callback appelé par apex.server.process',
  ],
  content: `
    <h3>Anatomie d'une Dynamic Action</h3>
    ${H.tbl(
      ['Partie', 'Question', 'Exemples'],
      [
        [
          '<b>When</b> : événement',
          'Quand ?',
          'Change, Click, Page Load, Dialog Closed, After Refresh, Key Release, événement personnalisé',
        ],
        [
          '<b>When</b> : sélection',
          'Sur quoi ?',
          'Item(s) <code>P1_ANNEE</code>, Button, Region, jQuery Selector <code>.js-kpi</code>, JavaScript Expression',
        ],
        [
          '<b>Client-side Condition</b>',
          'À quelle condition ?',
          '<code>P1_CATEGORIE</code> = « Vélos », item nul, expression JavaScript',
        ],
        ['<b>True Actions</b>', 'Que faire si vrai ?', 'Show, Refresh, Set Value…'],
        ['<b>False Actions</b>', 'Que faire si faux ?', 'Hide, Clear…'],
      ],
    )}
    <p>Chaque action a ses <b>Affected Elements</b> (ce sur quoi elle agit) et une option <b>Fire on Initialization</b> : exécuter aussi l'action au chargement de la page, pour que l'état initial soit cohérent (un Show/Hide doit presque toujours l'avoir).</p>

    <h3>Les actions les plus utiles</h3>
    <div class="cards">
      <div><b>Refresh</b>Recharge une région (rapport, graphique) en AJAX. Pensez à <i>Page Items to Submit</i> sur la région.</div>
      <div><b>Set Value</b>Affecte un item à partir d'une valeur statique, d'une expression JS, d'une requête SQL ou de PL/SQL (<i>Items to Submit</i> requis pour le serveur).</div>
      <div><b>Execute Server-side Code</b>Exécute du PL/SQL en AJAX. <i>Items to Submit</i> : valeurs envoyées ; <i>Items to Return</i> : items mis à jour au retour.</div>
      <div><b>Show / Hide, Enable / Disable</b>Adapter le formulaire au contexte.</div>
      <div><b>Execute JavaScript Code</b>Pour tout le reste, avec <code>this.triggeringElement</code>, <code>this.data</code>…</div>
      <div><b>Confirm, Alert, Submit Page, Set Focus, Add Class</b>Interactions courantes, sans code.</div>
    </div>

    <h3>Exemple complet : un tableau de bord qui réagit</h3>
    <p>Page 1 : un item <code>P1_ANNEE</code>, un graphique (Static ID <code>chart_ca</code>), un rapport (Static ID <code>rep_top</code>) et un item d'affichage <code>P1_CA_TOTAL</code>.</p>
    <ol>
      <li>DA « Changement d'année » : <b>Event</b> Change, <b>Item</b> <code>P1_ANNEE</code>.</li>
      <li>True action 1 : <b>Refresh</b> de la région <code>chart_ca</code> (sa propriété <i>Page Items to Submit</i> contient <code>P1_ANNEE</code>).</li>
      <li>True action 2 : <b>Refresh</b> de la région <code>rep_top</code>.</li>
      <li>True action 3 : <b>Execute Server-side Code</b>, Items to Submit = <code>P1_ANNEE</code>, Items to Return = <code>P1_CA_TOTAL</code> :</li>
    </ol>
    ${H.code(
      'plsql',
      `
      SELECT TO_CHAR(SUM(f.montant_ht), 'FM999G999G990', 'NLS_NUMERIC_CHARACTERS='', ''') || ' €'
      INTO   :P1_CA_TOTAL
      FROM   fait_ventes f
      JOIN   dim_temps t ON t.date_key = f.date_key
      WHERE  t.annee = :P1_ANNEE;
    `,
    )}
    ${H.callout('tip', 'Static ID', "Donnez un <b>Static ID</b> à chaque région que vous manipulez (Advanced &gt; Static ID). Il devient l'<code>id</code> HTML de la région et le nom utilisé par l'API JavaScript : <code>apex.region('chart_ca')</code>.")}

    <h3>L'API JavaScript d'APEX</h3>
    ${H.tbl(
      ['Besoin', 'Code'],
      [
        ['Lire un item', "<code>apex.item('P1_ANNEE').getValue()</code> ou <code>$v('P1_ANNEE')</code>"],
        [
          'Écrire un item',
          "<code>apex.item('P1_ANNEE').setValue('2025')</code> ou <code>$s('P1_ANNEE', '2025')</code>",
        ],
        ['Rafraîchir une région', "<code>apex.region('chart_ca').refresh()</code>"],
        ['Message de succès', "<code>apex.message.showPageSuccess('Enregistré')</code>"],
        [
          'Afficher des erreurs',
          "<code>apex.message.showErrors([{ type: 'error', location: 'page', message: '…' }])</code>",
        ],
        ['Appel AJAX', "<code>apex.server.process('NOM_CALLBACK', {…})</code>"],
        ['Naviguer', '<code>apex.navigation.redirect(url)</code>'],
        ['Soumettre la page', "<code>apex.page.submit('SAVE')</code>"],
      ],
    )}

    <h3>Ajax Callback : appeler du PL/SQL depuis JavaScript</h3>
    <p>Quand les actions déclaratives ne suffisent pas (renvoyer plusieurs valeurs, un JSON complexe), on crée un processus de type <b>Ajax Callback</b> dans la page, puis on l'appelle en JavaScript.</p>
    ${H.code(
      'plsql',
      `
      -- Processus « Ajax Callback » nommé GET_KPI (page 1)
      DECLARE
        l_ca     NUMBER;
        l_marge  NUMBER;
        l_nb     NUMBER;
      BEGIN
        SELECT SUM(f.montant_ht), SUM(f.marge), COUNT(DISTINCT f.num_ticket)
        INTO   l_ca, l_marge, l_nb
        FROM   fait_ventes f
        JOIN   dim_temps t ON t.date_key = f.date_key
        WHERE  t.annee = TO_NUMBER(apex_application.g_x01);   -- paramètre envoyé par le JS

        apex_json.open_object;
        apex_json.write('ca',        l_ca);
        apex_json.write('tauxMarge', ROUND(100 * l_marge / NULLIF(l_ca, 0), 1));
        apex_json.write('tickets',   l_nb);
        apex_json.close_object;
      END;
    `,
    )}
    ${H.code(
      'js',
      `
      // Dans une DA « Execute JavaScript Code », ou dans Function and Global Variable Declaration
      function chargerKpi() {
        apex.server.process('GET_KPI', {
          x01: apex.item('P1_ANNEE').getValue()
        }, {
          dataType: 'json'
        }).done(function (data) {
          apex.item('P1_KPI_CA').setValue(data.ca);
          apex.item('P1_KPI_MARGE').setValue(data.tauxMarge + ' %');
          apex.item('P1_KPI_TICKETS').setValue(data.tickets);
        }).fail(function (jqXHR, textStatus) {
          apex.message.showErrors([{ type: 'error', location: 'page', message: 'KPI indisponibles : ' + textStatus }]);
        });
      }
    `,
    )}
    ${H.callout('info', 'Où placer son JavaScript ?', "<ul><li>Page &gt; <b>Function and Global Variable Declaration</b> : fonctions de la page.</li><li>Page &gt; <b>Execute when Page Loads</b> : code d'initialisation.</li><li><b>Static Application Files</b> + référence dans l'application : code partagé, mis en cache par le navigateur.</li></ul>")}
    ${H.callout('warn', 'La sécurité reste côté serveur', "Tout ce qui est dans le navigateur peut être modifié par l'utilisateur (outils de développement). Une DA qui masque un bouton n'est pas une protection : les contrôles de droits et de données doivent être faits côté serveur (validations, autorisations, notion 7).")}
  `,
  keypoints: [
    "DA = événement + sélection + condition client + actions vraies / fausses ; Fire on Initialization pour l'état initial.",
    'Refresh (avec Page Items to Submit), Set Value, Execute Server-side Code (Items to Submit / Return).',
    "API : apex.item, apex.region('staticId').refresh(), apex.message, apex.server.process.",
    'Ajax Callback + apex_json pour renvoyer des données structurées ; la sécurité se contrôle côté serveur.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Vous voulez rafraîchir un graphique chaque fois que l'utilisateur choisit une autre année dans <code>P1_ANNEE</code>. Quel événement choisir pour la Dynamic Action ?",
      options: ['Click', 'Page Load', 'Change', 'Dialog Closed'],
      answer: 2,
      explain:
        "L'événement <strong>Change</strong> sur l'item <code>P1_ANNEE</code> se déclenche quand sa valeur change. Page Load ne se déclenche qu'au chargement, Dialog Closed à la fermeture d'une modale.",
    },
    {
      type: 'qcm',
      q: "Une action <i>Execute Server-side Code</i> calcule <code>:P1_CA_TOTAL</code>, mais le champ reste vide à l'écran. Que manque-t-il ?",
      options: [
        'Mettre P1_CA_TOTAL dans Items to Return',
        'Mettre P1_CA_TOTAL dans Items to Submit',
        'Cocher Fire on Initialization',
        'Utiliser &amp;P1_CA_TOTAL. dans le PL/SQL',
      ],
      answer: 0,
      explain:
        "<b>Items to Submit</b> envoie des valeurs du navigateur vers le serveur ; <b>Items to Return</b> renvoie au navigateur les valeurs modifiées par le PL/SQL. Sans cela, la valeur calculée reste dans le session state mais n'est pas affichée.",
    },
    {
      type: 'qcm',
      q: 'Quelle instruction JavaScript rafraîchit la région dont le Static ID est <code>rep_ventes</code> ?',
      options: [
        "<code>$s('rep_ventes')</code>",
        "<code>apex.region('rep_ventes').refresh()</code>",
        "<code>apex.page.submit('rep_ventes')</code>",
        "<code>document.refresh('rep_ventes')</code>",
      ],
      answer: 1,
      explain:
        "<code>apex.region(staticId)</code> renvoie l'interface de la région, dont la méthode <code>refresh()</code> recharge le contenu en AJAX. <code>$s</code> affecte un item, <code>apex.page.submit</code> soumet toute la page.",
    },
    {
      type: 'open',
      q: 'Page 2 : si <code>P2_CATEGORIE</code> vaut « Vélos », il faut afficher la région « Détail par type de vélo » ; sinon la masquer. Dans tous les cas, le rapport principal doit se rafraîchir. Décrivez la ou les Dynamic Actions de façon déclarative.',
      answer: `<p><strong>DA « Catégorie modifiée »</strong></p>
      <ul>
        <li><b>When</b> : Event = Change, Selection Type = Item(s), Item = <code>P2_CATEGORIE</code>.</li>
        <li><b>Client-side Condition</b> : Type = Item = Value, Item = <code>P2_CATEGORIE</code>, Value = <code>Vélos</code>.</li>
        <li><b>True Action 1</b> : Show, Affected Elements = Region « Détail par type de vélo », <b>Fire on Initialization</b> = Oui.</li>
        <li><b>False Action 1</b> : Hide, même région, Fire on Initialization = Oui.</li>
        <li><b>True Action 2</b> et <b>False Action 2</b> : Refresh du rapport principal (dans les deux branches, puisqu'on rafraîchit toujours). Alternative : une seconde DA sans condition dédiée au rafraîchissement.</li>
        <li>Sur le rapport : <b>Page Items to Submit</b> = <code>P2_CATEGORIE</code>.</li>
      </ul>`,
      criteria: [
        'Événement Change sur P2_CATEGORIE',
        'Condition client sur la valeur « Vélos »',
        'Show en vrai, Hide en faux, avec Fire on Initialization',
        'Refresh du rapport dans tous les cas',
        'Page Items to Submit sur le rapport',
      ],
    },
    {
      type: 'open',
      q: "Écrivez un Ajax Callback <code>TOP_MAGASIN</code> qui renvoie en JSON le nom et le CA du meilleur magasin pour l'année passée en <code>x01</code>, et le code JavaScript qui l'appelle et affiche « Meilleur magasin : Lyon Part-Dieu (1 234 567 €) » en message de succès.",
      answer: `${H.code(
        'plsql',
        `
        DECLARE
          l_nom VARCHAR2(100);
          l_ca  NUMBER;
        BEGIN
          SELECT nom, ca INTO l_nom, l_ca
          FROM  (SELECT m.nom, SUM(f.montant_ht) AS ca
                 FROM   fait_ventes f
                 JOIN   dim_temps   t ON t.date_key    = f.date_key
                 JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
                 WHERE  t.annee = TO_NUMBER(apex_application.g_x01)
                 GROUP  BY m.nom
                 ORDER  BY ca DESC)
          FETCH FIRST 1 ROW ONLY;

          apex_json.open_object;
          apex_json.write('nom', l_nom);
          apex_json.write('ca',  l_ca);
          apex_json.close_object;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            apex_json.open_object;
            apex_json.write('nom', '');
            apex_json.close_object;
        END;
      `,
      )}${H.code(
        'js',
        `
        apex.server.process('TOP_MAGASIN', { x01: $v('P1_ANNEE') }, { dataType: 'json' })
          .done(function (d) {
            if (!d.nom) { apex.message.showPageSuccess('Aucune vente pour cette année.'); return; }
            var ca = Number(d.ca).toLocaleString('fr-FR');
            apex.message.showPageSuccess('Meilleur magasin : ' + d.nom + ' (' + ca + ' €)');
          });
      `,
      )}`,
      criteria: [
        'Processus Ajax Callback nommé TOP_MAGASIN',
        'Paramètre lu via apex_application.g_x01',
        'JSON produit avec apex_json',
        'apex.server.process avec dataType json',
        'Gestion du cas sans donnée',
      ],
    },
  ],
};
