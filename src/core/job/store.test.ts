import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { matchCacheKey, openJobStore } from './store';
import type { JobRow } from './types';

const minimalRow = (jobId: string, rowId: string, order: number): JobRow => ({
  jobId,
  rowId,
  order,
  entry: { work: { kind: 'movie', title: rowId, externalIds: {}, refs: [] }, source: { platform: 'allocine', fetchedAt: '' } },
  selected: false,
  status: 'pending',
  attempts: 0,
});

describe('openJobStore', () => {
  it('écrase une ligne de même clé au lieu de la dupliquer, et garde l’ordre', async () => {
    const store = await openJobStore('store-1');
    await store.putRows([minimalRow('j', 'b', 2), minimalRow('j', 'a', 1), minimalRow('other', 'x', 0)]);
    await store.putRows([{ ...minimalRow('j', 'a', 1), status: 'done' }]);
    const rows = await store.getRows('j');
    expect(rows.map((r) => `${r.rowId}:${r.status}`)).toEqual(['a:done', 'b:pending']);
  });

  it('expire les correspondances datées', async () => {
    const store = await openJobStore('store-2');
    const key = matchCacheKey({ platform: 'allocine', id: '12551' }, 'senscritique');
    expect(key).toBe('allocine:12551>senscritique');
    await store.putCachedMatch({ key, destinationId: '472094', confirmedByUser: false, savedAt: '', expiresAt: '2026-05-01T00:00:00Z' });
    expect(await store.getCachedMatch(key, new Date('2026-04-30T00:00:00Z'))).toMatchObject({ destinationId: '472094' });
    expect(await store.getCachedMatch(key, new Date('2026-05-02T00:00:00Z'))).toBeUndefined();
    expect(await store.getCachedMatch(key, new Date('2026-04-30T00:00:00Z'))).toBeUndefined();
  });

  it('supprime un job avec ses lignes, et vide tout sur demande', async () => {
    const store = await openJobStore('store-3');
    const job = { id: 'j' } as Parameters<typeof store.putJob>[0];
    await store.putJob(job);
    await store.putJob({ ...job, id: 'k' });
    await store.putRows([minimalRow('j', 'a', 1), minimalRow('k', 'a', 1)]);
    await store.deleteJob('j');
    expect(await store.getRows('j')).toEqual([]);
    expect(await store.getRows('k')).toHaveLength(1);

    await store.putCachedMatch({ key: 'x', destinationId: '1', confirmedByUser: true, savedAt: '' });
    await store.clearAll();
    expect(await store.listJobs()).toEqual([]);
    expect(await store.getRows('k')).toEqual([]);
    expect(await store.getCachedMatch('x')).toBeUndefined();
  });
});
