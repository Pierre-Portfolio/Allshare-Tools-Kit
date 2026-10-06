// Prisme : inspection d'un fichier CSV (encodage, séparateur, structure, contenu des cellules)
// et conversion en ANSI (Windows-1252) ou en UTF-8. Fonctions pures, sans dépendance au navigateur
// (testables avec Node) : le fichier est lu sous forme d'octets (Uint8Array).

// ---------------------------------------------------------------- Encodage

/**
 * Windows-1252 : octet -> caractère. Seule la plage 0x80–0x9F diffère d'Unicode (€, ’, Œ…) ;
 * 0x81, 0x8D, 0x8F, 0x90 et 0x9D ne sont pas définis (U+0081…), comme dans les navigateurs.
 * Table explicite : le décodeur « windows-1252 » de Node lit cette plage comme du Latin-1.
 */
const CP1252_HIGH =
  '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F' +
  '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';
const CP1252_CHARS = Array.from({ length: 256 }, (_, b) =>
  b >= 0x80 && b < 0xa0 ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b),
);
/** Caractère -> octet Windows-1252. */
const CP1252 = new Map(CP1252_CHARS.map((ch, b) => [ch, b]));
const CP1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** Décode des octets Windows-1252 (plage 0x80–0x9F corrigée si le décodeur la lit en Latin-1). */
export const decodeAnsi = (bytes) =>
  new TextDecoder('windows-1252').decode(bytes).replace(/[\u0080-\u009F]/g, (c) => CP1252_CHARS[c.charCodeAt(0)]);

export const isAnsiChar = (ch) => CP1252.has(ch);
export const ansiByte = (ch) => CP1252.get(ch);

/** Encode en Windows-1252 ; un caractère non convertible devient « ? » et est compté. */
export function encodeAnsi(str) {
  const out = [];
  let lost = 0;
  for (const ch of str) {
    const b = CP1252.get(ch);
    if (b === undefined) {
      out.push(0x3f);
      lost++;
    } else out.push(b);
  }
  return { bytes: new Uint8Array(out), lost };
}

// ---------------------------------------------------------------- Anomalies

