import { H } from '../helpers.js';

export default {
  id: 'apex-7',
  short: 'Sécurité',
  title: 'Sécurité : authentification, autorisations, injection, XSS',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "Une application décisionnelle expose des données sensibles (chiffre d'affaires, marges, clients). APEX fournit des protections solides, à condition de savoir les activer et de ne pas les contourner.",
  objectives: [
    'Distinguer authentification et autorisation, et les configurer',
    "Restreindre l'accès aux pages, régions et données selon le rôle",
    'Activer la protection du session state (checksums)',
    "Éviter l'injection SQL et le XSS",
  ],
  content: `
    <h3>Authentification : qui êtes-vous ?</h3>
    <p>Un <b>Authentication Scheme</b> (Shared Components) définit comment l'utilisateur prouve son identité. Un seul est actif à la fois.</p>
    ${H.tbl(
      ['Schéma', 'Usage'],
      [
        ['Oracle APEX Accounts', 'Utilisateurs gérés dans le workspace. Pratique pour apprendre et prototyper'],
        ['Database Accounts', 'Comptes de la base Oracle'],
        ['LDAP Directory', "Annuaire d'entreprise (Active Directory…)"],
        ['Social Sign-In', 'OAuth2 / OpenID Connect : Microsoft Entra ID, Google, Okta…'],
        ['SAML Sign-In', "Fournisseur d'identité SAML de l'entreprise"],
        ['HTTP Header Variable', 'SSO géré en amont par un reverse proxy'],
        ['Custom', 'Votre propre fonction PL/SQL de vérification'],
      ],
    )}
    <p>Une page peut être rendue publique (<b>Authentication</b> = <i>Page Is Public</i>), par exemple une page d'accueil ou de contact. Toutes les autres exigent une session authentifiée.</p>

    <h3>Autorisation : qu'avez-vous le droit de faire ?</h3>
    <p>Un <b>Authorization Scheme</b> est une règle nommée qui renvoie vrai ou faux. On l'attache ensuite à l'application, une page, une région, un item, un bouton, un processus ou une colonne de rapport : si la règle est fausse, le composant n'est ni affiché ni exécuté.</p>
    ${H.code(
      'sql',
      `
      -- Authorization Scheme « Est manager » : type Exists SQL Query
      SELECT 1
      FROM   app_utilisateurs
      WHERE  UPPER(login) = UPPER(:APP_USER)
      AND    role IN ('MANAGER', 'ADMIN');
    `,
    )}
    ${H.tbl(
      ['Propriété', 'Conseil'],
      [
        [
          'Type',
          '<i>Exists SQL Query</i>, <i>PL/SQL Function Returning Boolean</i>, <i>Is In Role or Group</i> (avec Access Control)',
        ],
        [
          'Validate authorization scheme',
          '<i>Once per session</i> pour les règles stables (performances), <i>Once per page view</i> si les droits changent souvent',
        ],
        ['Error message', 'Message clair si une page est refusée'],
      ],
    )}
    ${H.callout('tip', 'Access Control intégré', "La fonctionnalité <b>Access Control</b> (cochée à la création de l'application, ou ajoutée plus tard) crée les rôles Administrator, Contributor, Reader, les pages de gestion des utilisateurs et les schémas d'autorisation correspondants. En PL/SQL : <code>APEX_ACL.HAS_USER_ROLE(p_role_static_id => 'ADMINISTRATOR')</code>.")}

    <h3>Sécurité au niveau des lignes</h3>
    <p>Masquer une page ne suffit pas quand chaque utilisateur doit voir <strong>une partie</strong> des données : un directeur régional ne voit que sa région. Deux approches :</p>
    <ul>
      <li><strong>Filtrer dans les requêtes</strong>, idéalement dans une vue commune utilisée par toutes les régions :</li>
    </ul>
    ${H.code(
      'sql',
      `
      CREATE OR REPLACE VIEW v_ventes_securisees AS
      SELECT vd.*
      FROM   v_ventes_detail vd
      WHERE  EXISTS (SELECT 1
                     FROM   droits_region d
                     WHERE  UPPER(d.login) = UPPER(v('APP_USER'))
                     AND   (d.region = vd."Région" OR d.region = '*'));  -- '*' = toutes les régions
    `,
    )}
    <ul>
      <li><strong>Virtual Private Database</strong> (VPD, <code>DBMS_RLS</code>) : la base ajoute elle-même le filtre à <em>toute</em> requête sur la table, quel que soit l'outil (Enterprise Edition).</li>
    </ul>

    <h3>Protection du session state</h3>
    <p>Les URL APEX transportent des valeurs d'items (<code>P20_PRODUIT_KEY=42</code>). Un utilisateur curieux peut modifier <code>42</code> en <code>43</code> pour afficher un enregistrement qui ne le concerne pas. Protection :</p>
    <ol>
      <li>Activer <b>Session State Protection</b> au niveau de l'application (Shared Components &gt; Security).</li>
      <li>Sur la page : <b>Page Access Protection</b> = <i>Arguments Must Have Checksum</i>.</li>
      <li>Sur les items sensibles : <b>Session State Protection</b> = <i>Checksum Required</i> ou <i>Restricted – May not be set from browser</i>.</li>
    </ol>
    <p>APEX ajoute alors une somme de contrôle (<code>cs=…</code>) aux URL qu'il génère ; toute URL modifiée à la main est rejetée. Et comme pour les DA : complétez par une vérification côté serveur (l'utilisateur a-t-il le droit sur cet enregistrement ?).</p>

    <h3>Injection SQL</h3>
    <p>Elle survient quand une valeur saisie par l'utilisateur est <strong>concaténée</strong> dans une requête au lieu d'être passée en paramètre.</p>
    ${H.code(
      'plsql',
      `
      -- DANGEREUX : substitution dans le SQL
      SELECT * FROM dim_client WHERE nom = '&P5_NOM.'
      -- Si P5_NOM vaut :  x' OR '1'='1   → toute la table est renvoyée

      -- DANGEREUX : concaténation en SQL dynamique
      l_sql := 'SELECT COUNT(*) FROM dim_client WHERE nom = ''' || :P5_NOM || '''';
      EXECUTE IMMEDIATE l_sql INTO l_nb;

      -- SÛR : variable de liaison
      SELECT * FROM dim_client WHERE nom = :P5_NOM

      -- SÛR : SQL dynamique avec USING
      EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM dim_client WHERE nom = :nom'
        INTO l_nb USING :P5_NOM;
    `,
    )}
    <p>Les noms d'objets (colonne de tri, nom de table) ne peuvent pas être passés en variable de liaison. On les contrôle par une <strong>liste blanche</strong> ou avec <code>DBMS_ASSERT</code> :</p>
    ${H.code(
      'plsql',
      `
      l_col := CASE :P5_TRI
                 WHEN 'NOM'     THEN 'nom'
                 WHEN 'SEGMENT' THEN 'segment'
                 ELSE 'nom'                      -- valeur par défaut sûre
               END;
      -- ou : l_col := DBMS_ASSERT.SIMPLE_SQL_NAME(:P5_TRI);
    `,
    )}

    <h3>Cross-Site Scripting (XSS)</h3>
    <p>Le XSS consiste à faire exécuter du JavaScript malveillant dans le navigateur d'un autre utilisateur, par exemple en saisissant <code>&lt;script&gt;…&lt;/script&gt;</code> dans un champ « commentaire » affiché ensuite dans un rapport.</p>
    <ul>
      <li>Laissez <b>Escape special characters</b> activé sur les colonnes de rapport (valeur par défaut).</li>
      <li>Dans du PL/SQL qui génère du HTML, échappez les données : <code>apex_escape.html(l_commentaire)</code>.</li>
      <li>Dans les substitutions, utilisez les filtres d'échappement : <code>&amp;P1_NOM!HTML.</code>, <code>&amp;P1_NOM!ATTR.</code>, <code>&amp;P1_NOM!JS.</code>.</li>
    </ul>

    <h3>Liste de contrôle avant la mise en production</h3>
    ${H.tbl(
      ['Point', 'Où'],
      [
        ['HTTPS obligatoire', 'Instance / serveur web'],
        ['Toutes les pages non publiques exigent une authentification', 'Propriétés des pages'],
        ['Autorisations sur pages, boutons et processus sensibles', 'Authorization Schemes'],
        ['Session State Protection activée, pages protégées par checksum', 'Shared Components &gt; Security'],
        ['Aucune substitution <code>&amp;ITEM.</code> dans le SQL', 'Advisor, revue de code'],
        ['Échappement conservé sur les colonnes', 'Rapports'],
        ["Délai d'expiration de session adapté", 'Security Attributes'],
        ["Lancer l'<b>Advisor</b> (Utilities) et un scanner comme APEX-SERT", 'App Builder'],
      ],
    )}
  `,
  keypoints: [
    'Authentification = qui ; autorisation = quoi. Un Authentication Scheme actif, des Authorization Schemes réutilisables.',
    'Filtrer les données par utilisateur dans une vue commune ou avec VPD.',
    'Session State Protection + checksums empêchent la manipulation des URL.',
    "Injection : variables de liaison et USING, listes blanches pour les noms d'objets. XSS : garder l'échappement, apex_escape.",
  ],
  exercises: [
    {
      type: 'qcm',
      q: 'Quelle est la différence entre authentification et autorisation ?',
      options: [
        'Aucune, ce sont deux noms pour la même chose',
        "L'authentification vérifie l'identité ; l'autorisation détermine ce que l'utilisateur a le droit de faire",
        "L'autorisation vérifie le mot de passe ; l'authentification gère les rôles",
        "L'authentification ne concerne que les administrateurs",
      ],
      answer: 1,
      explain:
        "On s'<strong>authentifie</strong> (prouver qui l'on est : mot de passe, SSO), puis l'application applique des <strong>autorisations</strong> (droits sur pages, régions, boutons, données).",
    },
    {
      type: 'qcm',
      q: "Laquelle de ces sources de région est vulnérable à l'injection SQL ?",
      options: [
        '<code>WHERE region = :P3_REGION</code>',
        "<code>WHERE region = '&amp;P3_REGION.'</code>",
        '<code>WHERE region = NVL(:P3_REGION, region)</code>',
        '<code>WHERE (:P3_REGION IS NULL OR region = :P3_REGION)</code>',
      ],
      answer: 1,
      explain:
        "La substitution <code>&amp;P3_REGION.</code> insère le texte brut dans la requête : une valeur comme <code>x' OR '1'='1</code> modifie la logique. Les trois autres utilisent des variables de liaison.",
    },
    {
      type: 'qcm',
      q: 'Contre quoi protège la <b>Session State Protection</b> avec checksum ?',
      options: [
        'Contre les mots de passe faibles',
        "Contre la modification manuelle des valeurs d'items passées dans l'URL",
        'Contre les attaques par déni de service',
        'Contre les erreurs de syntaxe SQL',
      ],
      answer: 1,
      explain:
        "Les URL générées par APEX reçoivent une somme de contrôle. Si l'utilisateur change <code>P20_ID=42</code> en <code>43</code>, la somme ne correspond plus et APEX refuse la requête.",
    },
    {
      type: 'open',
      q: "Dans le tableau de bord des ventes, les directeurs régionaux ne doivent voir que leur région, la direction générale tout. Proposez une solution complète : table(s), vue, autorisation, et ce qui change dans les régions de l'application.",
      answer: `${H.code(
        'sql',
        `
        CREATE TABLE droits_region (
          login   VARCHAR2(100) NOT NULL,
          region  VARCHAR2(50)  NOT NULL,          -- '*' = toutes les régions
          CONSTRAINT pk_droits_region PRIMARY KEY (login, region)
        );

        CREATE OR REPLACE VIEW v_ventes_securisees AS
        SELECT f.*, m.region
        FROM   fait_ventes f
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        WHERE  EXISTS (SELECT 1 FROM droits_region d
                       WHERE  UPPER(d.login) = UPPER(v('APP_USER'))
                       AND   (d.region = m.region OR d.region = '*'));
      `,
      )}<ul>
        <li><strong>Authorization Scheme</strong> « A accès au pilotage » : <i>Exists SQL Query</i> sur <code>droits_region</code> pour <code>:APP_USER</code>, appliqué à l'application ou aux pages du tableau de bord.</li>
        <li>Toutes les régions (graphiques, IR) interrogent <code>v_ventes_securisees</code> au lieu de <code>fait_ventes</code> : le filtre est centralisé, impossible de l'oublier.</li>
        <li>La LOV des régions est elle aussi filtrée par les droits.</li>
        <li>Pour une protection indépendante de l'outil : politique VPD (<code>DBMS_RLS.ADD_POLICY</code>) sur la table de faits.</li>
      </ul>`,
      criteria: [
        'Table de correspondance utilisateur → région(s)',
        'Filtre centralisé (vue ou VPD) basé sur APP_USER',
        "Authorization Scheme pour l'accès aux pages",
        'Toutes les sources utilisent la vue sécurisée',
        'Cas « toutes régions » pour la direction',
      ],
    },
    {
      type: 'open',
      q:
        'Revue de code : trouvez les failles de ce processus et corrigez-le.<br>' +
        H.code(
          'plsql',
          `
        DECLARE
          l_sql VARCHAR2(4000);
        BEGIN
          l_sql := 'DELETE FROM objectifs_ventes WHERE magasin_key = ' || :P9_MAGASIN
                || ' ORDER BY ' || :P9_TRI;
          EXECUTE IMMEDIATE l_sql;
          htp.p('<p>Objectifs supprimés pour ' || :P9_NOM_MAGASIN || '</p>');
        END;
      `,
        ),
      answer: `<ul>
        <li><strong>Injection SQL</strong> : <code>:P9_MAGASIN</code> est concaténé. Une valeur <code>1 OR 1=1</code> supprimerait tout. → variable de liaison avec <code>USING</code>.</li>
        <li><strong>Nom de colonne dynamique</strong> <code>:P9_TRI</code> concaténé (et un <code>ORDER BY</code> n'a de toute façon aucun sens dans un <code>DELETE</code>) → à supprimer, ou liste blanche si besoin ailleurs.</li>
        <li><strong>XSS</strong> : <code>:P9_NOM_MAGASIN</code> est écrit tel quel dans le HTML. → <code>apex_escape.html</code>, ou mieux, un message de succès APEX.</li>
        <li><strong>Autorisation</strong> : rien ne vérifie que l'utilisateur a le droit de supprimer ces objectifs. → Authorization Scheme sur le bouton et le processus, et contrôle dans le PL/SQL.</li>
      </ul>${H.code(
        'plsql',
        `
        BEGIN
          IF NOT apex_authorization.is_authorized('ADMINISTRATEUR') THEN
            raise_application_error(-20001, 'Action non autorisée.');
          END IF;

          DELETE FROM objectifs_ventes
          WHERE  magasin_key = :P9_MAGASIN;          -- SQL statique + variable de liaison

          apex_application.g_print_success_message :=
            'Objectifs supprimés pour ' || apex_escape.html(:P9_NOM_MAGASIN) || '.';
        END;
      `,
      )}`,
      criteria: [
        "Détecte l'injection sur P9_MAGASIN",
        'Détecte la concaténation de P9_TRI',
        'Détecte le XSS sur P9_NOM_MAGASIN',
        "Ajoute un contrôle d'autorisation",
        'Propose une version corrigée avec bind / échappement',
      ],
    },
  ],
};
