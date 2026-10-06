import { H } from '../helpers.js';

// Petit jeu de données pour le laboratoire interactif (CA en k€)
const REG = ['Nord', 'Sud', 'Ouest'];
const CAT = ['Vélos', 'Accessoires', 'Vêtements'];
const TRI = ['T1', 'T2', 'T3', 'T4'];
const ANS = ['2024', '2025'];
const base = { Nord: 120, Sud: 150, Ouest: 90 };
const mult = { Vélos: 1.6, Accessoires: 0.7, Vêtements: 0.9 };
const saison = { T1: 0.8, T2: 1.2, T3: 1.35, T4: 0.95 };
const croissance = { 2024: 1, 2025: 1.08 };
const bonus = { 'Sud|Vélos|2025': 1.15, 'Ouest|Accessoires|2025': 0.9 };
const facts = [];
REG.forEach((r) =>
  CAT.forEach((c) =>
    ANS.forEach((a) =>
      TRI.forEach((t) => {
        const v = base[r] * mult[c] * saison[t] * croissance[a] * (bonus[r + '|' + c + '|' + a] || 1);
        facts.push({ Région: r, Catégorie: c, Année: a, Trimestre: a + '-' + t, ca: Math.round(v) });
      }),
    ),
  ),
);

function mountLab(root) {
  const lab = root.querySelector('#cube-lab');
  if (!lab) return;
  const $ = (sel) => lab.querySelector(sel);
  const st = { rows: 'Région', cols: 'Temps', filterDim: 'Catégorie', filterVal: '*', timeLevel: 'Année' };
  const DIMS = ['Région', 'Catégorie', 'Temps'];
  const valuesOf = (d) =>
    d === 'Région'
      ? REG
      : d === 'Catégorie'
        ? CAT
        : st.timeLevel === 'Année'
          ? ANS
          : ANS.flatMap((a) => TRI.map((t) => a + '-' + t));
  const key = (f, d) => (d === 'Temps' ? f[st.timeLevel] : f[d]);
  const fmt = (n) => n.toLocaleString('fr-FR');

  function sqlFor() {
    const col = (d) =>
      d === 'Région'
        ? 'm.region'
        : d === 'Catégorie'
          ? 'p.categorie'
          : st.timeLevel === 'Année'
            ? 't.annee'
            : 't.annee, t.trimestre';
    const where =
      st.filterVal === '*'
        ? ''
        : '\nWHERE  ' +
          (st.filterDim === 'Région' ? 'm.region' : st.filterDim === 'Catégorie' ? 'p.categorie' : 't.annee') +
          " = '" +
          st.filterVal +
          "'";
    return (
      'SELECT ' +
      col(st.rows) +
      ', ' +
      col(st.cols) +
      ', SUM(f.montant_ht) AS ca\nFROM   fait_ventes f JOIN ... ' +
      where +
      '\nGROUP  BY ' +
      col(st.rows) +
      ', ' +
      col(st.cols) +
      ';'
    );
  }

  function render() {
    st.filterDim = DIMS.find((d) => d !== st.rows && d !== st.cols);
    $('#lab-rows').value = st.rows;
    $('#lab-cols').value = st.cols;
    $('#lab-level').value = st.timeLevel;
    const fv = $('#lab-filter');
    const fvals = st.filterDim === 'Temps' ? ANS : valuesOf(st.filterDim);
    if (st.filterVal !== '*' && fvals.indexOf(st.filterVal) < 0) st.filterVal = '*';
    $('#lab-filter-label').textContent = 'Tranche (slice) sur ' + st.filterDim.toLowerCase();
    fv.innerHTML =
      '<option value="*">Toutes (agrégé)</option>' +
      fvals.map((v) => '<option' + (v === st.filterVal ? ' selected' : '') + '>' + v + '</option>').join('');

    const rows = valuesOf(st.rows),
      cols = valuesOf(st.cols);
    const cell = {};
    const rt = {};
    const ct = {};
    let tot = 0;
    facts.forEach((f) => {
      if (st.filterVal !== '*') {
        const fvKey = st.filterDim === 'Temps' ? f.Année : f[st.filterDim];
        if (fvKey !== st.filterVal) return;
      }
      const r = key(f, st.rows),
        c = key(f, st.cols);
      cell[r + '|' + c] = (cell[r + '|' + c] || 0) + f.ca;
      rt[r] = (rt[r] || 0) + f.ca;
      ct[c] = (ct[c] || 0) + f.ca;
      tot += f.ca;
    });
    let h =
      '<table><thead><tr><th>' +
      st.rows +
      ' \\ ' +
      st.cols +
      '</th>' +
      cols.map((c) => '<th class="n">' + c + '</th>').join('') +
      '<th class="n">Total</th></tr></thead><tbody>';
    rows.forEach((r) => {
      h +=
        '<tr><td><b>' +
        r +
        '</b></td>' +
        cols.map((c) => '<td class="n">' + fmt(cell[r + '|' + c] || 0) + '</td>').join('') +
        '<td class="n"><b>' +
        fmt(rt[r] || 0) +
        '</b></td></tr>';
    });
    h +=
      '<tr class="total"><td>Total</td>' +
      cols.map((c) => '<td class="n">' + fmt(ct[c] || 0) + '</td>').join('') +
      '<td class="n">' +
      fmt(tot) +
      '</td></tr></tbody></table>';
    $('#lab-table').innerHTML = h;
    $('#lab-sql').innerHTML = H.code('sql', sqlFor());
  }

  function say(msg) {
    $('#lab-log').textContent = msg;
  }

  lab.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'lab-rows' || id === 'lab-cols') {
      const other = id === 'lab-rows' ? 'cols' : 'rows';
      const which = id === 'lab-rows' ? 'rows' : 'cols';
      if (e.target.value === st[other]) st[other] = st[which];
      st[which] = e.target.value;
      st.filterVal = '*';
      say('Nouveaux axes : ' + st.rows + ' en lignes, ' + st.cols + ' en colonnes.');
    } else if (id === 'lab-filter') {
      st.filterVal = e.target.value;
      say(
        st.filterVal === '*'
          ? 'Tranche retirée : toutes les valeurs de ' + st.filterDim.toLowerCase() + ' sont agrégées.'
          : 'Slice : on ne garde que ' + st.filterDim.toLowerCase() + ' = ' + st.filterVal + ' (WHERE).',
      );
    } else if (id === 'lab-level') {
      const prev = st.timeLevel;
      st.timeLevel = e.target.value;
      say(
        prev === 'Année' && st.timeLevel === 'Trimestre'
          ? "Drill-down : on descend de l'année au trimestre (plus de détail)."
          : "Roll-up : on remonte du trimestre à l'année (plus agrégé).",
      );
    }
    render();
  });
  $('#lab-pivot').addEventListener('click', () => {
    const r = st.rows;
    st.rows = st.cols;
    st.cols = r;
    say('Pivot : lignes et colonnes échangées. Les chiffres ne changent pas, seule la présentation change.');
    render();
  });
  render();
}

