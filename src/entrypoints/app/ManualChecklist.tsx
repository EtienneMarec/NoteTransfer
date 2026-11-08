import { getAdapter } from '../../adapters/registry';
import { send } from '../../background/messages';
import { formatRating } from '../../core/convert';
import { errorMsg, type Msg } from '../../core/i18n';
import type { JobRow, TransferJob } from '../../core/job/types';
import { useI18n } from './i18n';

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
  onError: (message: Msg) => void;
}) {
  const { t, lang } = useI18n();
  const dst = getAdapter(job.destination);
  const handled = rows.filter((r) => r.status === 'done' || r.status === 'skipped').length;
  const mark = (rowId: string, status: 'done' | 'skipped' | 'pending') =>
    send({ type: 'setManualRowStatus', jobId: job.id, rowId, status }).then(onChanged, (e: unknown) => onError(errorMsg(e)));

  return (
    <>
      <h3>{t('manual.toRate', { platform: dst.displayName, done: handled, total: rows.length })}</h3>
      <div class="progress" role="progressbar" aria-valuenow={handled} aria-valuemin={0} aria-valuemax={rows.length}>
        <div style={{ width: `${rows.length ? Math.round((handled / rows.length) * 100) : 0}%` }} />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('manual.film')}</th>
              <th>{t('manual.ratingToSet')}</th>
              <th>{t('manual.on', { platform: dst.displayName })}</th>
              <th>{t('manual.doneQ')}</th>
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
                    <strong>{r.conversion ? formatRating(r.conversion.value, dst.capabilities.scale, lang) : '—'}</strong>
                  </td>
                  <td>
                    <a href={r.match?.ref?.url} target="_blank" rel="noreferrer">
                      {t(exact ? 'manual.openPage' : 'manual.searchFilm')}
                    </a>
                    {!exact && <div class="muted small">{t('manual.pickYourself')}</div>}
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <div class="row">
                        <button class="primary" onClick={() => void mark(r.rowId, 'done')}>
                          {t('manual.done')}
                        </button>
                        <button onClick={() => void mark(r.rowId, 'skipped')}>{t('manual.skip')}</button>
                      </div>
                    ) : (
                      <div class="row">
                        <span class={`badge ${r.status}`}>{t(r.status === 'done' ? 'manual.doneBadge' : 'manual.skippedBadge')}</span>
                        <button class="small" onClick={() => void mark(r.rowId, 'pending')}>
                          {t('manual.undo')}
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
