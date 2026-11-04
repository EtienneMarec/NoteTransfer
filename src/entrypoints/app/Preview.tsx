import { useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send } from '../../background/messages';
import { formatRating } from '../../core/convert';
import { ACTION_LABELS, STATUS_LABELS } from '../../core/export';
import { isWriteAction } from '../../core/job/plan';
import type { JobRow, TransferJob } from '../../core/job/types';

const CONFIDENCE_LABELS = { sure: 'sûr', review: 'à vérifier', not_found: 'introuvable' } as const;

type Filter = 'all' | 'write' | 'review' | 'conflict' | 'not_found' | 'failed';
const FILTERS: Array<[Filter, string, (r: JobRow) => boolean]> = [
  ['all', 'Tout', () => true],
  ['write', 'À écrire', (r) => r.selected && isWriteAction(r.action)],
  ['review', 'À vérifier', (r) => r.match?.confidence === 'review' && !r.match.confirmedByUser],
  ['conflict', 'Conflits', (r) => r.action === 'skip_conflict' || r.action === 'overwrite'],
  ['not_found', 'Introuvables', (r) => r.action === 'skip_unmatched'],
  ['failed', 'Échecs', (r) => r.status === 'failed'],
];

export function Preview({ job, rows, editable, onChanged }: { job: TransferJob; rows: JobRow[]; editable: boolean; onChanged: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string>();
  const dst = getAdapter(job.destination);
  const src = getAdapter(job.source);
  const visible = rows.filter(FILTERS.find(([f]) => f === filter)![2]);

  const act = (p: Promise<unknown>) => {
    setError(undefined);
    p.then(onChanged, (e: Error) => setError(e.message));
  };

  return (
    <div>
      <div class="tabs" role="toolbar" aria-label="Filtrer les lignes">
        {FILTERS.map(([f, label, pred]) => (
          <button aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label} ({rows.filter(pred).length})
          </button>
        ))}
      </div>
      {editable && filter === 'review' && visible.length > 0 && (
        <p>
          <button
            onClick={() => act(send({ type: 'setRowsSelected', jobId: job.id, rowIds: visible.map((r) => r.rowId), selected: true }))}
          >
            Valider les {visible.length} ligne(s) affichée(s)
          </button>{' '}
          <span class="muted small">Après les avoir relues : rien d’incertain n’est inclus sans votre validation.</span>
        </p>
      )}
      {error && <p class="notice bad">{error}</p>}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Film ({src.displayName})</th>
              <th>Note source</th>
              <th>Convertie</th>
              <th>Correspondance ({dst.displayName})</th>
              <th>Confiance</th>
              <th>Note existante</th>
              <th>Action / résultat</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Line key={r.rowId} job={job} row={r} editable={editable} act={act} />
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p class="muted">Aucune ligne.</p>}
    </div>
  );
}

