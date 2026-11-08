import { useEffect, useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send, type Responses } from '../../background/messages';
import { buildBackup, buildReport, summarize } from '../../core/export';
import { errorMsg, type Msg } from '../../core/i18n';
import { isWriteAction } from '../../core/job/plan';
import { download, stampForFile } from './download';
import { useI18n, type UiKey } from './i18n';
import { ManualChecklist } from './ManualChecklist';
import { Preview } from './Preview';

export function JobView({ jobId, onClosed }: { jobId: string; onClosed: () => void }) {
  const { t, m, l, lang } = useI18n();
  const [state, setState] = useState<Responses['getJob']>();
  const [error, setError] = useState<Msg>();
  const [tick, setTick] = useState(0);
  const [exportInfo, setExportInfo] = useState<{ matched: number; total: number }>();
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    const load = () =>
      send({ type: 'getJob', jobId }).then(
        (s) => alive && setState(s),
        (e: unknown) => alive && setError(errorMsg(e)),
      );
    void load();
    const timer = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, tick]);

  if (!state) return <section class="card">{error ? <p class="notice bad">{m(error)}</p> : t('job.loading')}</section>;
  const { job, rows } = state;
  const src = getAdapter(job.source);
  const dst = getAdapter(job.destination);
  const toWrite = rows.filter((r) => r.selected && isWriteAction(r.action));
  const matched = rows.filter((r) => r.match !== undefined).length;
  const finished = toWrite.filter((r) => r.status === 'done' || r.status === 'failed' || r.status === 'skipped').length;
  const summary = summarize(job, rows);
  const manual = job.writeMode === 'manual';
  const fileDest = !manual && dst.capabilities.write === 'file';
  const act = (p: Promise<unknown>) => {
    setError(undefined);
    p.then(refresh, (e: unknown) => setError(errorMsg(e)));
  };

  /** Export actuel de la destination, pour retrouver les notes déjà présentes (fichier ou « à la main »). */
  const existingExport = (why: UiKey) =>
    dst.parseExport && (
      <div class={`notice ${job.destinationExportAppliedAt ? 'ok' : 'warn'}`}>
        <p>
          <strong>{t('job.existingTitle', { platform: dst.displayName })}</strong> {t(why)} {t('job.existingBody', { platform: dst.displayName })}
        </p>
        <p class="muted small">{l(dst.exportInstructions)}</p>
        <input
          type="file"
          accept={dst.exportFileTypes}
          aria-label={t('job.existingLabel', { platform: dst.displayName })}
          onChange={(e) => void applyExport((e.target as HTMLInputElement).files?.[0])}
        />
        {exportInfo && <p>{t('job.existingInfo', { ...exportInfo, platform: dst.displayName })}</p>}
      </div>
    );

  function saveBackup() {
    const b = buildBackup(job, rows, new Date(), lang);
    const base = `${t('file.backup')}-${job.source}-${stampForFile()}`;
    download(`${base}.json`, b.json, 'application/json');
    download(`${base}.csv`, b.csv, 'text/csv;charset=utf-8');
    act(send({ type: 'markBackupSaved', jobId }));
  }

  async function applyExport(f: File | undefined) {
    if (!f || !dst.parseExport) return;
    setExportInfo(undefined);
    setError(undefined);
    try {
      const entries = await dst.parseExport({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      const { matched } = await send({ type: 'applyDestinationExport', jobId, entries });
      setExportInfo({ matched, total: entries.filter((e) => e.rating).length });
      refresh();
    } catch (e) {
      setError(errorMsg(e));
    }
  }

  function downloadImport() {
    const files = dst.buildImportFiles?.(toWrite.map((r) => ({ work: r.entry.work, value: r.conversion!.value }))) ?? [];
    for (const f of files) download(f.name, f.content, f.mimeType);
    return files;
  }

  function generateImport() {
    const files = downloadImport();
    act(send({ type: 'completeFileExport', jobId, fileNames: files.map((f) => f.name) }));
  }

  function saveReport() {
    const r = buildReport(job, rows, new Date(), lang);
    const base = `${t('file.report')}-${stampForFile()}`;
    download(`${base}.json`, r.json, 'application/json');
    download(`${base}.csv`, r.csv, 'text/csv;charset=utf-8');
  }

  const progress =
    job.phase === 'reading'
      ? job.readTotal ? rows.length / job.readTotal : 0
      : job.phase === 'matching'
        ? rows.length ? matched / rows.length : 0
        : toWrite.length ? finished / toWrite.length : 0;

  return (
    <>
      <section class="card">
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>
            {src.displayName} → {dst.displayName} {job.dryRun && <span class="badge review">{t('job.simulation')}</span>}
          </h2>
          <div class="row">
            {(job.phase === 'reading' || job.phase === 'matching' || job.phase === 'running') && (
              <button onClick={() => act(send({ type: 'pause', jobId }))}>{t('job.pause')}</button>
            )}
            {job.phase !== 'done' && job.phase !== 'cancelled' && (
              <button class="danger" onClick={() => confirm(t('job.cancelConfirm')) && act(send({ type: 'cancel', jobId }))}>
                {t('job.cancel')}
              </button>
            )}
            <button onClick={onClosed}>{t('job.close')}</button>
          </div>
        </div>
        <p>
          <strong>{t(`phase.${job.phase}`)}</strong>
        </p>
        {(job.phase === 'reading' || job.phase === 'matching' || job.phase === 'running') && (
          <>
            <div class="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p class="muted small">
              {job.phase === 'reading' && (job.readTotal ? t('job.readOf', { count: rows.length, total: job.readTotal }) : t('job.read', { count: rows.length }))}
              {job.phase === 'matching' && t('job.matching', { done: matched, total: rows.length, platform: dst.displayName })}
              {job.phase === 'running' && t('job.running', { done: finished, total: toWrite.length })}
              {' · '}{t('job.spaced')}
            </p>
          </>
        )}

        {job.phase === 'paused' && job.pause && (
          <div class={`notice ${job.pause.kind === 'user' ? 'warn' : 'bad'}`}>
            <p>{m(job.pause.message)}</p>
            {job.pause.kind === 'blocked' && (
              <p>
                {t('job.pauseOpen')} {job.pause.url ? <a href={job.pause.url} target="_blank" rel="noreferrer">{t('job.pauseTheSite')}</a> : t('job.pauseTheSite')}
                {t('job.pauseSolve')}
              </p>
            )}
            {job.pause.kind === 'signed_out' && <p>{t('job.pauseSignedOut')}</p>}
            {job.pause.kind !== 'adapter_outdated' && <button onClick={() => act(send({ type: 'resume', jobId }))}>{t('job.resume')}</button>}
          </div>
        )}

        {(job.phase === 'review' || job.phase === 'awaiting_confirmation' || job.phase === 'done' || job.phase === 'running' || job.phase === 'manual') && (
          <div class="stats">
            <div>
              <strong>{rows.length}</strong>
              <span class="muted small">{t('stats.read')}</span>
            </div>
            <div>
              <strong>{toWrite.length}</strong>
              <span class="muted small">{t('stats.toWrite')}</span>
            </div>
            <div>
              <strong>{summary.done}</strong>
              <span class="muted small">{t(job.dryRun ? 'stats.simulated' : 'stats.done')}</span>
            </div>
            <div>
              <strong>{summary.failed}</strong>
              <span class="muted small">{t('stats.failed')}</span>
            </div>
            <div>
              <strong>{summary.skipped}</strong>
              <span class="muted small">{t('stats.skipped')}</span>
            </div>
          </div>
        )}

        {job.phase === 'review' && fileDest && (
          <>
            <h3>{t('job.importFile', { platform: dst.displayName })}</h3>
            {dst.capabilities.writeSideEffects && <p class="notice warn">{l(dst.capabilities.writeSideEffects)}</p>}
            <p class="muted small">{t('job.importHelp', { platform: dst.displayName })}</p>
            {existingExport('job.importerOverwrites')}
            <div class="row">
              <button onClick={saveBackup}>{t('job.backupOptional')}</button>
              <button class="primary" disabled={!toWrite.length} onClick={generateImport}>
                {t('job.generateImport', { count: toWrite.length })}
              </button>
            </div>
          </>
        )}

        {job.phase === 'review' && manual && (
          <>
            <h3>{t('job.manualList', { platform: dst.displayName })}</h3>
            <p class="muted small">{l(dst.manualWrite?.instructions)}</p>
            {existingExport('job.manualWhy')}
            <div class="row">
              <button onClick={saveBackup}>{t('job.backupOptional')}</button>
              <button class="primary" disabled={!toWrite.length} onClick={() => act(send({ type: 'startManual', jobId }))}>
                {t('job.startList', { count: toWrite.length })}
              </button>
            </div>
          </>
        )}

        {(job.phase === 'manual' || (job.phase === 'done' && manual)) && (
          <ManualChecklist job={job} rows={toWrite} onChanged={refresh} onError={setError} />
        )}

        {job.phase === 'done' && fileDest && dst.importInstructions && (
          <div class="notice ok">
            <p>
              <strong>{t('job.lastStep', { platform: dst.displayName })}</strong>
            </p>
            <p>{l(dst.importInstructions)}</p>
            <button onClick={() => downloadImport()}>{t('job.redownload')}</button>
          </div>
        )}

        {job.phase === 'review' && !fileDest && !manual && (
          <>
            <h3>{t('job.beforeWrite')}</h3>
            {dst.capabilities.writeSideEffects && <p class="notice warn">{l(dst.capabilities.writeSideEffects)}</p>}
            <div class="row">
              <label class="field">
                {t('job.conflicts')}
                <select
                  value={job.conflictPolicy}
                  onChange={(e) =>
                    act(send({ type: 'setConflictPolicy', jobId, policy: (e.target as HTMLSelectElement).value as 'keep' | 'overwrite' }))
                  }
                >
                  <option value="keep">{t('job.keep')}</option>
                  <option value="overwrite">{t('job.overwrite')}</option>
                </select>
              </label>
            </div>
            <ol>
              <li>
                <button onClick={saveBackup}>{t('job.backup')}</button>{' '}
                {job.backupSavedAt ? (
                  <span class="badge done">{t('job.backupSaved')}</span>
                ) : (
                  <span class="muted small">{t(job.dryRun ? 'job.backupHintDry' : 'job.backupHintReal', { platform: dst.displayName })}</span>
                )}
              </li>
              <li>
                <button
                  class="primary"
                  disabled={!toWrite.length || (!job.dryRun && !job.backupSavedAt)}
                  onClick={() =>
                    (job.dryRun || confirm(t('job.confirmWrite', { count: Math.min(job.testBatchSize, toWrite.length), platform: dst.displayName }))) &&
                    act(send({ type: 'startWriting', jobId }))
                  }
                >
                  {t(job.dryRun ? 'job.simulateBatch' : 'job.writeBatch', { count: Math.min(job.testBatchSize, toWrite.length) })}
                </button>
              </li>
            </ol>
          </>
        )}

        {job.phase === 'awaiting_confirmation' && (
          <div class="notice ok">
            <p>{t(job.dryRun ? 'job.batchDone' : 'job.batchDoneReal', { platform: dst.displayName })}</p>
            <button
              class="primary"
              onClick={() =>
                (job.dryRun || confirm(t('job.confirmRest', { count: toWrite.length - finished, platform: dst.displayName }))) &&
                act(send({ type: 'confirmTestBatch', jobId }))
              }
            >
              {t('job.continue', { count: toWrite.length - finished })}
            </button>
          </div>
        )}

        {(job.phase === 'done' || job.phase === 'awaiting_confirmation' || job.phase === 'cancelled' || job.phase === 'paused' || job.phase === 'manual') &&
          rows.length > 0 && (
          <p>
            <button onClick={saveReport}>{t('job.exportReport')}</button>
          </p>
        )}
        {error && <p class="notice bad">{m(error)}</p>}
      </section>

      {rows.length > 0 && job.phase !== 'reading' && (
        <section class="card">
          <Preview job={job} rows={rows} editable={job.phase === 'review'} onChanged={refresh} />
        </section>
      )}
    </>
  );
}
