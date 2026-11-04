import { getAdapter } from '../../adapters/registry';
import { send } from '../../background/messages';
import { formatRating } from '../../core/convert';
import type { JobRow, TransferJob } from '../../core/job/types';

/** Mode « à la main » : l'utilisateur ouvre chaque lien, note lui-même sur le site, puis coche la ligne. */
export function ManualChecklist({
  job,
  rows,
  onChanged,
  onError,
}: {
  job: TransferJob;
  rows: JobRow[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const dst = getAdapter(job.destination);
  const handled = rows.filter((r) => r.status === 'done' || r.status === 'skipped').length;
  const mark = (rowId: string, status: 'done' | 'skipped' | 'pending') =>
    send({ type: 'setManualRowStatus', jobId: job.id, rowId, status }).then(onChanged, (e: Error) => onError(e.message));

  return (
    <>
      <h3>
        À noter sur {dst.displayName} : {handled} / {rows.length}
      </h3>
      <div class="progress" role="progressbar" aria-valuenow={handled} aria-valuemin={0} aria-valuemax={rows.length}>
        <div style={{ width: `${rows.length ? Math.round((handled / rows.length) * 100) : 0}%` }} />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Film</th>
              <th>Note à mettre</th>
              <th>Sur {dst.displayName}</th>
              <th>Fait ?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const w = r.entry.work;
              const exact = r.match?.confidence === 'sure';
              return (
                <tr key={r.rowId}>
                  <td>
                    {w.title}
                    <div class="muted small">{[w.originalTitle !== w.title && w.originalTitle, w.year, w.directors?.join(', ')].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td class="num">
                    <strong>{r.conversion ? formatRating(r.conversion.value, dst.capabilities.scale) : '—'}</strong>
                  </td>
                  <td>
                    <a href={r.match?.ref?.url} target="_blank" rel="noreferrer">
                      {exact ? 'Ouvrir la fiche' : 'Chercher le film'}
                    </a>
                    {!exact && <div class="muted small">choisissez le bon film vous-même</div>}
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <div class="row">
                        <button class="primary" onClick={() => void mark(r.rowId, 'done')}>
                          Fait
                        </button>
                        <button onClick={() => void mark(r.rowId, 'skipped')}>Sauter</button>
                      </div>
                    ) : (
                      <div class="row">
                        <span class={`badge ${r.status}`}>{r.status === 'done' ? 'fait' : 'sauté'}</span>
                        <button class="small" onClick={() => void mark(r.rowId, 'pending')}>
                          Annuler
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
