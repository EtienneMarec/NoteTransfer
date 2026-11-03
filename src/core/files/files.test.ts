import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv, pick } from './csv';
import { makeZip } from './make-zip.testutil';
import { isZip, listZip, readZipText } from './zip';

describe('parseCsv', () => {
  it('gère guillemets, guillemets doublés, virgules et retours à la ligne dans un champ', () => {
    expect(parseCsv('﻿a,b,c\r\n"x, y","il a dit ""oui""","ligne\nsuite"\r\n1,,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'il a dit "oui"', 'ligne\nsuite'],
      ['1', '', '3'],
    ]);
  });

  it('ignore les lignes vides et accepte une dernière ligne sans fin de ligne', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('csvRecords / pick', () => {
  it('tolère les variantes d’en-têtes', () => {
    const { records } = csvRecords('Const,Your Rating,Date Rated\ntt0113247,8,2024-01-02\n');
    expect(pick(records[0]!, 'your rating')).toBe('8');
    expect(pick(records[0]!, 'YourRating')).toBe('8');
    expect(pick(records[0]!, 'Absente', 'Const')).toBe('tt0113247');
    expect(pick(records[0]!, 'Absente')).toBeUndefined();
  });
});

describe('zip', () => {
  it('liste et lit des entrées stockées et compressées', async () => {
    const zip = await makeZip([
      { name: 'profile.csv', content: 'a\n1', deflate: false },
      { name: 'ratings.csv', content: 'Name,Rating\nLa Haine,4.5\n'.repeat(3), deflate: true },
    ]);
    expect(isZip(zip)).toBe(true);
    expect(listZip(zip).map((e) => e.name)).toEqual(['profile.csv', 'ratings.csv']);
    expect(await readZipText(zip, (n) => n === 'ratings.csv')).toBe('Name,Rating\nLa Haine,4.5\n'.repeat(3));
    expect(await readZipText(zip, (n) => n === 'absent.csv')).toBeUndefined();
  });

  it('refuse un fichier qui n’est pas une archive', () => {
    const bytes = new TextEncoder().encode('Name,Rating\n');
    expect(isZip(bytes)).toBe(false);
    expect(() => listZip(bytes)).toThrow(/ZIP/);
  });
});
