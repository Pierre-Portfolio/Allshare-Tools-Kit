import { H } from '../helpers.js';

export default {
  id: 'apex-5',
  short: 'Logique serveur & PL/SQL',
  title: 'Logique côté serveur : cycle de vie, calculs, validations, processus, branches',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "Une page APEX vit deux moments : son affichage (Show) et sa soumission (Accept). Savoir ce qui s'exécute et dans quel ordre permet de placer chaque morceau de logique au bon endroit.",
  objectives: [
    "Décrire le cycle de vie d'une page : rendu et traitement",
    'Utiliser computations, validations, processus et branches',
    "Conditionner l'exécution (bouton, item, autorisation)",
    'Organiser la logique métier dans des packages PL/SQL',
  ],
  content: `
    <h3>Le cycle de vie d'une page</h3>
    <figure class="figure part-apex">
      <svg class="dg" viewBox="0 0 720 210" width="720" role="img" aria-label="Cycle de vie : affichage (pre-rendering, régions, post-rendering) puis soumission (computations, validations, processus, branches)">
        <defs><marker id="ah-a5" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" class="arrow"/></marker></defs>
        <text x="10" y="22" class="t-p">1. AFFICHAGE (Show / Rendering)</text>
        <rect class="box" x="10" y="34" width="160" height="56" rx="8"/><text x="90" y="58" text-anchor="middle" class="t-b">Pre-Rendering</text><text x="90" y="76" text-anchor="middle" class="t-s">calculs, init. formulaire</text>
        <path class="ln" d="M170 62h24" marker-end="url(#ah-a5)"/>
        <rect class="box-p" x="198" y="34" width="160" height="56" rx="8"/><text x="278" y="58" text-anchor="middle" class="t-b">Régions</text><text x="278" y="76" text-anchor="middle" class="t-s">requêtes SQL, HTML</text>
        <path class="ln" d="M358 62h24" marker-end="url(#ah-a5)"/>
        <rect class="box" x="386" y="34" width="160" height="56" rx="8"/><text x="466" y="58" text-anchor="middle" class="t-b">Post-Rendering</text><text x="466" y="76" text-anchor="middle" class="t-s">après le pied de page</text>
        <path class="ln" d="M546 62h24" marker-end="url(#ah-a5)"/>
        <rect class="box-2" x="574" y="34" width="136" height="56" rx="8"/><text x="642" y="58" text-anchor="middle" class="t-b">Navigateur</text><text x="642" y="76" text-anchor="middle" class="t-s">l'utilisateur agit</text>
        <path class="ln" d="M642 90v40" marker-end="url(#ah-a5)"/>
        <text x="652" y="116" class="t-m">submit</text>
        <text x="10" y="126" class="t-p">2. SOUMISSION (Accept / Processing)</text>
        <rect class="box" x="490" y="138" width="220" height="56" rx="8"/><text x="600" y="162" text-anchor="middle" class="t-b">After Submit</text><text x="600" y="180" text-anchor="middle" class="t-s">items → session state, calculs</text>
        <path class="ln" d="M490 166h-24" marker-end="url(#ah-a5)"/>
        <rect class="box-a" x="336" y="138" width="126" height="56" rx="8"/><text x="399" y="162" text-anchor="middle" class="t-b">Validations</text><text x="399" y="180" text-anchor="middle" class="t-s">erreur ⇒ arrêt</text>
        <path class="ln" d="M336 166h-24" marker-end="url(#ah-a5)"/>
        <rect class="box-p" x="182" y="138" width="126" height="56" rx="8"/><text x="245" y="162" text-anchor="middle" class="t-b">Processus</text><text x="245" y="180" text-anchor="middle" class="t-s">DML, PL/SQL</text>
        <path class="ln" d="M182 166h-24" marker-end="url(#ah-a5)"/>
        <rect class="box" x="10" y="138" width="144" height="56" rx="8"/><text x="82" y="162" text-anchor="middle" class="t-b">Branches</text><text x="82" y="180" text-anchor="middle" class="t-s">redirection</text>
      </svg>
      <figcaption>Si une validation échoue, les processus ne s'exécutent pas : la page se réaffiche avec les messages d'erreur.</figcaption>
    </figure>
    ${H.tbl(
      ["Point d'exécution", 'Quand', 'Usage typique'],
      [
        ['Before Header', 'Avant tout envoi de HTML', 'Initialiser des items, rediriger, <i>Form – Initialization</i>'],
        ['After Header / Before Regions', 'Pendant le rendu', "Rare : calculs dépendant d'éléments déjà affichés"],
        ['After Submit', 'Juste après réception des valeurs', 'Computations (normaliser une saisie)'],
        ['Validating', 'Après After Submit', 'Validations'],
        ['Processing', 'Si toutes les validations passent', 'Processus DML, PL/SQL, e-mails'],
        ['After Processing', 'À la fin', 'Branches (vers quelle page aller)'],
      ],
    )}

    <h3>Computations (calculs)</h3>
    <p>Affectent une valeur à un item, à un point d'exécution donné. Exemple : forcer une saisie en majuscules après soumission (<i>After Submit</i>, type <i>Expression</i> : <code>UPPER(:P20_CODE)</code>), ou calculer l'année par défaut au premier affichage.</p>

    <h3>Validations</h3>
    <p>Elles vérifient les données <strong>avant</strong> les processus. Types courants :</p>
    <ul>
      <li><i>Item is NOT NULL</i>, <i>Item is numeric</i>, <i>Item is a valid date</i> : les plus simples (souvent remplacés par la propriété <b>Value Required</b> de l'item) ;</li>
      <li><i>Rows returned</i> / <i>No Rows returned</i> : une requête SQL doit (ou ne doit pas) renvoyer de ligne, par exemple pour interdire un doublon ;</li>
      <li><i>Expression</i> (booléenne) : <code>:P30_DATE_FIN &gt;= :P30_DATE_DEBUT</code> ;</li>
      <li><i>Function Body (returning Boolean)</i> ou <i>(returning Error Text)</i> : du PL/SQL libre.</li>
    </ul>
    ${H.code(
      'plsql',
      `
      -- Validation « Function Body (returning Error Text) » : NULL = OK, sinon message affiché
      DECLARE
        l_nb NUMBER;
      BEGIN
        IF :P30_OBJECTIF < 0 THEN
          RETURN 'L''objectif doit être positif.';
        END IF;

        SELECT COUNT(*) INTO l_nb
        FROM   objectifs_ventes
        WHERE  magasin_key = :P30_MAGASIN_KEY
        AND    mois_key    = :P30_MOIS_KEY
        AND    objectif_id <> NVL(:P30_OBJECTIF_ID, -1);   -- exclure la ligne en cours d'édition

        IF l_nb > 0 THEN
          RETURN 'Un objectif existe déjà pour ce magasin et ce mois.';
        END IF;

        RETURN NULL;
      END;
    `,
    )}
    <p>Associez chaque validation à un item (<b>Associated Item</b>) : le message s'affiche à côté du champ concerné.</p>

    <h3>Processus</h3>
    <p>Un processus exécute du code serveur : DML automatique, PL/SQL, envoi d'e-mail (<code>APEX_MAIL</code>), fermeture de modale, appel REST… Ils s'exécutent dans l'ordre de leur <b>Sequence</b>.</p>
    ${H.callout('tip', 'Bonne pratique : le code métier dans des packages', "Gardez dans APEX des processus d'une ligne qui appellent des procédures de <strong>packages PL/SQL</strong>. Avantages : code compilé et vérifié par la base, réutilisable (autres pages, jobs, API), testable, versionné dans Git comme n'importe quel code.")}
    ${H.code(
      'plsql',
      `
      CREATE OR REPLACE PACKAGE pkg_objectifs AS
        PROCEDURE enregistrer (
          p_magasin_key IN NUMBER,
          p_mois_key    IN NUMBER,
          p_montant     IN NUMBER
        );
      END pkg_objectifs;
      /
      CREATE OR REPLACE PACKAGE BODY pkg_objectifs AS
        PROCEDURE enregistrer (
          p_magasin_key IN NUMBER,
          p_mois_key    IN NUMBER,
          p_montant     IN NUMBER
        ) IS
        BEGIN
          MERGE INTO objectifs_ventes o
          USING (SELECT p_magasin_key AS magasin_key, p_mois_key AS mois_key FROM dual) s
          ON    (o.magasin_key = s.magasin_key AND o.mois_key = s.mois_key)
          WHEN MATCHED THEN
            UPDATE SET o.montant = p_montant, o.modifie_par = v('APP_USER'), o.modifie_le = SYSDATE
          WHEN NOT MATCHED THEN
            INSERT (magasin_key, mois_key, montant, modifie_par, modifie_le)
            VALUES (p_magasin_key, p_mois_key, p_montant, v('APP_USER'), SYSDATE);

          apex_debug.message('Objectif enregistré : magasin %s, mois %s', p_magasin_key, p_mois_key);
        END enregistrer;
      END pkg_objectifs;
      /
    `,
    )}
    <p>Dans la page, le processus (type <i>Execute Code</i>) devient :</p>
    ${H.code(
      'plsql',
      `
      pkg_objectifs.enregistrer(
        p_magasin_key => :P30_MAGASIN_KEY,
        p_mois_key    => :P30_MOIS_KEY,
        p_montant     => :P30_OBJECTIF
      );
    `,
    )}
    <p>Et ses propriétés : <b>Server-side Condition</b> = <i>When Button Pressed</i> : <code>SAVE</code>, <b>Success Message</b> = « Objectif enregistré. ».</p>

    <h3>Conditions côté serveur</h3>
    <p>Presque tous les composants (régions, items, boutons, processus) ont une <b>Server-side Condition</b> et une <b>Authorization Scheme</b>. Types fréquents :</p>
    ${H.tbl(
      ['Condition', 'Exemple'],
      [
        ['When Button Pressed', 'Processus exécuté seulement si REQUEST = SAVE'],
        [
          'Item is NULL / is NOT NULL',
          'Bouton « Supprimer » visible seulement si <code>P20_ID</code> est renseigné (mode édition)',
        ],
        ['Request is contained in Value', '<code>SAVE,CREATE</code>'],
        ['Rows returned', "Afficher une alerte s'il existe des objectifs non saisis"],
        ['Expression', '<code>:APP_PAGE_ID = 1 AND :P1_ANNEE &lt; EXTRACT(YEAR FROM SYSDATE)</code>'],
      ],
    )}

    <h3>Branches et messages d'erreur</h3>
    <p>Une <b>branche</b> redirige après le traitement (vers la même page, une autre page, une URL), avec éventuellement des valeurs d'items. Pour lever une erreur propre depuis PL/SQL :</p>
    ${H.code(
      'plsql',
      `
      IF l_budget_depasse THEN
        apex_error.add_error(
          p_message          => 'Le budget annuel du magasin est dépassé.',
          p_display_location => apex_error.c_inline_with_field_and_notif,
          p_page_item_name   => 'P30_OBJECTIF'
        );
      END IF;
    `,
    )}
    ${H.callout('info', 'Déboguer', "Lancez la page en mode <b>Debug</b> (barre de développeur) puis ouvrez <i>View Debug</i> : vous voyez chaque étape du cycle de vie, les requêtes, les temps d'exécution et vos <code>apex_debug.message</code>.")}
  `,
  keypoints: [
    'Affichage : Pre-Rendering → régions → Post-Rendering. Soumission : After Submit → Validations → Processus → Branches.',
    'Une validation en échec stoppe les processus et réaffiche la page avec les messages.',
    'Processus conditionnés par bouton (When Button Pressed), item ou autorisation.',
    'Logique métier dans des packages PL/SQL ; APEX appelle, la base exécute.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Après la soumission d'une page, dans quel ordre s'exécutent ces éléments ?",
      options: [
        'Processus → Validations → Branches',
        'Validations → Processus → Branches',
        'Branches → Validations → Processus',
        'Validations → Branches → Processus',
      ],
      answer: 1,
      explain:
        "Les valeurs sont d'abord enregistrées (After Submit, avec les computations), puis <strong>validées</strong>, puis <strong>traitées</strong> par les processus, et enfin la <strong>branche</strong> redirige. Si une validation échoue, processus et branches ne s'exécutent pas.",
    },
    {
      type: 'qcm',
      q: "Un processus PL/SQL ne doit s'exécuter que si l'utilisateur a cliqué sur le bouton <code>SAVE</code>. Quelle propriété régler ?",
      options: [
        'Sequence = SAVE',
        'Server-side Condition : When Button Pressed = SAVE',
        'Authorization Scheme = SAVE',
        'Success Message = SAVE',
      ],
      answer: 1,
      explain:
        'La condition <i>When Button Pressed</i> teste la valeur de <code>REQUEST</code>, qui contient le nom du bouton ayant soumis la page. <i>Authorization</i> sert aux droits, pas au déclenchement.',
    },
    {
      type: 'qcm',
      q: 'Pourquoi placer la logique métier dans des packages PL/SQL plutôt que directement dans les processus APEX ?',
      options: [
        "Parce qu'APEX n'accepte pas le PL/SQL dans les processus",
        'Pour la réutilisation, la compilation par la base, les tests et le versionnement',
        "Parce que les packages s'exécutent dans le navigateur",
        "Pour éviter d'utiliser des variables de liaison",
      ],
      answer: 1,
      explain:
        'APEX accepte le PL/SQL, mais un package est compilé (erreurs détectées tôt), réutilisable depuis plusieurs pages, jobs ou API, testable unitairement (utPLSQL) et facile à versionner.',
    },
    {
      type: 'open',
      q: 'La page 40 permet de saisir une promotion : <code>P40_DATE_DEBUT</code>, <code>P40_DATE_FIN</code>, <code>P40_REMISE_PCT</code>. Écrivez une validation <i>Function Body (returning Error Text)</i> qui vérifie : dates renseignées, fin ≥ début, remise entre 1 et 70 %.',
      answer: `${H.code(
        'plsql',
        `
        BEGIN
          IF :P40_DATE_DEBUT IS NULL OR :P40_DATE_FIN IS NULL THEN
            RETURN 'Les dates de début et de fin sont obligatoires.';
          END IF;

          IF TO_DATE(:P40_DATE_FIN, 'DD/MM/YYYY') < TO_DATE(:P40_DATE_DEBUT, 'DD/MM/YYYY') THEN
            RETURN 'La date de fin doit être postérieure ou égale à la date de début.';
          END IF;

          IF :P40_REMISE_PCT IS NULL
             OR TO_NUMBER(:P40_REMISE_PCT) NOT BETWEEN 1 AND 70 THEN
            RETURN 'La remise doit être comprise entre 1 et 70 %.';
          END IF;

          RETURN NULL;   -- tout est correct
        END;
      `,
      )}<p>Les items APEX sont des chaînes dans le session state : on convertit explicitement avec le <strong>format de l'item</strong> (ici <code>DD/MM/YYYY</code>). On peut aussi découper en trois validations distinctes, chacune associée à son item, pour des messages mieux placés.</p>`,
      criteria: [
        'Retourne NULL si tout est correct, un message sinon',
        'Contrôle des dates obligatoires',
        'Comparaison des dates avec conversion explicite',
        'Borne 1–70 sur la remise',
      ],
    },
    {
      type: 'open',
      q: "Un bouton « Recalculer les agrégats » sur une page d'administration doit rafraîchir la vue matérialisée <code>mv_ca_region_trimestre</code> (module OLAP, notion 7), tracer qui l'a lancé et afficher un message. Proposez le code (package + processus) et les réglages.",
      answer: `${H.code(
        'plsql',
        `
        CREATE OR REPLACE PACKAGE BODY pkg_admin_dwh AS
          PROCEDURE rafraichir_agregats IS
          BEGIN
            DBMS_MVIEW.REFRESH('MV_CA_REGION_TRIMESTRE', method => 'C');

            INSERT INTO journal_admin (action, utilisateur, date_action)
            VALUES ('REFRESH MV_CA_REGION_TRIMESTRE', v('APP_USER'), SYSTIMESTAMP);
          END rafraichir_agregats;
        END pkg_admin_dwh;
        /
      `,
      )}<ul>
        <li>Bouton <code>REFRESH</code>, action <i>Submit Page</i>.</li>
        <li>Processus <i>Execute Code</i> : <code>pkg_admin_dwh.rafraichir_agregats;</code>, condition <i>When Button Pressed</i> = REFRESH, <b>Success Message</b> « Agrégats recalculés. ».</li>
        <li>Page et bouton protégés par un <b>Authorization Scheme</b> « Administrateur » (notion 7).</li>
        <li>Si le rafraîchissement est long, cocher l'exécution en arrière-plan (<i>Execution Chain</i> avec <i>Run in Background</i>, APEX 23.1+) pour ne pas bloquer l'utilisateur.</li>
      </ul>`,
      criteria: [
        'Logique dans un package',
        'DBMS_MVIEW.REFRESH appelé',
        'Traçabilité avec APP_USER',
        'Processus conditionné par le bouton + message',
        'Protection par autorisation',
      ],
    },
  ],
};
