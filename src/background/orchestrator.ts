import { getAdapter } from '../adapters/registry';
import type { AdapterContext, PlatformAdapter, SessionStatus } from '../core/adapter';
import { isAbortError, PauseError } from '../core/errors';
import { createHttpClient, DEFAULT_POLICY } from '../core/http/client';
import {
  applyDestinationExport,
  completeFileExport,
  importEntries,
  newJob,
  runMatchStep,
  runReadStep,
  setConflictPolicy,
  setRowMatch,
  setRowSelected,
  setRowsSelected,
} from '../core/job/pipeline';
import { cancel, confirmTestBatch, pauseByUser, resume, runWriteStep, startWriting } from '../core/job/runner';
import { openJobStore, type JobStore } from '../core/job/store';
import type { TransferJob } from '../core/job/types';
import { createLogger, type LogRecord } from '../core/log';
import { OPTIONAL_HOST_PERMISSIONS } from '../core/permissions';
import type { PlatformId } from '../core/pivot';
import { DEFAULT_SETTINGS, type Request, type Responses, type Settings } from './messages';
import { fetchTransport, siteTransport, TabPool } from './site-bridge';

const ALARM = 'notes-transfert-tick';
const LOG_LIMIT = 300;
const ACTIVE_PHASES: TransferJob['phase'][] = ['reading', 'matching', 'running'];

const logs: LogRecord[] = [];
const log = createLogger((r) => {
  logs.push(r);
  if (logs.length > LOG_LIMIT) logs.shift();
});

let storePromise: Promise<JobStore> | undefined;
const getStore = () => (storePromise ??= openJobStore());
const tabs = new TabPool();

/** Toutes les mutations d'un job passent par ce verrou : une étape ou une action à la fois. */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

let driving: { jobId: string; abort: AbortController } | undefined;

async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

async function contextFor(adapter: PlatformAdapter, signal: AbortSignal): Promise<AdapterContext> {
  const s = await getSettings();
  const policy = { ...DEFAULT_POLICY, minDelayMs: s.minDelayMs, maxDelayMs: Math.max(s.minDelayMs, s.maxDelayMs) };
  return {
    http: createHttpClient({
      transport: adapter.site ? siteTransport(adapter.site, tabs) : fetchTransport,
      policyFor: () => policy,
      log,
    }),
    settings: {},
    signal,
    log,
  };
}

async function hasPermissions(adapter: PlatformAdapter): Promise<boolean> {
  return adapter.hostPermissions.length === 0 || browser.permissions.contains({ origins: [...adapter.hostPermissions] });
}

async function checkSession(id: PlatformId): Promise<SessionStatus> {
  const adapter = getAdapter(id);
  if (!(await hasPermissions(adapter))) return { state: 'needs_setup', what: 'permission' };
  const ctx = await contextFor(adapter, new AbortController().signal);
  try {
    return await adapter.checkSession(ctx);
  } catch (e) {
    if (e instanceof PauseError && e.kind === 'blocked') return { state: 'blocked', reason: e.detail?.reason ?? 'forbidden', ...(e.detail?.url && { url: e.detail.url }) };
    if (e instanceof PauseError && e.kind === 'signed_out') return { state: 'signed_out', loginUrl: adapter.site?.loginUrl ?? '' };
    throw e;
  }
}

/** Fait avancer un job jusqu'à une pause, une attente de l'utilisateur ou la fin. */
async function drive(jobId: string): Promise<void> {
  if (driving) return;
  const abort = new AbortController();
  driving = { jobId, abort };
  await browser.alarms.create(ALARM, { periodInMinutes: 0.5 });
  try {
    const store = await getStore();
    const first = await store.getJob(jobId);
    if (!first) return;
    const source = getAdapter(first.source);
    const destination = getAdapter(first.destination);
    const sourceCtx = await contextFor(source, abort.signal);
    const destinationCtx = await contextFor(destination, abort.signal);
    const deps = { store, source, destination, sourceCtx, destinationCtx };

    for (;;) {
      if (abort.signal.aborted) return;
      const outcome = await locked(async () => {
        const job = await store.getJob(jobId);
        switch (job?.phase) {
          case 'reading':
            return runReadStep(jobId, deps);
          case 'matching':
            return runMatchStep(jobId, deps);
          case 'running':
            return runWriteStep(jobId, { store, destination, ctx: destinationCtx });
          default:
            return 'idle';
        }
      });
      if (outcome !== 'progressed') {
        const job = await store.getJob(jobId);
        if (job && ACTIVE_PHASES.includes(job.phase) && outcome === 'idle') continue; // changement de phase
        if (job?.phase === 'paused') log.warn(`Transfert en pause : ${job.pause?.message}`);
        return;
      }
    }
  } catch (e) {
    if (!isAbortError(e)) {
      log.error('Erreur inattendue', { message: e instanceof Error ? e.message : String(e) });
      const store = await getStore();
      const job = await store.getJob(jobId);
      if (job && ACTIVE_PHASES.includes(job.phase)) {
        await store.putJob({
          ...job,
          phase: 'paused',
          updatedAt: new Date().toISOString(),
          pause: {
            kind: 'network',
            message: e instanceof Error ? e.message : String(e),
            at: new Date().toISOString(),
            resumePhase: job.phase as 'reading' | 'matching' | 'running',
          },
        });
      }
    }
  } finally {
    driving = undefined;
    await browser.alarms.clear(ALARM);
    await tabs.closeCreated();
  }
}

/** Reprend un job actif après une suspension du service worker. */
export async function resumeActive(): Promise<void> {
  const store = await getStore();
  const active = (await store.listJobs()).find((j) => ACTIVE_PHASES.includes(j.phase));
  if (active) void drive(active.id);
}