/** Contrôles : gravité (error | warning | info), titre, piste de correction. */
export const DEFS = {
  // Encodage
  'enc-utf8': {
    sev: 'warning',
    t: "Fichier encodé en UTF-8 (sans BOM) au lieu d'ANSI",
    h: 'Un logiciel qui lit en ANSI affichera « Ã© » à la place de « é ». Utilisez « Exporter en ANSI » pour convertir.',
  },
  'enc-utf8-bom': {
    sev: 'warning',
    t: "Fichier encodé en UTF-8 avec BOM au lieu d'ANSI",
    h: 'Le BOM (octets EF BB BF) en début de fichier apparaît souvent comme « ï»¿ » collé au premier nom de colonne dans les outils ANSI.',
  },
  'enc-utf16': {
    sev: 'error',
    t: 'Fichier encodé en UTF-16',
    h: "La plupart des traitements CSV (imports, scripts) ne lisent pas l'UTF-16. Convertissez en ANSI ou UTF-8.",
  },
  'enc-utf16-nobom': {
    sev: 'error',
    t: 'Fichier probablement en UTF-16 sans BOM (octets nuls détectés)',
    h: "Beaucoup d'octets 00 : typique d'un export Unicode d'Excel. Le fichier a été relu en UTF-16.",
  },
  'enc-mixed': {
    sev: 'error',
    t: 'Encodage mixte : lignes ANSI et lignes UTF-8 dans le même fichier',
    h: 'Probablement une concaténation de fichiers ou une ligne ajoutée à la main. Les lignes signalées contiennent des séquences UTF-8, le reste est en ANSI.',
  },
  'enc-ansi': {
    sev: 'warning',
    t: "Fichier encodé en ANSI (Windows-1252) au lieu d'UTF-8",
    h: 'Utilisez « Exporter en UTF-8 » pour convertir.',
  },
  'enc-ansi-ok': { sev: 'info', t: 'Encodage ANSI (Windows-1252) — conforme', h: '' },
  'enc-utf8-ok': { sev: 'info', t: 'Encodage UTF-8 — conforme', h: '' },
  'enc-ascii': {
    sev: 'info',
    t: 'Fichier 100 % ASCII (aucun caractère accentué)',
    h: 'Compatible à la fois ANSI et UTF-8 : aucun risque de conversion.',
  },
  'enc-undef': {
    sev: 'error',
    t: 'Octets non définis en Windows-1252 (81, 8D, 8F, 90, 9D)',
    h: "Ces octets n'ont pas de caractère en ANSI : fichier corrompu ou dans un autre encodage (ex. IBM850/OEM).",
  },
  'enc-forced': {
    sev: 'info',
    t: 'Encodage de lecture forcé manuellement',
    h: 'La détection automatique est ignorée.',
  },
  // Fins de ligne
  'eol-mixed': {
    sev: 'warning',
    t: 'Fins de ligne mixtes (CRLF / LF / CR)',
    h: "Le fichier mélange plusieurs types de retours à la ligne, souvent signe d'une édition manuelle ou d'une concaténation.",
  },
  'eol-lf': {
    sev: 'info',
    t: 'Fins de ligne Unix (LF) au lieu de Windows (CRLF)',
    h: "Certains outils Windows attendent CRLF. Cochez « CRLF à l'export » et exportez pour normaliser.",
  },
  'eol-cr': {
    sev: 'warning',
    t: 'Fins de ligne Mac classique (CR seul)',
    h: "Format rarement supporté : beaucoup d'outils verront tout le fichier sur une seule ligne.",
  },
  'no-final-eol': {
    sev: 'info',
    t: 'Pas de retour à la ligne après la dernière ligne',
    h: "Certains imports ignorent ou tronquent la dernière ligne si elle n'est pas terminée.",
  },
  // Structure
  'delim-guess': {
    sev: 'info',
    t: 'Séparateur détecté avec une confiance faible',
    h: "Vérifiez le séparateur dans la barre d'outils.",
  },
  'no-data': { sev: 'error', t: 'Aucune ligne de données', h: "Le fichier ne contient que l'en-tête (ou est vide)." },
  'header-empty': {
    sev: 'error',
    t: "Nom de colonne vide dans l'en-tête",
    h: "Une colonne n'a pas de nom : séparateur doublé « ;; » dans l'en-tête ?",
  },
  'header-dup': {
    sev: 'error',
    t: 'Nom de colonne en double',
    h: 'Deux colonnes portent le même nom (comparaison sans casse ni espaces).',
  },
  'header-ws': {
    sev: 'warning',
    t: "Espaces autour d'un nom de colonne",
    h: '« Montant » et « Montant␣ » ne sont pas la même colonne pour un import.',
  },
  'header-numeric': {
    sev: 'info',
    t: "L'en-tête ressemble à des données",
    h: 'Des noms de colonne sont purement numériques ou des dates : la ligne 1 est-elle vraiment un en-tête ?',
  },
  'header-trailing': {
    sev: 'warning',
    t: "Séparateur en trop à la fin de l'en-tête",
    h: "L'en-tête se termine par un séparateur : cela crée une colonne vide sans nom.",
  },
  'trailing-delim': {
    sev: 'warning',
    t: 'Séparateur en trop en fin de ligne',
    h: "La ligne a plus de séparateurs que l'en-tête, mais les cellules en trop sont vides (ex. « ...;123; »).",
  },
  'too-many-cols': {
    sev: 'error',
    t: 'Colonnes en trop (données décalées)',
    h: "La ligne contient plus de valeurs que l'en-tête : un séparateur dans une valeur non protégée par des guillemets ? Les colonnes suivantes sont décalées.",
  },
  'too-few-cols': {
    sev: 'error',
    t: 'Colonnes manquantes',
    h: "La ligne contient moins de valeurs que l'en-tête : séparateur oublié ou ligne coupée.",
  },
  'empty-line': {
    sev: 'warning',
    t: 'Ligne vide au milieu du fichier',
    h: "Les lignes vides peuvent être importées comme un enregistrement vide ou faire échouer l'import.",
  },
  'eof-empty': { sev: 'info', t: 'Ligne(s) vide(s) en fin de fichier', h: '' },
  'only-delims': {
    sev: 'warning',
    t: 'Ligne ne contenant que des séparateurs',
    h: 'Ligne du type « ;;;; » : enregistrement entièrement vide.',
  },
  'dup-row': { sev: 'warning', t: 'Ligne en double', h: 'Ligne strictement identique à une ligne précédente.' },
  'empty-col': {
    sev: 'warning',
    t: 'Colonne entièrement vide',
    h: 'Aucune ligne de données ne renseigne cette colonne.',
  },
  // Guillemets
  'unclosed-quote': {
    sev: 'error',
    t: 'Guillemet ouvrant jamais refermé',
    h: 'Tout le reste du fichier à partir de cette ligne a été absorbé dans une seule cellule.',
  },
  'stray-quote': {
    sev: 'warning',
    t: 'Guillemet isolé dans une valeur non protégée',
    h: 'Ex. « 12" pouces ». Selon l\'outil, cela peut ouvrir une zone entre guillemets et décaler tout le fichier.',
  },
  'quote-garbage': {
    sev: 'error',
    t: 'Texte après un guillemet fermant',
    h: 'Ex. « "abc"def ». Le guillemet doit être doublé ("") à l\'intérieur d\'une valeur.',
  },
  // Contenu des cellules
  mojibake: {
    sev: 'error',
    t: 'Accents cassés (double encodage « Ã© », « â€™ »…)',
    h: "Du texte UTF-8 a été lu comme de l'ANSI puis ré-enregistré. « Ã© » = é, « Ã¨ » = è, « Ã  » = à, « â€™ » = ’.",
  },
  replacement: {
    sev: 'error',
    t: 'Caractère de remplacement « � »',
    h: "Un caractère a été perdu lors d'une conversion d'encodage antérieure.",
  },
  'question-mark': {
    sev: 'warning',
    t: "« ? » au milieu d'un mot",
    h: "Souvent un caractère accentué perdu lors d'une conversion vers ANSI (ex. « caf? »).",
  },
  'not-ansi': {
    sev: 'warning',
    t: 'Caractère non convertible en ANSI',
    h: "Ce caractère n'existe pas en Windows-1252 : il deviendra « ? » lors d'une conversion en ANSI.",
  },
  'ws-edge': {
    sev: 'warning',
    t: "Espace(s) au début ou à la fin d'une valeur",
    h: "Invisible à l'œil mais « ABC » ≠ « ABC␣ » pour une comparaison ou une jointure.",
  },
  'double-space': { sev: 'info', t: 'Espaces multiples consécutifs dans une valeur', h: '' },
  nbsp: {
    sev: 'warning',
    t: 'Espace insécable (U+00A0 / U+202F)',
    h: "Ressemble à un espace mais n'en est pas un : casse les conversions de nombres (« 1 234,56 ») et les comparaisons.",
  },
  'zero-width': {
    sev: 'error',
    t: 'Caractère invisible (largeur nulle ou BOM au milieu du texte)',
    h: 'U+200B, U+FEFF… totalement invisible, fait échouer les comparaisons.',
  },
  control: {
    sev: 'error',
    t: 'Caractère de contrôle (NUL, BEL, ESC…)',
    h: 'Caractère non imprimable : fichier corrompu ou binaire.',
  },
  'c1-control': {
    sev: 'error',
    t: 'Caractère de contrôle C1 (U+0080–U+009F)',
    h: "Typique d'un octet non défini en Windows-1252 ou d'une mauvaise conversion Latin-1 ↔ UTF-8.",
  },
  'tab-in-cell': { sev: 'warning', t: 'Tabulation dans une valeur', h: '' },
  multiline: {
    sev: 'info',
    t: "Retour à la ligne à l'intérieur d'une valeur",
    h: 'Valeur multi-ligne (entre guillemets) : valide en CSV mais mal supportée par de nombreux outils.',
  },
  formula: {
    sev: 'info',
    t: 'Valeur commençant par = + - @',
    h: "Excel peut l'interpréter comme une formule (risque d'injection CSV).",
  },
  sci: {
    sev: 'warning',
    t: 'Nombre en notation scientifique (1,23E+11)',
    h: "Typique d'un fichier ré-enregistré par Excel : les chiffres au-delà de 15 sont perdus (IBAN, codes, n° de carte…).",
  },
  'long-cell': {
    sev: 'info',
    t: 'Valeur très longue (> 255 caractères)',
    h: 'Certains imports tronquent à 255 caractères.',
  },
  'type-mismatch': {
    sev: 'warning',
    t: 'Valeur atypique pour la colonne',
    h: 'Le type ne correspond pas au type dominant de la colonne (ex. texte dans une colonne numérique).',
  },
  'mixed-decimal': {
    sev: 'warning',
    t: 'Séparateur décimal incohérent dans la colonne',
    h: 'La colonne mélange « 12,50 » et « 12.50 ».',
  },
  'mixed-date': {
    sev: 'warning',
    t: 'Formats de date incohérents dans la colonne',
    h: 'La colonne mélange plusieurs formats (JJ/MM/AAAA, AAAA-MM-JJ…).',
  },
  'invalid-date': { sev: 'error', t: 'Date invalide', h: 'Jour ou mois hors limites (ex. 31/02 ou mois 13).' },
  'empty-in-full': { sev: 'info', t: 'Cellule vide dans une colonne presque toujours renseignée', h: '' },
};
export const SEV_RANK = { error: 3, warning: 2, info: 1 };
export const SEV_LABEL = { error: 'Erreur', warning: 'Alerte', info: 'Info' };
export const FAM_LABEL = { num: 'nombre', date: 'date', text: 'texte', empty: 'vide', mixed: 'mixte' };

