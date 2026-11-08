import { describe, expect, it } from 'vitest';
import { LANGS } from '../../core/i18n';
import { createI18n, uiEntry, UI_KEYS } from './i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('textes de l’interface', () => {
  it.each(UI_KEYS)('%s existe dans les deux langues, avec les mêmes paramètres', (key) => {
    const entry = uiEntry(key);
    for (const lang of LANGS) expect(entry[lang].trim()).not.toBe('');
    expect(placeholders(entry.en)).toEqual(placeholders(entry.fr));
  });

  it('remplace les paramètres dans la langue choisie', () => {
    expect(createI18n('en').t('job.running', { done: 1, total: 2 })).toBe('1 / 2 rating(s) processed');
    expect(createI18n('fr').t('job.running', { done: 1, total: 2 })).toBe('1 / 2 note(s) traitée(s)');
  });
});
