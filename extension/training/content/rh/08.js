import { H } from '../helpers.js';

export default {
  id: 'rh-8',
  short: 'Index égalité & reporting',
  title: 'Égalité professionnelle et reporting social',
  level: 'Intermédiaire',
  duration: '40 min',
  intro:
    "Les entreprises publient chaque année des indicateurs sociaux, dont l'Index de l'égalité professionnelle entre les femmes et les hommes. Leur calcul est très encadré, et leur diffusion doit protéger les données individuelles.",
  objectives: [
    "Connaître les indicateurs de l'Index de l'égalité professionnelle et leur barème",
    "Calculer l'écart de rémunération par groupes, avec le seuil de pertinence",
    'Situer BDESE, bilan social et directive européenne sur la transparence salariale',
    'Diffuser des rapports RH sans exposer de données individuelles',
  ],
  content: `
    <h3>L'Index de l'égalité professionnelle</h3>
    <p>Toute entreprise d'<strong>au moins 50 salariés</strong> calcule chaque année son Index, sur 100 points, à partir d'une période de référence de 12 mois. Elle le <strong>publie au plus tard le 1<sup>er</sup> mars</strong> (sur son site internet), le transmet au ministère du Travail (plateforme Egapro) et le communique au CSE.</p>
    ${H.tbl(
      ['Indicateur', '#≥ 251 salariés', '#50 à 250 salariés'],
      [
        ['1. Écart de rémunération entre femmes et hommes', '40 pts', '40 pts'],
        ["2. Écart de taux d'augmentations individuelles", '20 pts', '35 pts (augmentations, promotions comprises)'],
        ['3. Écart de taux de promotions', '15 pts', '—'],
        ['4. Salariées augmentées à leur retour de congé maternité', '15 pts', '15 pts'],
        ['5. Salariés du sexe sous-représenté parmi les 10 plus hautes rémunérations', '10 pts', '10 pts'],
        ['__total__', 'Total', '100 pts', '100 pts'],
      ],
    )}
    <ul>
      <li><strong>Moins de 75 points</strong> : l'entreprise doit prendre des mesures de correction et atteindre 75 points dans un délai de 3 ans, sous peine de pénalité financière.</li>
      <li><strong>Moins de 85 points</strong> : elle fixe et publie des objectifs de progression pour chaque indicateur où elle n'a pas le maximum.</li>
      <li><strong>Indicateur 4</strong> : 15 points si toutes les salariées revenues de congé maternité ont bénéficié des augmentations intervenues pendant leur congé, 0 sinon.</li>
      <li><strong>Indicateur 5</strong> : 0 ou 1 personne du sexe sous-représenté parmi les 10 plus hautes rémunérations → 0 point ; 2 ou 3 → 5 points ; 4 ou 5 → 10 points.</li>
    </ul>

    <h3>L'écart de rémunération (indicateur 1)</h3>
    <ol>
      <li>On répartit les salariés en <strong>groupes</strong> : 4 catégories socioprofessionnelles (ou les niveaux de la classification, après consultation du CSE) × 4 tranches d'âge (moins de 30 ans, 30-39, 40-49, 50 ans et plus).</li>
      <li>Un groupe n'est retenu que s'il compte <strong>au moins 3 femmes et 3 hommes</strong>. L'indicateur n'est calculable que si les groupes retenus couvrent au moins 40 % de l'effectif.</li>
      <li>Pour chaque groupe : écart = (rémunération moyenne des hommes − celle des femmes) ÷ rémunération moyenne des hommes. Les rémunérations sont ramenées en équivalent temps plein ; certains éléments sont exclus (heures supplémentaires, indemnités de départ, intéressement et participation…).</li>
      <li>On applique un <strong>seuil de pertinence</strong> de 5 % (2 % si l'on utilise la classification) : on retranche 5 points à un écart positif (on les ajoute à un écart négatif), sans dépasser zéro.</li>
      <li>On fait la moyenne des écarts, <strong>pondérée par l'effectif</strong> de chaque groupe, puis on convertit l'écart global en points : 40 points pour un écart nul, 0 point au-delà de 20 %.</li>
    </ol>
    ${H.tbl(
      ['Groupe', '#Rém. moy. H', '#Rém. moy. F', '#Écart', '#Après seuil', '#Effectif'],
      [
        ['Cadres, 30-39 ans', '52 000', '49 400', '5,0 %', '0,0 %', '40'],
        ['Cadres, 40-49 ans', '61 000', '56 120', '8,0 %', '3,0 %', '30'],
        ['Employés, 30-39 ans', '31 000', '31 310', '− 1,0 %', '0,0 %', '30'],
        ['__total__', 'Écart pondéré', '', '', '', '(40 × 0 + 30 × 3 + 30 × 0) ÷ 100 = 0,9 %', '100'],
      ],
      'Un écart global de 0,9 % rapporte 39 points sur 40 au barème réglementaire.',
    )}
    ${H.callout('tip', 'Bon réflexe', "Faites le calcul dans l'outil officiel (Egapro) ou contrôlez-le avec lui : le moindre choix (période, rémunérations retenues, groupes) change le résultat. Gardez la trace de vos paramètres d'une année sur l'autre.")}
    ${H.callout('info', 'Ce qui change', "La directive européenne 2023/970 sur la <strong>transparence des rémunérations</strong> (à transposer au plus tard le 7 juin 2026) renforce ces obligations : information sur la rémunération dès le recrutement, interdiction de demander l'historique de salaire d'un candidat, droit des salariés à connaître les niveaux de rémunération moyens par sexe pour un travail de même valeur, rapport sur l'écart de rémunération pour les entreprises d'au moins 100 salariés, et évaluation conjointe avec les représentants du personnel si un écart d'au moins 5 % n'est pas justifié. Vérifiez les textes français en vigueur : le calcul de l'Index est appelé à évoluer.")}

    <h3>Les autres rapports sociaux</h3>
    ${H.tbl(
      ['Rapport', 'Qui', 'Contenu'],
      [
        [
          '<b>BDESE</b> (base de données économiques, sociales et environnementales)',
          "Entreprises d'au moins 50 salariés",
          'Base mise à disposition du CSE : investissements, emploi, égalité professionnelle, rémunérations, environnement…',
        ],
        [
          '<b>Bilan social</b>',
          "Entreprises d'au moins 300 salariés",
          'Rapport annuel chiffré : emploi, rémunérations, santé et sécurité, conditions de travail, formation, relations professionnelles',
        ],
        ['<b>Index égalité</b>', "Entreprises d'au moins 50 salariés", 'Score sur 100 et indicateurs détaillés'],
      ],
    )}

    <h3>Diffuser sans exposer</h3>
    <p>Les tableaux de pilotage sont diffusés (états programmés, exports, publication aux managers et au CSE). Chaque diffusion doit respecter quelques règles :</p>
    <ul>
      <li><strong>Seuil de diffusion</strong> : ne pas afficher de moyenne de salaire, d'âge ou d'absence sur un groupe de moins de 5 personnes (le chiffre exact varie selon les politiques internes) ; le regrouper avec un groupe voisin ou l'afficher en « n.s. ».</li>
      <li><strong>Habilitations</strong> : chaque destinataire ne reçoit que son périmètre.</li>
      <li><strong>Agrégats plutôt que listes</strong> : une liste nominative n'est diffusée qu'à qui en a besoin pour gérer.</li>
      <li><strong>Traçabilité</strong> : qui a reçu quoi, quand.</li>
    </ul>
    ${H.code(
      'sql',
      `
      -- Salaire moyen par service, masqué sous 5 salariés
      SELECT o.service,
             COUNT(*)                                   AS effectif,
             CASE WHEN COUNT(*) >= 5
                  THEN ROUND(AVG(f.salaire_base_etp))
             END                                        AS salaire_moyen   -- NULL = non significatif
      FROM   fait_effectif_mensuel f
      JOIN   dim_organisation o ON o.service_key = f.service_key
      WHERE  f.mois_key = 202512
      GROUP  BY o.service;
    `,
    )}
    ${H.callout('info', "Dans l'application", "La rubrique <b>Index Egalité HF</b> (barèmes, liste, tableau de bord) calcule l'Index, et <b>Publisher</b> assure la diffusion des états : deux pages où les règles de cette notion s'appliquent directement.")}
  `,
  keypoints: [
    'Index égalité : obligatoire dès 50 salariés, publié au plus tard le 1er mars ; sous 75 points, mesures de correction ; sous 85, objectifs de progression.',
    'Écart de rémunération : groupes CSP × âge (≥ 3 F et 3 H), seuil de pertinence, moyenne pondérée, barème sur 40 points.',
    'BDESE dès 50 salariés, bilan social dès 300 ; la directive 2023/970 renforce la transparence salariale.',
    'Diffusion : seuil minimal de taille de groupe, habilitations, agrégats, traçabilité.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "À partir de quel effectif une entreprise doit-elle calculer et publier son Index de l'égalité professionnelle ?",
      options: ['11 salariés', '50 salariés', '250 salariés', '1 000 salariés'],
      answer: 1,
      explain:
        "L'Index est obligatoire à partir de <strong>50 salariés</strong>. Entre 50 et 250 salariés, il comporte 4 indicateurs au lieu de 5.",
    },
    {
      type: 'qcm',
      q: 'Une entreprise obtient 72 points sur 100. Quelle est la conséquence ?',
      options: [
        "Aucune, l'Index est indicatif",
        'Elle doit seulement publier des objectifs de progression',
        'Elle doit prendre des mesures de correction pour atteindre 75 points en 3 ans, sous peine de pénalité',
        'Elle ne doit pas publier son Index',
      ],
      answer: 2,
      explain:
        'Sous <strong>75 points</strong>, des mesures de correction sont obligatoires (délai de 3 ans, sinon pénalité financière). Étant aussi sous 85 points, elle doit en plus fixer des objectifs de progression.',
    },
    {
      type: 'qcm',
      q: "Parmi les 10 plus hautes rémunérations figurent 3 femmes et 7 hommes. Combien de points rapporte l'indicateur 5 ?",
      options: ['0', '3', '5', '10'],
      answer: 2,
      explain:
        'Le sexe sous-représenté (les femmes) compte 3 personnes : <strong>5 points</strong>. Il faudrait 4 ou 5 personnes pour obtenir 10 points ; 0 ou 1 donnerait 0 point.',
    },
    {
      type: 'open',
      q: "Calculez l'écart de rémunération pondéré (seuil de pertinence de 5 %) pour : Techniciens 30-39 ans, H 38 000 €, F 35 340 €, 50 salariés ; Techniciens 40-49 ans, H 42 000 €, F 41 160 €, 30 salariés ; Cadres 50 ans et plus, H 70 000 €, F 61 600 €, 20 salariés.",
      hint: "Écart = (H − F) ÷ H ; retranchez 5 points aux écarts positifs sans descendre sous zéro ; pondérez par l'effectif.",
      answer: `${H.tbl(
        ['Groupe', '#Écart', '#Après seuil', '#Effectif'],
        [
          ['Techniciens 30-39', '(38 000 − 35 340) ÷ 38 000 = 7,0 %', '2,0 %', '50'],
          ['Techniciens 40-49', '(42 000 − 41 160) ÷ 42 000 = 2,0 %', '0,0 %', '30'],
          ['Cadres 50 et +', '(70 000 − 61 600) ÷ 70 000 = 12,0 %', '7,0 %', '20'],
        ],
      )}<p>Écart pondéré = (50 × 2,0 + 30 × 0 + 20 × 7,0) ÷ 100 = (100 + 140) ÷ 100 = <strong>2,4 %</strong>, en faveur des hommes. L'indicateur rapporte un peu moins que le maximum de 40 points ; l'essentiel de l'écart vient des cadres de 50 ans et plus, où porteront les actions de rattrapage.</p>`,
      criteria: [
        'Trois écarts corrects (7 %, 2 %, 12 %)',
        'Seuil appliqué : 2 %, 0 %, 7 %',
        'Moyenne pondérée = 2,4 %',
        "Identifie le groupe qui porte l'écart",
      ],
    },
    {
      type: 'open',
      q: 'Un état diffusé chaque mois aux managers affiche le salaire moyen par service. Le service Juridique compte 2 personnes. Quels risques, et quelles règles proposez-vous pour cet état ?',
      hint: 'Pensez ré-identification, habilitations, seuil, traçabilité.',
      answer: `<p><strong>Risque</strong> : avec 2 personnes, la moyenne révèle quasiment chaque salaire (chacun connaît le sien, donc celui de son collègue). Diffusée à tous les managers, elle expose des données individuelles à des personnes non habilitées.</p>
      <p><strong>Règles</strong> :</p>
      <ul>
        <li>masquer toute moyenne sur un groupe de moins de 5 personnes (affichage « n.s. ») ou regrouper le Juridique avec un service voisin ;</li>
        <li>ne diffuser à chaque manager que son périmètre ; réserver le détail par service à la DRH et au contrôle de gestion ;</li>
        <li>préférer des agrégats (médiane, fourchettes) aux montants exacts ;</li>
        <li>tracer les diffusions (qui a reçu quel état, quand) et documenter la règle dans l'outil de publication.</li>
      </ul>`,
      criteria: [
        'Identifie le risque de ré-identification',
        'Propose un seuil minimal de taille de groupe',
        'Restreint la diffusion par périmètre',
        'Mentionne la traçabilité ou la documentation des règles',
      ],
    },
  ],
};