// ---------------------------------------------------------------- Formats d'affichage

export const hex = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');

/** Lettre de colonne façon Excel : 0 -> A, 25 -> Z, 26 -> AA. */
export function colLetter(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export const fmtSize = (n) =>
  n < 1024
    ? `${n} o`
    : n < 1048576
      ? `${(n / 1024).toFixed(1).replace('.', ',')} Ko`
      : `${(n / 1048576).toFixed(2).replace('.', ',')} Mo`;

export const delimName = (d) =>
  ({ ';': '« ; » point-virgule', ',': '« , » virgule', '\t': 'tabulation', '|': '« | » barre' })[d] ||
  JSON.stringify(d);

export const ENCODING_LABELS = {
  ascii: 'ASCII',
  'utf-8': 'UTF-8',
  'windows-1252': 'ANSI (Windows-1252)',
  mixed: 'Mixte ANSI + UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
};

// ---------------------------------------------------------------- Détection d'encodage

/** Parcourt les octets : séquences UTF-8 valides / invalides, octets nuls, ligne par ligne. */
function scanBytes(b, start) {
  let line = 1;
  let high = 0;
  let validSeq = 0;
  let invalid = 0;
  let nul = 0;
  let nulEven = 0;
  let nulOdd = 0;
  const utf8Lines = new Set();
  const badLines = new Set();
  const undefLines = new Set();
  for (let i = start; i < b.length; i++) {
    const x = b[i];
    if (x === 0x0a) {
      line++;
      continue;
    }
    if (x === 0x0d) {
      if (b[i + 1] !== 0x0a) line++;
      continue;
    }
    if (x === 0) {
      nul++;
      if (i % 2) nulOdd++;
      else nulEven++;
      continue;
    }
    if (x < 0x80) continue;
    high++;
    let need = 0;
    if (x >= 0xc2 && x <= 0xdf) need = 1;
    else if (x >= 0xe0 && x <= 0xef) need = 2;
    else if (x >= 0xf0 && x <= 0xf4) need = 3;
    let ok = need > 0;
    for (let k = 1; ok && k <= need; k++) {
      const y = b[i + k];
      if (y === undefined || y < 0x80 || y > 0xbf) ok = false;
    }
    if (ok) {
      validSeq++;
      utf8Lines.add(line);
      i += need;
    } else {
      invalid++;
      badLines.add(line);
      if (CP1252_UNDEFINED.has(x)) undefLines.add(line);
    }
  }
  return { high, validSeq, invalid, nul, nulEven, nulOdd, utf8Lines, badLines, undefLines };
}

/**
 * Décode les octets : BOM, puis détection (ASCII, UTF-8, ANSI, mixte, UTF-16 sans BOM),
 * sauf si l'encodage est forcé (override ≠ 'auto').
 */
export function decode(bytes, override = 'auto') {
  const r = { enc: '', label: '', bom: false, text: '', scan: null, forced: override !== 'auto', guessed16: false };
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    r.bom = 'utf-8';
    start = 3;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    r.bom = 'utf-16le';
    start = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    r.bom = 'utf-16be';
    start = 2;
  }

  let enc;
  if (override !== 'auto') enc = override;
  else if (r.bom) enc = r.bom;
  else {
    const s = scanBytes(bytes, 0);
    r.scan = s;
    if (s.nul > bytes.length * 0.2) {
      enc = s.nulOdd > s.nulEven ? 'utf-16le' : 'utf-16be';
      r.guessed16 = true;
    } else if (s.high === 0) enc = 'ascii';
    else if (s.invalid === 0) enc = 'utf-8';
    else if (s.validSeq > 0) enc = 'mixed';
    else enc = 'windows-1252';
  }
  if (!r.scan && !enc.startsWith('utf-16')) r.scan = scanBytes(bytes, start);
  r.enc = enc;
  const decEnc = enc === 'ascii' || enc === 'mixed' ? 'windows-1252' : enc;
  const skip = enc.startsWith('utf-16') && r.bom ? 2 : r.bom === 'utf-8' && decEnc === 'utf-8' ? 3 : 0;
  const body = bytes.subarray(skip);
  r.text = decEnc === 'windows-1252' ? decodeAnsi(body) : new TextDecoder(decEnc, { ignoreBOM: true }).decode(body);
  r.label = enc === 'utf-8' && r.bom === 'utf-8' ? 'UTF-8 avec BOM' : ENCODING_LABELS[enc] || enc;
  return r;
}

