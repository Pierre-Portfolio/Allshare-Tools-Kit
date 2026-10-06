import { H } from '../helpers.js';

export default {
  id: 'rh-6',
  short: 'Budget & hypothèses',
  title: 'Construire et suivre le budget de masse salariale',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "Chaque automne, l'entreprise prévoit sa masse salariale de l'année suivante. Le budget part d'une photographie des salariés présents, puis applique des hypothèses : augmentations, embauches, départs, charges.",
  objectives: [
    "Décrire les étapes d'un budget de masse salariale et ses hypothèses",
    'Calculer un budget simple salarié par salarié',
    'Distinguer budget, réel, atterrissage (estimé) et reforecast',
    'Décomposer un écart réel / budget en effet volume et effet prix',
  ],
  content: `
    <h3>Les étapes</h3>
    <ol>
      <li><strong>La base de départ</strong> : une photographie des salariés présents (par exemple au 30 septembre), avec leur salaire de base annualisé, leur temps de travail et leur affectation.</li>
      <li><strong>Les hypothèses globales</strong> : taux et date d'effet de l'augmentation générale, enveloppe d'augmentations individuelles, évolution des minima (SMIC, grille de branche), taux de charges patronales par catégorie.</li>
      <li><strong>Les mouvements prévus</strong> : modifications de postes, embauches prévisionnelles (poste, date d'arrivée, salaire), départs connus (retraites, fins de CDD) et départs statistiques (taux de turnover).</li>
      <li><strong>Le calcul</strong> : mois par mois, salarié par salarié (ou poste par poste), puis consolidation par service et par rubrique.</li>
      <li><strong>Les contrôles</strong> : effectif budgété cohérent avec les postes autorisés, changements justifiés, comparaison avec l'atterrissage de l'année en cours.</li>
    </ol>
    ${H.callout('info', "Dans l'application", 'La rubrique <b>Hyp. Budgétaires</b> suit exactement ces étapes : modifications de postes, embauches prévisionnelles, saisie individuelle, saisie des enveloppes par service ou par rubrique, hypothèses globales, contrôles des effectifs et des changements. La rubrique <b>Finance</b> rapproche ensuite le budget des comptes (suivi budgétaire, calcul estimé, réel cumulé).')}

    <h3>Budget individuel ou global ?</h3>
    ${H.tbl(
      ['', 'Budget individuel (bottom-up)', 'Budget global (top-down)'],
      [
        [
          'Principe',
          'Chaque salarié et chaque poste est calculé mois par mois',
          "Masse de départ × taux d'évolution par grande catégorie",
        ],
        [
          'Précision',
          "Élevée : dates d'effet, départs, embauches nominatives",
          'Moyenne : bonne pour un ordre de grandeur',
        ],
        ['Effort', 'Important, nécessite un outil', 'Faible, un tableur suffit'],
        ['Usage', 'Budget définitif, suivi fin', 'Cadrage initial, simulations rapides'],
      ],
    )}
    <p>En pratique, on combine les deux : la Direction fixe un cadrage global (« + 3 % maximum »), puis les services construisent le détail, et l'on vérifie que le total respecte le cadrage.</p>

    <h3>Un exemple salarié par salarié</h3>
    <p>Hypothèses : augmentation générale de 2 % au 1<sup>er</sup> avril pour les présents ; C part le 30 juin sans être remplacé ; D est recruté le 1<sup>er</sup> septembre à 3 000 € par mois ; taux de charges patronales de 45 %.</p>
    ${H.tbl(
      ['Salarié', 'Salaire mensuel au départ', 'Calcul', '#Brut annuel (€)'],
      [
        ['A', '3 000 €', '3 × 3 000 + 9 × 3 060', '36 540'],
        ['B', '4 000 €', '3 × 4 000 + 9 × 4 080', '48 720'],
        ['C', '2 500 €', '3 × 2 500 + 3 × 2 550 (départ fin juin)', '15 150'],
        ['D', '—', '4 × 3 000 (septembre à décembre)', '12 000'],
        ['__total__', 'Masse brute', '', '', '112 410'],
        ['__total__', 'Masse chargée', '', '× 1,45', '162 994,50'],
      ],
    )}
    ${H.callout('tip', 'Les économies de calendrier', "Un recrutement budgété au 1<sup>er</sup> mars mais réalisé au 1<sup>er</sup> juin « économise » 3 mois de coût. Ces <strong>vacances de poste</strong> expliquent souvent qu'un service soit sous son budget en cours d'année… et le rattrape quand les postes sont pourvus.")}

    <h3>Réel, budget, atterrissage</h3>
    <div class="cards">
      <div><b>Budget</b>La prévision validée en fin d'année N-1, mois par mois. Elle ne change plus.</div>
      <div><b>Réel</b>Ce qui a été effectivement payé (ou rattaché) chaque mois, issu de la paie.</div>
      <div><b>Atterrissage (estimé)</b>Le réel des mois écoulés + une prévision des mois restants : « où allons-nous finir l'année ? ».</div>
      <div><b>Reforecast</b>Une nouvelle prévision complète en cours d'année, quand les hypothèses ont trop changé.</div>
    </div>

    <h3>Analyser un écart : volume et prix</h3>
    <p>Un écart entre réel et budget vient soit du <strong>nombre</strong> de personnes (volume), soit de leur <strong>coût moyen</strong> (prix) :</p>
    ${H.code(
      'text',
      `
      Réel   = ETP réel   × coût moyen réel
      Budget = ETP budget × coût moyen budget

      Écart total   = Réel − Budget
      Effet volume  = (ETP réel − ETP budget) × coût moyen budget
      Effet prix    = (coût moyen réel − coût moyen budget) × ETP réel
      (Effet volume + Effet prix = Écart total)
    `,
    )}
    ${H.tbl(
      ['', '#ETP', '#Coût moyen mensuel', '#Masse mensuelle'],
      [
        ['Budget', '100', '4 000 €', '400 000 €'],
        ['Réel', '104', '3 950 €', '410 800 €'],
        ['__total__', 'Écart', '+ 4', '− 50 €', '+ 10 800 €'],
      ],
      'Effet volume : 4 × 4 000 = + 16 000 €. Effet prix : − 50 × 104 = − 5 200 €. Total : + 10 800 €.',
    )}
    <p>Lecture : le service a 4 ETP de plus que prévu (+ 16 000 €), mais ses salariés coûtent en moyenne moins cher que prévu (− 5 200 €), par exemple parce que les recrutements se sont faits sur des profils plus juniors. Un même écart total peut cacher des situations très différentes.</p>
    ${H.code(
      'sql',
      `
      -- Écart réel / budget par service pour un mois, décomposé en volume et prix
      SELECT o.service,
             r.etp - b.etp                                   AS ecart_etp,
             (r.etp - b.etp) * (b.masse / b.etp)             AS effet_volume,
             (r.masse / r.etp - b.masse / b.etp) * r.etp     AS effet_prix,
             r.masse - b.masse                               AS ecart_total
      FROM   reel_mensuel   r
      JOIN   budget_mensuel b ON b.service_key = r.service_key AND b.mois_key = r.mois_key
      JOIN   dim_organisation o ON o.service_key = r.service_key
      WHERE  r.mois_key = 202603;
    `,
    )}
  `,
  keypoints: [
    'Budget = base de départ (photographie) + hypothèses globales + mouvements prévus, calculé mois par mois.',
    'On combine cadrage global (top-down) et calcul individuel (bottom-up).',
    'Atterrissage = réel des mois passés + prévision des mois restants.',
    'Écart réel / budget = effet volume (ETP) + effet prix (coût moyen).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Un recrutement budgété au 1<sup>er</sup> mars arrive finalement le 1<sup>er</sup> juin. Quel est l'effet sur la masse salariale de l'année ?",
      options: [
        'Aucun : le poste est budgété',
        "Une économie d'environ 3 mois de coût du poste",
        'Un dépassement de 3 mois de coût du poste',
        'Une économie de 9 mois de coût du poste',
      ],
      answer: 1,
      explain:
        'Le poste coûte 7 mois (juin à décembre) au lieu des 10 budgétés (mars à décembre) : économie de <strong>3 mois</strong>, dite économie de calendrier ou de vacance de poste.',
    },
    {
      type: 'qcm',
      q: "Fin septembre, qu'appelle-t-on l'<strong>atterrissage</strong> de l'année ?",
      options: [
        "Le budget de l'année suivante",
        "Le réel de janvier à septembre + la prévision d'octobre à décembre",
        'Le réel de septembre multiplié par 12',
        "Le budget initial de l'année",
      ],
      answer: 1,
      explain:
        "L'atterrissage (ou estimé) combine le <strong>réel connu</strong> et une <strong>prévision</strong> pour les mois restants. Multiplier un mois par 12 ignorerait les primes annuelles, les embauches et départs à venir.",
    },
    {
      type: 'qcm',
      q: "Budget : 50 ETP à 4 000 € par mois. Réel : 48 ETP à 4 200 €. Quel est l'effet volume ?",
      options: ['− 8 000 €', '− 8 400 €', '+ 9 600 €', '+ 1 600 €'],
      answer: 0,
      explain:
        'Effet volume = (48 − 50) × 4 000 = <strong>− 8 000 €</strong>. Effet prix = (4 200 − 4 000) × 48 = + 9 600 €. Écart total = 201 600 − 200 000 = + 1 600 €.',
    },
    {
      type: 'open',
      q: "Calculez la masse salariale brute et chargée de l'année pour : E à 2 800 € par mois et F à 3 500 € par mois, présents toute l'année ; augmentation générale de 1,5 % au 1<sup>er</sup> mai ; F part le 31 octobre et est remplacé le 1<sup>er</sup> décembre par G à 3 300 € par mois ; charges patronales 44 %.",
      hint: "Janvier-avril au salaire initial, mai-décembre augmenté. G arrive après l'augmentation.",
      answer: `<ul>
        <li><strong>E</strong> : 4 × 2 800 + 8 × 2 842 = 11 200 + 22 736 = <strong>33 936 €</strong></li>
        <li><strong>F</strong> : 4 × 3 500 + 6 × 3 552,50 (mai à octobre) = 14 000 + 21 315 = <strong>35 315 €</strong></li>
        <li><strong>G</strong> : 1 × 3 300 (décembre) = <strong>3 300 €</strong></li>
        <li><strong>Masse brute</strong> = 33 936 + 35 315 + 3 300 = <strong>72 551 €</strong></li>
        <li><strong>Masse chargée</strong> = 72 551 × 1,44 = <strong>104 473,44 €</strong></li>
      </ul>
      <p>Le mois de novembre sans titulaire est une économie de vacance de poste. Le remplaçant G est moins payé que F (3 300 contre 3 552,50) : c'est un effet de noria.</p>`,
      criteria: [
        'E = 33 936 € (2 842 € après augmentation)',
        'F = 35 315 € (départ fin octobre)',
        'G = 3 300 € (décembre seulement)',
        'Masse brute 72 551 € et chargée ≈ 104 473 €',
      ],
    },
    {
      type: 'open',
      q: "Un directeur s'étonne : « Mon effectif est en dessous du budget, et pourtant ma masse salariale le dépasse. » Expliquez-lui en quelques lignes, et dites quelles analyses vous allez lui présenter.",
      hint: "Volume et prix ; qu'est-ce qui peut rendre le coût moyen plus élevé que prévu ?",
      answer: `<p>« Votre masse salariale dépend du <strong>nombre</strong> de personnes et de leur <strong>coût moyen</strong>. Vous avez moins d'ETP que prévu (effet volume favorable), mais un coût moyen plus élevé (effet prix défavorable) qui l'emporte. »</p>
      <p>Causes possibles de l'effet prix : recrutements sur des profils plus seniors ou plus payés que budgété ; primes exceptionnelles ou heures supplémentaires pour compenser les postes vacants ; rappels de salaire ; changement de structure (départs de juniors, maintien des cadres) ; intérim ou CDD de remplacement plus coûteux.</p>
      <p>Analyses à présenter : décomposition volume / prix par mois, comparaison des salaires d'embauche au budget, masse par rubrique (base, primes, heures sup.) réel contre budget, et atterrissage de fin d'année.</p>`,
      criteria: [
        'Distingue effet volume et effet prix',
        "Au moins trois causes plausibles d'un coût moyen plus élevé",
        'Propose des analyses concrètes (par rubrique, embauches)',
        'Langage accessible à un non-spécialiste',
      ],
    },
  ],
};
