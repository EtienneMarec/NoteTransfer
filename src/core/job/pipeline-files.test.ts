import 'fake-indexeddb/auto';
import { render } from '../i18n';
import { beforeEach, describe, expect, it } from 'vitest';
import page1 from '../../adapters/allocine/__fixtures__/movies-seen-page1.json';
import page2 from '../../adapters/allocine/__fixtures__/movies-seen-page2.json';
import { parseMoviesRated, type MoviesRatedResponse } from '../../adapters/allocine/parse';
import imdbRealCsv from '../../adapters/imdb/__fixtures__/ratings.real-fr.csv?raw';
import imdbCsv from '../../adapters/imdb/__fixtures__/ratings.synthetic.csv?raw';
import { parseImdbRatings } from '../../adapters/imdb';
import { allocine } from '../../adapters/allocine';
import { imdb } from '../../adapters/imdb';
import { letterboxd, parseLetterboxdRatings } from '../../adapters/letterboxd';
import lbRealCsv from '../../adapters/letterboxd/__fixtures__/ratings.real.csv?raw';
import type { AdapterContext } from '../adapter';
import { buildReport, summarize } from '../export';
import { parseCsv } from '../files/csv';
import { silentLogger } from '../log';
import {
  applyDestinationExport,
  completeFileExport,
  importEntries,
  newJob,
  runMatchStep,
  setManualRowStatus,
  setRowsSelected,
  startManual,
} from './pipeline';
import { openJobStore, type JobStore } from './store';

const ctx: AdapterContext = {
  http: {
    request: async () => {
      throw new Error('aucune requête réseau attendue pour une destination par fichier');
    },
  },
  settings: {},
  signal: new AbortController().signal,
  log: silentLogger,
};

let store: JobStore;
let n = 0;
beforeEach(async () => {
  store = await openJobStore(`files-${++n}`);
});

async function prepare(source: typeof imdb, entries: Parameters<typeof importEntries>[2]) {
  const job = newJob({ source: source.id, destination: 'letterboxd', dryRun: false, rounding: 'nearest', conflictPolicy: 'keep', testBatchSize: 3 });
  await store.putJob(job);
  await importEntries(store, job, entries);
  const deps = { store, source, destination: letterboxd, sourceCtx: ctx, destinationCtx: ctx };
  while ((await runMatchStep(job.id, deps)) === 'progressed');
  return job.id;
}

const selectedForImport = async (jobId: string) =>
  (await store.getRows(jobId)).filter((r) => r.selected && (r.action === 'create' || r.action === 'overwrite'));

describe('IMDb (fichier) → Letterboxd (fichier)', () => {
  it('rapproche par ID IMDb, sans requête réseau, et génère un import avec imdbID', async () => {
    const jobId = await prepare(imdb, parseImdbRatings(imdbCsv, ''));
    expect((await store.getJob(jobId))?.phase).toBe('review');
    const rows = await selectedForImport(jobId);
    expect(rows.map((r) => [r.entry.work.title, r.match?.confidence, r.conversion?.value])).toEqual([
      ['Hate', 'sure', 4],
      ['Forrest Gump', 'sure', 3],
      ['Despicable Me', 'sure', 2.5],
      ['The Blair Witch Project', 'sure', 5],
    ]);
    const [file] = letterboxd.buildImportFiles!(rows.map((r) => ({ work: r.entry.work, value: r.conversion!.value })));
    expect(parseCsv(file!.content)[1]).toEqual(['tt0113247', 'La haine', '1995', 'Mathieu Kassovitz', '4']);

    await completeFileExport(store, jobId, [file!.name]);
    const job = (await store.getJob(jobId))!;
    expect(job.phase).toBe('done');
    expect(summarize(job, await store.getRows(jobId))).toMatchObject({ done: 4, failed: 0 });
  });
});

describe('AlloCiné → IMDb « à la main »', () => {
  async function prepareManual() {
    const job = newJob({ source: 'allocine', destination: 'imdb', dryRun: false, writeMode: 'manual', rounding: 'nearest', conflictPolicy: 'keep', testBatchSize: 3 });
    await store.putJob(job);
    await importEntries(store, job, [page1, page2].flatMap((p) => parseMoviesRated(p.data as MoviesRatedResponse, '').items));
    // ctx lève une erreur à toute requête : le mode manuel ne doit rien envoyer à IMDb.
    const deps = { store, source: allocine, destination: imdb, sourceCtx: ctx, destinationCtx: ctx };
    while ((await runMatchStep(job.id, deps)) === 'progressed');
    return job.id;
  }

  it('prépare des liens de recherche, sans aucune requête vers IMDb, et tout est coché', async () => {
    const jobId = await prepareManual();
    const rows = await store.getRows(jobId);
    expect(rows.every((r) => r.action === 'create' && r.selected)).toBe(true);
    expect(rows[0]!.match).toMatchObject({
      confidence: 'review',
      confirmedByUser: true,
      ref: { url: 'https://www.imdb.com/find/?q=Men%20in%20Black%20II%202002&s=tt&ttype=ft' },
    });
    expect(rows.map((r) => r.conversion?.value)).toEqual([6, 9, 5, 7, 6, 10]);
  });

  it('écarte les films déjà notés grâce à l’export IMDb réel', async () => {
    const jobId = await prepareManual();
    const { matched } = await applyDestinationExport({ store, destination: imdb }, jobId, parseImdbRatings(imdbRealCsv, ''));
    expect(matched).toBe(2); // À bout de souffle (7) et Forrest Gump (6), identiques
    const skipped = (await store.getRows(jobId)).filter((r) => r.action === 'skip_identical').map((r) => r.entry.work.title);
    expect(skipped).toEqual(['À bout de souffle', 'Forrest Gump']);
  });

  it('termine quand chaque ligne est cochée « fait » ou « sautée »', async () => {
    const jobId = await prepareManual();
    expect(await startManual(store, jobId)).toBe(true);
    const rows = await store.getRows(jobId);
    for (const r of rows.slice(0, -1)) await setManualRowStatus(store, jobId, r.rowId, 'done');
    expect((await store.getJob(jobId))?.phase).toBe('manual');
    await setManualRowStatus(store, jobId, rows.at(-1)!.rowId, 'skipped');
    const job = (await store.getJob(jobId))!;
    expect(job.phase).toBe('done');
    expect(summarize(job, await store.getRows(jobId))).toMatchObject({ done: 5, skipped: 1, failed: 0 });
    // On peut encore annuler une coche par erreur : le job repasse en attente.
    await setManualRowStatus(store, jobId, rows.at(-1)!.rowId, 'pending');
    expect((await store.getJob(jobId))?.phase).toBe('manual');
  });
});

