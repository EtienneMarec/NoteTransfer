import { LocalizedError, msg, type Lang, type Msg } from '../core/i18n';
import type { SessionStatus } from '../core/adapter';
import type { JobRow, TransferJob } from '../core/job/types';
import type { PivotEntry, PlatformId } from '../core/pivot';

export interface Settings {
  minDelayMs: number;
  maxDelayMs: number;
  /** Langue de l'interface ; absente = langue du navigateur. */
  language?: Lang;
  /** Date d'acceptation de l'avertissement CGU, par plateforme. */
  termsAccepted: Partial<Record<PlatformId, string>>;
}

export const DEFAULT_SETTINGS: Settings = { minDelayMs: 2000, maxDelayMs: 4000, termsAccepted: {} };

export type Request =
  | { type: 'checkSessions'; platforms: PlatformId[] }
  | {
      type: 'createJob';
      job: Pick<TransferJob, 'source' | 'destination' | 'dryRun' | 'rounding' | 'conflictPolicy' | 'testBatchSize' | 'writeMode'>;
      /** Source par fichier : entrées déjà lues dans la page de l'application. */
      entries?: PivotEntry[];
    }
  | { type: 'setRowsSelected'; jobId: string; rowIds: string[]; selected: boolean }
  | { type: 'completeFileExport'; jobId: string; fileNames: string[] }
  | { type: 'applyDestinationExport'; jobId: string; entries: PivotEntry[] }
  | { type: 'startManual'; jobId: string }
  | { type: 'setManualRowStatus'; jobId: string; rowId: string; status: 'done' | 'skipped' | 'pending' }
  | { type: 'listJobs' }
  | { type: 'getJob'; jobId: string }
  | { type: 'pause'; jobId: string }
  | { type: 'resume'; jobId: string }
  | { type: 'cancel'; jobId: string }
  | { type: 'deleteJob'; jobId: string }
  | { type: 'setRowSelected'; jobId: string; rowId: string; selected: boolean }
  | { type: 'setRowCandidate'; jobId: string; rowId: string; candidateId: string | null }
  | { type: 'setRowUrl'; jobId: string; rowId: string; url: string }
  | { type: 'setConflictPolicy'; jobId: string; policy: TransferJob['conflictPolicy'] }
  | { type: 'markBackupSaved'; jobId: string }
  | { type: 'startWriting'; jobId: string }
  | { type: 'confirmTestBatch'; jobId: string }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; settings: Settings }
  | { type: 'deleteAll' };

export interface Responses {
  checkSessions: Partial<Record<PlatformId, SessionStatus>>;
  createJob: { jobId: string };
  setRowsSelected: true;
  completeFileExport: true;
  applyDestinationExport: { matched: number };
  startManual: boolean;
  setManualRowStatus: JobRow;
  listJobs: TransferJob[];
  getJob: { job: TransferJob; rows: JobRow[]; active: boolean } | null;
  pause: boolean;
  resume: boolean;
  cancel: boolean;
  deleteJob: true;
  setRowSelected: JobRow;
  setRowCandidate: JobRow;
  setRowUrl: JobRow;
  setConflictPolicy: true;
  markBackupSaved: true;
  startWriting: boolean;
  confirmTestBatch: boolean;
  getSettings: Settings;
  saveSettings: true;
  deleteAll: true;
}

export type Reply<T extends Request['type']> = { ok: true; value: Responses[T] } | { ok: false; error: Msg };

export async function send<R extends Request>(request: R): Promise<Responses[R['type']]> {
  const reply = (await browser.runtime.sendMessage(request)) as Reply<R['type']> | undefined;
  if (!reply) throw new LocalizedError(msg('err.noBackground'));
  if (!reply.ok) throw new LocalizedError(reply.error);
  return reply.value;
}
