import { H } from '../helpers.js';

export default {
  id: 'rh-4',
  short: 'Paie : du brut au coût',
  title: 'La paie : du salaire brut au coût employeur',
  level: 'Débutant → Intermédiaire',
  duration: '35 min',
  intro:
    "La paie est la source de la masse salariale. Comprendre la structure d'un bulletin, les rubriques et les déclarations permet de lire correctement tous les chiffres qui en découlent.",
  objectives: [
    "Lire la structure d'un bulletin : brut, cotisations, net, coût employeur",
    'Calculer un salaire mensuel de base et un coût employeur simplifié',
    'Comprendre les rubriques de paie, le livre de paie et la DSN',
    'Distinguer mois de paie et mois de rattachement (rappels, décalages)',
  ],
  content: `
    <h3>Du brut au net, du brut au coût</h3>
    <figure class="figure part-rh">
      <svg class="dg" viewBox="0 0 700 210" width="700" role="img" aria-label="Le salaire brut se décompose : moins les cotisations salariales et l'impôt prélevé à la source, on obtient le net à payer ; plus les cotisations patronales, on obtient le coût employeur.">
        <defs><marker id="ah-rh4" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" class="arrow"/></marker></defs>
        <rect class="box-2" x="10" y="80" width="150" height="50" rx="8"/>
        <text x="85" y="102" text-anchor="middle" class="t-b">Éléments de salaire</text>
        <text x="85" y="119" text-anchor="middle" class="t-s">base, primes, heures sup.</text>
        <path class="ln" d="M160 105h40" marker-end="url(#ah-rh4)"/>
        <rect class="box-p" x="204" y="80" width="120" height="50" rx="8"/>
        <text x="264" y="102" text-anchor="middle" class="t-b">Salaire brut</text>
        <text x="264" y="119" text-anchor="middle" class="t-s">référence du contrat</text>
        <path class="ln" d="M324 95 380 50" marker-end="url(#ah-rh4)"/>
        <path class="ln" d="M324 115 380 160" marker-end="url(#ah-rh4)"/>
        <rect class="box" x="384" y="20" width="160" height="56" rx="8"/>
        <text x="464" y="42" text-anchor="middle" class="t-s">− cotisations salariales</text>
        <text x="464" y="62" text-anchor="middle" class="t-s">− impôt (prélèvement à la source)</text>
        <path class="ln" d="M544 48h36" marker-end="url(#ah-rh4)"/>
        <rect class="box-p" x="584" y="23" width="106" height="50" rx="8"/>
        <text x="637" y="45" text-anchor="middle" class="t-b">Net à payer</text>
        <text x="637" y="62" text-anchor="middle" class="t-s">versé au salarié</text>
        <rect class="box" x="384" y="134" width="160" height="56" rx="8"/>
        <text x="464" y="157" text-anchor="middle" class="t-s">+ cotisations patronales</text>
        <text x="464" y="176" text-anchor="middle" class="t-s">− allègements</text>
        <path class="ln" d="M544 162h36" marker-end="url(#ah-rh4)"/>
        <rect class="box-p" x="584" y="137" width="106" height="50" rx="8"/>
        <text x="637" y="159" text-anchor="middle" class="t-b">Coût employeur</text>
        <text x="637" y="176" text-anchor="middle" class="t-s">payé par l'entreprise</text>
      </svg>
      <figcaption>Le brut est le pivot : le salarié en voit le net, l'entreprise en paie le coût.</figcaption>
    </figure>

    <h3>La structure d'un bulletin</h3>
    <ol>
      <li><strong>Salaire de base</strong> : pour un temps plein mensualisé à 35 heures, taux horaire × <strong>151,67 heures</strong>.</li>
      <li><strong>Éléments variables</strong> : heures supplémentaires (majorées, en l'absence d'accord, de 25 % pour les 8 premières heures de la semaine puis de 50 %), primes (objectifs, ancienneté, 13<sup>e</sup> mois), avantages en nature, retenues pour absence.</li>
      <li><strong>Salaire brut</strong> : la somme des éléments ci-dessus.</li>
      <li><strong>Cotisations salariales</strong> : retraite de base et complémentaire, CSG et CRDS, prévoyance, mutuelle… Elles réduisent le brut au net.</li>
      <li><strong>Net</strong> : le bulletin affiche le <em>montant net social</em>, le <em>net imposable</em>, puis le <strong>prélèvement à la source</strong> de l'impôt sur le revenu (taux transmis par l'administration fiscale), et enfin le <strong>net à payer</strong>.</li>
      <li><strong>Cotisations patronales</strong> : maladie, vieillesse, allocations familiales, chômage, retraite complémentaire, accidents du travail… diminuées des <strong>allègements</strong> sur les bas salaires.</li>
    </ol>
    <p>Certaines cotisations ne s'appliquent que jusqu'au <strong>plafond de la sécurité sociale</strong> (PMSS, revalorisé chaque 1<sup>er</sup> janvier) ou par <em>tranches</em> de salaire : le taux global de charges n'est donc pas le même pour un salaire de 2 000 € et de 8 000 €.</p>

    <h3>Un exemple simplifié</h3>
    ${H.tbl(
      ['Ligne', '#Base', '#Taux', '#Salarié', '#Employeur'],
      [
        ['Salaire de base (18,46 € × 151,67 h)', '', '', '2 800,00', ''],
        ["Prime d'objectifs", '', '', '200,00', ''],
        ['__total__', 'Salaire brut', '', '', '3 000,00', ''],
        ['Cotisations salariales (global)', '3 000,00', '22 %', '− 660,00', ''],
        ['Cotisations patronales (global, après allègements)', '3 000,00', '40 %', '', '1 200,00'],
        ['__total__', 'Net avant impôt', '', '', '2 340,00', ''],
        ['Prélèvement à la source', '2 340,00', '5 %', '− 117,00', ''],
        ['__total__', 'Net à payer', '', '', '2 223,00', ''],
        ['__total__', 'Coût employeur (brut + patronales)', '', '', '', '4 200,00'],
      ],
      "Taux globaux fictifs, arrondis pour l'exemple. En réalité, chaque cotisation a sa base et son taux, et le net imposable diffère du net avant impôt.",
    )}
    <p>Ordre de grandeur à retenir : pour un salaire moyen, le <strong>coût employeur</strong> représente environ <strong>1,4 fois le brut</strong> et près de <strong>1,8 à 1,9 fois le net</strong>. C'est pourquoi on parle de masse salariale <em>brute</em> ou <em>chargée</em> (notion 5).</p>

    <h3>Rubriques, livre de paie et DSN</h3>
    <p>Chaque ligne du bulletin est une <strong>rubrique de paie</strong> : un code, un libellé, une base, un taux, un montant salarial et un montant patronal. Le <strong>plan de paie</strong> (la liste des rubriques) est propre à chaque entreprise. Le <strong>livre de paie</strong> rassemble tous les bulletins d'une période, rubrique par rubrique.</p>
    ${H.tbl(
      ['matricule', 'mois_paie', 'rubrique', 'libelle', '#base', '#taux', '#montant_sal', '#montant_pat'],
      [
        ['E1042', '2026-03', '1000', 'Salaire de base', '151,67', '18,46', '2 800,00', ''],
        ['E1042', '2026-03', '1450', "Prime d'objectifs", '', '', '200,00', ''],
        ['E1042', '2026-03', '7010', 'Vieillesse plafonnée', '3 000,00', '…', '…', '…'],
      ],
      'Une table de faits de paie a pour grain : un salarié × un mois de paie × une rubrique.',
    )}
    <p>Chaque mois, la paie produit la <strong>DSN</strong> (déclaration sociale nominative) : un fichier unique transmis via net-entreprises qui alimente l'Urssaf, les caisses de retraite, France Travail, l'administration fiscale (prélèvement à la source)… Elle est due le 5 ou le 15 du mois suivant selon la taille de l'entreprise. Certains événements (arrêt de travail, fin de contrat) font en plus l'objet d'un <em>signalement</em> dans les jours qui suivent.</p>

    <h3>Mois de paie ou mois de rattachement ?</h3>
    <p>L'argent versé en mars ne correspond pas toujours au travail de mars :</p>
    <ul>
      <li><strong>Rappels</strong> : une augmentation rétroactive verse en mars des sommes dues pour janvier et février (notion 1) ;</li>
      <li><strong>Décalage de paie</strong> : les heures supplémentaires ou primes variables de février sont souvent payées en mars ;</li>
      <li><strong>Primes annuelles</strong> : le 13<sup>e</sup> mois versé en décembre concerne toute l'année ;</li>
      <li><strong>Soldes de tout compte</strong> : indemnités de départ, congés payés non pris.</li>
    </ul>
    ${H.callout('warn', 'Piège', "Comparer la masse salariale de deux mois sans neutraliser ces effets conduit à de fausses conclusions (« la masse a bondi de 12 % en décembre » : c'est le 13<sup>e</sup> mois). Le contrôle de gestion travaille souvent en <strong>masse mensualisée</strong> (primes annuelles réparties sur 12 mois) ou en mois de rattachement.")}
    ${H.callout('info', "Dans l'application", '<b>Fiche Salarié › Détail Paye par Salarié</b>, <b>Listes Collaborateurs › Liste par Rubrique</b> et <b>Masse Salariale › Livre de Paye</b> exploitent directement ces rubriques de paie.')}
  `,
  keypoints: [
    'Brut = base + éléments variables ; net = brut − cotisations salariales − impôt à la source.',
    'Coût employeur = brut + cotisations patronales − allègements (environ 1,4 × le brut pour un salaire moyen).',
    'Temps plein mensualisé = 151,67 heures ; chaque ligne du bulletin est une rubrique de paie.',
    'La DSN mensuelle transmet la paie aux organismes ; mois de paie et mois de rattachement diffèrent (rappels, primes annuelles).',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Un salarié à temps plein (35 h) est payé 15 € de l'heure. Quel est son salaire mensuel de base ?",
      options: ['2 100,00 €', '2 250,00 €', '2 275,05 €', '2 400,00 €'],
      answer: 2,
      explain:
        '15 € × 151,67 h = <strong>2 275,05 €</strong>. 151,67 h = 35 h × 52 semaines ÷ 12 mois : la mensualisation lisse les mois de 4 et de 5 semaines.',
    },
    {
      type: 'qcm',
      q: "Comment calcule-t-on le coût employeur d'un salarié ?",
      options: [
        'Net à payer + impôt sur le revenu',
        'Salaire brut + cotisations patronales (après allègements)',
        'Salaire brut + cotisations salariales',
        'Net à payer × 2',
      ],
      answer: 1,
      explain:
        'Le coût employeur ajoute au brut les <strong>cotisations patronales</strong>, diminuées des allègements. Les cotisations salariales sont déjà comprises dans le brut (elles sont retenues sur lui).',
    },
    {
      type: 'qcm',
      q: "Quelle déclaration mensuelle transmet les données de paie aux organismes sociaux et à l'administration fiscale ?",
      options: ['La DPAE', 'La DSN', 'La BDESE', 'Le bilan social'],
      answer: 1,
      explain:
        "La <strong>DSN</strong> (déclaration sociale nominative) est produite à chaque paie. La DPAE précède l'embauche ; BDESE et bilan social concernent l'information du CSE.",
    },
    {
      type: 'open',
      q: "Salaire de base 2 600 €, prime 400 €. Avec des taux globaux simplifiés de 22 % (cotisations salariales) et 42 % (cotisations patronales), et un taux de prélèvement à la source de 4 %, calculez le brut, le net avant impôt, le net à payer et le coût employeur. Combien coûte à l'entreprise 1 € versé au salarié ?",
      hint: "Le prélèvement à la source s'applique ici au net avant impôt.",
      answer: `<ul>
        <li><strong>Brut</strong> = 2 600 + 400 = <strong>3 000 €</strong></li>
        <li>Cotisations salariales = 3 000 × 22 % = 660 € → <strong>net avant impôt = 2 340 €</strong></li>
        <li>Prélèvement à la source = 2 340 × 4 % = 93,60 € → <strong>net à payer = 2 246,40 €</strong></li>
        <li>Cotisations patronales = 3 000 × 42 % = 1 260 € → <strong>coût employeur = 4 260 €</strong></li>
      </ul>
      <p>Rapport coût / net avant impôt : 4 260 ÷ 2 340 ≈ <strong>1,82</strong>. Pour 1 € net versé, l'entreprise dépense environ 1,82 €. L'impôt sur le revenu ne change pas le coût employeur : c'est une part du salaire du salarié, collectée par l'employeur.</p>`,
      criteria: [
        'Brut = 3 000 €',
        'Net avant impôt = 2 340 € et net à payer = 2 246,40 €',
        'Coût employeur = 4 260 €',
        "Ratio ≈ 1,8 et remarque sur l'impôt",
      ],
    },
    {
      type: 'open',
      q: "Le contrôleur de gestion constate que la masse salariale payée en mars dépasse de 9 % celle de février, alors que l'effectif n'a pas bougé. Proposez au moins quatre explications possibles et la vérification associée.",
      hint: 'Pensez à tout ce qui est versé en mars sans correspondre au travail de mars.',
      answer: `${H.tbl(
        ['Explication', 'Vérification'],
        [
          [
            "Rappels d'une augmentation rétroactive au 1er janvier",
            'Rubriques de rappel dans le livre de paie de mars',
          ],
          [
            "Prime annuelle ou variable versée en mars (bonus de l'exercice précédent, par exemple)",
            'Montants par rubrique de prime, mars contre février',
          ],
          [
            'Heures supplémentaires de février payées en mars (décalage de paie)',
            "Rubriques d'heures sup. et leur mois de rattachement",
          ],
          [
            'Soldes de tout compte de salariés partis (indemnités, congés payés)',
            "Bulletins de sortie, rubriques d'indemnités",
          ],
          [
            'Février plus court : retenues pour absence plus faibles en mars, ou forte absence en février',
            "Rubriques d'absence des deux mois",
          ],
        ],
      )}<p>La méthode : comparer les deux mois <strong>rubrique par rubrique</strong> (livre de paie), puis raisonner en mois de rattachement ou en masse mensualisée pour isoler l'évolution « de fond ».</p>`,
      criteria: [
        'Au moins quatre explications pertinentes',
        'Une vérification concrète pour chacune',
        "Mentionne l'analyse par rubrique",
        'Distingue mois de paie et mois de rattachement',
      ],
    },
  ],
};
