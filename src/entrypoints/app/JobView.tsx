import { useEffect, useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send, type Responses } from '../../background/messages';
import { buildBackup, buildReport, summarize } from '../../core/export';
import { isWriteAction } from '../../core/job/plan';
import { download, stampForFile } from './download';
import { Preview } from './Preview';

const PHASE_LABELS = {
  reading: 'Lecture des notes source',
  matching: 'Recherche des correspondances',
  review: 'Aperçu : à vérifier avant écriture',
  running: 'Écriture en cours',
  awaiting_confirmation: 'Lot de test terminé',
  paused: 'En pause',
  done: 'Terminé',
  cancelled: 'Annulé',
} as const;

export function JobView({ jobId, onClosed }: { jobId: string; onClosed: () => void }) {
  const [state, setState] = useState<Responses['getJob']>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    const load = () =>
      send({ type: 'getJob', jobId }).then(
        (s) => alive && setState(s),
        (e: Error) => alive && setError(e.message),
      );
    void load();
    const timer = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, tick]);

  if (!state) return <section class="card">{error ? <p class="notice bad">{error}</p> : 'Chargement…'}</section>;
  const { job, rows } = state;
  const src = getAdapter(job.source);
  const dst = getAdapter(job.destination);
  const toWrite = rows.filter((r) => r.selected && isWriteAction(r.action));
  const matched = rows.filter((r) => r.match !== undefined).length;
  const finished = toWrite.filter((r) => r.status === 'done' || r.status === 'failed' || r.status === 'skipped').length;
  const summary = summarize(job, rows);
  const act = (p: Promise<unknown>) => {
    setError(undefined);
    p.then(refresh, (e: Error) => setError(e.message));
  };

  function saveBackup() {
    const b = buildBackup(job, rows);
    const base = `notes-transfert-sauvegarde-${job.source}-${stampForFile()}`;
    download(`${base}.json`, b.json, 'application/json');
    download(`${base}.csv`, b.csv, 'text/csv;charset=utf-8');
    act(send({ type: 'markBackupSaved', jobId }));
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
    const r = buildReport(job, rows);
    const base = `notes-transfert-rapport-${stampForFile()}`;
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
            {src.displayName} → {dst.displayName} {job.dryRun && <span class="badge review">simulation</span>}
          </h2>
          <div class="row">
            {(job.phase === 'reading' || job.phase === 'matching' || job.phase === 'running') && (
              <button onClick={() => act(send({ type: 'pause', jobId }))}>Pause</button>
            )}
            {job.phase !== 'done' && job.phase !== 'cancelled' && (
              <button class="danger" onClick={() => confirm('Annuler ce transfert ?') && act(send({ type: 'cancel', jobId }))}>
                Annuler
              </button>
            )}
            <button onClick={onClosed}>Fermer</button>
          </div>
        </div>
        <p>
          <strong>{PHASE_LABELS[job.phase]}</strong>
        </p>
        {(job.phase === 'reading' || job.phase === 'matching' || job.phase === 'running') && (
          <>
            <div class="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p class="muted small">
              {job.phase === 'reading' && `${rows.length} film(s) lu(s)${job.readTotal ? ` sur ${job.readTotal}` : ''}`}
              {job.phase === 'matching' && `${matched} / ${rows.length} film(s) recherché(s) sur ${dst.displayName}`}
              {job.phase === 'running' && `${finished} / ${toWrite.length} note(s) traitée(s)`}
              {' · '}requêtes espacées de quelques secondes, une à la fois.
            </p>
          </>
        )}

        {job.phase === 'paused' && job.pause && (
          <div class={`notice ${job.pause.kind === 'user' ? 'warn' : 'bad'}`}>
            <p>{job.pause.message}</p>
            {job.pause.kind === 'blocked' && (
              <p>
                Ouvrez {job.pause.url ? <a href={job.pause.url} target="_blank" rel="noreferrer">le site</a> : 'le site'}, résolvez la vérification
                vous-même, puis cliquez sur Reprendre. L’extension ne contourne jamais ces protections.
              </p>
            )}
            {job.pause.kind === 'signed_out' && <p>Reconnectez-vous au site dans ce navigateur, puis cliquez sur Reprendre.</p>}
            {job.pause.kind !== 'adapter_outdated' && <button onClick={() => act(send({ type: 'resume', jobId }))}>Reprendre</button>}
          </div>
        )}

        {(job.phase === 'review' || job.phase === 'awaiting_confirmation' || job.phase === 'done' || job.phase === 'running') && (
          <div class="stats">
            <div>
              <strong>{rows.length}</strong>
              <span class="muted small">films lus</span>
            </div>
            <div>
              <strong>{toWrite.length}</strong>
              <span class="muted small">à écrire</span>
            </div>
            <div>
              <strong>{summary.done}</strong>
              <span class="muted small">{job.dryRun ? 'simulés' : 'réussis'}</span>
            </div>
            <div>
              <strong>{summary.failed}</strong>
              <span class="muted small">échecs</span>
            </div>
            <div>
              <strong>{summary.skipped}</strong>
              <span class="muted small">ignorés</span>
            </div>
          </div>
        )}

        {job.phase === 'review' && dst.capabilities.write === 'file' && (
          <>
            <h3>Fichier d’import {dst.displayName}</h3>
            {dst.capabilities.writeSideEffects && <p class="notice warn">{dst.capabilities.writeSideEffects}</p>}
            <p class="muted small">
              Les lignes « à vérifier » seront rapprochées par {dst.displayName} sur le titre et l’année : cochez celles que vous voulez inclure
              (filtre « À vérifier », puis « Valider les lignes affichées »).
            </p>
            <div class="row">
              <button onClick={saveBackup}>Télécharger la sauvegarde (facultatif)</button>
              <button class="primary" disabled={!toWrite.length} onClick={generateImport}>
                Générer le fichier d’import ({toWrite.length} film(s))
              </button>
            </div>
          </>
        )}

        {job.phase === 'done' && dst.capabilities.write === 'file' && dst.importInstructions && (
          <div class="notice ok">
            <p>
              <strong>Dernière étape, sur {dst.displayName} :</strong>
            </p>
            <p>{dst.importInstructions}</p>
            <button onClick={() => downloadImport()}>Télécharger à nouveau le fichier d’import</button>
          </div>
        )}

        {job.phase === 'review' && dst.capabilities.write !== 'file' && (
          <>
            <h3>Avant d’écrire</h3>
            {dst.capabilities.writeSideEffects && <p class="notice warn">{dst.capabilities.writeSideEffects}</p>}
            <div class="row">
              <label class="field">
                Conflits (note différente déjà présente)
                <select
                  value={job.conflictPolicy}
                  onChange={(e) =>
                    act(send({ type: 'setConflictPolicy', jobId, policy: (e.target as HTMLSelectElement).value as 'keep' | 'overwrite' }))
                  }
                >
                  <option value="keep">Conserver la note existante (recommandé)</option>
                  <option value="overwrite">Écraser avec la note source</option>
                </select>
              </label>
            </div>
            <ol>
              <li>
                <button onClick={saveBackup}>Télécharger la sauvegarde (JSON + CSV)</button>{' '}
                {job.backupSavedAt ? (
                  <span class="badge done">enregistrée</span>
                ) : (
                  <span class="muted small">
                    {job.dryRun ? 'facultative en simulation' : 'obligatoire'} : notes source et notes {dst.displayName} qui seraient écrasées.
                  </span>
                )}
              </li>
              <li>
                <button
                  class="primary"
                  disabled={!toWrite.length || (!job.dryRun && !job.backupSavedAt)}
                  onClick={() =>
                    (job.dryRun || confirm(`Écrire réellement ${Math.min(job.testBatchSize, toWrite.length)} note(s) sur ${dst.displayName} ?`)) &&
                    act(send({ type: 'startWriting', jobId }))
                  }
                >
                  {job.dryRun ? 'Simuler' : 'Écrire'} le lot de test ({Math.min(job.testBatchSize, toWrite.length)} film(s))
                </button>
              </li>
            </ol>
          </>
        )}

        {job.phase === 'awaiting_confirmation' && (
          <div class="notice ok">
            <p>
              Le lot de test est terminé. Vérifiez les résultats ci-dessous{!job.dryRun && ` et sur ${dst.displayName}`}, puis continuez.
            </p>
            <button
              class="primary"
              onClick={() =>
                (job.dryRun || confirm(`Écrire les ${toWrite.length - finished} note(s) restantes sur ${dst.displayName} ?`)) &&
                act(send({ type: 'confirmTestBatch', jobId }))
              }
            >
              Continuer ({toWrite.length - finished} restante(s))
            </button>
          </div>
        )}

        {(job.phase === 'done' || job.phase === 'awaiting_confirmation' || job.phase === 'cancelled' || job.phase === 'paused') && rows.length > 0 && (
          <p>
            <button onClick={saveReport}>Exporter le rapport (JSON + CSV)</button>
          </p>
        )}
        {error && <p class="notice bad">{error}</p>}
      </section>

      {rows.length > 0 && job.phase !== 'reading' && (
        <section class="card">
          <Preview job={job} rows={rows} editable={job.phase === 'review'} onChanged={refresh} />
        </section>
      )}
    </>
  );
}