function Line({ job, row: r, editable, act }: { job: TransferJob; row: JobRow; editable: boolean; act: (p: Promise<unknown>) => void }) {
  const [url, setUrl] = useState('');
  const w = r.entry.work;
  const srcRef = w.refs.find((x) => x.platform === job.source);
  const chosen = r.match?.candidates.find((c) => c.candidate.ref.id === r.match?.ref?.id)?.candidate;
  const canSelect = editable && (isWriteAction(r.action) || r.action === 'skip_conflict' || r.action === 'skip_review');
  const written = r.status !== 'pending' || r.outcome;
  const dst = getAdapter(job.destination);
  // Destination par fichier : c'est l'importeur du site qui rapproche, rien à corriger ici.
  // Fichier ou « à la main » : pas de candidats à corriger ici.
  const noCandidates = dst.capabilities.write === 'file' || job.writeMode === 'manual';
  const correctable = editable && !noCandidates;

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`Transférer ${w.title}`}
          checked={r.selected}
          disabled={!canSelect}
          onChange={(e) => act(send({ type: 'setRowSelected', jobId: job.id, rowId: r.rowId, selected: (e.target as HTMLInputElement).checked }))}
        />
      </td>
      <td>
        {srcRef?.url ? (
          <a href={srcRef.url} target="_blank" rel="noreferrer">
            {w.title}
          </a>
        ) : (
          w.title
        )}
        <div class="muted small">
          {[w.originalTitle !== w.title && w.originalTitle, w.year, w.directors?.join(', ')].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td class="num">{r.entry.rating ? formatRating(r.entry.rating.value, r.entry.rating.scale) : '—'}</td>
      <td class="num">
        {r.conversion ? formatRating(r.conversion.value, getAdapter(job.destination).capabilities.scale) : '—'}
        {r.conversion && !r.conversion.exact && (
          <div class="small" style={{ color: 'var(--warn)' }}>
            {r.conversion.raw.toLocaleString('fr-FR')} → {r.conversion.value.toLocaleString('fr-FR')} ({r.conversion.rule})
          </div>
        )}
      </td>
      <td>
        {r.match?.ref && noCandidates ? (
          <>
            {r.match.ref.url && job.writeMode === 'manual' && (
              <a href={r.match.ref.url} target="_blank" rel="noreferrer">
                {r.match.confidence === 'sure' ? 'fiche' : 'recherche'}
              </a>
            )}{' '}
            <span class="muted small">{r.match.reason}</span>
          </>
        ) : r.match?.ref ? (
          <>
            <a href={r.match.ref.url} target="_blank" rel="noreferrer">
              {chosen?.work.title ?? `#${r.match.ref.id}`}
            </a>
            {chosen && (
              <div class="muted small">
                {[chosen.work.originalTitle !== chosen.work.title && chosen.work.originalTitle, chosen.work.year, chosen.work.directors?.join(', ')]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </>
        ) : (
          <span class="muted">aucune</span>
        )}
        {correctable && (
          <details>
            <summary class="small">Corriger</summary>
            {r.match && r.match.candidates.length > 0 && (
              <select
                value={r.match.ref?.id ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  act(send({ type: 'setRowCandidate', jobId: job.id, rowId: r.rowId, candidateId: v || null }));
                }}
              >
                <option value="">Aucun ne correspond</option>
                {r.match.candidates.map(({ candidate: c, score }) => (
                  <option value={c.ref.id}>
                    {c.work.title} ({c.work.year ?? '?'}) – {Math.round(score * 100)} %
                  </option>
                ))}
              </select>
            )}
            <form
              class="row"
              style={{ marginTop: '4px' }}
              onSubmit={(e) => {
                e.preventDefault();
                act(send({ type: 'setRowUrl', jobId: job.id, rowId: r.rowId, url }));
              }}
            >
              <input type="url" placeholder="Coller l’adresse de la fiche" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
              <button type="submit" disabled={!url}>
                OK
              </button>
            </form>
          </details>
        )}
      </td>
      <td>
        {r.match && <span class={`badge ${r.match.confidence}`}>{CONFIDENCE_LABELS[r.match.confidence]}</span>}
        {r.match?.score !== undefined && <div class="muted small">{Math.round(r.match.score * 100)} %</div>}
        {r.match?.confirmedByUser && <div class="muted small">validée</div>}
      </td>
      <td class="num">{r.existing ? formatRating(r.existing.value, r.existing.scale) : '—'}</td>
      <td>
        {written && r.selected && isWriteAction(r.action) ? (
          <>
            <span class={`badge ${r.status}`}>{STATUS_LABELS[r.status]}</span>
            {r.outcome && <div class="muted small">{r.outcome.message}</div>}
          </>
        ) : (
          <span class={r.selected ? '' : 'muted'}>{r.action ? ACTION_LABELS[r.action] : 'recherche…'}</span>
        )}
      </td>
    </tr>
  );
}
