import { H } from '../helpers.js';

export default {
  id: 'rh-1',
  short: 'SIRH & cycle de vie',
  title: 'Le SIRH et le cycle de vie du salarié',
  level: 'Débutant',
  duration: '25 min',
  intro:
    "Avant d'analyser des effectifs ou une masse salariale, il faut savoir d'où viennent les données RH : qui les saisit, à quel moment de la vie du salarié, et avec quelles précautions.",
  objectives: [
    'Situer les acteurs de la fonction RH et leur rôle dans les données',
    'Décrire le cycle de vie du salarié et les données produites à chaque étape',
    'Distinguer les données de gestion (SIRH, paie) et les données de pilotage',
    'Connaître les règles essentielles de protection des données RH (RGPD)',
  ],
  content: `
    <p class="def"><b>SIRH</b> (système d'information des ressources humaines) : l'ensemble des outils qui gèrent les <strong>données</strong> et les <strong>processus</strong> RH : administration du personnel, paie, temps et absences, recrutement, formation, entretiens, et pilotage.</p>
    <p>Dans une entreprise, le SIRH est rarement un logiciel unique. On trouve souvent un <strong>cœur RH</strong> (dossiers des salariés, contrats, organisation), un <strong>moteur de paie</strong>, un outil de <strong>gestion des temps</strong>, et une application de <strong>pilotage</strong> qui assemble le tout pour produire tableaux de bord, budgets et indicateurs. C'est le cas de l'application dont Insight mesure les temps de réponse.</p>

    <h3>Qui fait quoi ?</h3>
    ${H.tbl(
      ['Acteur', 'Rôle', "Ce qu'il attend des données"],
      [
        [
          '<b>DRH</b>',
          'Définit la politique RH et sociale, négocie avec les partenaires sociaux',
          'Indicateurs de synthèse, budget, risques sociaux',
        ],
        [
          '<b>RRH / HR Business Partner</b>',
          "Accompagne les managers d'un périmètre (recrutements, carrières, conflits)",
          'Effectifs, mouvements, absentéisme de son périmètre',
        ],
        [
          '<b>Gestionnaire de paie / ADP</b>',
          'Administration du personnel : contrats, bulletins, déclarations sociales',
          'Données individuelles exactes, à jour, au bon mois',
        ],
        [
          '<b>Contrôleur de gestion sociale</b>',
          'Suit la masse salariale, construit le budget, explique les écarts',
          'Historique fiable, agrégats, comparaisons réel / budget',
        ],
        [
          '<b>Managers</b>',
          'Valident absences, recrutements, augmentations ; mènent les entretiens',
          'Vue simple de leur équipe',
        ],
        [
          '<b>CSE</b> (représentants du personnel)',
          'Informés et consultés sur la situation économique et sociale',
          'Données agrégées (BDESE, bilan social, Index égalité)',
        ],
      ],
    )}

    <h3>Le cycle de vie du salarié</h3>
    <p>Chaque étape de la vie d'un salarié dans l'entreprise <strong>produit des données</strong>, souvent accompagnées d'une obligation déclarative :</p>
    ${H.tbl(
      ['Étape', 'Événements', 'Données produites'],
      [
        [
          '<b>Recrutement</b>',
          'Ouverture de poste, candidatures, entretiens, offre',
          'Poste, fourchette de salaire, source de recrutement, délai',
        ],
        [
          '<b>Embauche</b>',
          "Contrat signé, <strong>DPAE</strong> (déclaration préalable à l'embauche, à l'Urssaf, dans les 8 jours qui précèdent), visite d'information et de prévention",
          "Matricule, date d'entrée, type de contrat, temps de travail, emploi, classification, salaire, affectation",
        ],
        [
          '<b>Vie du contrat</b>',
          'Avenants, changement de poste ou de temps de travail, augmentations, promotions, absences, formations, entretiens',
          'Historique daté : <em>qui</em> était <em>où</em>, à <em>quel</em> salaire, <em>quand</em>',
        ],
        [
          '<b>Paie mensuelle</b>',
          'Calcul du bulletin, déclaration sociale nominative (DSN)',
          'Rubriques de paie : brut, cotisations, net, coût employeur',
        ],
        [
          '<b>Sortie</b>',
          'Démission, fin de CDD, rupture conventionnelle, licenciement, retraite',
          'Date et motif de sortie, solde de tout compte, certificat de travail, attestation France Travail',
        ],
      ],
    )}

    <h3>Le dossier du salarié</h3>
    <p>Le dossier individuel (la « fiche salarié ») regroupe :</p>
    <div class="cards">
      <div><b>Identité</b>Nom, prénom, date de naissance, sexe, coordonnées, NIR (numéro de sécurité sociale, réservé à la paie et aux déclarations).</div>
      <div><b>Contrat</b>Type (CDI, CDD…), dates, temps de travail, statut (cadre, non-cadre), convention collective, classification.</div>
      <div><b>Organisation</b>Établissement, service, centre de coûts, manager, emploi occupé.</div>
      <div><b>Rémunération</b>Salaire de base, primes, éléments variables, avantages, historique des augmentations.</div>
    </div>
    ${H.callout('tip', 'Le matricule', "Chaque salarié a un <strong>matricule</strong> : un identifiant unique, stable, sans signification. C'est lui qui relie le cœur RH, la paie et les tableaux de bord. Le nom change (mariage), l'adresse e-mail aussi ; le matricule, jamais. En décisionnel, c'est la <em>clé naturelle</em> de la dimension salarié (module OLAP, notion 3).")}

    <h3>Date d'effet et date de saisie</h3>
    <p>En RH, une information a presque toujours <strong>deux dates</strong> :</p>
    <ul>
      <li>la <strong>date d'effet</strong> : à partir de quand la situation est vraie (augmentation au 1<sup>er</sup> janvier) ;</li>
      <li>la <strong>date de saisie</strong> : quand elle a été enregistrée (le 15 mars, après la négociation annuelle).</li>
    </ul>
    <p>Une augmentation saisie en mars avec effet au 1<sup>er</sup> janvier provoque un <strong>rappel de salaire</strong> : en mars, la paie verse le nouveau salaire de mars <em>et</em> la différence due pour janvier et février. Toute analyse doit donc préciser si elle raisonne en <strong>mois de paie</strong> (quand l'argent est versé) ou en <strong>mois de rattachement</strong> (la période à laquelle il correspond).</p>

    <h3>Données de gestion, données de pilotage</h3>
    ${H.tbl(
      ['', 'Gestion (cœur RH, paie)', 'Pilotage (contrôle de gestion sociale)'],
      [
        [
          'Question',
          '« Quel est le salaire de M. Martin ce mois-ci ? »',
          '« Comment évolue le salaire moyen des cadres depuis 3 ans ? »',
        ],
        ['Exigence', 'Exactitude individuelle, état courant', 'Historique cohérent, agrégats, comparaisons'],
        ['Granularité', 'Un salarié, un bulletin', 'Des populations, des périodes'],
        ['Modèle', 'Transactionnel', 'Décisionnel (faits et dimensions)'],
      ],
    )}
    <p>Vous reconnaissez la distinction OLTP / OLAP du module OLAP : une application de pilotage RH est un <strong>entrepôt de données RH</strong> avec ses faits (paie, effectifs, absences) et ses dimensions (salarié, organisation, temps).</p>

    <h3>Des données sensibles : le RGPD</h3>
    <ul>
      <li><strong>Finalité et minimisation</strong> : on ne collecte que ce qui sert à la gestion du personnel, et chaque traitement a un but précis.</li>
      <li><strong>Habilitations</strong> : un manager voit son équipe, un RRH son périmètre, la paie les données individuelles. Le reste de l'entreprise ne voit que des agrégats.</li>
      <li><strong>Données de santé</strong> : l'employeur connaît les dates d'un arrêt de travail, <strong>jamais son motif médical</strong>.</li>
      <li><strong>Durées de conservation</strong> : limitées et documentées (par exemple, un double des bulletins de paie est conservé 5 ans).</li>
      <li><strong>Petits effectifs</strong> : une moyenne de salaire sur un service de 2 personnes révèle des salaires individuels. Les rapports doivent masquer les groupes trop petits (notion 8).</li>
    </ul>
    ${H.callout('info', "Dans l'application", 'Les rubriques <b>Fiche Salarié</b> (fiche, détail de paie par salarié) et <b>Listes Collaborateurs</b> (listes mensuelle et annuelle, par rubrique, vue arborescente) donnent la vue <em>individuelle</em>. Les rubriques suivantes (effectifs, masse salariale, budget, Index égalité, absentéisme) donnent la vue <em>agrégée</em> de pilotage, celle des notions suivantes.')}
  `,
  keypoints: [
    'Le SIRH réunit cœur RH, paie, temps et pilotage ; chaque acteur attend autre chose des données.',
    'Chaque étape du cycle de vie (embauche, vie du contrat, paie, sortie) produit des données datées.',
    "Le matricule est l'identifiant stable du salarié ; date d'effet et date de saisie sont deux choses différentes.",
    'Données RH = données sensibles : habilitations, pas de motif médical, agrégats sur de petits groupes à masquer.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Quelle déclaration l'employeur doit-il faire <strong>avant</strong> toute embauche ?",
      options: ['La DSN', 'La DPAE', 'Le bilan social', "L'Index égalité"],
      answer: 1,
      explain:
        "La <strong>DPAE</strong> (déclaration préalable à l'embauche) est faite auprès de l'Urssaf dans les 8 jours qui précèdent l'embauche. La DSN est mensuelle, après la paie ; bilan social et Index sont des obligations annuelles.",
    },
    {
      type: 'qcm',
      q: 'Une augmentation est saisie le 15 mars avec effet au 1<sup>er</sup> janvier. Que contient la paie de mars ?',
      options: [
        "Rien de plus : l'augmentation s'appliquera à partir d'avril",
        'Le nouveau salaire de mars uniquement',
        'Le nouveau salaire de mars et un rappel pour janvier et février',
        'Une annulation des bulletins de janvier et février',
      ],
      answer: 2,
      explain:
        "La date d'effet est le 1<sup>er</sup> janvier : la paie de mars applique le nouveau salaire et verse un <strong>rappel</strong> (la différence due pour janvier et février). Les bulletins passés ne sont pas refaits.",
    },
    {
      type: 'qcm',
      q: "Quel identifiant choisir pour relier un salarié entre le cœur RH, la paie et l'entrepôt de pilotage ?",
      options: ['Nom + prénom', 'Le matricule', "L'adresse e-mail professionnelle", 'Le numéro du poste occupé'],
      answer: 1,
      explain:
        "Le <strong>matricule</strong> est unique et stable. Le nom et l'e-mail peuvent changer, et un poste est occupé successivement par plusieurs personnes. Le NIR, lui, est réservé à la paie et aux déclarations.",
    },
    {
      type: 'open',
      q: "Suivez un salarié de sa candidature à son départ en retraite. Listez cinq données produites en chemin et, pour chacune, l'acteur qui la saisit ou la produit.",
      hint: 'Reprenez les étapes du tableau du cycle de vie.',
      answer: `${H.tbl(
        ['Donnée', 'Étape', 'Acteur'],
        [
          ['Fourchette de salaire du poste, source du recrutement', 'Recrutement', 'Recruteur / RRH'],
          ["Date d'entrée, type de contrat, classification, salaire", 'Embauche', 'Gestionnaire ADP (DPAE comprise)'],
          [
            "Augmentations, promotions, changements d'affectation datés",
            'Vie du contrat',
            'Manager (proposition) puis RH (saisie)',
          ],
          ['Absences (dates, type)', 'Vie du contrat', 'Salarié / manager, contrôlées par la paie'],
          ['Bulletin et DSN du mois', 'Paie', 'Gestionnaire de paie'],
          ['Date et motif de sortie, solde de tout compte', 'Sortie', 'Gestionnaire ADP / paie'],
        ],
      )}<p>Toutes ces données sont <strong>datées</strong> : c'est ce qui permettra plus tard de reconstituer l'effectif ou la masse salariale à n'importe quelle date.</p>`,
      criteria: [
        'Au moins cinq données réparties sur plusieurs étapes',
        'Un acteur plausible pour chacune',
        'Mentionne au moins une déclaration (DPAE, DSN)',
        'Bonus : souligne que les données sont datées',
      ],
    },
    {
      type: 'open',
      q: 'Un manager vous demande la liste des arrêts maladie de son équipe <strong>avec leur motif médical</strong>, « pour mieux organiser le travail ». Que lui répondez-vous ?',
      hint: "Distinguez ce dont il a besoin pour organiser le travail et ce que l'entreprise ne connaît pas.",
      answer: `<p>« Je ne peux pas vous transmettre de motif médical : l'entreprise ne le connaît pas. Le volet de l'arrêt de travail adressé à l'employeur ne mentionne que les dates. Et même pour les dates, je vous donne ce qui est utile à l'organisation : qui est absent, depuis quand, jusqu'à quand, pour votre équipe uniquement. »</p>
      <ul>
        <li>Principe de <strong>minimisation</strong> (RGPD) : seules les données nécessaires à la finalité (organiser le travail) sont communiquées.</li>
        <li><strong>Habilitations</strong> : le manager n'accède qu'aux données de son équipe.</li>
        <li>Les analyses d'absentéisme se font sur des <strong>agrégats</strong> (taux par service), pas sur des personnes.</li>
      </ul>`,
      criteria: [
        "Refuse le motif médical (inconnu de l'employeur)",
        "Propose les informations utiles : dates, périmètre de l'équipe",
        'Cite la minimisation ou les habilitations',
        'Ton constructif envers le manager',
      ],
    },
  ],
};
