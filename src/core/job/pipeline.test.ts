import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import page1 from '../../adapters/allocine/__fixtures__/movies-seen-page1.json';
import page2 from '../../adapters/allocine/__fixtures__/movies-seen-page2.json';
import { allocine } from '../../adapters/allocine';
import type { AdapterContext, Candidate, PlatformAdapter } from '../adapter';
import { PauseError } from '../errors';
import { buildBackup, buildReport, summarize, toCsv } from '../export';
import { raw } from '../i18n';
import type { RawResponse } from '../http/client';
import { silentLogger } from '../log';
import type { PivotRating, PlatformRef } from '../pivot';
import { SCALES } from '../scales';
import { newJob, runMatchStep, runReadStep, setConflictPolicy, setRowMatch, setRowSelected } from './pipeline';
import { runUntilStopped, startWriting, confirmTestBatch } from './runner';
import { openJobStore, type JobStore } from './store';

/** Source : le vrai adaptateur AlloCiné, alimenté par les fixtures réelles. */
function allocineCtx(): AdapterContext {
  const pages = [page1, page2];
  return {
    http: { request: async (): Promise<RawResponse> => ({ status: 200, headers: {}, body: JSON.stringify(pages.shift()) }) },
    settings: {},
    signal: new AbortController().signal,
    log: silentLogger,
  };
}

/** Destination simulée qui connaît certains films. */
function fakeSc(catalog: Record<string, Candidate['work'] & { id: string }>, ratings: Record<string, number> = {}) {
  const searches: string[] = [];
  const writes: Array<[string, number]> = [];
  let pauseNextSearch = false;
  const toCandidate = (w: Candidate['work'] & { id: string }): Candidate => {
    const ref: PlatformRef = { platform: 'senscritique', id: w.id };
    return { ref, work: { ...w, refs: [ref] } };
  };
  const adapter: PlatformAdapter = {
    id: 'senscritique',
    displayName: 'SC',
    hostPermissions: [],
    capabilities: { read: null, write: 'site', scale: SCALES.integersOf10, kinds: ['movie'], providesExternalIds: [], lookupByExternalId: [] },
    checkSession: async () => ({ state: 'ok' }),
    searchFilm: async (_c, q) => {
      if (pauseNextSearch) {
        pauseNextSearch = false;
        throw new PauseError('blocked', raw('challenge'), { reason: 'challenge' });
      }
      searches.push(q.title);
      return Object.values(catalog).filter((w) => w.title === q.title || w.originalTitle === q.originalTitle).map(toCandidate);
    },
    getExistingRating: async (_c, ref): Promise<PivotRating | null> =>
      ratings[ref.id] ? { value: ratings[ref.id]!, scale: SCALES.integersOf10 } : null,
    writeRating: async (_c, ref, v) => {
      writes.push([ref.id, v]);
      ratings[ref.id] = v;
      return { ok: true };
    },
  };
  return { adapter, searches, writes, pauseNextSearch: () => (pauseNextSearch = true), toCandidate };
}

const scCtx: AdapterContext = { http: { request: async () => ({ status: 200, headers: {}, body: '' }) }, settings: {}, signal: new AbortController().signal, log: silentLogger };

// Catalogue « SensCritique » : 4 films exacts, 1 ambigu (deux homonymes), 1 absent (Blair Witch).
const catalog = {
  mib: { id: '101', kind: 'movie' as const, title: 'Men in Black II', originalTitle: 'Men in Black II', year: 2002, directors: ['Barry Sonnenfeld'], externalIds: {}, refs: [] },
  ahx: { id: '102', kind: 'movie' as const, title: 'American History X', originalTitle: 'American History X', year: 1998, directors: ['Tony Kaye'], externalIds: {}, refs: [] },
  dm: { id: '103', kind: 'movie' as const, title: 'Moi, moche et méchant', originalTitle: 'Despicable Me', year: 2010, directors: ['Pierre Coffin', 'Chris Renaud'], externalIds: {}, refs: [] },
  abs: { id: '104', kind: 'movie' as const, title: 'À bout de souffle', originalTitle: 'À bout de souffle', year: 1960, directors: ['Jean-Luc Godard'], externalIds: {}, refs: [] },
  fg1: { id: '105', kind: 'movie' as const, title: 'Forrest Gump', originalTitle: 'Forrest Gump', year: 1994, externalIds: {}, refs: [] },
  fg2: { id: '106', kind: 'movie' as const, title: 'Forrest Gump', originalTitle: 'Forrest Gump', year: 1994, externalIds: {}, refs: [] },
};

