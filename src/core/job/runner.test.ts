import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdapterContext, PlatformAdapter, WriteResult } from '../adapter';
import { HttpError, PauseError } from '../errors';
import { silentLogger } from '../log';
import type { PivotRating, PlatformRef } from '../pivot';
import { SCALES } from '../scales';
import { planRow } from './plan';
import { confirmTestBatch, resume, runUntilStopped, runWriteStep, startWriting } from './runner';
import { openJobStore, type JobStore } from './store';
import type { JobRow, TransferJob } from './types';

const DEST_SCALE = SCALES.integersOf10;

/** Destination simulée : un dictionnaire de notes, avec des pannes programmables. */
function fakeDestination(initial: Record<string, number> = {}) {
  const remote = new Map(Object.entries(initial));
  const writes: Array<[string, number]> = [];
  let failNextWriteWith: Error | undefined;
  let dropNextWrite = false;
  let crashAfterNextWrite = false;

  const adapter: PlatformAdapter = {
    id: 'senscritique',
    displayName: 'Destination test',
    hostPermissions: [],
    capabilities: { read: null, write: 'site', scale: DEST_SCALE, kinds: ['movie'], providesExternalIds: [], lookupByExternalId: [] },
    checkSession: async () => ({ state: 'ok' }),
    getExistingRating: async (_ctx, ref: PlatformRef): Promise<PivotRating | null> => {
      const v = remote.get(ref.id);
      return v === undefined ? null : { value: v, scale: DEST_SCALE };
    },
    writeRating: async (_ctx, ref, value): Promise<WriteResult> => {
      if (failNextWriteWith) {
        const e = failNextWriteWith;
        failNextWriteWith = undefined;
        throw e;
      }
      writes.push([ref.id, value]);
      if (dropNextWrite) dropNextWrite = false;
      else remote.set(ref.id, value);
      if (crashAfterNextWrite) {
        crashAfterNextWrite = false;
        throw new Error('service worker suspendu'); // simule une coupure juste après l'envoi
      }
      return { ok: true };
    },
  };
  return {
    adapter,
    remote,
    writes,
    failNextWrite: (e: Error) => (failNextWriteWith = e),
    dropNextWrite: () => (dropNextWrite = true),
    crashAfterNextWrite: () => (crashAfterNextWrite = true),
  };
}

const ctx = (): AdapterContext => ({
  http: { request: async () => ({ status: 200, headers: {}, body: '' }) },
  settings: {},
  signal: new AbortController().signal,
  log: silentLogger,
});

function job(patch: Partial<TransferJob> = {}): TransferJob {
  return {
    id: 'job1',
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    source: 'allocine',
    destination: 'senscritique',
    dryRun: false,
    phase: 'review',
    readCursor: null,
    rounding: 'nearest',
    conflictPolicy: 'keep',
    testBatchSize: 2,
    testBatchConfirmed: false,
    backupSavedAt: '2026-11-03T00:00:00Z',
    ...patch,
  };
}

/** Ligne AlloCiné (0,5–5) déjà rapprochée d'un film de destination. */
function row(order: number, sourceValue: number, destId: string, existing: number | null = null): JobRow {
  const base: JobRow = {
    jobId: 'job1',
    rowId: `ac-${order}`,
    order,
    entry: {
      work: { kind: 'movie', title: `Film ${order}`, externalIds: {}, refs: [{ platform: 'allocine', id: String(order) }] },
      rating: { value: sourceValue, scale: SCALES.halfStarsOf5 },
      source: { platform: 'allocine', fetchedAt: '2026-11-03T00:00:00Z' },
    },
    match: {
      confidence: 'sure',
      ref: { platform: 'senscritique', id: destId },
      reason: 'test',
      candidates: [],
      confirmedByUser: false,
    },
    existing: existing === null ? null : { value: existing, scale: DEST_SCALE },
    selected: false,
    status: 'pending',
    attempts: 0,
  };
  const plan = planRow({ row: base, destinationScale: DEST_SCALE, rounding: 'nearest', conflictPolicy: 'keep' });
  return { ...base, ...plan };
}

let store: JobStore;
let dbCounter = 0;

beforeEach(async () => {
  store = await openJobStore(`test-${++dbCounter}`);
});

async function setup(rows: JobRow[], patch: Partial<TransferJob> = {}) {
  await store.putJob(job(patch));
  await store.putRows(rows);
  expect(await startWriting(store, 'job1')).toBe(true);
}

const statuses = async () => (await store.getRows('job1')).map((r) => `${r.rowId}:${r.status}`);

