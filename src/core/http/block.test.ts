import { describe, expect, it } from 'vitest';
import { detectBlock } from './block';

describe('detectBlock', () => {
  it('reconnaît l’en-tête cf-mitigated', () => {
    expect(detectBlock({ status: 403, headers: { 'CF-Mitigated': 'challenge' }, body: '' }, true)).toBe('challenge');
  });

  it('reconnaît un CAPTCHA dans une page HTML', () => {
    const body = '<html><div class="g-recaptcha"></div></html>';
    expect(detectBlock({ status: 200, headers: { 'content-type': 'text/html' }, body }, true)).toBe('captcha');
  });

  it('considère un 403 HTML comme un blocage quand on attend du JSON', () => {
    expect(detectBlock({ status: 403, headers: { 'content-type': 'text/html' }, body: '<html>Forbidden</html>' }, true)).toBe(
      'forbidden',
    );
  });

  it('ignore une réponse JSON normale, même en erreur', () => {
    expect(detectBlock({ status: 403, headers: { 'content-type': 'application/json' }, body: '{"errors":[]}' }, true)).toBeNull();
  });

  it('ignore une page HTML normale quand on attend du HTML', () => {
    expect(detectBlock({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>Fiche film</html>' }, false)).toBeNull();
  });
});
