import type { AdapterContext, PlatformAdapter } from '../adapter';
import { isAbortError, PauseError } from '../errors';
import { isWriteAction } from './plan';
import type { JobStore } from './store';
import type { JobRow, TransferJob } from './types';

export interface RunnerDeps {
  store: JobStore;
  destination: PlatformAdapter;
  ctx: AdapterContext;
  now?: () => Date;
}

export type StepOutcome = 'progressed' | 'idle' | 'paused' | 'awaiting_confirmation' | 'done';

const isWriteRow = (r: JobRow) => r.selected && isWriteAction(r.action);
const isFinished = (r: JobRow) => r.status === 'done' || r.status === 'failed' || r.status === 'skipped';

/**
 * Traite au plus une ligne et enregistre l'état avant et après chaque écriture.
 * Le service worker peut être suspendu entre deux appels : tout l'état utile est dans le store.
 *
 * Idempotence : une ligne restée `in_flight` (interruption pendant l'écriture) n'est
 * jamais renvoyée à l'aveugle. On relit d'abord la note de destination.
 */
export async function runWriteStep(jobId: string, deps: RunnerDeps): Promise<StepOutcome> {
  const { store, destination, ctx } = deps;
  const now = () => (deps.now ?? (() => new Date()))().toISOString();

  const job = await store.getJob(jobId);
  if (!job || job.phase !== 'running') return 'idle';

  const rows = (await store.getRows(jobId)).filter(isWriteRow);
  const remaining = rows.filter((r) => !isFinished(r));
  const saveJob = (patch: Partial<TransferJob>) => store.putJob({ ...job, ...patch, updatedAt: now() });

  const row = remaining[0];
  if (!row) {
    await saveJob({ phase: 'done' });
    return 'done';
  }
  if (!job.testBatchConfirmed && rows.length - remaining.length >= job.testBatchSize) {
    await saveJob({ phase: 'awaiting_confirmation' });
    return 'awaiting_confirmation';
  }

  const finish = (status: JobRow['status'], message: string, extra: Partial<NonNullable<JobRow['outcome']>> = {}) =>
    store.putRows([{ ...row, status, outcome: { at: now(), message, ...extra } }]);

  if (job.dryRun) {
    await finish('done', 'simulation : aucune écriture', { simulated: true });
    return 'progressed';
  }

  const ref = row.match?.ref;
  const target = row.conversion?.value;
  if (!ref || target === undefined || !destination.writeRating) {
    await finish('failed', 'ligne incomplète (correspondance ou note manquante)');
    return 'progressed';
  }

  let sent = false;
  try {
    const current = destination.getExistingRating ? await destination.getExistingRating(ctx, ref) : undefined;
    const resumed = row.status === 'in_flight';

    if (current?.value === target) {
      await finish('done', resumed ? 'déjà enregistrée (vérifiée à la reprise)' : 'déjà présente', { verified: true });
      return 'progressed';
    }
    // La destination a changé depuis l'aperçu : on ne prend pas de décision à la place de l'utilisateur.
    if (!resumed && current !== undefined && (current?.value ?? null) !== (row.existing?.value ?? null)) {
      await finish('skipped', "la note de destination a changé depuis l'aperçu ; elle est conservée");
      return 'progressed';
    }

    const inFlight: JobRow = { ...row, status: 'in_flight', attempts: row.attempts + 1 };
    await store.putRows([inFlight]);

    sent = true;
    const result = await destination.writeRating(ctx, ref, target);
    if (!result.ok) {
      await store.putRows([{ ...inFlight, status: 'failed', outcome: { at: now(), message: result.reason } }]);
      return 'progressed';
    }

    if (!destination.getExistingRating) {
      await store.putRows([{ ...inFlight, status: 'done', outcome: { at: now(), message: 'enregistrée', verified: false } }]);
      return 'progressed';
    }
    const after = await destination.getExistingRating(ctx, ref);
    const verified = after?.value === target;
    await store.putRows([
      {
        ...inFlight,
        status: verified ? 'done' : 'failed',
        outcome: {
          at: now(),
          message: verified ? 'enregistrée et vérifiée' : `non confirmée : la destination indique ${after?.value ?? 'aucune note'}`,
          verified,
        },
      },
    ]);
    return 'progressed';
  } catch (e) {
    if (isAbortError(e) || ctx.signal.aborted) throw e;
    if (e instanceof PauseError) {
      // La ligne garde son statut : si elle était `in_flight`, elle sera vérifiée à la reprise.
      await saveJob({ phase: 'paused', pause: pauseInfo(e, now(), 'running') });
      return 'paused';
    }
    const latest = (await store.getRow(jobId, row.rowId)) ?? row;
    const message = e instanceof Error ? e.message : String(e);
    // L'erreur a pu survenir après que le site a enregistré la note : on vérifie avant de conclure.
    if (sent && destination.getExistingRating) {
      const after = await destination.getExistingRating(ctx, ref).catch(() => undefined);
      if (after?.value === target) {
        await store.putRows([
          { ...latest, status: 'done', outcome: { at: now(), message: `enregistrée malgré l'erreur « ${message} »`, verified: true } },
        ]);
        return 'progressed';
      }
    }
    await store.putRows([{ ...latest, status: 'failed', outcome: { at: now(), message } }]);
    return 'progressed';
  }
}

