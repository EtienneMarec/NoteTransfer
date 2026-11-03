import type { BlockReason } from '../adapter';

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const CHALLENGE_MARKERS = [/challenge-platform/i, /cf-chl-/i, /cf_chl_opt/i, /Just a moment\.\.\./i, /Attention Required!/i];
const CAPTCHA_MARKERS = [/g-recaptcha/i, /hcaptcha\.com/i, /cf-turnstile/i, /datadome/i, /captcha-delivery\.com/i];

function header(res: RawResponse, name: string): string | undefined {
  const key = Object.keys(res.headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : res.headers[key];
}

/**
 * Reconnaît une page de vérification anti-robot à la place de la réponse attendue.
 * On ne cherche jamais à la contourner : le transfert se met en pause.
 */
export function detectBlock(res: RawResponse, expectJson: boolean): BlockReason | null {
  if (header(res, 'cf-mitigated') === 'challenge') return 'challenge';

  const contentType = header(res, 'content-type') ?? '';
  const looksHtml = contentType.includes('text/html') || /^\s*<(!doctype|html)/i.test(res.body);
  if (!looksHtml) return null;

  // Une réponse HTML là où on attend du JSON n'est jamais normale.
  if (CAPTCHA_MARKERS.some((re) => re.test(res.body))) return 'captcha';
  if (CHALLENGE_MARKERS.some((re) => re.test(res.body))) return 'challenge';
  if (expectJson && (res.status === 403 || res.status === 503)) return 'forbidden';
  return null;
}
