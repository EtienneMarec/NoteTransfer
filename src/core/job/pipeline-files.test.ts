import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import page1 from '../../adapters/allocine/__fixtures__/movies-seen-page1.json';
import page2 from '../../adapters/allocine/__fixtures__/movies-seen-page2.json';
import { parseMoviesRated, type MoviesRatedResponse } from '../../adapters/allocine/parse';
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
import { applyDestinationExport, completeFileExport, importEntries, newJob, runMatchStep, setRowsSelected } from './pipeline';
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

describe('AlloCiné → Letterboxd (fichier)', () => {
  it('demande une validation manuelle faute d’identifiant, puis inclut les lignes validées', async () => {
    const entries = [page1, page2].flatMap((p) => parseMoviesRated(p.data as MoviesRatedResponse, '').items);
    const jobId = await prepare(allocine, entries);
    const rows = await store.getRows(jobId);
    expect(rows.every((r) => r.match?.confidence === 'review' && r.action === 'skip_review' && !r.selected)).toBe(true);
    expect(rows[0]!.match?.reason).toMatch(/titre et année/);

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