/** Enchaîne les étapes jusqu'à une pause, la fin du lot de test, la fin du job ou l'annulation. */
export async function runUntilStopped(jobId: string, deps: RunnerDeps): Promise<StepOutcome> {
  for (;;) {
    const outcome = await runWriteStep(jobId, deps);
    if (outcome !== 'progressed' || deps.ctx.signal.aborted) return outcome;
  }
}

export function pauseInfo(e: PauseError, at: string, resumePhase: NonNullable<TransferJob['pause']>['resumePhase']) {
  return { kind: e.kind, message: e.message, at, resumePhase, ...(e.detail?.url && { url: e.detail.url }) };
}

async function transition(store: JobStore, jobId: string, from: TransferJob['phase'][], patch: Partial<TransferJob>) {
  const job = await store.getJob(jobId);
  if (!job || !from.includes(job.phase)) return false;
  await store.putJob({ ...job, ...patch, updatedAt: new Date().toISOString() });
  return true;
}

/** Refuse de démarrer un transfert réel tant que la sauvegarde n'a pas été exportée. */
export async function startWriting(store: JobStore, jobId: string): Promise<boolean> {
  const job = await store.getJob(jobId);
  if (!job || (!job.dryRun && !job.backupSavedAt)) return false;
  return transition(store, jobId, ['review'], { phase: 'running' });
}

export const confirmTestBatch = (store: JobStore, jobId: string) =>
  transition(store, jobId, ['awaiting_confirmation'], { phase: 'running', testBatchConfirmed: true });

export async function pauseByUser(store: JobStore, jobId: string): Promise<boolean> {
  const job = await store.getJob(jobId);
  if (!job || !(job.phase === 'reading' || job.phase === 'matching' || job.phase === 'running')) return false;
  return transition(store, jobId, [job.phase], {
    phase: 'paused',
    pause: { kind: 'user', message: 'Mis en pause par vous.', at: new Date().toISOString(), resumePhase: job.phase },
  });
}

export async function resume(store: JobStore, jobId: string): Promise<boolean> {
  const job = await store.getJob(jobId);
  if (!job || job.phase !== 'paused') return false;
  return transition(store, jobId, ['paused'], { phase: job.pause?.resumePhase ?? 'running', pause: undefined });
}

export const cancel = (store: JobStore, jobId: string) =>
  transition(store, jobId, ['reading', 'matching', 'review', 'running', 'awaiting_confirmation', 'paused', 'manual'], {
    phase: 'cancelled',
  });