describe('runWriteStep', () => {
  it('s’arrête après le lot de test, puis reprend sur confirmation', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a'), row(2, 4, 'b'), row(3, 2.5, 'c')]);

    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('awaiting_confirmation');
    expect(dest.writes).toEqual([
      ['a', 7],
      ['b', 8],
    ]);

    await confirmTestBatch(store, 'job1');
    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toHaveLength(3);
    expect((await store.getRows('job1')).every((r) => r.outcome?.verified)).toBe(true);
  });

  it('n’écrase jamais une note existante par défaut', async () => {
    const dest = fakeDestination({ a: 5 });
    await setup([row(1, 3.5, 'a', 5)], { testBatchConfirmed: true });
    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toEqual([]);
    expect(dest.remote.get('a')).toBe(5);
  });

  it('ignore une ligne si une note est apparue depuis l’aperçu', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a')], { testBatchConfirmed: true });
    dest.remote.set('a', 3); // modifiée à la main entre l'aperçu et l'écriture
    await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() });
    expect(dest.writes).toEqual([]);
    expect(await statuses()).toEqual(['ac-1:skipped']);
  });

  it('ne réécrit pas après une fermeture du navigateur si la note a bien été enregistrée', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a'), row(2, 4, 'b')], { testBatchConfirmed: true });
    // État laissé par une coupure juste après l'envoi : la note est sur le site, la ligne est « in_flight ».
    dest.remote.set('a', 7);
    await store.putRows([{ ...(await store.getRow('job1', 'ac-1'))!, status: 'in_flight', attempts: 1 }]);

    // Reprise avec une nouvelle connexion à la même base, comme après un redémarrage.
    const reopened = await openJobStore(`test-${dbCounter}`);
    expect(await runUntilStopped('job1', { store: reopened, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toEqual([['b', 8]]);
    expect((await reopened.getRow('job1', 'ac-1'))?.outcome?.message).toBe('déjà enregistrée (vérifiée à la reprise)');
  });

  it('vérifie avant de conclure à l’échec quand l’erreur survient après l’envoi', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a')], { testBatchConfirmed: true });
    dest.crashAfterNextWrite();
    await runWriteStep('job1', { store, destination: dest.adapter, ctx: ctx() });
    expect(await store.getRow('job1', 'ac-1')).toMatchObject({ status: 'done', outcome: { verified: true } });
    expect(dest.writes).toEqual([['a', 7]]);
  });

  it('réessaie après une interruption si la note n’a pas été enregistrée', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a')], { testBatchConfirmed: true });
    await store.putRows([{ ...(await store.getRow('job1', 'ac-1'))!, status: 'in_flight', attempts: 1 }]);

    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toEqual([['a', 7]]);
    expect((await store.getRow('job1', 'ac-1'))?.attempts).toBe(2);
  });

  it('se met en pause sur un blocage, puis reprend sans doublon', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a'), row(2, 4, 'b')], { testBatchConfirmed: true });
    dest.failNextWrite(new PauseError('blocked', 'vérification Cloudflare', { reason: 'challenge' }));

    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('paused');
    expect((await store.getJob('job1'))?.pause).toMatchObject({ kind: 'blocked' });
    expect(await statuses()).toEqual(['ac-1:in_flight', 'ac-2:pending']);

    await resume(store, 'job1');
    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toEqual([
      ['a', 7],
      ['b', 8],
    ]);
  });

  it('marque en échec une écriture non confirmée à la relecture', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a')], { testBatchConfirmed: true });
    dest.dropNextWrite();
    await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() });
    const r = await store.getRow('job1', 'ac-1');
    expect(r).toMatchObject({ status: 'failed', outcome: { verified: false } });
    expect(r?.outcome?.message).toContain('non confirmée');
  });

  it('marque en échec une erreur HTTP sans arrêter le job', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a'), row(2, 4, 'b')], { testBatchConfirmed: true });
    dest.failNextWrite(new HttpError(400, 'requête refusée'));
    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(await statuses()).toEqual(['ac-1:failed', 'ac-2:done']);
  });

  it('en simulation, parcourt tout sans rien écrire', async () => {
    const dest = fakeDestination();
    await setup([row(1, 3.5, 'a'), row(2, 4, 'b')], { dryRun: true, testBatchConfirmed: true, backupSavedAt: undefined });
    expect(await runUntilStopped('job1', { store, destination: dest.adapter, ctx: ctx() })).toBe('done');
    expect(dest.writes).toEqual([]);
    expect((await store.getRows('job1')).every((r) => r.outcome?.simulated)).toBe(true);
  });
});

describe('startWriting', () => {
  it('refuse un transfert réel sans sauvegarde préalable', async () => {
    await store.putJob(job({ backupSavedAt: undefined }));
    expect(await startWriting(store, 'job1')).toBe(false);
  });
});

describe('planRow', () => {
  const plan = (r: JobRow, conflictPolicy: 'keep' | 'overwrite' = 'keep') =>
    planRow({ row: r, destinationScale: DEST_SCALE, rounding: 'nearest', conflictPolicy });

  it('ne sélectionne pas une correspondance à vérifier tant qu’elle n’est pas validée', () => {
    const r = row(1, 3.5, 'a');
    const review = { ...r, match: { ...r.match!, confidence: 'review' as const } };
    expect(plan(review)).toMatchObject({ action: 'skip_review', selected: false });
    expect(plan({ ...review, match: { ...review.match, confirmedByUser: true } })).toMatchObject({
      action: 'create',
      selected: true,
    });
  });

  it('distingue note identique, conflit conservé et écrasement explicite', () => {
    expect(plan(row(1, 3.5, 'a', 7))).toMatchObject({ action: 'skip_identical', selected: false });
    expect(plan(row(1, 3.5, 'a', 5))).toMatchObject({ action: 'skip_conflict', selected: false });
    expect(plan(row(1, 3.5, 'a', 5), 'overwrite')).toMatchObject({ action: 'overwrite', selected: true });
  });
});
