import type { AdapterContext } from './adapter';
import { HttpError, PauseError } from './errors';

interface GraphQLError {
  message?: string;
  extensions?: { code?: string };
}

const SIGNED_OUT_CODES = new Set(['UNAUTHENTICATED', 'auth/unauthenticated-user', 'api/invalid-token', 'api/missing-token']);

function classify(errors: GraphQLError[], status: number): Error {
  const codes = errors.map((e) => e.extensions?.code);
  const message = errors.map((e) => e.message).filter(Boolean).join(' ; ') || `erreur GraphQL (${status})`;
  // IMDb : code FORBIDDEN avec « Authentication required but not provided ».
  const authRequired = errors.some((e) => e.extensions?.code === 'FORBIDDEN' && /authentication required/i.test(e.message ?? ''));
  if (codes.some((c) => c && SIGNED_OUT_CODES.has(c)) || status === 401 || authRequired) {
    return new PauseError('signed_out', 'La session a expiré : reconnectez-vous au site puis reprenez.');
  }
  // Le schéma a changé : continuer produirait des erreurs en série.
  if (codes.includes('GRAPHQL_VALIDATION_FAILED')) {
    return new PauseError('adapter_outdated', `Le site a modifié son API (${message}). L'adaptateur doit être mis à jour.`);
  }
  return new Error(message);
}

/** Requête GraphQL via le client limité du contexte, avec classement des erreurs. */
export async function gql<T>(ctx: AdapterContext, endpoint: string, query: string, variables: object = {}): Promise<T> {
  let status: number;
  let body: string;
  try {
    const res = await ctx.http.request(
      {
        url: endpoint,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        expectJson: true,
      },
      ctx.signal,
    );
    status = res.status;
    body = res.body;
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    status = e.status;
    body = e.body ?? '';
    if (status === 401 || status === 403) {
      const parsed = tryParse(body);
      throw classify(parsed?.errors ?? [], 401);
    }
  }

  const json = tryParse(body);
  if (!json) throw new PauseError('adapter_outdated', `Réponse inattendue de ${new URL(endpoint).host} (pas du JSON).`);
  if (json.errors?.length) throw classify(json.errors, status);
  if (status >= 400) throw new HttpError(status, `${new URL(endpoint).host} a répondu ${status}`, body);
  return json.data as T;
}

function tryParse(body: string): { data?: unknown; errors?: GraphQLError[] } | undefined {
  try {
    const v = JSON.parse(body);
    return v && typeof v === 'object' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Durée ISO 8601 (`PT1H30M0S`) en minutes. */
export function isoDurationToMinutes(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return undefined;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  const total = Number(d) * 1440 + Number(h) * 60 + Number(min) + Number(s) / 60;
  return total > 0 ? Math.round(total) : undefined;
}
