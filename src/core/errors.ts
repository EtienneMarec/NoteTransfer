import type { BlockReason } from './adapter';
import { render, type Msg } from './i18n';

/** Erreur qui doit mettre le transfert en pause (et non faire échouer une seule ligne). */
export class PauseError extends Error {
  constructor(
    readonly kind: 'blocked' | 'rate_limited' | 'network' | 'adapter_outdated' | 'signed_out',
    readonly msg: Msg,
    readonly detail?: { reason?: BlockReason; url?: string },
  ) {
    super(render(msg, 'fr'));
    this.name = 'PauseError';
  }
}

/** Erreur HTTP non récupérable par simple nouvelle tentative (4xx hors 429). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly msg: Msg,
    readonly body?: string,
  ) {
    super(render(msg, 'fr'));
    this.name = 'HttpError';
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