// ---------------------------------------------------------------- Séparateur

/**
 * La ligne 1 (en-tête) fait référence : on retient le séparateur présent dans l'en-tête
 * et dont le nombre d'occurrences est le plus stable sur les lignes suivantes.
 */
export function detectDelimiter(text) {
  const sample = text.slice(0, 65536).replace(/"(?:[^"]|"")*"/g, '');
  const lines = sample
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim())
    .slice(0, 50);
  let best = { d: ';', score: -1, conf: 0 };
  if (!lines.length) return best;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const hc = counts[0];
    if (!hc) continue;
    const rest = counts.length > 1 ? counts.slice(1) : counts;
    const exact = rest.filter((c) => c === hc).length / rest.length;
    const near = rest.filter((c) => Math.abs(c - hc) <= 1).length / rest.length;
    const conf = (exact + near) / 2;
    const score = conf * 1000 + Math.min(hc, 50);
    if (score > best.score) best = { d, score, conf };
  }
  return best;
}

// ---------------------------------------------------------------- Lecture CSV

/**
 * Parseur CSV (RFC 4180 tolérant) : conserve, pour chaque enregistrement, ses lignes d'origine,
 * sa position dans le texte, la position de ses séparateurs et les problèmes de guillemets.
 * @returns {{ fields: { v: string, q: boolean }[], line, lineEnd, start, end, issues, delims }[]}
 */
export function parseCSV(text, d) {
  const recs = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  let recStart = 0;
  let recLine = 1;
  let fields = [];
  let field = '';
  let quoted = false;
  let inQ = false;
  let issues = [];
  let delims = [];
  const pushField = () => {
    fields.push({ v: field, q: quoted });
    field = '';
    quoted = false;
  };
  const pushRec = (end) => {
    pushField();
    recs.push({ fields, line: recLine, lineEnd: line, start: recStart, end, issues, delims });
    fields = [];
    issues = [];
    delims = [];
  };
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        if (i < n) {
          const nx = text[i];
          if (nx !== d && nx !== '\n' && nx !== '\r') issues.push({ code: 'quote-garbage', c: fields.length });
        }
        continue;
      }
      if (c === '\r') {
        if (text[i + 1] === '\n') {
          field += '\r\n';
          i += 2;
        } else {
          field += '\r';
          i++;
        }
        line++;
        continue;
      }
      if (c === '\n') line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.length === 0 && !quoted) {
        inQ = true;
        quoted = true;
        i++;
        continue;
      }
      issues.push({ code: 'stray-quote', c: fields.length });
      field += c;
      i++;
      continue;
    }
    if (c === d) {
      delims.push(i);
      pushField();
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      const end = i;
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      pushRec(end);
      line++;
      recStart = i;
      recLine = line;
      continue;
    }
    field += c;
    i++;
  }
  if (inQ) issues.push({ code: 'unclosed-quote', c: fields.length });
  if (recStart < n || fields.length || field.length) pushRec(n);
  return recs;
}

// ---------------------------------------------------------------- Typage des valeurs

const RX = {
  int: /^[-+]?\d+$/,
  decComma: /^[-+]?\d+,\d+$/,
  decPoint: /^[-+]?\d+\.\d+$/,
  numSp: /^[-+]?\d{1,3}(?:[   .]\d{3})+(?:,\d+)?$/,
  dateFr: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
  dateFr2: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  dateIso: /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/,
  sci: /^[-+]?\d+(?:[.,]\d+)?E[-+]?\d+$/i,
};

/** Famille (num, date, text, empty) et sous-type d'une valeur. */
export function classify(v) {
  const t = v.trim();
  if (!t) return { fam: 'empty', sub: '' };
  if (RX.int.test(t)) return { fam: 'num', sub: 'int' };
  if (RX.decComma.test(t)) return { fam: 'num', sub: 'comma' };
  if (RX.decPoint.test(t)) return { fam: 'num', sub: 'point' };
  if (RX.numSp.test(t)) return { fam: 'num', sub: 'grouped' };
  if (RX.sci.test(t)) return { fam: 'num', sub: 'sci' };
  let m;
  if ((m = RX.dateFr.exec(t))) return { fam: 'date', sub: 'JJ/MM/AAAA', d: +m[1], mo: +m[2], y: +m[3] };
  if ((m = RX.dateIso.exec(t))) return { fam: 'date', sub: 'AAAA-MM-JJ', d: +m[3], mo: +m[2], y: +m[1] };
  if ((m = RX.dateFr2.exec(t))) return { fam: 'date', sub: 'JJ/MM/AA', d: +m[1], mo: +m[2], y: 2000 + +m[3] };
  return { fam: 'text', sub: '' };
}

export const validDate = (d, mo, y) => mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(y, mo, 0).getDate();

const RX_MOJIBAKE = /Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|â€|Â[ -¿]|ï»¿/;
export const RX_NBSP = /[  ]/;
export const RX_ZERO_WIDTH = /[​-‍⁠﻿]/;

// ---------------------------------------------------------------- Analyse complète

/**
 * Analyse un fichier CSV.
 * @param {Uint8Array} bytes
 * @param {{ expected?: 'ansi' | 'utf8', encOverride?: string, delimOverride?: string }} options
 *   expected : encodage attendu ; encOverride / delimOverride : 'auto' ou valeur forcée
 */
