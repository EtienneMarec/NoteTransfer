import type { SiteConfig } from '../core/adapter';
import type { HttpRequest, RawResponse, Transport } from '../core/http/client';

/**
 * Exécutée dans la page du site (monde MAIN), comme une requête du site lui-même.
 * Le jeton est lu dans le cookie et ajouté à l'en-tête ici : il n'est jamais renvoyé à l'extension.
 * Cette fonction est sérialisée par scripting.executeScript : elle ne doit rien capturer de l'extérieur.
 */
export async function fetchFromPage(
  req: { url: string; method: string; headers: Record<string, string>; body: string | null },
  auth: { cookie: string; header: string; prefix: string },
): Promise<{ status: number; headers: Record<string, string>; body: string } | { error: string }> {
  try {
    const prefix = auth.cookie + '=';
    const raw = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(prefix));
    const headers: Record<string, string> = { ...req.headers };
    if (raw) headers[auth.header] = auth.prefix + decodeURIComponent(raw.slice(prefix.length));
    const res = await fetch(req.url, { method: req.method, headers, body: req.body });
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k] = v;
    });
    return { status: res.status, headers: out, body: await res.text() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const matches = (url: string | undefined, patterns: string[]) =>
  !!url && patterns.some((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(url));

/** Onglets utilisés pour les requêtes ; ceux que l'extension a ouverts sont refermés à la fin. */
export class TabPool {
  private created = new Set<number>();

  async tabFor(config: SiteConfig): Promise<number> {
    const tabs = await browser.tabs.query({ url: config.tabPatterns });
    const ready = tabs.find((t) => t.id !== undefined && t.status === 'complete' && !t.discarded && matches(t.url, config.tabPatterns));
    if (ready?.id !== undefined) return ready.id;

    const tab = await browser.tabs.create({ url: config.homeUrl, active: false });
    if (tab.id === undefined) throw new Error('Impossible d’ouvrir un onglet');
    this.created.add(tab.id);
    await waitComplete(tab.id);
    return tab.id;
  }

  async closeCreated(): Promise<void> {
    const ids = [...this.created];
    this.created.clear();
    await Promise.all(ids.map((id) => browser.tabs.remove(id).catch(() => undefined)));
  }

  forget(tabId: number) {
    this.created.delete(tabId);
  }
}

function waitComplete(tabId: number, timeoutMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('Le site met trop de temps à charger'));
    }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.get(tabId).then((t) => t.status === 'complete' && listener(tabId, { status: 'complete' }));
  });
}

export function siteTransport(config: SiteConfig, pool: TabPool): Transport {
  return async (req: HttpRequest): Promise<RawResponse> => {
    const tabId = await pool.tabFor(config);
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: fetchFromPage,
      args: [{ url: req.url, method: req.method ?? 'GET', headers: req.headers ?? {}, body: req.body ?? null }, config.auth],
    });
    const value = result?.result as Awaited<ReturnType<typeof fetchFromPage>> | undefined;
    if (!value) throw new Error('Aucune réponse de l’onglet du site');
    if ('error' in value) throw new Error(value.error);
    return value;
  };
}

/** Transport pour les API officielles (Trakt, TMDB) : fetch direct depuis le background. */
export const fetchTransport: Transport = async (req, signal) => {
  const res = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers ?? {}, body: req.body ?? null, signal });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { status: res.status, headers, body: await res.text() };
};
