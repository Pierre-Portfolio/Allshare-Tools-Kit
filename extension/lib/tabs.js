// Onglets des pages de l'extension ouvertes en grand (tableau de bord Prisme, formation Training).

/**
 * Affiche une page de l'extension : réutilise son onglet s'il est déjà ouvert (adresse changée au
 * besoin, sans rechargement si elle est identique), sinon en ouvre un nouveau.
 * @param {string} base  adresse de la page sans paramètres (chrome.runtime.getURL)
 * @param {string} url   adresse complète à afficher
 */
export async function showExtensionPage(base, url) {
  try {
    const [ctx] = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).filter(
      (c) => c.documentUrl && c.documentUrl.startsWith(base) && c.tabId >= 0,
    );
    if (ctx) {
      await chrome.tabs.update(ctx.tabId, ctx.documentUrl === url ? { active: true } : { url, active: true });
      if (ctx.windowId >= 0) await chrome.windows.update(ctx.windowId, { focused: true });
      return;
    }
  } catch {
    /* onglet fermé entre-temps : on en ouvre un nouveau */
  }
  await chrome.tabs.create({ url });
}
