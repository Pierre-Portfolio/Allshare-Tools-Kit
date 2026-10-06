import { H } from '../helpers.js';

export default {
  id: 'rh-2',
  short: 'Contrats & temps de travail',
  title: 'Contrats, temps de travail et classifications',
  level: 'Débutant',
  duration: '30 min',
  intro:
    'Qui compte comme salarié, à quelle hauteur, et dans quelle catégorie ? Ces règles déterminent tous les indicateurs : effectifs, ETP, salaires moyens, Index égalité.',
  objectives: [
    "Reconnaître les principaux types de contrats et qui est salarié de l'entreprise",
    "Calculer un taux d'activité et un équivalent temps plein (ETP)",
    'Situer convention collective, classification, statut et catégorie socioprofessionnelle',
    'Comprendre pourquoi organisation et contrats doivent être historisés',
  ],
  content: `
    <h3>Les types de contrats</h3>
    ${H.tbl(
      ['Contrat', 'Principe', 'À savoir pour les indicateurs'],
      [
        [
          '<b>CDI</b>',
          'La forme normale du contrat de travail, sans date de fin',
          "Le cœur de l'effectif « permanent »",
        ],
        [
          '<b>CDD</b>',
          "Contrat à durée déterminée, pour un motif précis et limité (remplacement d'un absent, accroissement temporaire d'activité, saisonnier…)",
          "Une fin de CDD est une <em>sortie</em> ; un CDD transformé en CDI n'est pas un vrai départ",
        ],
        [
          '<b>Apprentissage, professionnalisation</b>',
          'Contrats en alternance associant formation et travail',
          "Salariés de l'entreprise, mais exclus de certains calculs d'effectif légal",
        ],
        [
          '<b>Intérim</b>',
          'Contrat de mission avec une entreprise de travail temporaire',
          "L'intérimaire est salarié de l'agence, pas de l'entreprise utilisatrice : il n'est pas dans la paie",
        ],
        [
          '<b>Stage</b>',
          'Convention de stage (école, entreprise, stagiaire), gratification',
          "Le stagiaire <strong>n'est pas salarié</strong> : pas de contrat de travail",
        ],
      ],
    )}
    ${H.callout('warn', 'Définir le périmètre', "Avant de publier un effectif, écrivez <strong>qui est compté</strong> : CDI seuls ? CDI + CDD ? Avec ou sans alternants ? Avec ou sans salariés en congé longue durée ? Deux chiffres « vrais » peuvent différer de 10 % selon le périmètre. L'effectif servant aux seuils légaux obéit, lui, à des règles précises du Code du travail et du Code de la sécurité sociale.")}

    <h3>Le temps de travail</h3>
    <ul>
      <li><strong>Durée légale</strong> : 35 heures par semaine pour un temps plein, soit <strong>151,67 heures par mois</strong> (35 × 52 ÷ 12).</li>
      <li><strong>Temps partiel</strong> : une durée contractuelle inférieure (par exemple 28 heures par semaine).</li>
      <li><strong>Forfait jours</strong> : pour des cadres autonomes, un nombre de jours travaillés par an (au plus 218 jours pour un forfait complet) au lieu d'un horaire.</li>
    </ul>
    <p>Le <strong>taux d'activité</strong> rapporte la durée contractuelle à la durée d'un temps plein :</p>
    ${H.tbl(
      ['Salarié', 'Durée contractuelle', "#Taux d'activité", '#ETP'],
      [
        ['A', '35 h / semaine', '100 %', '1,0'],
        ['B', '28 h / semaine', '80 %', '0,8'],
        ['C', '17 h 30 / semaine', '50 %', '0,5'],
        ['D', 'Forfait 218 jours', '100 %', '1,0'],
        ['E', 'Forfait réduit 174 jours', '≈ 80 %', '0,8'],
        ['__total__', '5 salariés', '', '', '4,1'],
      ],
      'Cinq personnes (effectif physique), 4,1 équivalents temps plein.',
    )}
    <p>L'<strong>ETP</strong> (équivalent temps plein) mesure la <em>quantité de travail</em>, l'<strong>effectif physique</strong> le <em>nombre de personnes</em>. Les deux sont utiles : on rapporte la masse salariale aux ETP (salaire moyen), mais on compte les personnes pour l'Index égalité ou une pyramide des âges.</p>

    <h3>Convention collective et classification</h3>
    <p>Chaque entreprise applique une <strong>convention collective</strong> de branche, repérée par son <strong>IDCC</strong> (identifiant de convention collective). Elle fixe une <strong>grille de classification</strong> (niveaux, positions, coefficients) et des <strong>salaires minimaux</strong> par niveau, en plus du SMIC.</p>
    <div class="cards">
      <div><b>Statut</b>Cadre ou non-cadre : il a des effets sur certaines cotisations (retraite complémentaire, prévoyance) et sur l'organisation du temps de travail.</div>
      <div><b>Catégorie socioprofessionnelle</b>Ouvriers ; employés ; techniciens et agents de maîtrise ; ingénieurs et cadres. Ce sont les 4 catégories de l'Index égalité (notion 8).</div>
      <div><b>Classification</b>Le niveau ou coefficient de la grille de branche, qui détermine le salaire minimum conventionnel.</div>
      <div><b>Emploi</b>Le métier exercé (comptable, technicien support…), souvent issu d'un référentiel des emplois de l'entreprise.</div>
    </div>

    <h3>L'organisation : une hiérarchie qui bouge</h3>
    <p>Un salarié est rattaché à un <strong>établissement</strong> (repéré par son SIRET), un <strong>service</strong>, un <strong>centre de coûts</strong> (pour la comptabilité analytique) et un <strong>manager</strong>. L'organigramme est une <strong>hiérarchie parent-enfant</strong> de profondeur variable : exactement le cas étudié en notion 6 du module OLAP.</p>
    <p>Or l'organisation change : réorganisations, mutations, changements de manager. Pour que « l'effectif du service Achats en mars 2025 » reste juste en 2027, il faut garder l'historique des affectations, avec des dates de début et de fin :</p>
    ${H.tbl(
      ['matricule', 'service', 'taux_activite', 'date_debut', 'date_fin'],
      [
        ['E1042', 'Achats', '1,0', '2021-09-01', '2025-03-31'],
        ['E1042', 'Achats', '0,8', '2025-04-01', '2025-12-31'],
        ['E1042', 'Logistique', '0,8', '2026-01-01', '9999-12-31'],
      ],
      'Trois périodes pour un même salarié : passage à 80 % en avril 2025, mutation en janvier 2026.',
    )}
    ${H.callout('tip', 'Bon réflexe', "C'est une dimension à évolution lente de type 2 (SCD 2, module OLAP notion 6) : une nouvelle ligne à chaque changement, avec ses dates de validité. Pour connaître la situation d'un salarié à une date, on cherche la ligne dont la période contient cette date.")}
    ${H.code(
      'sql',
      `
      -- Situation de chaque salarié au 31 mars 2026
      SELECT a.matricule, a.service, a.taux_activite
      FROM   affectations a
      WHERE  DATE '2026-03-31' BETWEEN a.date_debut AND a.date_fin;
    `,
    )}
  `,
  keypoints: [
    "Stagiaires et intérimaires ne sont pas salariés de l'entreprise ; un effectif publié doit toujours préciser son périmètre.",
    "Temps plein = 35 h par semaine = 151,67 h par mois ; ETP = somme des taux d'activité.",
    'Convention collective (IDCC), classification, statut et catégorie socioprofessionnelle classent les salariés.',
    "Affectations et temps de travail changent : on les historise avec des dates d'effet (SCD 2).",
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Une salariée travaille 28 heures par semaine dans une entreprise à 35 heures. Combien d'ETP représente-t-elle ?",
      options: ['1', '0,8', '0,7', '0,28'],
      answer: 1,
      explain:
        "28 ÷ 35 = <strong>0,8</strong>. Elle compte pour 1 dans l'effectif physique et pour 0,8 en équivalent temps plein.",
    },
    {
      type: 'qcm',
      q: "Parmi ces personnes, laquelle <strong>n'est pas</strong> salariée de l'entreprise ?",
      options: [
        'Un apprenti',
        'Un salarié en CDD de remplacement',
        'Un stagiaire sous convention de stage',
        'Une salariée à temps partiel',
      ],
      answer: 2,
      explain:
        "Le stagiaire est lié par une <strong>convention de stage</strong>, pas par un contrat de travail : il n'est pas salarié. L'apprenti, lui, a un contrat de travail (même s'il est exclu de certains calculs d'effectif légal).",
    },
    {
      type: 'qcm',
      q: "Comment s'appelle l'identifiant d'une convention collective ?",
      options: ['Le SIRET', "L'IDCC", 'Le code NAF', 'Le NIR'],
      answer: 1,
      explain:
        "L'<strong>IDCC</strong> identifie la convention collective. Le SIRET identifie un établissement, le code NAF (ou APE) l'activité principale, le NIR une personne (numéro de sécurité sociale).",
    },
    {
      type: 'open',
      q: "Au 31 mars, une équipe compte : A à temps plein ; B à 80 % ; C à 21 heures par semaine (entreprise à 35 h) ; D au forfait 218 jours ; E stagiaire. Donnez l'effectif physique et l'ETP de l'équipe, en justifiant.",
      hint: "Le stagiaire n'est pas salarié ; 21 ÷ 35 = ?",
      answer: `<ul>
        <li><strong>Effectif physique : 4</strong> (A, B, C, D). E est stagiaire : il n'a pas de contrat de travail.</li>
        <li><strong>ETP : 1 + 0,8 + 0,6 + 1 = 3,4</strong>. C : 21 ÷ 35 = 0,6. D : un forfait de 218 jours est un forfait complet, donc 1.</li>
      </ul>
      <p>Si l'on veut suivre l'encadrement des stagiaires, on le fait dans un indicateur séparé (nombre de stagiaires présents), jamais dans l'effectif salarié.</p>`,
      criteria: [
        'Effectif physique = 4 (stagiaire exclu)',
        'ETP = 3,4 avec le détail du calcul',
        'Forfait complet compté pour 1',
        'Bonus : propose un indicateur séparé pour les stagiaires',
      ],
    },
    {
      type: 'open',
      q: 'Le 1<sup>er</sup> juin, un salarié en CDD passe en CDI et change de service le même jour. Comment enregistrer ces changements pour que les effectifs historiques et le turnover restent justes ?',
      hint: "Pensez aux contrats successifs, aux dates d'effet et à ce qu'est un « vrai » départ.",
      answer: `<ul>
        <li><strong>Contrats successifs</strong> : le CDD se termine le 31 mai, le CDI commence le 1<sup>er</sup> juin. Le matricule reste le même.</li>
        <li><strong>Affectations historisées</strong> : la ligne « ancien service » est close au 31 mai, une nouvelle ligne « nouveau service » commence le 1<sup>er</sup> juin (SCD 2). L'effectif de mai reste dans l'ancien service, celui de juin dans le nouveau.</li>
        <li><strong>Mouvements</strong> : le passage CDD → CDI n'est ni une sortie ni une entrée dans l'entreprise. On l'enregistre comme une <em>transformation de contrat</em>, sinon le turnover serait gonflé d'un faux départ et d'une fausse embauche. Le changement de service est une <em>mutation interne</em> : sortie du service, entrée dans l'autre, mais pas de l'entreprise.</li>
      </ul>`,
      criteria: [
        'Contrats successifs avec le même matricule',
        'Affectation historisée avec dates (SCD 2)',
        'CDD → CDI traité comme une transformation, pas une sortie + entrée',
        "Mutation interne distinguée d'un départ de l'entreprise",
      ],
    },
  ],
};