describe('IMDb → AlloCiné « à la main »', () => {
  it('prépare la liste sans aucune requête vers AlloCiné', async () => {
    const job = newJob({ source: 'imdb', destination: 'allocine', dryRun: false, writeMode: 'manual', rounding: 'nearest', conflictPolicy: 'keep', testBatchSize: 3 });
    await store.putJob(job);
    await importEntries(store, job, parseImdbRatings(imdbRealCsv, ''));
    const deps = { store, source: imdb, destination: allocine, sourceCtx: ctx, destinationCtx: ctx };
    while ((await runMatchStep(job.id, deps)) === 'progressed');
    const rows = await store.getRows(job.id);
    expect(rows.map((r) => [r.entry.work.title, r.conversion?.value, r.match?.ref?.url, r.selected])).toEqual([
      ['À bout de souffle', 3.5, 'https://www.allocine.fr/rechercher/movie/?q=%C3%80%20bout%20de%20souffle', true],
      ['Forrest Gump', 3, 'https://www.allocine.fr/rechercher/movie/?q=Forrest%20Gump', true],
      ['La Haine', 4, 'https://www.allocine.fr/rechercher/movie/?q=La%20Haine', true],
    ]);
    expect(await startManual(store, job.id)).toBe(true);
  });
});

describe('AlloCiné → Letterboxd (fichier)', () => {
  it('demande une validation manuelle faute d’identifiant, puis inclut les lignes validées', async () => {
    const entries = [page1, page2].flatMap((p) => parseMoviesRated(p.data as MoviesRatedResponse, '').items);
    const jobId = await prepare(allocine, entries);
    const rows = await store.getRows(jobId);
    expect(rows.every((r) => r.match?.confidence === 'review' && r.action === 'skip_review' && !r.selected)).toBe(true);
    expect(render(rows[0]!.match?.reason, 'fr')).toMatch(/titre et année/);

    await setRowsSelected(store, jobId, rows.map((r) => r.rowId), true);
    const selected = await selectedForImport(jobId);
    expect(selected).toHaveLength(6);
    expect(selected.every((r) => r.match?.confirmedByUser)).toBe(true);

    const [file] = letterboxd.buildImportFiles!(selected.map((r) => ({ work: r.entry.work, value: r.conversion!.value })));
    expect(parseCsv(file!.content).slice(0, 2)).toEqual([
      ['Title', 'Year', 'Directors', 'Rating'],
      ['Men in Black II', '2002', 'Barry Sonnenfeld', '3'],
    ]);
    await completeFileExport(store, jobId, [file!.name]);
    const report = buildReport((await store.getJob(jobId))!, await store.getRows(jobId));
    expect(report.csv).toContain('incluse dans letterboxd-import.csv');
  });

  it('retrouve les notes déjà sur Letterboxd grâce à son export, pour ne pas les écraser', async () => {
    const entries = [page1, page2].flatMap((p) => parseMoviesRated(p.data as MoviesRatedResponse, '').items);
    const jobId = await prepare(allocine, entries);
    await setRowsSelected(store, jobId, (await store.getRows(jobId)).map((r) => r.rowId), true);

    // Export réel du compte de test, après deux imports (MIIB passé à 4 par le second).
    const existing = parseLetterboxdRatings(lbRealCsv, '');
    const { matched } = await applyDestinationExport({ store, destination: letterboxd }, jobId, existing);
    const view = Object.fromEntries((await store.getRows(jobId)).map((r) => [r.entry.work.title, `${r.action}/${r.selected}`]));
    expect(view).toEqual({
      MIIB: 'skip_conflict/false', // 3/5 sur AlloCiné, 4 sur Letterboxd : conservée
      'American History X': 'skip_identical/false',
      'Moi, moche et méchant': 'skip_identical/false', // trouvé par le titre original « Despicable Me »
      // « Breathless » sur Letterboxd : titre trop différent, aucune note existante détectée.
      'À bout de souffle': 'create/true',
      'Forrest Gump': 'skip_identical/false',
      'Le Projet Blair Witch': 'skip_identical/false',
    });
    expect(matched).toBe(5);
    expect((await store.getJob(jobId))?.destinationExportAppliedAt).toBeDefined();
  });

  it('dédoublonne un film répété dans le fichier source', async () => {
    const entries = parseImdbRatings(imdbCsv, '');
    const jobId = await prepare(imdb, [...entries, entries[0]!]);
    expect(await store.getRows(jobId)).toHaveLength(4);
  });
});