/** Au démarrage du navigateur, on ne relance pas d'écritures sans l'utilisateur : on met en pause. */
export async function pauseAfterBrowserRestart(): Promise<void> {
  const store = await getStore();
  for (const job of await store.listJobs()) {
    if (!ACTIVE_PHASES.includes(job.phase)) continue;
    await store.putJob({
      ...job,
      phase: 'paused',
      updatedAt: new Date().toISOString(),
      pause: {
        kind: 'user',
        message: 'Interrompu par la fermeture du navigateur. Cliquez sur Reprendre pour continuer.',
        at: new Date().toISOString(),
        resumePhase: job.phase as 'reading' | 'matching' | 'running',
      },
    });
  }
}

export function onAlarm(name: string) {
  if (name === ALARM) void resumeActive();
}

async function reviewDeps(jobId: string) {
  const store = await getStore();
  const job = await store.getJob(jobId);
  if (!job) throw new Error('Transfert introuvable');
  const destination = getAdapter(job.destination);
  return { store, job, destination, destinationCtx: await contextFor(destination, new AbortController().signal) };
}

export async function handle(req: Request): Promise<Responses[Request['type']]> {
  const store = await getStore();
  switch (req.type) {
    case 'checkSessions': {
      const out: Partial<Record<PlatformId, SessionStatus>> = {};
      for (const p of req.platforms) out[p] = await checkSession(p);
      await tabs.closeCreated();
      return out;
    }
    case 'createJob': {
      if (driving) throw new Error('Un transfert est déjà en cours');
      const fromFile = getAdapter(req.job.source).capabilities.read === 'file';
      if (fromFile && !req.entries?.length) throw new Error('Aucun film lu dans le fichier');
      // Une destination par fichier n'écrit rien sur un site : la simulation n'a pas de sens.
      const toFile = getAdapter(req.job.destination).capabilities.write === 'file';
      const job = newJob({ ...req.job, dryRun: toFile ? false : req.job.dryRun });
      await store.putJob(job);
      if (fromFile) await importEntries(store, job, req.entries!);
      log.info(`Nouveau transfert ${job.source} → ${job.destination}${job.dryRun ? ' (simulation)' : ''}`);
      void drive(job.id);
      return { jobId: job.id };
    }
    case 'setRowsSelected':
      await locked(() => setRowsSelected(store, req.jobId, req.rowIds, req.selected));
      return true;
    case 'completeFileExport':
      await locked(() => completeFileExport(store, req.jobId, req.fileNames));
      return true;
    case 'applyDestinationExport': {
      const { destination } = await reviewDeps(req.jobId);
      return locked(() => applyDestinationExport({ store, destination }, req.jobId, req.entries));
    }
    case 'listJobs':
      return (await store.listJobs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'getJob': {
      const job = await store.getJob(req.jobId);
      return job ? { job, rows: await store.getRows(req.jobId), active: driving?.jobId === req.jobId } : null;
    }
    case 'pause':
      return locked(() => pauseByUser(store, req.jobId));
    case 'resume': {
      const ok = await locked(() => resume(store, req.jobId));
      if (ok) void drive(req.jobId);
      return ok;
    }
    case 'cancel': {
      if (driving?.jobId === req.jobId) driving.abort.abort();
      return locked(() => cancel(store, req.jobId));
    }
    case 'deleteJob': {
      if (driving?.jobId === req.jobId) driving.abort.abort();
      await locked(() => store.deleteJob(req.jobId));
      return true;
    }
    case 'setRowSelected':
      return locked(() => setRowSelected(store, req.jobId, req.rowId, req.selected));
    case 'setRowCandidate': {
      const deps = await reviewDeps(req.jobId);
      const row = await store.getRow(req.jobId, req.rowId);
      const candidate = req.candidateId === null ? null : row?.match?.candidates.find((c) => c.candidate.ref.id === req.candidateId)?.candidate;
      if (candidate === undefined) throw new Error('Candidat inconnu');
      return locked(() => setRowMatch(req.jobId, req.rowId, candidate, deps));
    }
    case 'setRowUrl': {
      const deps = await reviewDeps(req.jobId);
      const ref = deps.destination.parseUrl?.(req.url);
      if (!ref) throw new Error(`Adresse non reconnue pour ${deps.destination.displayName}`);
      const candidate = await deps.destination.getFilm?.(deps.destinationCtx, ref);
      if (!candidate) throw new Error('Film introuvable à cette adresse');
      const row = await locked(() => setRowMatch(req.jobId, req.rowId, candidate, deps));
      await tabs.closeCreated();
      return row;
    }
    case 'setConflictPolicy': {
      const deps = await reviewDeps(req.jobId);
      await locked(() => setConflictPolicy(deps, req.jobId, req.policy));
      return true;
    }
    case 'markBackupSaved':
      await locked(async () => {
        const job = await store.getJob(req.jobId);
        if (job) await store.putJob({ ...job, backupSavedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      });
      return true;
    case 'startWriting': {
      const ok = await locked(() => startWriting(store, req.jobId));
      if (ok) void drive(req.jobId);
      return ok;
    }
    case 'confirmTestBatch': {
      const ok = await locked(() => confirmTestBatch(store, req.jobId));
      if (ok) void drive(req.jobId);
      return ok;
    }
    case 'getSettings':
      return getSettings();
    case 'saveSettings':
      await browser.storage.local.set({ settings: req.settings });
      return true;
    case 'getLogs':
      return [...logs];
    case 'deleteAll': {
      driving?.abort.abort();
      await locked(() => store.clearAll());
      await browser.storage.local.clear();
      logs.length = 0;
      await tabs.closeCreated();
      await browser.permissions.remove({ origins: OPTIONAL_HOST_PERMISSIONS }).catch(() => false);
      return true;
    }
  }
}
