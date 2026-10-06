// Module Métier RH : comprendre les données de l'application de pilotage RH (effectifs, paie,
// masse salariale, budget, absentéisme, égalité professionnelle). 8 notions, examen, mémo, glossaire.
import { H } from '../helpers.js';
import n1 from './01.js';
import n2 from './02.js';
import n3 from './03.js';
import n4 from './04.js';
import n5 from './05.js';
import n6 from './06.js';
import n7 from './07.js';
import n8 from './08.js';

export default {
  id: 'rh',
  label: 'Métier RH',
  title: 'Le métier RH et ses indicateurs',
  tagline: 'Effectifs, paie, masse salariale, budget, absentéisme, Index égalité',
  eyebrow: 'Débutant → Intermédiaire',
  lede: 'Comprendre les données que manipule une application de pilotage RH : qui est compté, comment se forment la paie et la masse salariale, comment se construit un budget, et comment se calculent les indicateurs sociaux.',
  intro:
    "Huit notions pour parler le langage de la DRH et du contrôle de gestion sociale, avec les calculs qui vont avec. Elles suivent les rubriques de l'application mesurée par Insight et font le lien avec les modules OLAP et APEX.",
  hero: 'pyramid',
  notions: [n1, n2, n3, n4, n5, n6, n7, n8],

  exam: [
    {
      q: 'Le 15 avril, une augmentation est saisie avec effet au 1<sup>er</sup> février. Dans quel mois de paie apparaît le rappel de février et mars ?',
      options: ['Février', 'Mars', 'Avril', "Il n'y a pas de rappel"],
      answer: 2,
      explain:
        'Le rappel est versé avec la première paie qui suit la saisie, ici <strong>avril</strong>. En mois de rattachement, ces sommes concernent février et mars (notions 1 et 4).',
    },
    {
      q: 'Une équipe compte 3 salariés à temps plein, 2 à 80 % et un stagiaire. Quel est son ETP ?',
      options: ['6', '5', '4,6', '3,6'],
      answer: 2,
      explain:
        "3 × 1 + 2 × 0,8 = <strong>4,6 ETP</strong>. Le stagiaire n'est pas salarié : il n'entre ni dans l'effectif ni dans l'ETP (notion 2).",
    },
    {
      q: "Effectif au 1<sup>er</sup> janvier : 400 ; 40 entrées et 60 sorties dans l'année. Quel est le turnover (formule courante) ?",
      options: ['10 %', '12,5 %', '15 %', '25 %'],
      answer: 1,
      explain:
        "((40 + 60) ÷ 2) ÷ 400 = 50 ÷ 400 = <strong>12,5 %</strong>. L'effectif au 31 décembre est de 380 (notion 3).",
    },
    {
      q: "Sur un mois, quel indicateur additionne-t-on <strong>sans précaution</strong> d'un service à l'autre <em>et</em> d'un mois à l'autre ?",
      options: ["L'effectif de fin de mois", 'Les entrées (embauches)', 'Le salaire moyen', "Le taux d'absentéisme"],
      answer: 1,
      explain:
        "Les mouvements sont des flux <strong>additifs</strong>. L'effectif est semi-additif (pas de somme sur les mois) ; salaire moyen et taux sont des ratios à recalculer (notion 3).",
    },
    {
      q: 'Brut mensuel 3 000 €, cotisations patronales globales de 40 %. Quel est le coût employeur ?',
      options: ['3 000 €', '3 400 €', '4 200 €', '5 000 €'],
      answer: 2,
      explain:
        '3 000 + 3 000 × 40 % = <strong>4 200 €</strong>. Le coût employeur ajoute les cotisations patronales au brut (notion 4).',
    },
    {
      q: "Une augmentation générale de 2 % au 1<sup>er</sup> octobre. Quel est son effet masse sur l'année ?",
      options: ['2 %', '1,5 %', '1 %', '0,5 %'],
      answer: 3,
      explain:
        "Elle joue 3 mois sur 12 : 2 % × 3 ÷ 12 = <strong>0,5 %</strong>. Le report sur l'année suivante sera d'environ 1,49 % (1,02 ÷ 1,005) (notion 5).",
    },
    {
      q: 'Que mesure le GVT ?',
      options: [
        'La hausse de la masse salariale due aux embauches',
        "La dérive du salaire moyen due à l'ancienneté, aux promotions et aux augmentations individuelles",
        "L'écart entre budget et réel",
        "Le coût de l'absentéisme",
      ],
      answer: 1,
      explain:
        'Glissement Vieillesse (ancienneté) Technicité (promotions, qualifications) : la hausse du salaire moyen à effectif et structure constants, hors mesures générales (notion 5).',
    },
    {
      q: "Budget : 20 ETP à 5 000 €. Réel : 22 ETP à 4 900 €. Quel est l'effet prix ?",
      options: ['− 2 200 €', '+ 10 000 €', '+ 7 800 €', '− 2 000 €'],
      answer: 0,
      explain:
        'Effet prix = (4 900 − 5 000) × 22 = <strong>− 2 200 €</strong>. Effet volume = 2 × 5 000 = + 10 000 €. Écart total = 107 800 − 100 000 = + 7 800 € (notion 6).',
    },
    {
      q: 'Un salarié a eu 3 absences pour un total de 6 jours. Quel est son indice de Bradford ?',
      options: ['18', '36', '54', '108'],
      answer: 2,
      explain: 'B = S² × D = 3² × 6 = <strong>54</strong> (notion 7).',
    },
    {
      q: "Pour l'écart de rémunération de l'Index égalité, un groupe (catégorie × tranche d'âge) est retenu s'il compte :",
      options: [
        'Au moins 1 femme et 1 homme',
        'Au moins 3 femmes et 3 hommes',
        'Au moins 10 salariés',
        "Au moins 40 % de l'effectif",
      ],
      answer: 1,
      explain:
        "Il faut <strong>au moins 3 femmes et 3 hommes</strong> dans le groupe. Les 40 % concernent l'ensemble des groupes retenus, qui doivent couvrir au moins 40 % de l'effectif (notion 8).",
    },
  ],

  memo: `
    <section>
      <h4>Effectifs</h4>
      ${H.tbl(
        ['Indicateur', 'Formule'],
        [
          ['ETP', "Σ taux d'activité × (jours présents ÷ jours du mois)"],
          ['Temps plein mensuel', '35 h × 52 ÷ 12 = 151,67 h'],
          ['Bilan', 'Effectif début + entrées − sorties = effectif fin'],
          ['Turnover', '((entrées + sorties) ÷ 2) ÷ effectif début'],
          ['Additivité', 'Effectif : semi-additif · mouvements : additifs'],
        ],
      )}
      <h4>Paie</h4>
      ${H.tbl(
        ['Notion', 'Calcul'],
        [
          ['Net à payer', 'Brut − cotisations salariales − prélèvement à la source'],
          ['Coût employeur', 'Brut + cotisations patronales − allègements'],
          ['Ordre de grandeur', 'Coût ≈ 1,4 × brut ≈ 1,8 × net'],
          ['Déclarations', "DPAE avant l'embauche · DSN chaque mois"],
        ],
      )}
      <h4>Absentéisme</h4>
      ${H.tbl(
        ['Indicateur', 'Formule'],
        [
          ['Taux', "Heures d'absence ÷ heures théoriques"],
          ['Fréquence', "Nombre d'arrêts ÷ effectif moyen"],
          ['Bradford', 'S² × D'],
        ],
      )}
    </section>
    <section>
      <h4>Masse salariale</h4>
      ${H.tbl(
        ['Effet', 'Définition'],
        [
          ['Niveau', 'Décembre N ÷ décembre N-1'],
          ['Masse', "Total N ÷ total N-1 (≈ taux × mois d'application ÷ 12)"],
          ['Report', '(1 + niveau) ÷ (1 + masse)'],
          ['GVT', 'Ancienneté + promotions + augmentations individuelles'],
          ['Noria', "Départs d'anciens remplacés par des entrants moins payés"],
          ['Décomposition', '(1 + évol. MS) = (1 + effet ETP) × (1 + effet salaire moyen)'],
        ],
      )}
      <h4>Budget : écart réel / budget</h4>
      ${H.tbl(
        ['Effet', 'Calcul'],
        [
          ['Volume', '(ETP réel − ETP budget) × coût moyen budget'],
          ['Prix', '(coût moyen réel − coût moyen budget) × ETP réel'],
          ['Atterrissage', 'Réel des mois passés + prévision des mois restants'],
        ],
      )}
      <h4>Index égalité</h4>
      ${H.tbl(
        ['Seuil', 'Conséquence'],
        [
          ['50 salariés', 'Index obligatoire, publié au plus tard le 1er mars'],
          ['< 75 points', 'Mesures de correction, 3 ans pour atteindre 75'],
          ['< 85 points', 'Objectifs de progression'],
          ['Groupes', '≥ 3 F et ≥ 3 H ; seuil de pertinence 5 % (2 % par classification)'],
        ],
      )}
    </section>
  `,

  glossary: [
    { term: 'SIRH', def: "Système d'information RH : cœur RH, paie, temps, recrutement, formation et pilotage." },
    { term: 'Matricule', def: "Identifiant unique et stable d'un salarié, qui relie tous les outils RH." },
    {
      term: 'DPAE',
      def: "Déclaration préalable à l'embauche, faite à l'Urssaf dans les 8 jours qui précèdent l'embauche.",
    },
    {
      term: 'DSN',
      def: "Déclaration sociale nominative : fichier mensuel issu de la paie, transmis aux organismes sociaux et à l'administration fiscale.",
    },
    { term: "Date d'effet", def: 'Date à partir de laquelle une situation est vraie, distincte de sa date de saisie.' },
    {
      term: 'Rappel de salaire',
      def: 'Somme versée pour régulariser des mois passés (augmentation rétroactive, erreur).',
    },
    { term: 'CDI / CDD', def: 'Contrat à durée indéterminée (forme normale) / déterminée (motif et durée limités).' },
    { term: 'IDCC', def: "Identifiant de la convention collective appliquée par l'entreprise." },
    {
      term: 'Classification',
      def: 'Niveau, position ou coefficient de la grille de branche ; il fixe le salaire minimum conventionnel.',
    },
    {
      term: 'CSP',
      def: 'Catégorie socioprofessionnelle : ouvriers, employés, techniciens et agents de maîtrise, ingénieurs et cadres.',
    },
    { term: "Taux d'activité", def: "Durée contractuelle rapportée à la durée d'un temps plein (28 h ÷ 35 h = 80 %)." },
    { term: 'ETP', def: "Équivalent temps plein : somme des taux d'activité, au prorata du temps de présence." },
    { term: 'Effectif physique', def: 'Nombre de personnes ayant un contrat actif à une date donnée.' },
    { term: 'Effectif moyen', def: 'Moyenne des effectifs sur une période, par exemple des 12 fins de mois.' },
    {
      term: 'Mouvement',
      def: "Entrée ou sortie de l'effectif (embauche, démission, fin de CDD, retraite, mutation…).",
    },
    {
      term: 'Turnover',
      def: 'Taux de rotation du personnel, couramment ((entrées + sorties) ÷ 2) ÷ effectif de début.',
    },
    { term: 'Pyramide des âges', def: "Répartition de l'effectif par tranche d'âge et par sexe à une date." },
    { term: 'Salaire brut', def: 'Rémunération avant retenue des cotisations salariales ; référence du contrat.' },
    { term: 'Net à payer', def: 'Somme versée au salarié après cotisations salariales et prélèvement à la source.' },
    { term: 'Coût employeur', def: 'Salaire brut + cotisations patronales, diminuées des allègements.' },
    {
      term: 'PMSS',
      def: 'Plafond mensuel de la sécurité sociale, base de certaines cotisations, revalorisé chaque année.',
    },
    { term: 'Rubrique de paie', def: 'Ligne du bulletin : code, base, taux, montants salarial et patronal.' },
    { term: 'Livre de paie', def: "Ensemble des bulletins d'une période, présenté rubrique par rubrique." },
    {
      term: 'Masse salariale',
      def: 'Somme des rémunérations versées sur une période ; brute, ou chargée des cotisations patronales.',
    },
    { term: 'Effet niveau', def: "Hausse des salaires entre la fin d'une année et la fin de la précédente." },
    { term: 'Effet masse', def: "Hausse de la masse salariale annuelle d'une année sur l'autre due à une mesure." },
    { term: 'Effet report', def: "Hausse acquise pour l'année suivante du fait des mesures prises en cours d'année." },
    {
      term: 'GVT',
      def: "Glissement vieillesse technicité : dérive du salaire moyen due à l'ancienneté, aux promotions et augmentations individuelles.",
    },
    {
      term: 'Effet de noria',
      def: 'Baisse du salaire moyen quand des salariés anciens sont remplacés par des entrants moins payés.',
    },
    {
      term: 'Effet de structure',
      def: 'Variation du salaire moyen due à un changement de composition de la population.',
    },
    { term: 'Atterrissage', def: "Estimation de fin d'année : réel des mois passés + prévision des mois restants." },
    {
      term: 'Effet volume / effet prix',
      def: "Décomposition d'un écart de masse salariale entre écart d'ETP et écart de coût moyen.",
    },
    { term: "Taux d'absentéisme", def: "Heures d'absence rapportées aux heures théoriques travaillées." },
    { term: 'AT/MP', def: 'Accidents du travail (et de trajet) et maladies professionnelles.' },
    { term: 'Indice de Bradford', def: 'S² × D : indicateur qui pondère la fréquence des absences.' },
    {
      term: 'Index égalité',
      def: "Index de l'égalité professionnelle entre les femmes et les hommes, sur 100 points, obligatoire dès 50 salariés.",
    },
    {
      term: 'Seuil de pertinence',
      def: "Marge (5 % ou 2 %) retranchée aux écarts de rémunération par groupe dans l'Index.",
    },
    { term: 'BDESE', def: 'Base de données économiques, sociales et environnementales mise à disposition du CSE.' },
    { term: 'Bilan social', def: 'Rapport social annuel obligatoire à partir de 300 salariés.' },
    { term: 'CSE', def: 'Comité social et économique : instance de représentation du personnel.' },
  ],

  resources: [
    {
      title: 'Service-Public Entreprendre',
      url: 'https://entreprendre.service-public.fr/',
      desc: "Fiches pratiques officielles de l'employeur : embauche, paie, absences, rupture du contrat.",
    },
    {
      title: 'Egapro',
      url: 'https://egapro.travail.gouv.fr/',
      desc: "Calcul et déclaration de l'Index de l'égalité professionnelle.",
    },
    {
      title: 'Urssaf',
      url: 'https://www.urssaf.fr/',
      desc: 'Taux et barèmes des cotisations en vigueur, réduction générale, plafond de la sécurité sociale.',
    },
    {
      title: 'net-entreprises.fr',
      url: 'https://www.net-entreprises.fr/',
      desc: 'Le portail des déclarations sociales, dont la DSN.',
    },
    {
      title: 'Code du travail (Légifrance)',
      url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050/',
      desc: 'Le texte en vigueur : contrats, durée du travail, égalité professionnelle, CSE.',
    },
    {
      title: 'CNIL : les données RH',
      url: 'https://www.cnil.fr/',
      desc: 'Référentiel de la gestion du personnel : finalités, durées de conservation, droits des salariés.',
    },
    {
      title: 'Directive (UE) 2023/970',
      url: 'https://eur-lex.europa.eu/eli/dir/2023/970/oj',
      desc: 'Transparence des rémunérations et égalité de rémunération entre femmes et hommes.',
    },
  ],
};
