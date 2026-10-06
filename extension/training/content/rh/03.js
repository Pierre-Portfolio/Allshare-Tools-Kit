import { H } from '../helpers.js';

export default {
  id: 'rh-3',
  short: 'Effectifs & turnover',
  title: 'Mesurer les effectifs : effectif, ETP, mouvements et turnover',
  level: 'Débutant → Intermédiaire',
  duration: '35 min',
  intro:
    "« Combien sommes-nous ? » paraît simple. La réponse dépend de la date, du périmètre et de l'unité. Voici les indicateurs de base du suivi des effectifs, et les pièges qui les accompagnent.",
  objectives: [
    'Calculer un effectif physique, un ETP et un effectif moyen',
    "Établir le bilan des mouvements (entrées, sorties) d'une période",
    'Calculer et interpréter un taux de turnover',
    "Construire pyramides des âges et d'ancienneté, et modéliser un datamart des effectifs",
  ],
  content: `
    <h3>Trois façons de compter</h3>
    ${H.tbl(
      ['Indicateur', 'Définition', 'Exemple'],
      [
        [
          '<b>Effectif physique</b> (inscrits)',
          'Nombre de personnes ayant un contrat actif à une date',
          '212 salariés au 31 mars',
        ],
        ['<b>ETP</b>', "Somme des taux d'activité, au prorata du temps de présence", '196,4 ETP en mars'],
        [
          '<b>Effectif moyen</b>',
          'Moyenne des effectifs sur une période (par exemple les 12 fins de mois)',
          '205,8 salariés en moyenne en 2025',
        ],
      ],
    )}
    <p>L'ETP d'un mois tient compte des arrivées et départs en cours de mois. Une personne à temps plein entrée le 10 mars (31 jours) est présente 22 jours : elle compte pour <strong>22 ÷ 31 ≈ 0,71 ETP</strong> en mars (prorata en jours calendaires ; certaines entreprises utilisent les jours ouvrés, l'essentiel est de s'y tenir).</p>
    ${H.callout('info', "L'effectif légal", "Pour les seuils d'effectif (11, 50 salariés…), le Code de la sécurité sociale retient l'<strong>effectif moyen annuel</strong> : la moyenne des effectifs de chaque mois de l'année civile précédente, avec des règles de prise en compte propres (temps partiels au prorata, certains contrats exclus). Un seuil n'est en général franchi qu'après avoir été atteint plusieurs années civiles consécutives. Ce calcul est à part : ne le confondez pas avec vos indicateurs de pilotage.")}

    <h3>Le bilan des mouvements</h3>
    <p>Sur une période, l'effectif évolue sous l'effet des <strong>entrées</strong> (embauches, mutations entrantes) et des <strong>sorties</strong> (fins de CDD, démissions, ruptures conventionnelles, licenciements, retraites, mutations sortantes). L'égalité de base doit toujours être vérifiée :</p>
    ${H.tbl(
      ['Effectif au 1er janvier', '+ Entrées', '− Sorties', '= Effectif au 31 décembre'],
      [['200', '+ 30', '− 20', '= 210']],
      "Si l'égalité n'est pas respectée, une date d'entrée ou de sortie est mal saisie (ou un contrat a été compté deux fois).",
    )}
    <p>Les sorties s'analysent <strong>par motif</strong> : un taux de démission en hausse n'a pas le même sens qu'une vague de départs en retraite.</p>

    <h3>Le turnover</h3>
    <p>Le <strong>taux de rotation</strong> (turnover) le plus courant fait la moyenne des entrées et des sorties, rapportée à l'effectif de début de période :</p>
    ${H.code(
      'text',
      `
      Turnover = ((entrées + sorties) ÷ 2) ÷ effectif au début de la période × 100
               = ((30 + 20) ÷ 2) ÷ 200 × 100 = 12,5 %
    `,
    )}
    <p>D'autres définitions existent : <strong>taux de départ</strong> (sorties ÷ effectif moyen), <strong>taux de démission</strong> (démissions seules), turnover hors fins de CDD… Aucune n'est « la bonne » : il faut <strong>en choisir une, l'écrire et s'y tenir</strong> pour comparer d'une année à l'autre.</p>
    ${H.callout('warn', 'Piège classique', "Comparer le turnover de deux filiales calculé avec deux définitions différentes. Autre piège : compter un CDD transformé en CDI comme une sortie suivie d'une entrée (notion 2).")}

    <h3>Pyramides des âges et d'ancienneté</h3>
    <p>Une <strong>pyramide des âges</strong> répartit l'effectif par tranche d'âge (moins de 25 ans, 25-34, 35-44…) et par sexe, à une date de référence. Elle aide à anticiper les départs en retraite et les besoins de transmission des compétences. La <strong>pyramide d'ancienneté</strong> fait de même avec l'ancienneté (depuis la date d'entrée, éventuellement reprise d'une société du groupe).</p>
    ${H.code(
      'sql',
      `
      -- Pyramide des âges au 31 décembre 2025 (âge en années révolues)
      SELECT CASE
               WHEN age < 25 THEN '1. Moins de 25 ans'
               WHEN age < 35 THEN '2. 25-34 ans'
               WHEN age < 45 THEN '3. 35-44 ans'
               WHEN age < 55 THEN '4. 45-54 ans'
               ELSE               '5. 55 ans et plus'
             END                                    AS tranche,
             COUNT(CASE WHEN sexe = 'H' THEN 1 END) AS hommes,
             COUNT(CASE WHEN sexe = 'F' THEN 1 END) AS femmes
      FROM  (SELECT s.sexe,
                    TRUNC(MONTHS_BETWEEN(DATE '2025-12-31', s.date_naissance) / 12) AS age
             FROM   salaries s
             JOIN   contrats c ON c.matricule = s.matricule
             WHERE  DATE '2025-12-31' BETWEEN c.date_debut AND NVL(c.date_fin, DATE '9999-12-31'))
      GROUP  BY CASE
               WHEN age < 25 THEN '1. Moins de 25 ans'
               WHEN age < 35 THEN '2. 25-34 ans'
               WHEN age < 45 THEN '3. 35-44 ans'
               WHEN age < 55 THEN '4. 45-54 ans'
               ELSE               '5. 55 ans et plus'
             END
      ORDER  BY tranche;
    `,
    )}

    <h3>Modéliser les effectifs : stock et flux</h3>
    <p>Deux tables de faits complémentaires, exactement comme en notion 3 du module OLAP :</p>
    ${H.tbl(
      ['Table de faits', 'Type', 'Grain', 'Mesures'],
      [
        [
          '<code>fait_effectif</code>',
          'Snapshot périodique',
          'Un salarié présent × un mois',
          'Présence (1), ETP, âge, ancienneté, salaire de base',
        ],
        [
          '<code>fait_mouvement</code>',
          'Transactionnelle',
          'Une entrée ou une sortie',
          'Nombre (1), avec le motif et le type de mouvement',
        ],
      ],
    )}
    ${H.callout('tip', 'Additivité', "L'effectif de fin de mois est <strong>semi-additif</strong> : on l'additionne entre services, jamais entre mois (12 fins de mois à 200 salariés ne font pas 2 400 salariés). Sur l'année, on prend la fin de période ou la moyenne. Les mouvements, eux, sont additifs : les entrées de l'année sont la somme des entrées des mois.")}
    ${H.code(
      'sql',
      `
      -- Effectif physique et ETP à chaque fin de mois 2025
      SELECT t.mois_libelle,
             COUNT(DISTINCT a.matricule) AS effectif_physique,
             SUM(a.taux_activite)        AS etp_fin_de_mois
      FROM   dim_mois t
      JOIN   affectations a
             ON t.fin_mois BETWEEN a.date_debut AND a.date_fin
      WHERE  t.annee = 2025
      GROUP  BY t.mois_num, t.mois_libelle
      ORDER  BY t.mois_num;
    `,
    )}
    ${H.callout('info', "Dans l'application", "La rubrique <b>RH Suivi Effectifs</b> regroupe ces analyses : effectif par catégorie, suivi des effectifs, pyramides des âges et d'ancienneté, analyse des salaires et turnover.")}
  `,
  keypoints: [
    'Effectif physique = personnes à une date ; ETP = quantité de travail ; effectif moyen = moyenne sur la période.',
    'Bilan des mouvements : effectif début + entrées − sorties = effectif fin.',
    'Turnover courant = ((entrées + sorties) ÷ 2) ÷ effectif de début ; une seule définition, écrite, et stable.',
    'Stock (snapshot mensuel, semi-additif) et flux (mouvements, additifs) : deux tables de faits complémentaires.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Effectif au 1<sup>er</sup> janvier : 200. Entrées de l'année : 30. Sorties : 20. Quel est le turnover (formule courante) ?",
      options: ['10 %', '12,5 %', '15 %', '25 %'],
      answer: 1,
      explain:
        "((30 + 20) ÷ 2) ÷ 200 = 25 ÷ 200 = <strong>12,5 %</strong>. L'effectif au 31 décembre est de 200 + 30 − 20 = 210.",
    },
    {
      type: 'qcm',
      q: "L'effectif de fin de mois est une mesure :",
      options: [
        'Additive : on peut faire la somme des 12 mois',
        'Semi-additive : on la somme entre services, pas entre mois',
        'Non additive : elle ne se somme jamais',
        "Ce n'est pas une mesure",
      ],
      answer: 1,
      explain:
        "Comme un stock, l'effectif se somme entre services ou établissements à une même date, mais pas dans le temps. Sur une année on prend la valeur de fin de période ou la moyenne.",
    },
    {
      type: 'qcm',
      q: "Une salariée à temps plein entre le 10 mars (mois de 31 jours). Combien d'ETP représente-t-elle pour mars, au prorata des jours calendaires ?",
      options: ['1', 'Environ 0,71', 'Environ 0,68', '0,5'],
      answer: 1,
      explain:
        "Du 10 au 31 mars inclus, elle est présente 22 jours : 22 ÷ 31 ≈ <strong>0,71 ETP</strong>. Au 31 mars, elle compte en revanche pour 1 dans l'effectif physique.",
    },
    {
      type: 'open',
      q: "Effectif au 1<sup>er</sup> janvier : 120. Pendant l'année : 18 entrées ; 12 sorties dont 5 fins de CDD, 4 démissions, 2 ruptures conventionnelles et 1 retraite. Calculez l'effectif au 31 décembre, le turnover et le taux de démission, puis commentez.",
      hint: 'Pour le taux de démission, précisez le dénominateur choisi.',
      answer: `<ul>
        <li><strong>Effectif au 31 décembre</strong> = 120 + 18 − 12 = <strong>126</strong>.</li>
        <li><strong>Turnover</strong> = ((18 + 12) ÷ 2) ÷ 120 = 15 ÷ 120 = <strong>12,5 %</strong>.</li>
        <li><strong>Taux de démission</strong> = 4 ÷ effectif moyen. Avec la moyenne début / fin : 4 ÷ 123 ≈ <strong>3,3 %</strong> (ou 4 ÷ 120 ≈ 3,3 % sur l'effectif de début).</li>
      </ul>
      <p>Commentaire : l'effectif progresse de 5 %. Près de la moitié des sorties (5 sur 12) sont des fins de CDD, donc des départs prévus ; hors fins de CDD, il reste 7 départs « subis » ou négociés. Le taux de démission est modéré, mais il faut le suivre dans le temps et par service.</p>`,
      criteria: [
        'Effectif final = 126',
        'Turnover = 12,5 % avec la formule',
        'Taux de démission avec dénominateur explicite',
        'Commentaire sur la part des fins de CDD',
      ],
    },
    {
      type: 'open',
      q: "Proposez un modèle dimensionnel pour suivre les effectifs mois par mois (présents, ETP, entrées, sorties), par service, par catégorie et par tranche d'âge.",
      hint: 'Un snapshot pour le stock, une table transactionnelle pour les flux. Quelles dimensions sont partagées ?',
      answer: `<p><strong>Faits</strong> :</p>
      <ul>
        <li><code>fait_effectif_mensuel</code> (snapshot périodique), grain : un salarié présent × un mois. Mesures : <code>present = 1</code>, <code>etp</code>, <code>age</code>, <code>anciennete</code>, <code>salaire_base</code>.</li>
        <li><code>fait_mouvement</code> (transactionnelle), grain : une entrée ou une sortie. Mesure : <code>nb = 1</code>.</li>
      </ul>
      <p><strong>Dimensions</strong> (conformes, partagées par les deux faits) :</p>
      <ul>
        <li><code>dim_temps</code> au niveau mois (mois, trimestre, année) ;</li>
        <li><code>dim_salarie</code> en SCD 2 (sexe, date de naissance, catégorie, statut…) ;</li>
        <li><code>dim_organisation</code> (service, établissement, hiérarchie parent-enfant) ;</li>
        <li><code>dim_contrat</code> (type de contrat, temps plein / partiel) ;</li>
        <li><code>dim_motif</code> pour les mouvements (démission, fin de CDD, retraite…) et le sens (entrée / sortie).</li>
      </ul>
      <p>La tranche d'âge se calcule à partir de l'âge stocké dans le snapshot (attribut dérivé ou mini-dimension). L'effectif est semi-additif (pas de somme sur les mois), les mouvements sont additifs.</p>`,
      criteria: [
        'Snapshot mensuel pour le stock avec grain explicite',
        'Table de mouvements pour les flux',
        'Dimensions temps, salarié (historisée), organisation, contrat, motif',
        "Remarque sur l'additivité (effectif semi-additif)",
      ],
    },
  ],
};