export function analyze(bytes, { expected: exp = 'ansi', encOverride = 'auto', delimOverride = 'auto' } = {}) {
  const dec = decode(bytes, encOverride);
  const text = dec.text;
  const dg = detectDelimiter(text);
  const delim = delimOverride === 'auto' ? dg.d : delimOverride;
  const recs = parseCSV(text, delim);

  const groups = new Map(); // code -> { code, sev, t, h, locs: [], details: [] }
  const cellIss = new Map(); // "r:c" -> [codes]
  const rowIss = new Map(); // r -> [codes]
  const add = (code, loc, detail, sevOverride) => {
    const def = DEFS[code];
    let g = groups.get(code);
    if (!g) {
      g = { code, sev: sevOverride || def.sev, t: def.t, h: def.h, locs: [], details: [] };
      groups.set(code, g);
    }
    if (detail && g.details.length < 6 && !g.details.includes(detail)) g.details.push(detail);
    if (loc) {
      g.locs.push(loc);
      if (loc.c !== undefined && loc.r !== undefined) {
        const k = `${loc.r}:${loc.c}`;
        if (!cellIss.has(k)) cellIss.set(k, []);
        if (!cellIss.get(k).includes(code)) cellIss.get(k).push(code);
      }
      if (loc.r !== undefined) {
        if (!rowIss.has(loc.r)) rowIss.set(loc.r, []);
        if (!rowIss.get(loc.r).includes(code)) rowIss.get(loc.r).push(code);
      }
    }
  };
  const recForLine = (ln) => {
    let lo = 0;
    let hi = recs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = recs[mid];
      if (ln < r.line) hi = mid - 1;
      else if (ln > r.lineEnd) lo = mid + 1;
      else return mid;
    }
    return undefined;
  };

  // --- Encodage
  if (dec.forced) add('enc-forced', null, `Lecture en ${dec.label}`);
  if (dec.enc === 'ascii') add('enc-ascii');
  else if (dec.enc === 'windows-1252') add(exp === 'ansi' ? 'enc-ansi-ok' : 'enc-ansi');
  else if (dec.enc === 'utf-8') {
    if (dec.bom === 'utf-8') add('enc-utf8-bom', null, null, exp === 'ansi' ? 'warning' : 'info');
    else add(exp === 'ansi' ? 'enc-utf8' : 'enc-utf8-ok');
  } else if (dec.enc.startsWith('utf-16')) add(dec.guessed16 ? 'enc-utf16-nobom' : 'enc-utf16');
  else if (dec.enc === 'mixed') {
    const s = dec.scan;
    const minority = s.utf8Lines.size <= s.badLines.size ? s.utf8Lines : s.badLines;
    add('enc-mixed', null, `${s.utf8Lines.size} ligne(s) avec UTF-8, ${s.badLines.size} ligne(s) avec ANSI`);
    [...minority]
      .sort((a, b) => a - b)
      .forEach((ln) => {
        const r = recForLine(ln);
        if (r !== undefined) add('enc-mixed', { r, line: ln });
      });
  }
  if (dec.scan && dec.scan.undefLines.size && (dec.enc === 'windows-1252' || dec.enc === 'mixed')) {
    [...dec.scan.undefLines].forEach((ln) => {
      const r = recForLine(ln);
      if (r !== undefined) add('enc-undef', { r, line: ln });
    });
  }

  // --- Fins de ligne
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  const eolKinds = [crlf, lf, cr].filter((x) => x > 0).length;
  if (eolKinds > 1) add('eol-mixed', null, `CRLF : ${crlf} · LF : ${lf} · CR : ${cr}`);
  else if (lf > 0) add('eol-lf');
  else if (cr > 0) add('eol-cr');
  const eolLabel = eolKinds > 1 ? 'Mixtes' : crlf ? 'CRLF (Windows)' : lf ? 'LF (Unix)' : cr ? 'CR (Mac)' : '—';
  if (text.length && !/[\r\n]$/.test(text)) add('no-final-eol');

  if (delimOverride === 'auto' && dg.conf < 0.7 && recs.length > 2) {
    add('delim-guess', null, `Confiance ${(dg.conf * 100).toFixed(0)} %`);
  }

  // --- En-tête
  const header = recs[0] ? recs[0].fields : [];
  let expected = header.length;
  while (expected > 1 && header[expected - 1].v.trim() === '' && !header[expected - 1].q) expected--;
  for (let c = expected; c < header.length; c++) {
    add('header-trailing', { r: 0, c }, `${header.length - expected} séparateur(s) en trop`);
  }
  const seen = new Map();
  for (let c = 0; c < expected; c++) {
    const name = header[c].v;
    if (!name.trim()) add('header-empty', { r: 0, c }, `Colonne ${colLetter(c)}`);
    else {
      const k = name.trim().toLowerCase();
      if (seen.has(k)) {
        add('header-dup', { r: 0, c }, `« ${name.trim()} » (colonnes ${colLetter(seen.get(k))} et ${colLetter(c)})`);
        add('header-dup', { r: 0, c: seen.get(k) });
      } else seen.set(k, c);
      if (name !== name.trim()) add('header-ws', { r: 0, c }, JSON.stringify(name));
      const cl = classify(name);
      if (cl.fam === 'num' || cl.fam === 'date') add('header-numeric', { r: 0, c }, name);
    }
  }

  // --- Lignes
  const isEmptyRec = (rec) => rec.fields.length === 1 && !rec.fields[0].q && rec.fields[0].v.trim() === '';
  let lastNonEmpty = recs.length - 1;
  while (lastNonEmpty > 0 && isEmptyRec(recs[lastNonEmpty])) lastNonEmpty--;
  const dataIdx = [];
  const dupMap = new Map();
  let maxCols = header.length;
  recs.forEach((rec, r) => {
    rec.empty = isEmptyRec(rec);
    rec.issues.forEach((pi) =>
      add(
        pi.code,
        { r, c: pi.c },
        pi.code === 'unclosed-quote' ? `Ouvert ligne ${rec.line}, colonne ${colLetter(pi.c)}` : null,
      ),
    );
    if (r === 0) return;
    if (rec.empty) {
      add(r > lastNonEmpty ? 'eof-empty' : 'empty-line', { r });
      return;
    }
    dataIdx.push(r);
    const f = rec.fields;
    maxCols = Math.max(maxCols, f.length);
    if (f.every((x) => x.v === '')) add('only-delims', { r });
    if (f.length > expected) {
      const extra = f.slice(expected);
      if (extra.every((x) => x.v.trim() === '')) {
        add('trailing-delim', { r, c: expected }, `${extra.length} séparateur(s) en trop`);
      } else {
        add('too-many-cols', { r, c: expected }, `${f.length} valeurs au lieu de ${expected}`);
      }
    } else if (f.length < expected) {
      add('too-few-cols', { r }, `${f.length} valeurs au lieu de ${expected}`);
    }
    const key = f.map((x) => x.v).join('\u0001');
    if (dupMap.has(key)) add('dup-row', { r }, null);
    else dupMap.set(key, r);
  });
  if (!dataIdx.length) add('no-data');
  // Doublons : ligne d'origine
  recs.forEach((rec, r) => {
    if (rowIss.get(r) && rowIss.get(r).includes('dup-row')) {
      rec.dupOf = recs[dupMap.get(rec.fields.map((x) => x.v).join('\u0001'))].line;
    }
  });

  // --- Cellules
  const checkCell = (v, r, c) => {
    if (!v) return;
    if (/^[ \t]|[ \t]$/.test(v) && r !== 0) add('ws-edge', { r, c });
    if (/\S {2,}\S/.test(v)) add('double-space', { r, c });
    if (RX_NBSP.test(v)) add('nbsp', { r, c });
    if (RX_ZERO_WIDTH.test(v)) add('zero-width', { r, c });
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v)) add('control', { r, c });
    if (/[\u0080-\u009F]/.test(v)) add('c1-control', { r, c });
    if (delim !== '\t' && /\t/.test(v)) add('tab-in-cell', { r, c });
    if (/[\r\n]/.test(v)) add('multiline', { r, c });
    if (/�/.test(v)) add('replacement', { r, c });
    const mj = RX_MOJIBAKE.exec(v);
    if (mj) add('mojibake', { r, c }, `« ${mj[0]} » dans ${JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v)}`);
    if (/[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]/.test(v)) add('question-mark', { r, c }, v.length > 40 ? v.slice(0, 40) + '…' : v);
    if (exp === 'ansi') {
      const bad = [...new Set([...v].filter((ch) => !isAnsiChar(ch)))];
      if (bad.length) {
        add(
          'not-ansi',
          { r, c },
          bad
            .slice(0, 5)
            .map((ch) => `« ${ch} » U+${hex(ch.codePointAt(0), 4)}`)
            .join(', '),
        );
      }
    }
    const t = v.trim();
    if (/^[=+\-@]/.test(t) && classify(t).fam !== 'num') add('formula', { r, c });
    if (RX.sci.test(t)) add('sci', { r, c }, t);
    if (v.length > 255) add('long-cell', { r, c });
  };
  header.forEach((f, c) => checkCell(f.v, 0, c));
  dataIdx.forEach((r) => recs[r].fields.forEach((f, c) => checkCell(f.v, r, c)));

  // --- Colonnes
  const cols = [];
  for (let c = 0; c < expected; c++) {
    const st = { fam: {}, sub: {}, filled: 0, total: 0, maxLen: 0, cls: [] };
    dataIdx.forEach((r) => {
      const f = recs[r].fields[c];
      st.total++;
      if (!f) {
        st.cls.push(null);
        return;
      }
      const cl = classify(f.v);
      st.cls.push(cl);
      st.maxLen = Math.max(st.maxLen, f.v.length);
      if (cl.fam === 'empty') return;
      st.filled++;
      st.fam[cl.fam] = (st.fam[cl.fam] || 0) + 1;
      st.sub[`${cl.fam}:${cl.sub}`] = (st.sub[`${cl.fam}:${cl.sub}`] || 0) + 1;
    });
    let dom = 'empty';
    if (st.filled) {
      const [fam, n] = Object.entries(st.fam).sort((a, b) => b[1] - a[1])[0];
      dom = n / st.filled >= 0.7 ? fam : 'mixed';
    }
    st.dom = dom;
    if (!st.filled && st.total) add('empty-col', { r: 0, c }, header[c].v || colLetter(c));
    // Anomalies de type
    if ((dom === 'num' || dom === 'date' || dom === 'text') && st.filled >= 3) {
      const comma = st.sub['num:comma'] || 0;
      const point = st.sub['num:point'] || 0;
      const minorityDec = comma && point ? (comma >= point ? 'point' : 'comma') : null;
      const dateSubs = Object.keys(st.sub).filter((k) => k.startsWith('date:'));
      let majorDate = null;
      if (dateSubs.length > 1) majorDate = dateSubs.sort((a, b) => st.sub[b] - st.sub[a])[0].slice(5);
      const colName = header[c].v.trim();
      dataIdx.forEach((r, i) => {
        const cl = st.cls[i];
        if (!cl || cl.fam === 'empty') return;
        if (dom !== 'text' && cl.fam !== dom) {
          add('type-mismatch', { r, c }, `Colonne « ${colName || colLetter(c)} » : ${FAM_LABEL[dom]} attendu`);
        }
        if (dom === 'num' && minorityDec && cl.sub === minorityDec) {
          add('mixed-decimal', { r, c }, `« ${colName} » : ${comma} avec virgule, ${point} avec point`);
        }
        if (dom === 'date' && majorDate && cl.fam === 'date' && cl.sub !== majorDate) {
          add('mixed-date', { r, c }, `« ${colName} » : majoritairement ${majorDate}`);
        }
      });
    }
    dataIdx.forEach((r, i) => {
      const cl = st.cls[i];
      if (cl && cl.fam === 'date' && !validDate(cl.d, cl.mo, cl.y)) {
        add('invalid-date', { r, c }, recs[r].fields[c].v.trim());
      }
    });
    if (st.total >= 10 && st.filled / st.total >= 0.9 && st.filled < st.total) {
      dataIdx.forEach((r, i) => {
        const cl = st.cls[i];
        if (cl && cl.fam === 'empty') add('empty-in-full', { r, c });
      });
    }
    cols.push(st);
  }

  // Gravité maximale par ligne et par cellule
  const maxSev = (codes) =>
    codes.reduce((m, k) => {
      const s = groups.get(k).sev;
      return !m || SEV_RANK[s] > SEV_RANK[m] ? s : m;
    }, null);
  const rowSev = new Map();
  const cellSev = new Map();
  rowIss.forEach((codes, r) => rowSev.set(r, maxSev(codes)));
  cellIss.forEach((codes, k) => cellSev.set(k, maxSev(codes)));

  const counts = { error: 0, warning: 0, info: 0 };
  groups.forEach((g) => {
    counts[g.sev] += g.locs.length || 1;
  });

  return {
    options: { expected: exp, encOverride, delimOverride },
    size: bytes.length,
    dec,
    delim,
    dg,
    recs,
    header,
    expected,
    maxCols,
    dataIdx,
    cols,
    groups,
    cellIss,
    rowIss,
    rowSev,
    cellSev,
    counts,
    eol: { crlf, lf, cr, label: eolLabel },
  };
}

