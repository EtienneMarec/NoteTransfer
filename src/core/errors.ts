import type { BlockReason } from './adapter';

/** Erreur qui doit mettre le transfert en pause (et non faire échouer une seule ligne). */
export class PauseError extends Error {
  constructor(
    readonly kind: 'blocked' | 'rate_limited' | 'network' | 'adapter_outdated' | 'signed_out',
    message: string,
    readonly detail?: { reason?: BlockReason; url?: string },
  ) {
    super(message);
    this.name = 'PauseError';
  }
}

/** Erreur HTTP non récupérable par simple nouvelle tentative (4xx hors 429). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
