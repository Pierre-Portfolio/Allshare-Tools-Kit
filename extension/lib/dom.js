// Petits outils d'interface partagés par les pages de l'extension (panneau, tableaux de bord, réglages).

export const $ = (id) => document.getElementById(id);

/** Élément avec ses propriétés (dataset compris) et ses enfants ; null, undefined et false sont ignorés. */
export function el(tag, { dataset, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

let toastTimer = 0;
/** Message éphémère dans l'élément #toast de la page. */
export function toast(text, ms = 2500) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Texte sûr dans du HTML (contenu ou valeur d'attribut). */
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Télécharge des données (texte ou octets) sous un nom de fichier. */
export function downloadBlob(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000); // le téléchargement d'un gros fichier démarre parfois tard
}
