import { HttpError, PauseError } from '../errors';
import { silentLogger, type Logger } from '../log';
import { detectBlock, type RawResponse } from './block';

export type { RawResponse };

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Vrai si la réponse attendue est du JSON (sert à détecter les pages de blocage). */
  expectJson?: boolean;
}

/** Transport réel : fetch depuis le background, ou relais par un onglet du site. */
export type Transport = (req: HttpRequest, signal: AbortSignal) => Promise<RawResponse>;

export interface HostPolicy {
  /** Délai aléatoire entre deux requêtes vers le même hôte. */
  minDelayMs: number;
  maxDelayMs: number;
  /** Nombre total de tentatives pour une requête (429, 5xx, erreur réseau). */
  maxAttempts: number;
  /** Premier délai de backoff, doublé à chaque échec. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_POLICY: HostPolicy = {
  minDelayMs: 2000,
  maxDelayMs: 4000,
  maxAttempts: 5,
  backoffBaseMs: 4000,
  backoffMaxMs: 64_000,
};

export interface Clock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }),
};

export interface HttpClient {
  request(req: HttpRequest, signal: AbortSignal): Promise<RawResponse>;
}

export interface HttpClientOptions {
  transport: Transport;
  policyFor?: (host: string) => HostPolicy;
  clock?: Clock;
  log?: Logger;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function retryAfterMs(res: RawResponse, now: number): number | undefined {
  const key = Object.keys(res.headers).find((k) => k.toLowerCase() === 'retry-after');
  const raw = key === undefined ? undefined : res.headers[key];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Client HTTP partagé par tous les adaptateurs :
 * - une seule requête à la fois par hôte, espacées d'un délai aléatoire ;
 * - backoff progressif sur 429, 5xx et erreurs réseau, puis pause propre ;
 * - détection des pages CAPTCHA / challenge, qui mettent en pause sans réessayer.
 */
export function createHttpClient({
  transport,
  policyFor = () => DEFAULT_POLICY,
  clock = realClock,
  log = silentLogger,
}: HttpClientOptions): HttpClient {
  const tails = new Map<string, Promise<unknown>>();
  const lastEnd = new Map<string, number>();

  async function attempt(host: string, policy: HostPolicy, req: HttpRequest, signal: AbortSignal) {
    for (let n = 1; ; n++) {
      const previous = lastEnd.get(host);
      if (previous !== undefined) {
        const gap = policy.minDelayMs + clock.random() * (policy.maxDelayMs - policy.minDelayMs);
        const wait = previous + gap - clock.now();
        if (wait > 0) await clock.sleep(wait, signal);
      }

      let res: RawResponse | undefined;
      let failure: string;
      try {
        res = await transport(req, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        failure = `erreur réseau (${e instanceof Error ? e.message : String(e)})`;
      } finally {
        lastEnd.set(host, clock.now());
      }

      if (res) {
        const block = detectBlock(res, req.expectJson ?? true);
        if (block) {
          throw new PauseError('blocked', `${host} affiche une vérification (${block}).`, { reason: block, url: req.url });
        }
        if (!RETRYABLE_STATUS.has(res.status)) {
          if (res.status >= 400) throw new HttpError(res.status, `${host} a répondu ${res.status}`);
          return res;
        }
        failure = `statut ${res.status}`;
      }

      if (n >= policy.maxAttempts) {
        const kind = res?.status === 429 ? 'rate_limited' : 'network';
        throw new PauseError(kind, `${host} : ${failure!} après ${n} tentatives.`, { url: req.url });
      }
      const backoff = Math.min(policy.backoffMaxMs, policy.backoffBaseMs * 2 ** (n - 1));
      const jittered = backoff * (0.75 + clock.random() * 0.5);
      const delay = Math.max(jittered, (res && retryAfterMs(res, clock.now())) ?? 0);
      log.warn(`${host} : ${failure!}, nouvelle tentative dans ${Math.round(delay / 1000)} s`, { attempt: n });
      await clock.sleep(delay, signal);
    }
  }

  return {
    request(req, signal) {
      const host = new URL(req.url).host;
      const policy = policyFor(host);
      // Chaînage : la requête suivante vers cet hôte attend la fin de la précédente.
      const run = (tails.get(host) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => attempt(host, policy, req, signal));
      tails.set(host, run);
      return run;
    },
  };
}
