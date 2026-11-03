import type { AdapterContext, Candidate, PlatformAdapter, WorkQuery } from '../adapter';
import { isAbortError, PauseError } from '../errors';
import { decideMatch } from '../match/score';
import type { PivotEntry, PivotWork, PlatformRef } from '../pivot';
import { isWriteAction, planRow } from './plan';
import { pauseInfo } from './runner';
import { matchCacheKey, type JobStore } from './store';
import type { JobRow, RowMatch, TransferJob } from './types';

export interface PipelineDeps {
  store: JobStore;
  source: PlatformAdapter;
  destination: PlatformAdapter;
  sourceCtx: AdapterContext;
  destinationCtx: AdapterContext;
  now?: () => Date;
}

export type PipelineOutcome = 'progressed' | 'idle' | 'paused';

const stamp = (deps: PipelineDeps) => (deps.now ?? (() => new Date()))().toISOString();

export function newJob(
  init: Pick<TransferJob, 'source' | 'destination' | 'dryRun' | 'rounding' | 'conflictPolicy' | 'testBatchSize'>,
  now = new Date(),
): TransferJob {
  return {
    ...init,
    id: `job-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    phase: 'reading',
    readCursor: null,
    testBatchConfirmed: false,
  };
}

/** Identifiant de ligne stable : relire une page déjà lue ne crée pas de doublon. */
export function rowIdOf(entry: PivotEntry): string {
  const ref = entry.work.refs.find((r) => r.platform === entry.source.platform);
  if (!ref) throw new Error(`Entrée sans référence ${entry.source.platform}`);
  return `${ref.platform}:${ref.id}`;
}

export function queryOf(work: PivotWork): WorkQuery {
  return {
    title: work.title,
    ...(work.originalTitle && { originalTitle: work.originalTitle }),
    ...(work.year && { year: work.year }),
    ...(work.directors && { directors: work.directors }),
    ...(work.runtimeMinutes && { runtimeMinutes: work.runtimeMinutes }),
    externalIds: work.externalIds,
  };
}

async function onPause<T>(deps: PipelineDeps, job: TransferJob, resumePhase: 'reading' | 'matching', run: () => Promise<T>) {
  try {
    return await run();
  } catch (e) {
    if (isAbortError(e)) throw e;
    if (e instanceof PauseError) {
      await deps.store.putJob({ ...job, phase: 'paused', updatedAt: stamp(deps), pause: pauseInfo(e, stamp(deps), resumePhase) });
      return 'paused' as const;
    }
    throw e;
  }
}

/** Lit une page de notes source et l'enregistre. Reprend au curseur sauvegardé. */
export async function runReadStep(jobId: string, deps: PipelineDeps): Promise<PipelineOutcome> {
  const job = await deps.store.getJob(jobId);
  if (!job || job.phase !== 'reading' || !deps.source.readRatings) return 'idle';

  return onPause(deps, job, 'reading', async () => {
    const page = await deps.source.readRatings!(deps.sourceCtx, job.readCursor);
    const known = await deps.store.getRows(jobId);
    const knownIds = new Map(known.map((r) => [r.rowId, r]));
    let order = known.length;
    const rows: JobRow[] = page.items
      .filter((e) => e.work.kind === 'movie')
      .map((entry) => {
        const rowId = rowIdOf(entry);
        const existing = knownIds.get(rowId);
        return existing
          ? { ...existing, entry }
          : { jobId, rowId, order: order++, entry, selected: false, status: 'pending' as const, attempts: 0 };
      });
    await deps.store.putRows(rows);
    await deps.store.putJob({
      ...job,
      readCursor: page.nextCursor,
      ...(page.total !== undefined && { readTotal: page.total }),
      phase: page.nextCursor ? 'reading' : 'matching',
      updatedAt: stamp(deps),
    });
    return 'progressed' as const;
  });
}

/** Source par fichier : les entrées déjà lues remplacent la phase de lecture. */
export async function importEntries(store: JobStore, job: TransferJob, entries: PivotEntry[]): Promise<void> {
  const seen = new Set<string>();
  const rows: JobRow[] = [];
  for (const entry of entries) {
    if (entry.work.kind !== 'movie') continue;
    const rowId = rowIdOf(entry);
    if (seen.has(rowId)) continue; // une ligne par film, même si le fichier le répète
    seen.add(rowId);
    rows.push({ jobId: job.id, rowId, order: rows.length, entry, selected: false, status: 'pending', attempts: 0 });
  }
  await store.putRows(rows);
  await store.putJob({ ...job, phase: 'matching', readCursor: null, readTotal: rows.length, updatedAt: new Date().toISOString() });
}

/**
 * Destination par fichier : c'est l'importeur de la plateforme qui rapprochera les films.
 * Avec un ID externe qu'il sait lire, le rapprochement est exact ; sinon il se fera par titre et année,
 * et la ligne doit être validée par l'utilisateur.
 */
function fileMatch(destination: PlatformAdapter, row: JobRow): RowMatch {
  const ids = destination.capabilities.lookupByExternalId.filter((k) => row.entry.work.externalIds[k] !== undefined);
  const ref: PlatformRef = { platform: destination.id, id: 'fichier-import' };
  return ids.length
    ? { confidence: 'sure', ref, reason: `${destination.displayName} rapprochera par identifiant ${ids.join('/').toUpperCase()}`, candidates: [], confirmedByUser: false }
    : {
        confidence: 'review',
        ref,
        reason: `${destination.displayName} rapprochera par titre et année : vérifiez son récapitulatif avant de confirmer`,
        candidates: [],
        confirmedByUser: false,
      };
}

async function plan(deps: PipelineDeps, job: TransferJob, row: JobRow): Promise<JobRow> {
  const p = planRow({
    row,
    destinationScale: deps.destination.capabilities.scale,
    rounding: job.rounding,
    conflictPolicy: job.conflictPolicy,
  });
  return { ...row, ...p };
}

/** Recherche la correspondance et la note existante d'une ligne, puis calcule l'action prévue. */
export async function runMatchStep(jobId: string, deps: PipelineDeps): Promise<PipelineOutcome> {
  const { store, destination, destinationCtx: ctx } = deps;
  const job = await store.getJob(jobId);
  if (!job || job.phase !== 'matching') return 'idle';

  const row = (await store.getRows(jobId)).find((r) => r.match === undefined);
  if (!row) {
    await store.putJob({ ...job, phase: 'review', updatedAt: stamp(deps) });
    return 'progressed';
  }

  return onPause(deps, job, 'matching', async () => {
    // Pas de note source : inutile d'interroger la destination.
    if (!row.entry.rating) {
      await store.putRows([await plan(deps, job, { ...row, match: { confidence: 'not_found', reason: 'pas de note source', candidates: [], confirmedByUser: false } })]);
      return 'progressed' as const;
    }

    if (destination.capabilities.write === 'file') {
      await store.putRows([await plan(deps, job, { ...row, match: fileMatch(destination, row), existing: null })]);
      return 'progressed' as const;
    }

    const sourceRef = row.entry.work.refs.find((r) => r.platform === job.source)!;
    const cached = await store.getCachedMatch(matchCacheKey(sourceRef, job.destination));
    let match: RowMatch;
    if (cached) {
      const ref: PlatformRef = { platform: job.destination, id: cached.destinationId, ...(cached.destinationUrl && { url: cached.destinationUrl }) };
      match = {
        confidence: 'sure',
        ref,
        reason: cached.confirmedByUser ? 'correspondance validée par vous' : 'correspondance mémorisée',
        candidates: [],
        confirmedByUser: cached.confirmedByUser,
      };
    } else {
      const query = queryOf(row.entry.work);
      const candidates = destination.searchFilm ? await destination.searchFilm(ctx, query) : [];
      const d = decideMatch(query, candidates);
      match = {
        confidence: d.confidence,
        ...(d.best && { ref: d.best.candidate.ref, score: d.best.score }),
        reason: d.reason,
        candidates: d.ranked.map((s) => ({ candidate: s.candidate, score: s.score })),
        confirmedByUser: false,
      };
      if (d.confidence === 'sure' && d.best) {
        await store.putCachedMatch({
          key: matchCacheKey(sourceRef, job.destination),
          destinationId: d.best.candidate.ref.id,
          ...(d.best.candidate.ref.url && { destinationUrl: d.best.candidate.ref.url }),
          confirmedByUser: false,
          savedAt: stamp(deps),
        });
      }
    }

    const existing = match.ref && destination.getExistingRating ? await destination.getExistingRating(ctx, match.ref) : null;
    await store.putRows([await plan(deps, job, { ...row, match, existing })]);
    return 'progressed' as const;
  });
}

// ---- Corrections de l'aperçu ------------------------------------------------------------

/**
 * L'utilisateur choisit (ou valide) la correspondance d'une ligne.
 * `candidate` null = « aucun film ne correspond ».
 */
export async function setRowMatch(
  jobId: string,
  rowId: string,
  candidate: Candidate | null,
  deps: Pick<PipelineDeps, 'store' | 'destination' | 'destinationCtx' | 'now'>,
): Promise<JobRow> {
  const { store, destination } = deps;
  const job = await store.getJob(jobId);
  const row = await store.getRow(jobId, rowId);
  if (!job || !row || job.phase !== 'review') throw new Error('Correction impossible dans cet état');
  const sourceRef = row.entry.work.refs.find((r) => r.platform === job.source)!;

  const previous = row.match?.candidates ?? [];
  const candidates =
    candidate && !previous.some((c) => c.candidate.ref.id === candidate.ref.id) ? [{ candidate, score: 0 }, ...previous] : previous;
  const match: RowMatch = candidate
    ? { confidence: 'sure', ref: candidate.ref, reason: 'choisie par vous', candidates, confirmedByUser: true }
    : { confidence: 'not_found', reason: 'aucune correspondance selon vous', candidates, confirmedByUser: true };

  const existing =
    candidate && destination.getExistingRating ? await destination.getExistingRating(deps.destinationCtx, candidate.ref) : null;
  if (candidate) {
    await store.putCachedMatch({
      key: matchCacheKey(sourceRef, job.destination),
      destinationId: candidate.ref.id,
      ...(candidate.ref.url && { destinationUrl: candidate.ref.url }),
      confirmedByUser: true,
      savedAt: (deps.now ?? (() => new Date()))().toISOString(),
    });
  }
  const planned = planRow({
    row: { ...row, match, existing },
    destinationScale: destination.capabilities.scale,
    rounding: job.rounding,
    conflictPolicy: job.conflictPolicy,
  });
  const next: JobRow = { ...row, match, existing, ...planned };
  await store.putRows([next]);
  return next;
}

/**
 * Coche ou décoche une ligne. Cocher une ligne « à vérifier » vaut validation de la correspondance ;
 * cocher un conflit vaut écrasement explicite pour cette ligne.
 */
export async function setRowSelected(store: JobStore, jobId: string, rowId: string, selected: boolean): Promise<JobRow> {
  const job = await store.getJob(jobId);
  const row = await store.getRow(jobId, rowId);
  if (!job || !row || job.phase !== 'review') throw new Error('Sélection impossible dans cet état');
  let next: JobRow = { ...row, selected };
  if (selected) {
    if (row.action === 'skip_review' && row.match) {
      next = { ...next, match: { ...row.match, confirmedByUser: true }, action: row.existing ? 'overwrite' : 'create' };
      if (row.existing && row.existing.value === row.conversion?.value) next = { ...next, action: 'skip_identical', selected: false };
    } else if (row.action === 'skip_conflict') {
      next = { ...next, action: 'overwrite' };
    } else if (row.action !== 'create' && row.action !== 'overwrite') {
      next = { ...next, selected: false }; // identique, introuvable ou sans note : rien à écrire
    }
  } else if (row.action === 'overwrite' && job.conflictPolicy === 'keep') {
    next = { ...next, action: 'skip_conflict' };
  }
  await store.putRows([next]);
  return next;
}

/** Coche ou décoche plusieurs lignes (ex. « valider toutes les lignes affichées »). */
export async function setRowsSelected(store: JobStore, jobId: string, rowIds: string[], selected: boolean): Promise<void> {
  for (const rowId of rowIds) await setRowSelected(store, jobId, rowId, selected);
}

/** Destination par fichier : les lignes cochées sont incluses dans le fichier d'import généré. */
export async function completeFileExport(store: JobStore, jobId: string, fileNames: string[], now = new Date()): Promise<void> {
  const job = await store.getJob(jobId);
  if (!job || job.phase !== 'review') throw new Error('Export impossible dans cet état');
  const rows = await store.getRows(jobId);
  const message = `incluse dans ${fileNames.join(', ')} : à importer sur le site`;
  await store.putRows(
    rows
      .filter((r) => r.selected && isWriteAction(r.action))
      .map((r) => ({ ...r, status: 'done' as const, outcome: { at: now.toISOString(), message, verified: false } })),
  );
  await store.putJob({ ...job, phase: 'done', updatedAt: now.toISOString() });
}

/** Applique une politique de conflit à toutes les lignes en conflit. */
export async function setConflictPolicy(
  deps: Pick<PipelineDeps, 'store' | 'destination'>,
  jobId: string,
  conflictPolicy: TransferJob['conflictPolicy'],
): Promise<void> {
  const job = await deps.store.getJob(jobId);
  if (!job || job.phase !== 'review') throw new Error('Modification impossible dans cet état');
  const updatedJob = { ...job, conflictPolicy, updatedAt: new Date().toISOString() };
  await deps.store.putJob(updatedJob);
  const rows = await deps.store.getRows(jobId);
  const replanned = rows
    .filter((r) => r.action === 'skip_conflict' || r.action === 'overwrite')
    .map((r) => {
      const p = planRow({ row: r, destinationScale: deps.destination.capabilities.scale, rounding: job.rounding, conflictPolicy });
      return { ...r, ...p };
    });
  await deps.store.putRows(replanned);
}
