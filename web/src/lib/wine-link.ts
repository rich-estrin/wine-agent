import type { Wine } from '../types';

// The open review is named on the page URL as `?wine=<post slug>`, so a link to
// it can be shared and reopens it. Embedded in WordPress the shortcode inlines
// the linked review (`__WINE_AGENT_WINE__`) so it opens without a request, and
// hands an editor the "Edit Brand Review" link template (`__WINE_AGENT_EDIT__`),
// which this keeps in the admin bar for whichever review is open.

const PARAM = 'wine';
const NODE_ID = 'wp-admin-bar-wine-agent-edit-review';

/** What names a wine in the URL: its post slug, or its id when it has none
 *  (standalone data). The plugin resolves either. */
export function wineKey(wine: Wine): string {
  return wine.slug || wine.id;
}

export function wineParam(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM) || null;
}

/** The URL with `?wine=` set to this key, or removed when null. */
export function urlWithWine(key: string | null): string {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set(PARAM, key);
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

/** The review the page was linked to, when the shortcode inlined it. */
export function linkedWine(): Wine | null {
  const wine = (window as any).__WINE_AGENT_WINE__ as Wine | null | undefined;
  const key = wineParam();
  return wine && key && (key === wine.slug || key === wine.id) ? wine : null;
}

/** Show "Edit Brand Review" in the WordPress admin bar for the open wine, and
 *  take it away when none is. A no-op off WordPress or for non-editors. */
export function syncAdminBarEdit(wine: Wine | null): void {
  const edit = (window as any).__WINE_AGENT_EDIT__ as { label: string; url: string } | null | undefined;
  const bar = document.getElementById('wp-admin-bar-root-default');
  if (!edit || !bar) return;

  let node = document.getElementById(NODE_ID);
  if (!wine) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement('li');
    node.id = NODE_ID;
    const link = document.createElement('a');
    link.className = 'ab-item';
    node.appendChild(link);
    // Beside core's "Edit Page", where the server-rendered node sits.
    const after = document.getElementById('wp-admin-bar-edit');
    if (after?.parentElement === bar) after.after(node);
    else bar.appendChild(node);
  }
  const link = node.querySelector('a')!;
  link.textContent = edit.label;
  link.href = edit.url.replace('__ID__', encodeURIComponent(wine.id));
}
