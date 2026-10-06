import { H } from '../helpers.js';

export default {
  id: 'rh-5',
  short: 'Masse salariale & GVT',
  title: 'La masse salariale et ses effets : masse, niveau, report, GVT',
  level: 'Intermédiaire',
  duration: '45 min',
  intro:
    "La masse salariale est souvent le premier poste de dépenses d'une entreprise de services. Pour l'expliquer, le contrôle de gestion sociale la décompose en effets : volume, augmentations, ancienneté, structure.",
  objectives: [
    'Définir la masse salariale brute, chargée et comptable',
    "Calculer les effets niveau, masse et report d'une augmentation",
    "Expliquer le GVT, l'effet de noria et l'effet de structure",
    'Décomposer une évolution de masse salariale en effet effectif et effet salaire moyen',
  ],
  content: `
    <h3>Quelle masse salariale ?</h3>
    ${H.tbl(
      ['Notion', 'Contenu', 'Usage'],
      [
        [
          '<b>Masse salariale brute</b>',
          'Somme des salaires bruts versés (base, primes, heures sup., avantages)',
          'Suivi RH, comparaisons de salaires',
        ],
        [
          '<b>Masse salariale chargée</b>',
          'Brut + cotisations patronales (après allègements)',
          'Budget, coût réel du personnel',
        ],
        [
          '<b>Charges de personnel (comptables)</b>',
          'Comptes 641 (rémunérations) et 645 (charges sociales) du plan comptable, provisions comprises (congés payés, primes)',
          'Rapprochement avec la comptabilité et la finance',
        ],
      ],
    )}
    <p>On la découpe aussi par <strong>nature</strong> : fixe (salaire de base), variable (primes, heures sup.), périphérique (avantages), charges. Et par <strong>axe</strong> : organisation, catégorie, établissement, centre de coûts.</p>
    ${H.callout('warn', 'Toujours dire de quoi on parle', "Un « écart de 2 % » entre la DRH et la Finance vient souvent d'un périmètre différent : brut contre chargé, mois de paie contre mois de rattachement, provisions comprises ou non. Écrivez la définition en tête de chaque tableau.")}

    <h3>Effet niveau, effet masse, effet report</h3>
    <p>Prenons 100 salariés payés au total 100 (k€) par mois, et une <strong>augmentation générale de 2 % au 1<sup>er</sup> avril</strong>, sans autre changement :</p>
    ${H.tbl(
      ['', '#Janv.', '#Fév.', '#Mars', '#Avril', '#…', '#Déc.', '#Total année'],
      [
        ['Année N-1', '100', '100', '100', '100', '…', '100', '1 200'],
        ['Année N', '100', '100', '100', '102', '…', '102', '1 218'],
        ['Année N+1 (sans nouvelle mesure)', '102', '102', '102', '102', '…', '102', '1 224'],
      ],
    )}
    <div class="cards">
      <div><b>Effet niveau : + 2 %</b>Écart entre la fin d'année N et la fin d'année N-1 (102 contre 100 en décembre). C'est l'augmentation « en régime de croisière ».</div>
      <div><b>Effet masse : + 1,5 %</b>Écart entre les totaux annuels : 1 218 ÷ 1 200. L'augmentation n'a joué que 9 mois sur 12 (2 % × 9 ÷ 12).</div>
      <div><b>Effet report : + 0,49 %</b>Ce que l'année N « lègue » à N+1 sans aucune nouvelle mesure : 1 224 ÷ 1 218, soit 1,02 ÷ 1,015.</div>
    </div>
    <p>Retenez la relation : <strong>(1 + effet niveau) = (1 + effet masse de N) × (1 + effet report sur N+1)</strong>, lorsque le niveau de départ est stable. Plus une augmentation est tardive dans l'année, plus son effet masse est faible… et plus son report sur l'année suivante est fort.</p>
    ${H.callout('tip', 'Bon réflexe', "Dans un budget N+1, commencez toujours par chiffrer le <strong>report</strong> des mesures de N : c'est une hausse déjà engagée, avant toute nouvelle décision.")}

    <h3>Le GVT et ses cousins</h3>
    <p>À effectif constant et sans augmentation générale, le salaire moyen bouge quand même. Le <strong>GVT</strong> (glissement vieillesse technicité) mesure cette dérive :</p>
    <ul>
      <li><strong>Vieillesse</strong> : avancement à l'ancienneté (primes, échelons) ;</li>
      <li><strong>Technicité</strong> : promotions, changements de qualification, augmentations individuelles au mérite.</li>
    </ul>
    <p>Ce <em>GVT positif</em> est en partie compensé par l'<strong>effet de noria</strong> : des salariés anciens et mieux payés partent (retraite, démission) et sont remplacés par des entrants moins payés. Le salaire moyen baisse d'autant. Le <strong>GVT solde</strong> = GVT positif + effet de noria (négatif).</p>
    <p>Enfin, l'<strong>effet de structure</strong> traduit un changement de composition : si la part des cadres augmente, le salaire moyen de l'entreprise monte, même si aucun salaire individuel n'a bougé.</p>

    <h3>Décomposer une évolution</h3>
    <p>La masse salariale est le produit d'un <strong>volume</strong> et d'un <strong>prix</strong> :</p>
    ${H.code(
      'text',
      `
      Masse salariale = ETP moyen × salaire moyen par ETP

      Évolution :  (1 + évolution MS) = (1 + effet effectif) × (1 + effet salaire moyen)

      Effet salaire moyen ≈ mesures générales (effet masse de N + report de N-1)
                          + mesures individuelles et promotions (GVT positif)
                          + effet de noria + effet de structure
    `,
    )}
    ${H.tbl(
      ['', '#N-1', '#N', '#Évolution'],
      [
        ['ETP moyen', '200', '204', '+ 2,0 %'],
        ['Salaire moyen annuel par ETP (k€)', '50,0', '52,5', '+ 5,0 %'],
        ['__total__', 'Masse salariale (k€)', '10 000', '10 710', '+ 7,1 %'],
      ],
      "1,02 × 1,05 = 1,071 : les effets se multiplient, ils ne s'additionnent qu'en première approximation.",
    )}
    <p>Le calcul se fait facilement en SQL avec une fonction analytique (module OLAP, notion 8) :</p>
    ${H.code(
      'sql',
      `
      -- Masse salariale brute annuelle, ETP moyen et évolutions N / N-1
      WITH annuel AS (
        SELECT t.annee,
               SUM(f.montant_brut)          AS ms,
               SUM(f.etp) / 12              AS etp_moyen      -- grain : salarié × mois
        FROM   fait_paie_mensuelle f
        JOIN   dim_temps t ON t.mois_key = f.mois_key
        GROUP  BY t.annee
      )
      SELECT annee, ms, etp_moyen,
             ms / etp_moyen                                                 AS salaire_moyen,
             ROUND(100 * (ms / LAG(ms) OVER (ORDER BY annee) - 1), 1)     AS evol_ms_pct,
             ROUND(100 * (etp_moyen / LAG(etp_moyen) OVER (ORDER BY annee) - 1), 1) AS effet_effectif_pct
      FROM   annuel
      ORDER  BY annee;
    `,
    )}
    ${H.callout('info', "Dans l'application", 'La rubrique <b>Masse Salariale</b> propose ces vues : masse salariale croisée, par organisation, écarts entre périodes, suivi réel / budget, analyse des écarts, livre de paie et diffusion au contrôle de gestion.')}
  `,
  keypoints: [
    'Masse salariale brute, chargée ou comptable : toujours préciser le périmètre.',
    "Effet niveau = hausse de fin d'année ; effet masse = hausse de la moyenne annuelle ; effet report = ce qui reste à jouer l'année suivante.",
    "GVT = ancienneté + promotions ; effet de noria = remplacement d'anciens par des entrants moins payés.",
    'Évolution de la masse = effet effectif × effet salaire moyen (mesures générales, GVT, noria, structure).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Une augmentation générale de 3 % s'applique au 1<sup>er</sup> juillet, sans autre mesure. Quel est son effet masse sur l'année ?",
      options: ['3 %', '1,5 %', '0,75 %', '2,25 %'],
      answer: 1,
      explain:
        "Elle joue 6 mois sur 12 : (6 × 100 + 6 × 103) ÷ 1 200 = 1,015, soit <strong>+ 1,5 %</strong>. L'effet niveau, lui, est de 3 %.",
    },
    {
      type: 'qcm',
      q: "Même cas (3 % au 1<sup>er</sup> juillet). Quel est l'effet report sur l'année suivante ?",
      options: ['0 %', 'Environ 1,48 %', '1,5 % exactement', '3 %'],
      answer: 1,
      explain:
        "Report = 1,03 ÷ 1,015 − 1 ≈ <strong>1,48 %</strong>. L'année suivante, la masse sera à 103 tous les mois (1 236) contre 1 218 cette année : + 1,48 % sans aucune nouvelle décision.",
    },
    {
      type: 'qcm',
      q: "Qu'appelle-t-on l'<strong>effet de noria</strong> ?",
      options: [
        'La hausse du salaire moyen due aux promotions',
        'La baisse du salaire moyen quand des salariés anciens et bien payés sont remplacés par des entrants moins payés',
        "L'augmentation de la masse liée aux heures supplémentaires",
        'Le décalage entre mois de paie et mois de rattachement',
      ],
      answer: 1,
      explain:
        'La noria (la roue à godets) renouvelle la population : des salaires élevés sortent, des salaires plus bas entrent. Elle compense en partie le GVT positif.',
    },
    {
      type: 'open',
      q: "Masse salariale N-1 : 10 000 k€ pour 200 ETP moyens. Masse N : 10 710 k€ pour 204 ETP moyens. En N, l'augmentation générale a un effet masse de 1,5 % ; le report des mesures de N-1 vaut 0,5 % ; le GVT positif est estimé à 2 %. Décomposez l'évolution et déduisez l'effet résiduel (noria + structure).",
      hint: "Calculez d'abord l'effet effectif et l'effet salaire moyen, puis divisez l'effet salaire moyen par les effets connus.",
      answer: `<ul>
        <li>Évolution de la masse : 10 710 ÷ 10 000 = <strong>+ 7,1 %</strong>.</li>
        <li>Effet effectif : 204 ÷ 200 = <strong>+ 2,0 %</strong>.</li>
        <li>Salaire moyen : 50,0 k€ → 52,5 k€, soit <strong>+ 5,0 %</strong> (et 1,02 × 1,05 = 1,071).</li>
        <li>Effets connus : 1,015 × 1,005 × 1,02 ≈ 1,0405.</li>
        <li>Effet résiduel : 1,05 ÷ 1,0405 ≈ <strong>1,009, soit + 0,9 %</strong>.</li>
      </ul>
      <p>Un résiduel positif signifie que la noria (négative) est plus que compensée par un effet de structure (par exemple, des recrutements de profils plus qualifiés que les départs). C'est un point à investiguer avec les entrées et sorties par catégorie.</p>`,
      criteria: [
        'Évolution totale + 7,1 % ; effet effectif + 2 % ; effet salaire moyen + 5 %',
        'Combinaison multiplicative des effets connus',
        'Résiduel ≈ + 0,9 %',
        'Interprétation : noria compensée par la structure',
      ],
    },
    {
      type: 'open',
      q: "Deux augmentations générales : 1,5 % au 1<sup>er</sup> janvier et 1 % au 1<sup>er</sup> juillet (base 100 par mois avant mesures). Calculez l'effet niveau, l'effet masse et l'effet report sur l'année suivante.",
      hint: 'Calculez le salaire mensuel de chaque semestre.',
      answer: `<ul>
        <li>Janvier à juin : 100 × 1,015 = 101,5 ; juillet à décembre : 101,5 × 1,01 = 102,515.</li>
        <li><strong>Effet niveau</strong> = 102,515 ÷ 100 − 1 = <strong>+ 2,515 %</strong> (et non 2,5 % : les hausses se composent).</li>
        <li><strong>Effet masse</strong> = (6 × 101,5 + 6 × 102,515) ÷ 1 200 − 1 = 1 224,09 ÷ 1 200 − 1 ≈ <strong>+ 2,01 %</strong>.</li>
        <li><strong>Effet report</strong> sur N+1 = 102,515 × 12 ÷ 1 224,09 − 1 ≈ <strong>+ 0,50 %</strong>.</li>
      </ul>
      <p>Contrôle : 1,0201 × 1,0050 ≈ 1,0252, cohérent avec l'effet niveau (aux arrondis près).</p>`,
      criteria: [
        'Salaires mensuels par semestre corrects',
        'Effet niveau ≈ 2,515 % (composition des hausses)',
        'Effet masse ≈ 2,01 %',
        'Effet report ≈ 0,50 % et contrôle de cohérence',
      ],
    },
  ],
};
