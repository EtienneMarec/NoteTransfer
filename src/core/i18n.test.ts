import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../adapters/registry';
import { buildBackup, buildReport } from './export';
import { catalogEntry, defaultLang, errorMsg, LANGS, LocalizedError, MESSAGE_KEYS, msg, raw, render, type Localized } from './i18n';
import type { JobRow, TransferJob } from './job/types';
import { SCALES } from './scales';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogue de messages', () => {
  it.each(MESSAGE_KEYS)('%s existe dans les deux langues, avec les mêmes paramètres', (key) => {
    const entry = catalogEntry(key);
    for (const lang of LANGS) expect(entry[lang].trim()).not.toBe('');
    expect(placeholders(entry.en)).toEqual(placeholders(entry.fr));
  });

  it('traduit un message et ses paramètres imbriqués', () => {
    const m = msg('err.retriesExhausted', { host: 'x.test', detail: msg('err.statusDetail', { status: 500 }), attempts: 3 });
    expect(render(m, 'en')).toBe('x.test: status 500 after 3 attempts.');
    expect(render(m, 'fr')).toBe('x.test : statut 500 après 3 tentatives.');
  });

  it('laisse intacts le texte brut et les anciennes données en texte', () => {
    expect(render(raw('Erreur du site {x}'), 'en')).toBe('Erreur du site {x}');
    expect(render('ancien message', 'en')).toBe('ancien message');
    expect(render(undefined, 'en')).toBe('');
  });

  it('conserve le code d’une erreur traduisible', () => {
    const m = msg('err.jobNotFound');
    expect(errorMsg(new LocalizedError(m))).toEqual(m);
    expect(render(errorMsg(new Error('boom')), 'fr')).toBe('boom');
  });

  it('choisit la langue du navigateur', () => {
    expect(defaultLang('fr-CA')).toBe('fr');
    expect(defaultLang('en-US')).toBe('en');
    expect(defaultLang('de-DE')).toBe('en');
    expect(defaultLang(undefined)).toBe('en');
  });
});

describe('textes des adaptateurs', () => {
  const texts = ADAPTERS.flatMap((a) =>
    (
      [
        ['notes', a.capabilities.notes],
        ['termsWarning', a.capabilities.termsWarning],
        ['writeSideEffects', a.capabilities.writeSideEffects],
        ['manualWrite', a.manualWrite?.instructions],
        ['exportInstructions', a.exportInstructions],
        ['importInstructions', a.importInstructions],
      ] as Array<[string, Localized | undefined]>
    )
      .filter((t): t is [string, Localized] => !!t[1])
      .map(([name, text]) => [`${a.id}.${name}`, text] as const),
  );

  it.each(texts)('%s est fourni dans les deux langues', (_name, text) => {
    for (const lang of LANGS) expect(text[lang].trim()).not.toBe('');
    expect(text.en).not.toBe(text.fr);
  });
});

describe('exports traduits', () => {
  const job = { source: 'allocine', destination: 'senscritique', dryRun: true } as TransferJob;
  const rows = [
    {
      rowId: 'a',
      entry: { source: { platform: 'allocine' }, work: { title: 'Film', year: 2000, refs: [] }, rating: { value: 3.5, scale: SCALES.halfStarsOf5 } },
      selected: true,
      action: 'create',
      status: 'done',
      conversion: { value: 7, raw: 7, exact: true },
      match: { confidence: 'sure', reason: raw('x'), candidates: [], confirmedByUser: false, ref: { platform: 'senscritique', id: '1' } },
      outcome: { at: '2026-01-01T00:00:00.000Z', message: msg('outcome.simulated'), simulated: true },
    },
  ] as unknown as JobRow[];

  it('produit le rapport en anglais', () => {
    const [header, line] = buildReport(job, rows, new Date(0), 'en').csv.split('\r\n');
    expect(header).toBe('title,year,source_rating,converted_rating,conversion,existing_rating,match,confidence,result,reason,simulated');
    expect(line).toBe('Film,2000,3.5/5,7,,,1,sure,done,dry run: nothing written,yes');
  });

  it('retraduit le même transfert en français', () => {
    expect(buildReport(job, rows, new Date(0), 'fr').csv.split('\r\n')[1]).toBe('Film,2000,"3,5/5",7,,,1,sûr,réussi,simulation : aucune écriture,oui');
  });

  it('adapte les colonnes de la sauvegarde', () => {
    expect(buildBackup(job, rows, new Date(0), 'en').csv.split('\r\n')[0]).toBe('platform,id,url,title,original_title,year,rating,scale_max,rated_at');
  });
});