let store: JobStore;
let n = 0;
beforeEach(async () => {
  store = await openJobStore(`pipeline-${++n}`);
});

async function readAndMatch(sc: ReturnType<typeof fakeSc>, dryRun = true) {
  const job = newJob({ source: 'allocine', destination: 'senscritique', dryRun, rounding: 'nearest', conflictPolicy: 'keep', testBatchSize: 2 });
  await store.putJob(job);
  const deps = { store, source: allocine, destination: sc.adapter, sourceCtx: allocineCtx(), destinationCtx: scCtx };
  while ((await runReadStep(job.id, deps)) === 'progressed');
  while ((await runMatchStep(job.id, deps)) === 'progressed');
  return { job: (await store.getJob(job.id))!, deps };
}

describe('pipeline AlloCiné → SensCritique (simulation sur fixtures)', () => {
  it('lit les 2 pages, rapproche les films et prépare l’aperçu', async () => {
    const sc = fakeSc(catalog, { '104': 7 }); // « À bout de souffle » déjà noté 7 = 3,5 × 2
    const { job } = await readAndMatch(sc);
    expect(job.phase).toBe('review');
    expect(job.readTotal).toBe(6);

    const rows = await store.getRows(job.id);
    const view = Object.fromEntries(rows.map((r) => [r.entry.work.title, `${r.match?.confidence}/${r.action}/${r.conversion?.value}`]));
    expect(view).toEqual({
      MIIB: 'sure/create/6',
      'American History X': 'sure/create/9',
      'Moi, moche et méchant': 'sure/create/5',
      'À bout de souffle': 'sure/skip_identical/7',
      'Forrest Gump': 'review/skip_review/6', // deux homonymes : vérification manuelle
      'Le Projet Blair Witch': 'not_found/skip_unmatched/10',
    });
    expect(rows.filter((r) => r.selected).map((r) => r.entry.work.title)).toEqual(['MIIB', 'American History X', 'Moi, moche et méchant']);
  });

  it('se met en pause sur un blocage pendant la recherche, puis reprend sans relire la source', async () => {
    const sc = fakeSc(catalog);
    const job = newJob({ source: 'allocine', destination: 'senscritique', dryRun: true, rounding: 'nearest', conflictPolicy: 'keep', testBatchSize: 3 });
    await store.putJob(job);
    const deps = { store, source: allocine, destination: sc.adapter, sourceCtx: allocineCtx(), destinationCtx: scCtx };
    while ((await runReadStep(job.id, deps)) === 'progressed');
    sc.pauseNextSearch();
    expect(await runMatchStep(job.id, deps)).toBe('paused');
    expect((await store.getJob(job.id))?.pause).toMatchObject({ kind: 'blocked', resumePhase: 'matching' });

    await store.putJob({ ...(await store.getJob(job.id))!, phase: 'matching', pause: undefined });
    while ((await runMatchStep(job.id, deps)) === 'progressed');
    expect((await store.getJob(job.id))?.phase).toBe('review');
    expect(sc.searches).toHaveLength(6); // aucune recherche en double
  });

  it('réutilise le cache de correspondances pour un nouveau transfert', async () => {
    const sc = fakeSc(catalog);
    await readAndMatch(sc);
    const before = sc.searches.length;
    await readAndMatch(sc);
    // Seuls les films non « sûrs » sont recherchés à nouveau.
    expect(sc.searches.length - before).toBe(2);
  });

  it('applique les corrections : choix d’un candidat, validation, conflit', async () => {
    const sc = fakeSc(catalog, { '102': 4 });
    const { job, deps } = await readAndMatch(sc);
    const rows = await store.getRows(job.id);
    const fg = rows.find((r) => r.entry.work.title === 'Forrest Gump')!;
    const ahx = rows.find((r) => r.entry.work.title === 'American History X')!;
    expect(ahx.action).toBe('skip_conflict');

    // Choisir explicitement le deuxième homonyme.
    const chosen = await setRowMatch(job.id, fg.rowId, sc.toCandidate(catalog.fg2), deps);
    expect(chosen).toMatchObject({ action: 'create', selected: true, match: { ref: { id: '106' }, confirmedByUser: true } });

    // Cocher un conflit = écraser cette ligne uniquement.
    expect(await setRowSelected(store, job.id, ahx.rowId, true)).toMatchObject({ action: 'overwrite', selected: true });
    expect(await setRowSelected(store, job.id, ahx.rowId, false)).toMatchObject({ action: 'skip_conflict', selected: false });

    // Politique globale.
    await setConflictPolicy(deps, job.id, 'overwrite');
    expect((await store.getRow(job.id, ahx.rowId))?.action).toBe('overwrite');
  });

  it('ne permet pas de cocher une ligne sans rien à écrire', async () => {
    const sc = fakeSc(catalog);
    const { job } = await readAndMatch(sc);
    const blair = (await store.getRows(job.id)).find((r) => r.entry.work.title === 'Le Projet Blair Witch')!;
    expect(await setRowSelected(store, job.id, blair.rowId, true)).toMatchObject({ selected: false });
  });

  it('va jusqu’au rapport en simulation, sans aucune écriture', async () => {
    const sc = fakeSc(catalog);
    const { job } = await readAndMatch(sc, true);
    expect(await startWriting(store, job.id)).toBe(true);
    expect(await runUntilStopped(job.id, { store, destination: sc.adapter, ctx: scCtx })).toBe('awaiting_confirmation');
    await confirmTestBatch(store, job.id);
    expect(await runUntilStopped(job.id, { store, destination: sc.adapter, ctx: scCtx })).toBe('done');
    expect(sc.writes).toEqual([]);

    const done = (await store.getJob(job.id))!;
    const rows = await store.getRows(job.id);
    // 4 créations (aucune note existante ici) ; Forrest Gump (à vérifier) et Blair Witch (introuvable) ignorés.
    expect(summarize(done, rows)).toEqual({ done: 4, skipped: 2, failed: 0, pending: 0, simulated: true });
    const report = buildReport(done, rows);
    expect(report.csv.split('\r\n')[0]).toBe('titre,annee,note_source,note_convertie,conversion,note_existante,correspondance,confiance,resultat,raison,simule');
    expect(report.csv).toContain('MIIB,2002,3/5,6,,,101,sûr,réussi,simulation : aucune écriture,oui');
  });

  it('exporte une sauvegarde complète avant écriture, sans identifiant utilisateur', async () => {
    const sc = fakeSc(catalog, { '102': 4 });
    const { job } = await readAndMatch(sc);
    const ahx = (await store.getRows(job.id)).find((r) => r.entry.work.title === 'American History X')!;
    await setRowSelected(store, job.id, ahx.rowId, true);
    const backup = buildBackup(job, await store.getRows(job.id));
    const parsed = JSON.parse(backup.json);
    expect(parsed.source.entries).toHaveLength(6);
    expect(parsed.destinationToBeOverwritten).toEqual([
      { title: 'American History X', destination: { platform: 'senscritique', id: '102' }, rating: { value: 4, scale: SCALES.integersOf10 } },
    ]);
    expect(backup.csv).toContain('allocine,12475,https://www.allocine.fr/film/fichefilm_gen_cfilm=12475.html,American History X');
    expect(backup.json + backup.csv).not.toMatch(/T3Bpbmlvbj|MTAz|Bearer|GraphToken|SC_AUTH/);
  });
});

describe('toCsv', () => {
  it('échappe les virgules, guillemets et retours à la ligne', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'il a dit "oui"'], ['ligne\nsuite', null]])).toBe(
      'a,b\r\n"x, y","il a dit ""oui"""\r\n"ligne\nsuite",\r\n',
    );
  });
});
