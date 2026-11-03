const LEADING_ARTICLES = /^(le|la|les|l|un|une|des|the|a|an|der|die|das|el|los|las|il|lo|gli)\s+/;

/** Forme canonique d'un titre ou d'un nom, pour la comparaison. */
export function normalizeTitle(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’'`]/g, ' ')
    .replace(/&/g, ' et ')
    .replace(/\band\b/g, 'et')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(LEADING_ARTICLES, '');
}

export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const padded = ` ${s} `;
  for (let i = 0; i < padded.length - 1; i++) {
    const bg = padded.slice(i, i + 2);
    out.set(bg, (out.get(bg) ?? 0) + 1);
  }
  return out;
}

/** Coefficient de Dice sur les bigrammes de caractères des formes normalisées (0 à 1). */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let common = 0;
  let total = 0;
  for (const [bg, n] of ba) {
    common += Math.min(n, bb.get(bg) ?? 0);
    total += n;
  }
  for (const n of bb.values()) total += n;
  return (2 * common) / total;
}
