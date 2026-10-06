import { H } from '../helpers.js';

export default {
  id: 'rh-7',
  short: 'Absentéisme',
  title: 'Absentéisme : mesurer, comprendre, agir',
  level: 'Débutant → Intermédiaire',
  duration: '35 min',
  intro:
    "L'absentéisme est un indicateur de santé de l'organisation autant qu'un coût. Bien le mesurer suppose de définir ce qu'on compte, de distinguer fréquence et durée, et de manier les chiffres avec prudence.",
  objectives: [
    'Définir le périmètre des absences prises en compte',
    "Calculer un taux d'absentéisme, une fréquence, une durée moyenne",
    "Utiliser l'indice de Bradford avec discernement",
    'Imputer correctement une absence à cheval sur deux mois',
  ],
  content: `
    <h3>Que compte-t-on ?</h3>
    <p>L'absentéisme mesure les absences <strong>non planifiées</strong> par l'organisation du travail. Le périmètre doit être écrit noir sur blanc :</p>
    ${H.tbl(
      ['Généralement inclus', 'Généralement exclu'],
      [
        ['Maladie (y compris de courte durée)', 'Congés payés, RTT, jours de repos'],
        [
          'Accidents du travail et de trajet, maladies professionnelles (AT/MP)',
          'Congés maternité, paternité, adoption (suivis à part)',
        ],
        ['Absences injustifiées ou non rémunérées', 'Formation, délégation des représentants du personnel'],
        [
          "Absences pour enfant malade (selon les choix de l'entreprise)",
          'Congés pour événements familiaux prévus par la loi ou la convention',
        ],
      ],
    )}

    <h3>Les indicateurs</h3>
    ${H.code(
      'text',
      `
      Taux d'absentéisme = heures (ou jours) d'absence ÷ heures (ou jours) théoriques travaillés × 100
      Fréquence          = nombre d'arrêts ÷ effectif moyen
      Durée moyenne      = jours d'absence ÷ nombre d'arrêts
      Taux de salariés absents = salariés absents au moins une fois ÷ effectif
    `,
    )}
    <p>Les heures théoriques tiennent compte du temps de travail de chacun : un salarié à 80 % a 80 % des heures théoriques d'un temps plein. Exemple : un service dont les heures théoriques du mois sont de 12 000 et qui compte 540 heures d'absence a un taux de <strong>4,5 %</strong>.</p>
    ${H.callout('warn', 'Le piège des petits effectifs', "Dans une équipe de 8 personnes, un seul arrêt long fait passer le taux de 2 % à 12 %. Avant de conclure, regardez le <strong>nombre d'arrêts</strong> et la <strong>durée</strong>, pas seulement le taux.")}
    <p>On distingue souvent les absences <strong>courtes</strong> (1 à 3 jours), qui signalent plutôt un problème d'ambiance, de charge ou de management, des absences <strong>longues</strong>, plutôt liées à des problèmes de santé. Les deux appellent des actions différentes.</p>

    <h3>L'indice de Bradford</h3>
    <p>L'indice de Bradford pondère la <strong>fréquence</strong> des absences, plus perturbante pour l'organisation que leur durée :</p>
    ${H.code(
      'text',
      `
      B = S² × D     (S = nombre d'absences, D = nombre total de jours d'absence)

      1 absence de 10 jours  : 1² × 10 = 10
      5 absences de 2 jours  : 5² × 10 = 250
    `,
    )}
    ${H.callout('warn', 'À manier avec précaution', "Bradford est un outil de <strong>repérage</strong> collectif, pas un outil de sanction. Une absence pour maladie est un droit : les indicateurs servent à adapter l'organisation et la prévention, jamais à cibler une personne en raison de son état de santé.")}

    <h3>Le coût de l'absentéisme</h3>
    <ul>
      <li><strong>Coûts directs</strong> : maintien de salaire par l'employeur (complément aux indemnités journalières de la sécurité sociale, selon l'ancienneté et la convention collective), remplacements, heures supplémentaires, intérim.</li>
      <li><strong>Coûts indirects</strong> : désorganisation, surcharge des collègues, retards, qualité.</li>
    </ul>
    <p>Les règles d'indemnisation (délais de carence, durée et niveau du maintien de salaire) dépendent de la loi et des conventions collectives et évoluent régulièrement : vérifiez-les sur les sources officielles avant de chiffrer un coût.</p>

    <h3>Une absence à cheval sur deux mois</h3>
    <p>Une absence enregistrée du 28 janvier au 3 février doit être <strong>répartie</strong> : 4 jours en janvier, 3 jours en février (en jours calendaires). On la « découpe » en joignant le calendrier :</p>
    ${H.code(
      'sql',
      `
      -- Jours d'absence par mois et par motif (jours ouvrés uniquement)
      SELECT t.annee, t.mois_num, a.motif,
             COUNT(*) AS jours_absence
      FROM   absences a
      JOIN   dim_temps t
             ON t.date_jour BETWEEN a.date_debut AND a.date_fin
      WHERE  t.est_ouvre = 'O'
      GROUP  BY t.annee, t.mois_num, a.motif
      ORDER  BY t.annee, t.mois_num, a.motif;
    `,
    )}
    <p>En table de faits, on stocke souvent l'absence <strong>au grain jour</strong> (un salarié × un jour d'absence) ou au grain mois (jours d'absence d'un salarié dans un mois) : la répartition est faite une fois pour toutes au chargement.</p>
    ${H.callout('info', "Dans l'application", "La page <b>Absentéisme</b> présente ces indicateurs. Le temps de réponse de ce type de page dépend beaucoup du volume d'absences et de la façon dont le calendrier est joint : c'est exactement ce qu'Insight permet de mesurer.")}
  `,
  keypoints: [
    'Un périmètre écrit : maladie, AT/MP, absences injustifiées ; hors congés payés et congés familiaux.',
    "Taux = heures d'absence ÷ heures théoriques ; à compléter par fréquence et durée moyenne.",
    'Bradford (S² × D) repère les absences fréquentes, mais ne doit jamais servir à cibler une personne.',
    'Une absence à cheval sur deux mois se répartit jour par jour grâce au calendrier.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Heures théoriques du mois : 12 000. Heures d'absence (maladie et AT) : 540. Quel est le taux d'absentéisme ?",
      options: ['0,45 %', '4,5 %', '5,4 %', '22 %'],
      answer: 1,
      explain: '540 ÷ 12 000 × 100 = <strong>4,5 %</strong>.',
    },
    {
      type: 'qcm',
      q: "Un salarié a eu 5 absences de 2 jours dans l'année. Quel est son indice de Bradford ?",
      options: ['10', '50', '250', '1 000'],
      answer: 2,
      explain:
        "S = 5 absences, D = 10 jours : B = 5² × 10 = <strong>250</strong>. Une seule absence de 10 jours donnerait 1² × 10 = 10 : l'indice pèse la fréquence.",
    },
    {
      type: 'qcm',
      q: "Une absence court du 28 janvier au 3 février. Comment l'imputer dans un suivi mensuel ?",
      options: [
        'Tout en janvier, mois du début',
        'Tout en février, mois de la fin',
        'Répartie entre janvier et février selon les jours de chaque mois',
        "Elle n'est pas comptée car elle chevauche deux mois",
      ],
      answer: 2,
      explain:
        'On répartit jour par jour : 4 jours calendaires en janvier (28 au 31) et 3 en février (1er au 3). Une jointure avec la dimension temps fait ce découpage.',
    },
    {
      type: 'open',
      q: "Le taux d'absentéisme d'un service de 15 personnes passe de 3 % à 6 % d'une année sur l'autre. Quelles analyses menez-vous avant de conclure ?",
      hint: 'Pensez effectif, fréquence, durée, motifs, saisonnalité, comparaisons.',
      answer: `<ul>
        <li><strong>Effet petit effectif</strong> : un ou deux arrêts longs suffisent à doubler le taux. Regarder le nombre d'arrêts et de salariés concernés.</li>
        <li><strong>Fréquence et durée</strong> : plus d'arrêts courts (signal d'organisation ou de climat) ou quelques arrêts longs (santé) ?</li>
        <li><strong>Motifs</strong> : maladie, AT/MP (un accident du travail appelle une analyse de sécurité), absences injustifiées.</li>
        <li><strong>Saisonnalité</strong> : épidémie hivernale, période de forte charge.</li>
        <li><strong>Comparaisons</strong> : autres services, moyenne de l'entreprise, années précédentes.</li>
        <li><strong>Contexte</strong> : réorganisation, changement de manager, charge de travail, départs non remplacés.</li>
      </ul>
      <p>Conclusion à présenter de façon collective et anonyme, avec des pistes d'action (prévention, organisation), sans viser de personne.</p>`,
      criteria: [
        "Mentionne l'effet petit effectif",
        'Distingue fréquence et durée',
        'Analyse par motif dont AT/MP',
        'Contexte et comparaisons ; restitution anonyme',
      ],
    },
    {
      type: 'open',
      q: "Tables disponibles : <code>absences(matricule, date_debut, date_fin, motif)</code>, <code>affectations(matricule, service, taux_activite, date_debut, date_fin)</code> et <code>dim_temps(date_jour, annee, mois_num, est_ouvre)</code>. Écrivez une requête qui donne, pour mars 2026 et par service, les jours d'absence, les jours théoriques et le taux d'absentéisme (en jours ouvrés, pondérés par le taux d'activité).",
      hint: "Les jours théoriques se calculent en joignant affectations et calendrier ; les jours d'absence aussi.",
      answer: `${H.code(
        'sql',
        `
        WITH jours AS (
          SELECT a.service, a.matricule, a.taux_activite, t.date_jour
          FROM   affectations a
          JOIN   dim_temps t
                 ON t.date_jour BETWEEN a.date_debut AND a.date_fin
          WHERE  t.annee = 2026 AND t.mois_num = 3
          AND    t.est_ouvre = 'O'
        )
        SELECT j.service,
               SUM(j.taux_activite)                                       AS jours_theoriques,
               SUM(CASE WHEN ab.matricule IS NOT NULL
                        THEN j.taux_activite END)                         AS jours_absence,
               ROUND(100 * SUM(CASE WHEN ab.matricule IS NOT NULL
                                    THEN j.taux_activite END)
                         / SUM(j.taux_activite), 1)                       AS taux_pct
        FROM   jours j
        LEFT JOIN absences ab
               ON ab.matricule = j.matricule
              AND j.date_jour BETWEEN ab.date_debut AND ab.date_fin
              AND ab.motif IN ('MALADIE', 'AT', 'MP', 'INJUSTIFIEE')
        GROUP  BY j.service
        ORDER  BY taux_pct DESC;
      `,
      )}<p>Un salarié présent et absent le même jour est compté une fois au théorique et une fois en absence (pondéré par son taux d'activité). Si deux absences se chevauchent dans la table, il faut d'abord les dédoublonner, sinon le jour serait compté deux fois.</p>`,
      criteria: [
        'Jours théoriques issus de la jointure affectations × calendrier ouvré',
        "Absences rattachées jour par jour (LEFT JOIN sur l'intervalle)",
        'Filtre sur le périmètre de motifs',
        "Taux = absences ÷ théorique, pondéré par le taux d'activité",
      ],
    },
  ],
};