// ---------------------------------------------------------------- Lecture du résultat

/** Encodage conforme à l'attendu ? Classe de la carte : ok | warn | err. */
export function encodingStatus(res) {
  const { enc } = res.dec;
  const exp = res.options.expected;
  const ok =
    (exp === 'ansi' && (enc === 'windows-1252' || enc === 'ascii')) ||
    (exp === 'utf8' && (enc === 'utf-8' || enc === 'ascii'));
  return { ok, cls: enc === 'mixed' || enc.startsWith('utf-16') ? 'err' : ok ? 'ok' : 'warn' };
}

/** Anomalies regroupées par type, les plus graves puis les plus fréquentes en premier. */
export function sortedGroups(res) {
  return [...res.groups.values()].sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev] || b.locs.length - a.locs.length);
}

/** Nombre de lignes de données concernées par au moins une anomalie. */
export const rowsWithIssues = (res) => [...res.rowIss.keys()].filter((r) => r > 0).length;

/** Verdict global : 'error' | 'warning' | 'ok'. */
export const verdict = (res) => (res.counts.error ? 'error' : res.counts.warning ? 'warning' : 'ok');

/** Résumé enregistré avec un fichier récent (affiché sans relire le fichier). */
export function summarize(res) {
  return {
    encoding: res.dec.label,
    delim: res.delim,
    rows: res.dataIdx.length,
    cols: res.expected,
    counts: { ...res.counts },
  };
}

