import { useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send } from '../../background/messages';
import { formatRating } from '../../core/convert';
import { actionMsg, statusMsg } from '../../core/export';
import { errorMsg, msg, type Msg } from '../../core/i18n';
import { isWriteAction } from '../../core/job/plan';
import type { JobRow, TransferJob } from '../../core/job/types';
import { useI18n, type UiKey } from './i18n';

type Filter = 'all' | 'write' | 'review' | 'conflict' | 'not_found' | 'failed';
const FILTERS: Array<[Filter, UiKey, (r: JobRow) => boolean]> = [
  ['all', 'filter.all', () => true],
  ['write', 'filter.write', (r) => r.selected && isWriteAction(r.action)],
  ['review', 'filter.review', (r) => r.match?.confidence === 'review' && !r.match.confirmedByUser],
  ['conflict', 'filter.conflict', (r) => r.action === 'skip_conflict' || r.action === 'overwrite'],
  ['not_found', 'filter.not_found', (r) => r.action === 'skip_unmatched'],
  ['failed', 'filter.failed', (r) => r.status === 'failed'],
];

export function Preview({ job, rows, editable, onChanged }: { job: TransferJob; rows: JobRow[]; editable: boolean; onChanged: () => void }) {
  const { t, m } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<Msg>();
  const dst = getAdapter(job.destination);
  const src = getAdapter(job.source);
  const visible = rows.filter(FILTERS.find(([f]) => f === filter)![2]);

  const act = (p: Promise<unknown>) => {
    setError(undefined);
    p.then(onChanged, (e: unknown) => setError(errorMsg(e)));
  };

  return (
    <div>
      <div class="tabs" role="toolbar" aria-label={t('filter.aria')}>
        {FILTERS.map(([f, label, pred]) => (
          <button aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(label)} ({rows.filter(pred).length})
          </button>
        ))}
      </div>
      {editable && filter === 'review' && visible.length > 0 && (
        <p>
          <button
            onClick={() => act(send({ type: 'setRowsSelected', jobId: job.id, rowIds: visible.map((r) => r.rowId), selected: true }))}
          >
            {t('preview.approveShown', { count: visible.length })}
          </button>{' '}
          <span class="muted small">{t('preview.approveHelp')}</span>
        </p>
      )}
      {error && <p class="notice bad">{m(error)}</p>}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{t('preview.film', { platform: src.displayName })}</th>
              <th>{t('preview.sourceRating')}</th>
              <th>{t('preview.converted')}</th>
              <th>{t('preview.match', { platform: dst.displayName })}</th>
              <th>{t('preview.confidence')}</th>
              <th>{t('preview.existing')}</th>
              <th>{t('preview.action')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Line key={r.rowId} job={job} row={r} editable={editable} act={act} />
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p class="muted">{t('preview.noRows')}</p>}
    </div>
  );
}

function Line({ job, row: r, editable, act }: { job: TransferJob; row: JobRow; editable: boolean; act: (p: Promise<unknown>) => void }) {
  const { t, m, lang, locale } = useI18n();
  const [url, setUrl] = useState('');
  const w = r.entry.work;
  const srcRef = w.refs.find((x) => x.platform === job.source);
  const chosen = r.match?.candidates.find((c) => c.candidate.ref.id === r.match?.ref?.id)?.candidate;
  const canSelect = editable && (isWriteAction(r.action) || r.action === 'skip_conflict' || r.action === 'skip_review');
  const written = r.status !== 'pending' || r.outcome;
  const dst = getAdapter(job.destination);
  // Fichier ou « à la main » : pas de candidats à corriger ici.
  const noCandidates = dst.capabilities.write === 'file' || job.writeMode === 'manual';
  const correctable = editable && !noCandidates;

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={t('preview.transfer', { title: w.title })}
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
      <td class="num">{r.entry.rating ? formatRating(r.entry.rating.value, r.entry.rating.scale, lang) : '—'}</td>
      <td class="num">
        {r.conversion ? formatRating(r.conversion.value, dst.capabilities.scale, lang) : '—'}
        {r.conversion && !r.conversion.exact && (
          <div class="small" style={{ color: 'var(--warn)' }}>
            {r.conversion.raw.toLocaleString(locale)} → {r.conversion.value.toLocaleString(locale)} ({m(r.conversion.rule)})
          </div>
        )}
      </td>
      <td>
        {r.match?.ref && noCandidates ? (
          <>
            {r.match.ref.url && job.writeMode === 'manual' && (
              <a href={r.match.ref.url} target="_blank" rel="noreferrer">
                {t(r.match.confidence === 'sure' ? 'preview.pageLink' : 'preview.searchLink')}
              </a>
            )}{' '}
            <span class="muted small">{m(r.match.reason)}</span>
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
          <span class="muted">{t('preview.none')}</span>
        )}
        {correctable && (
          <details>
            <summary class="small">{t('preview.fix')}</summary>
            {r.match && r.match.candidates.length > 0 && (
              <select
                value={r.match.ref?.id ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  act(send({ type: 'setRowCandidate', jobId: job.id, rowId: r.rowId, candidateId: v || null }));
                }}
              >
                <option value="">{t('preview.noneMatches')}</option>
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
              <input type="url" placeholder={t('preview.pasteUrl')} value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
              <button type="submit" disabled={!url}>
                OK
              </button>
            </form>
          </details>
        )}
      </td>
      <td>
        {r.match && <span class={`badge ${r.match.confidence}`}>{m(msg(`confidence.${r.match.confidence}`))}</span>}
        {r.match?.score !== undefined && <div class="muted small">{Math.round(r.match.score * 100)} %</div>}
        {r.match?.confirmedByUser && <div class="muted small">{t('preview.validated')}</div>}
      </td>
      <td class="num">{r.existing ? formatRating(r.existing.value, r.existing.scale, lang) : '—'}</td>
      <td>
        {written && r.selected && isWriteAction(r.action) ? (
          <>
            <span class={`badge ${r.status}`}>{m(statusMsg(r.status))}</span>
            {r.outcome && <div class="muted small">{m(r.outcome.message)}</div>}
          </>
        ) : (
          <span class={r.selected ? '' : 'muted'}>{r.action ? m(actionMsg(r.action)) : t('preview.searching')}</span>
        )}
      </td>
    </tr>
  );
}