export default {
  id: 'olap-5',
  short: 'Le cube et ses opérations',
  title: 'Le cube OLAP et ses opérations',
  level: 'Débutant',
  duration: '35 min',
  intro:
    "Le cube est la façon « naturelle » de se représenter des mesures croisées par plusieurs dimensions. On le manipule avec un petit nombre d'opérations à connaître par cœur.",
  objectives: [
    'Se représenter un cube : dimensions, membres, cellules',
    'Maîtriser slice, dice, roll-up, drill-down, pivot et drill-through',
    'Traduire chaque opération en SQL',
    'Manipuler un cube dans le laboratoire interactif',
  ],
  mount: mountLab,
  content: `
    <h3>Se représenter le cube</h3>
    <p>Imaginez un cube dont les trois arêtes sont <strong>Temps</strong>, <strong>Produit</strong> et <strong>Région</strong>. Chaque petite case (une <strong>cellule</strong>) contient la valeur d'une mesure pour une combinaison précise : « CA des Vélos, dans le Sud, au T3 2025 = 312 k€ ».</p>
    <ul>
      <li>Chaque dimension possède des <strong>membres</strong> (Nord, Sud, Ouest sont les membres de Région).</li>
      <li>Les membres s'organisent en <strong>niveaux</strong> (jour → mois → trimestre → année) au sein d'une <strong>hiérarchie</strong>.</li>
      <li>Au-delà de trois dimensions on parle d'<strong>hypercube</strong>, mais le principe reste identique.</li>
      <li>Beaucoup de cellules sont vides (tel produit n'a jamais été vendu dans telle région tel jour) : on dit que le cube est <strong>creux</strong> (<i>sparse</i>).</li>
    </ul>
    ${H.callout('analogy', 'Analogie', "Un tableau croisé dynamique Excel est une vue à deux dimensions d'un cube. Les « filtres » du TCD correspondent aux tranches (slices), les champs en lignes et en colonnes aux axes affichés.")}

    <h3>Les six opérations</h3>
    ${H.tbl(
      ['Opération', "Ce qu'on fait", 'Exemple', 'En SQL'],
      [
        [
          '<b>Slice</b> (tranche)',
          'Fixer <em>une</em> valeur sur une dimension',
          "Uniquement l'année 2025",
          '<code>WHERE t.annee = 2025</code>',
        ],
        [
          '<b>Dice</b> (dé)',
          'Restreindre <em>plusieurs</em> dimensions à des sous-ensembles',
          'Régions Sud et Ouest, trimestres T2 et T3',
          '<code>WHERE m.region IN (…) AND t.trimestre IN (…)</code>',
        ],
        [
          '<b>Roll-up</b> (agréger)',
          'Monter dans une hiérarchie ou retirer une dimension',
          'Passer des mois aux trimestres',
          '<code>GROUP BY</code> sur un niveau plus haut',
        ],
        [
          '<b>Drill-down</b> (forer)',
          'Descendre dans une hiérarchie',
          "Passer de l'année aux mois",
          '<code>GROUP BY</code> sur un niveau plus bas',
        ],
        [
          '<b>Pivot</b> (rotation)',
          'Échanger les axes affichés',
          'Régions en colonnes au lieu de lignes',
          'Présentation, ou clause <code>PIVOT</code>',
        ],
        [
          '<b>Drill-through</b>',
          'Afficher les lignes de détail derrière une cellule',
          'Les tickets qui composent « Vélos · Sud · T3 »',
          '<code>SELECT *</code> sur le fait filtré',
        ],
      ],
    )}

    <h3>Laboratoire : manipulez un cube</h3>
    <p>Ce mini-cube contient le CA (en k€) de 3 régions × 3 catégories × 8 trimestres. Changez les axes, prenez une tranche, forez dans le temps, et observez la requête SQL équivalente.</p>
    <div class="cube-lab" id="cube-lab">
      <div class="lab-controls">
        <label>Lignes<select id="lab-rows"><option>Région</option><option>Catégorie</option><option>Temps</option></select></label>
        <label>Colonnes<select id="lab-cols"><option>Région</option><option>Catégorie</option><option>Temps</option></select></label>
        <label><span id="lab-filter-label">Tranche</span><select id="lab-filter"></select></label>
        <label>Niveau du temps<select id="lab-level"><option>Année</option><option>Trimestre</option></select></label>
        <button class="btn" type="button" id="lab-pivot">Pivot ⇄</button>
      </div>
      <p class="lab-log" id="lab-log" aria-live="polite">Départ : régions en lignes, années en colonnes, toutes catégories agrégées.</p>
      <div class="tbl" id="lab-table"></div>
      <div id="lab-sql"></div>
    </div>
    ${H.callout('tip', 'À essayer', 'Mettez Temps en colonnes au niveau Trimestre, Catégorie en lignes, puis prenez la tranche Région = Sud. Quelle catégorie progresse le plus entre 2024 et 2025 ?')}

    <h3>Chaque opération en SQL</h3>
    <h4>Slice et dice</h4>
    ${H.code(
      'sql',
      `
      -- SLICE : on fixe une seule valeur (l'année 2025)
      SELECT m.region, p.categorie, SUM(f.montant_ht) AS ca
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      WHERE  t.annee = 2025
      GROUP  BY m.region, p.categorie;

      -- DICE : sous-cube sur plusieurs dimensions
      --   ... WHERE t.annee = 2025
      --       AND   m.region    IN ('Sud', 'Ouest')
      --       AND   t.trimestre IN ('T2', 'T3')
    `,
    )}
    <h4>Roll-up et drill-down</h4>
    ${H.code(
      'sql',
      `
      -- Niveau mois (détail)
      SELECT t.annee, t.mois_num, SUM(f.montant_ht) AS ca
      FROM   fait_ventes f JOIN dim_temps t ON t.date_key = f.date_key
      GROUP  BY t.annee, t.mois_num;

      -- ROLL-UP vers le trimestre : on regroupe sur le niveau supérieur
      SELECT t.annee, t.trimestre, SUM(f.montant_ht) AS ca
      FROM   fait_ventes f JOIN dim_temps t ON t.date_key = f.date_key
      GROUP  BY t.annee, t.trimestre;
    `,
    )}
    <h4>Pivot</h4>
    ${H.code(
      'sql',
      `
      SELECT *
      FROM  (SELECT m.region, t.trimestre, f.montant_ht
             FROM   fait_ventes f
             JOIN   dim_temps   t ON t.date_key    = f.date_key
             JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
             WHERE  t.annee = 2025)
      PIVOT (SUM(montant_ht) FOR trimestre IN ('T1' AS t1, 'T2' AS t2, 'T3' AS t3, 'T4' AS t4))
      ORDER BY region;
    `,
    )}
    <h4>Drill-through</h4>
    ${H.code(
      'sql',
      `
      -- Les tickets derrière la cellule « Vélos · Sud · T3 2025 »
      SELECT f.num_ticket, t.date_jour, m.nom AS magasin, p.libelle, f.quantite, f.montant_ht
      FROM   fait_ventes f
      JOIN   dim_temps   t ON t.date_key    = f.date_key
      JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
      JOIN   dim_produit p ON p.produit_key = f.produit_key
      WHERE  t.annee = 2025 AND t.trimestre = 'T3'
      AND    m.region = 'Sud' AND p.categorie = 'Vélos'
      ORDER  BY f.montant_ht DESC
      FETCH FIRST 100 ROWS ONLY;
    `,
    )}
    ${H.callout('info', 'Dans APEX', 'Vous retrouverez ces opérations dans le module APEX : un graphique cliquable qui ouvre une page de détail est un drill-down ou un drill-through, un filtre de page est un slice, la recherche à facettes est un dice.')}
  `,
  keypoints: [
    'Un cube croise des mesures selon des dimensions ; une cellule = une combinaison de membres.',
    'Slice = une valeur fixée ; dice = sous-cube sur plusieurs dimensions.',
    'Roll-up monte dans la hiérarchie, drill-down descend.',
    'Pivot change la présentation, pas les chiffres ; drill-through affiche les lignes de détail.',
  ],
  exercises: [
    {
      type: 'qcm',
      q: "Sur un cube Temps × Produit × Région, on ne conserve que l'année 2025. Quelle opération a-t-on réalisée ?",
      options: ['Un drill-down', 'Un slice', 'Un pivot', 'Un roll-up'],
      answer: 1,
      explain:
        "Fixer <strong>une seule valeur</strong> sur une dimension, c'est découper une tranche : un <strong>slice</strong>. Si on avait restreint plusieurs dimensions à des sous-ensembles, ce serait un dice.",
    },
    {
      type: 'qcm',
      q: "Un rapport affiche le CA par mois. L'utilisateur demande « le même rapport, mais par trimestre ». Quelle opération ?",
      options: ['Drill-down', 'Roll-up', 'Slice', 'Drill-through'],
      answer: 1,
      explain:
        "On monte d'un niveau dans la hiérarchie du temps (mois → trimestre) : on agrège davantage. C'est un <strong>roll-up</strong>. L'inverse (trimestre → mois) serait un drill-down.",
    },
    {
      type: 'qcm',
      q: "Un manager clique sur la cellule « Vélos · Sud · T3 = 312 k€ » pour voir la liste des tickets de caisse correspondants. C'est :",
      options: ['Un dice', 'Un pivot', 'Un drill-through', 'Un roll-up'],
      answer: 2,
      explain:
        "On quitte l'agrégat pour afficher les <strong>lignes de détail</strong> de la table de faits : c'est un <strong>drill-through</strong>. Un drill-down resterait dans l'agrégé (ex. : T3 → juillet, août, septembre).",
    },
    {
      type: 'open',
      q: "Question du directeur : « Quelle région a le plus progressé sur les vélos entre 2024 et 2025, et quels mois expliquent cette hausse ? » Décrivez la suite d'opérations OLAP que vous feriez, dans l'ordre.",
      hint: 'Commencez par réduire le cube, puis choisissez les axes, puis forez.',
      answer: `<ol>
        <li><strong>Slice</strong> sur Catégorie = Vélos (on ne regarde que les vélos).</li>
        <li><strong>Axes</strong> : Région en lignes, Temps au niveau Année en colonnes (2024, 2025), puis calcul de l'écart ou du taux d'évolution par région.</li>
        <li>On identifie la région qui progresse le plus (dans le laboratoire : le Sud).</li>
        <li><strong>Slice</strong> supplémentaire sur cette région, puis <strong>drill-down</strong> sur le temps : année → trimestre → mois, pour repérer les périodes qui portent la hausse.</li>
        <li>Éventuellement un <strong>drill-through</strong> sur le mois le plus fort pour voir les magasins ou tickets en cause (une grosse commande exceptionnelle ?).</li>
      </ol>`,
      criteria: [
        'Slice sur la catégorie Vélos',
        'Comparaison 2024 / 2025 par région',
        'Drill-down sur le temps pour la région retenue',
        'Bonus : drill-through pour vérifier le détail',
      ],
    },
    {
      type: 'open',
      q: 'Écrivez en SQL le <strong>dice</strong> suivant : CA 2025 des catégories Vélos et Accessoires, dans les régions Sud et Ouest, par région et par catégorie.',
      answer: `${H.code(
        'sql',
        `
        SELECT m.region, p.categorie, SUM(f.montant_ht) AS ca
        FROM   fait_ventes f
        JOIN   dim_temps   t ON t.date_key    = f.date_key
        JOIN   dim_magasin m ON m.magasin_key = f.magasin_key
        JOIN   dim_produit p ON p.produit_key = f.produit_key
        WHERE  t.annee = 2025
        AND    p.categorie IN ('Vélos', 'Accessoires')
        AND    m.region    IN ('Sud', 'Ouest')
        GROUP  BY m.region, p.categorie
        ORDER  BY m.region, p.categorie;
      `,
      )}<p>Le dice se traduit par plusieurs conditions <code>IN</code> sur différentes dimensions. Le résultat est un sous-cube de 2 × 2 cellules.</p>`,
      criteria: ['Filtre année 2025', 'IN sur la catégorie', 'IN sur la région', 'GROUP BY région, catégorie'],
    },
  ],
};
