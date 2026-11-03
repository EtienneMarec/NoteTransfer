import { describe, expect, it } from 'vitest';
import { convertRating, formatRating, isValidRating } from './convert';
import { SCALES } from './scales';

const { halfStarsOf5, integersOf10, halfPointsOf10 } = SCALES;

describe('convertRating', () => {
  it('convertit 3,5/5 en 7/10 exactement', () => {
    expect(convertRating(3.5, halfStarsOf5, integersOf10)).toEqual({ value: 7, exact: true, raw: 7 });
  });

  it('est exact dans les deux sens entre 0,5–5 et 1–10, pour toutes les valeurs', () => {
    for (let v = 0.5; v <= 5; v += 0.5) {
      const there = convertRating(v, halfStarsOf5, integersOf10);
      expect(there.exact).toBe(true);
      expect(convertRating(there.value, integersOf10, halfStarsOf5)).toMatchObject({ value: v, exact: true });
    }
  });

  it('arrondit 7,5/10 (demi-points) au plus proche, demi vers le haut, et le signale', () => {
    expect(convertRating(7.5, halfPointsOf10, integersOf10)).toEqual({
      value: 8,
      exact: false,
      raw: 7.5,
      rule: 'arrondi au plus proche, demi vers le haut',
    });
  });

  it('respecte les modes vers le bas et vers le haut', () => {
    expect(convertRating(7.5, halfPointsOf10, integersOf10, 'down').value).toBe(7);
    expect(convertRating(7.5, halfPointsOf10, integersOf10, 'up').value).toBe(8);
    expect(convertRating(7.5, halfPointsOf10, halfStarsOf5, 'nearest')).toMatchObject({ value: 4, raw: 3.75 });
    expect(convertRating(7.5, halfPointsOf10, halfStarsOf5, 'down').value).toBe(3.5);
  });

  it('ramène dans les bornes une note sous le minimum de destination', () => {
    expect(convertRating(0.5, halfPointsOf10, integersOf10)).toEqual({
      value: 1,
      exact: false,
      raw: 0.5,
      rule: 'ramenée dans les bornes 1–10',
    });
  });

  it("refuse une note hors de l'échelle d'origine", () => {
    expect(() => convertRating(6, halfStarsOf5, integersOf10)).toThrow(RangeError);
    expect(() => convertRating(3.3, halfStarsOf5, integersOf10)).toThrow(RangeError);
    expect(() => convertRating(Number.NaN, halfStarsOf5, integersOf10)).toThrow(RangeError);
  });

  it('ne produit pas d’erreur flottante', () => {
    expect(convertRating(0.5, halfStarsOf5, halfPointsOf10)).toMatchObject({ value: 1, exact: true });
    expect(convertRating(3, integersOf10, halfPointsOf10)).toMatchObject({ value: 3, exact: true });
  });
});

describe('isValidRating', () => {
  it('vérifie bornes et pas', () => {
    expect(isValidRating(0.5, halfStarsOf5)).toBe(true);
    expect(isValidRating(0, halfStarsOf5)).toBe(false);
    expect(isValidRating(4.5, integersOf10)).toBe(false);
  });
});

describe('formatRating', () => {
  it('utilise la virgule décimale', () => {
    expect(formatRating(3.5, halfStarsOf5)).toBe('3,5/5');
  });
});
