// Training : petits helpers utilisés par les fichiers de contenu (blocs de code colorés, tableaux,
// encadrés). Repris de la formation OLAP & APEX Training ; aucun accès au DOM (testable sous Node).

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const KW_SQL = new Set(
  (
    'select from where group by order having rollup cube grouping sets join inner left right outer full cross on as and or not in is null ' +
    'case when then else end with over partition rows range between unbounded preceding following current row create replace table view ' +
    'materialized primary key foreign references insert into values update set delete merge using matched begin declare exception raise ' +
    'return function procedure package body if elsif loop for commit rollback distinct union all exists like number varchar2 date integer ' +
    'constraint default enable query rewrite build immediate refresh complete fast force demand alter index bitmap sequence identity ' +
    'generated always nulls first last asc desc fetch offset only true false boolean clob timestamp char dimension level hierarchy child ' +
    'of attribute determines columns members children descendants crossjoin non empty grant execute to while type out nocopy pragma ' +
    'autonomous_transaction sysdate systimestamp others no_data_found interval day month year'
  ).split(' '),
);

const KW_JS = new Set(
  (
    'const let var function return if else new true false null undefined this await async for of in typeof instanceof try catch ' +
    'finally throw class extends switch case break continue default'
  ).split(' '),
);

// Un regex par langage : commentaires | chaînes | nombres | variables (binds / substitutions APEX) | mots (+ parenthèse = fonction)
const RE = {
  sql: /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"[^"\n]*")|(\b\d+(?:\.\d+)?\b)|(:[A-Za-z_][\w$#]*|&[A-Za-z_][\w$#]*\.|#[A-Z_][A-Z0-9_$]*#|\[[^\]\n]+\])|([A-Za-z_][\w$#]*)(\s*\()?/g,
  js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(&[A-Za-z_][\w$#]*\.|\$v|\$s|\bapex\b)|([A-Za-z_$][\w$]*)(\s*\()?/g,
};

export function highlight(src, lang) {
  if (lang === 'text') return esc(src);
  const re = lang === 'js' ? RE.js : RE.sql;
  const kw = lang === 'js' ? KW_JS : KW_SQL;
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    out += esc(src.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tok-num">${esc(m[3])}</span>`;
    else if (m[4]) out += `<span class="tok-var">${esc(m[4])}</span>`;
    else if (m[5]) {
      const word = m[5];
      const paren = m[6] || '';
      if (kw.has(word.toLowerCase()) && !(lang === 'js' && paren))
        out += `<span class="tok-kw">${esc(word)}</span>${esc(paren)}`;
      else if (paren) out += `<span class="tok-fn">${esc(word)}</span>${esc(paren)}`;
      else out += esc(word);
    }
  }
  return out + esc(src.slice(last));
}

export function dedent(src) {
  const lines = String(src).replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

const LANG_LABEL = { sql: 'SQL', plsql: 'PL/SQL', js: 'JavaScript', mdx: 'MDX', text: 'Texte', apex: 'APEX' };

/** Bloc de code coloré + bouton « Copier » (le clic est géré par la page de formation). */
function code(lang, src) {
  const clean = dedent(src);
  const hlLang = lang === 'js' ? 'js' : lang === 'text' ? 'text' : 'sql';
  return (
    `<div class="code"><span class="lang">${LANG_LABEL[lang] || lang}</span>` +
    '<button class="copy" type="button">Copier</button>' +
    `<pre><code>${highlight(clean, hlLang)}</code></pre></div>`
  );
}

/** Tableau : en-têtes préfixés par « # » = colonne numérique (alignée à droite). */
function tbl(head, rows, caption) {
  const num = head.map((h) => h.charAt(0) === '#');
  const th = head.map((h, i) => `<th${num[i] ? ' class="n"' : ''}>${num[i] ? h.slice(1) : h}</th>`).join('');
  const body = rows
    .map((r) => {
      const isTotal = r[0] === '__total__';
      const cells = isTotal ? r.slice(1) : r;
      return `<tr${isTotal ? ' class="total"' : ''}>${cells
        .map((c, i) => `<td${num[i] ? ' class="n"' : ''}>${c}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return (
    `<div class="tbl"><table>${caption ? `<caption>${caption}</caption>` : ''}` +
    `<thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`
  );
}

/** Encadré : tip (bon réflexe), warn (piège), info, analogy. */
function callout(kind, title, html) {
  return `<div class="callout ${kind}"><b>${title}</b><div>${html}</div></div>`;
}

export const H = { esc, code, tbl, callout, highlight };