/** Emplacement lisible d'une anomalie : « L12 · Montant », « En-tête · B ». */
export function locLabel(res, loc) {
  if (loc.r === undefined) return '';
  const rec = res.recs[loc.r];
  let s = loc.r === 0 ? 'En-tête' : `L${loc.line || rec.line}`;
  if (loc.c !== undefined) {
    const h = res.header[loc.c];
    s += ` · ${loc.c >= res.expected ? `+${loc.c - res.expected + 1}` : (h && h.v.trim()) || colLetter(loc.c)}`;
  }
  return s;
}

/** Lignes de données affichées selon la recherche et le filtre « lignes en anomalie ». */
export function filterRows(res, { search = '', onlyIssues = false } = {}) {
  const q = search.trim().toLowerCase();
  const out = [];
  for (let r = 1; r < res.recs.length; r++) {
    if (onlyIssues && !res.rowIss.has(r)) continue;
    if (q && !res.recs[r].fields.some((f) => f.v.toLowerCase().includes(q))) continue;
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- Visuel d'Excel

/**
 * Valeur affichée par Excel (paramètres régionaux français, format « Standard ») :
 * nombres et dates convertis et alignés à droite, notation scientifique au-delà de 11 chiffres.
 */
export function excelValue(v) {
  const t = v.replace(/[\r\n]+/g, ' ');
  const s = t.trim();
  let m;
  const num = (str) => {
    const x = parseFloat(str.replace(/ /g, '').replace(',', '.'));
    const ax = Math.abs(x);
    if (ax !== 0 && (ax >= 1e11 || ax < 1e-9)) {
      const [mant, ex] = x.toExponential(5).split('e');
      return `${(+mant).toString().replace('.', ',')}E${ex[0] === '-' ? '-' : '+'}${ex.replace(/^[-+]/, '').padStart(2, '0')}`;
    }
    return (+x.toPrecision(11)).toString().replace('.', ',');
  };
  if (
    /^[-+]?\d{1,3}( \d{3})+(,\d+)?$/.test(s) ||
    /^[-+]?\d+(,\d+)?$/.test(s) ||
    /^[-+]?\d+(,\d+)?E[-+]?\d+$/i.test(s)
  ) {
    return { v: num(s), n: true };
  }
  if (
    (m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s)) &&
    validDate(+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3])
  ) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { v: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`, n: true, date: true };
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)) && validDate(+m[3], +m[2], +m[1])) {
    return { v: `${m[3]}/${m[2]}/${m[1]}`, n: true, date: true };
  }
  if (/^[-+]?\d+(,\d+)?\s?%$/.test(s)) return { v: s.replace(/\s/, ''), n: true };
  return { v: t, n: false };
}

/**
 * Ouverture du fichier par double-clic dans Excel (FR) : lecture en ANSI sauf BOM UTF-8,
 * découpe uniquement sur « ; ».
 */
export function excelRecords(bytes, res) {
  const d = res.dec;
  const hasBom = d.bom === 'utf-8';
  const text = hasBom
    ? new TextDecoder('utf-8').decode(bytes.subarray(3))
    : d.enc.startsWith('utf-16')
      ? d.text
      : decodeAnsi(bytes);
  const notes = [];
  if (!hasBom && (d.enc === 'utf-8' || d.enc === 'mixed')) {
    notes.push("Le fichier n'a pas de BOM : Excel le lit en ANSI, les accents UTF-8 apparaissent donc cassés.");
  }
  if (res.delim !== ';') {
    notes.push(
      `Le séparateur du fichier est ${delimName(res.delim)} : Excel (FR) ne découpe que sur « ; », tout se retrouve donc dans la colonne A.`,
    );
  }
  return { recs: parseCSV(text, ';'), notes };
}

// ---------------------------------------------------------------- Conversion

/**
 * Fichier ré-encodé : ANSI (Windows-1252) ou UTF-8 avec BOM, fins de ligne CRLF au besoin.
 * @returns {{ bytes: Uint8Array, lost: number, suffix: string }}
 */
export function convert(res, encoding, crlf = true) {
  let t = res.dec.text.replace(/^﻿/, '');
  if (crlf) t = t.replace(/\r\n|\r|\n/g, '\r\n');
  if (encoding === 'ansi') return { ...encodeAnsi(t), suffix: '_ANSI' };
  const body = new TextEncoder().encode(t);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(body, 3);
  return { bytes, lost: 0, suffix: '_UTF8' };
}

/** « fichier.csv » -> « fichier_ANSI.csv ». */
export const convertedName = (name, suffix) => `${String(name).replace(/\.[^.]+$/, '') || 'export'}${suffix}.csv`;

// ---------------------------------------------------------------- Fichiers refusés

/** Fichier binaire reconnu par sa signature (classeur, archive, PDF, image) : ce n'est pas un CSV. */
export function binaryKind(b, name = '') {
  const sig = (...x) => x.every((v, i) => b[i] === v);
  const e = ((String(name).match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
  if (sig(0x50, 0x4b, 0x03, 0x04) || sig(0x50, 0x4b, 0x05, 0x06)) {
    if (e === 'xlsx' || e === 'xlsm') return 'un classeur Excel (.xlsx)';
    if (e === 'ods') return 'un classeur LibreOffice (.ods)';
    if (e === 'docx') return 'un document Word (.docx)';
    return 'une archive ZIP';
  }
  if (sig(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'un ancien classeur Excel (.xls)';
  if (sig(0x25, 0x50, 0x44, 0x46)) return 'un PDF';
  if (sig(0x89, 0x50, 0x4e, 0x47) || sig(0xff, 0xd8, 0xff)) return 'une image';
  if (['xlsx', 'xlsm', 'xls', 'ods', 'xlsb'].includes(e)) return `un classeur (.${e})`;
  return null;
}

// ---------------------------------------------------------------- Exemple

export const DEMO_NAME = 'exemple_avec_erreurs.csv';

/** Petit fichier truffé d'erreurs : ANSI avec une ligne UTF-8, une fin de ligne LF, décalages… */
export function demoBytes() {
  const lines = [
    ['ansi', 'Code;Libellé;Montant;Date opération;Ville;Commentaire;'],
    ['ansi', 'A001;Café crème;12,50;03/01/2024;Paris;RAS'],
    ['ansi', 'A002;Thé vert ;8,90;04/01/2024;Lyon;'],
    ['ansi', 'A003;Croissant;1.20;05/01/2024;Marseille;prix à vérifier;'],
    ['ansi', 'A004;Pain au chocolat;1,40;31/13/2024;Nantes;date erronée'],
    ['utf8', 'A005;Éclair café;3,80;06/01/2024;Besançon;ligne ajoutée en UTF-8'],
    ['ansi', 'A006;Brioche;2,10;07/01/2024;Lille'],
    ['ansi', ''],
    ['ansi', 'A007;Chausson;1,95;08/01/2024;Toulouse;Montant; avec point-virgule non protégé'],
    ['ansi', 'A008;Madeleine;0,90;2024-01-09;Nice;format de date différent'],
    ['ansi', 'A009;Macaron framboise;1 250,00;10/01/2024;Bordeaux;espace insécable'],
    ['ansi', 'A010;CafÃ© double;2,20;11/01/2024;Rennes;accent cassé (double encodage)'],
    ['ansi', 'A011;Tarte;4,50;12/01/2024;Strasbourg;"Recette ""maison"""'],
    ['ansi', 'A012;Flan 12" pouces;3,30;13/01/2024;Dijon;guillemet isolé'],
    ['ansi', 'A013;Gaufre;inconnu;14/01/2024;Reims;texte dans une colonne numérique'],
    ['ansi', 'A014;Cr?pe;2,00;15/01/2024;Brest;caractère perdu'],
    ['ansi', 'A015;Beignet;1,23E+11;16/01/2024;Metz;notation scientifique Excel'],
    ['ansi', 'A006;Brioche;2,10;07/01/2024;Lille'],
    ['ansi', ';;;;;'],
    ['ansi', 'A016;Chouquette;0,50;17/01/2024;=SOMME(A1:A3);injection formule'],
  ];
  const chunks = lines.map(([enc, l], i) => {
    const eol = i === 6 ? '\n' : '\r\n';
    return enc === 'utf8' ? new TextEncoder().encode(l + eol) : encodeAnsi(l + eol).bytes;
  });
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ---------------------------------------------------------------- Empreinte

/** Empreinte FNV-1a 32 bits (repérer un fichier déjà ouvert). */
export function fingerprint(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
