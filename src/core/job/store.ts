import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JobRow, TransferJob } from './types';

export interface MatchCacheEntry {
  /** `${sourcePlatform}:${sourceId}>${destinationPlatform}` */
  key: string;
  destinationId: string;
  destinationUrl?: string;
  confirmedByUser: boolean;
  savedAt: string;
  /** Date d'expiration facultative (pour une source dont les CGU limitent la durée de cache). */
  expiresAt?: string;
}

export interface JobStore {
  getJob(id: string): Promise<TransferJob | undefined>;
  listJobs(): Promise<TransferJob[]>;
  putJob(job: TransferJob): Promise<void>;
  getRows(jobId: string): Promise<JobRow[]>;
  getRow(jobId: string, rowId: string): Promise<JobRow | undefined>;
  /** Insère ou remplace ; la clé (jobId, rowId) empêche les doublons. */
  putRows(rows: JobRow[]): Promise<void>;
  deleteJob(id: string): Promise<void>;
  getCachedMatch(key: string, now?: Date): Promise<MatchCacheEntry | undefined>;
  putCachedMatch(entry: MatchCacheEntry): Promise<void>;
  clearAll(): Promise<void>;
}

interface Schema extends DBSchema {
  jobs: { key: string; value: TransferJob };
  rows: { key: [string, string]; value: JobRow; indexes: { byJob: [string, number] } };
  matchCache: { key: string; value: MatchCacheEntry };
}

export const DB_NAME = 'notes-transfert';

export async function openJobStore(name = DB_NAME): Promise<JobStore> {
  const db: IDBPDatabase<Schema> = await openDB<Schema>(name, 1, {
    upgrade(db) {
      db.createObjectStore('jobs', { keyPath: 'id' });
      const rows = db.createObjectStore('rows', { keyPath: ['jobId', 'rowId'] });
      rows.createIndex('byJob', ['jobId', 'order']);
      db.createObjectStore('matchCache', { keyPath: 'key' });
    },
  });

  const rowsOf = (jobId: string) =>
    db.getAllFromIndex('rows', 'byJob', IDBKeyRange.bound([jobId, -Infinity], [jobId, Infinity]));

  return {
    getJob: (id) => db.get('jobs', id),
    listJobs: () => db.getAll('jobs'),
    putJob: async (job) => {
      await db.put('jobs', job);
    },
    getRows: rowsOf,
    getRow: (jobId, rowId) => db.get('rows', [jobId, rowId]),
    putRows: async (rows) => {
      const tx = db.transaction('rows', 'readwrite');
      await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
    },
    deleteJob: async (id) => {
      const tx = db.transaction(['jobs', 'rows'], 'readwrite');
      const keys = await tx.objectStore('rows').index('byJob').getAllKeys(IDBKeyRange.bound([id, -Infinity], [id, Infinity]));
      await Promise.all([...keys.map((k) => tx.objectStore('rows').delete(k)), tx.objectStore('jobs').delete(id), tx.done]);
    },
    getCachedMatch: async (key, now = new Date()) => {
      const entry = await db.get('matchCache', key);
      if (entry?.expiresAt && Date.parse(entry.expiresAt) <= now.getTime()) {
        await db.delete('matchCache', key);
        return undefined;
      }
      return entry;
    },
    putCachedMatch: async (entry) => {
      await db.put('matchCache', entry);
    },
    clearAll: async () => {
      const tx = db.transaction(['jobs', 'rows', 'matchCache'], 'readwrite');
      await Promise.all([
        tx.objectStore('jobs').clear(),
        tx.objectStore('rows').clear(),
        tx.objectStore('matchCache').clear(),
        tx.done,
      ]);
    },
  };
}

export function matchCacheKey(source: { platform: string; id: string }, destination: string): string {
  return `${source.platform}:${source.id}>${destination}`;
}
