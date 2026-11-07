import { formatRating } from './convert';
import { msg, render, type Lang, type Msg } from './i18n';
import { isWriteAction } from './job/plan';
import type { JobRow, PlannedAction, RowStatus, TransferJob } from './job/types';
import { PIVOT_SCHEMA_VERSION, type PivotExport } from './pivot';

/** CSV RFC 4180 : séparateur virgule, guillemets doublés, fin de ligne CRLF. */
export function toCsv(header: string[], rows: Array<Array<string | number | undefined | null>>): string {
  const cell = (v: string | number | undefined | null) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const actionMsg = (action: PlannedAction): Msg => msg(`action.${action}`);
export const statusMsg = (status: RowStatus): Msg => msg(`status.${status}`);

export interface BackupFiles {
  json: string;
  csv: string;
}

const BACKUP_HEADERS: Record<Lang, string[]> = {
  fr: ['plateforme', 'id', 'url', 'titre', 'titre_original', 'annee', 'note', 'echelle_max', 'date_note'],
  en: ['platform', 'id', 'url', 'title', 'original_title', 'year', 'rating', 'scale_max', 'rated_at'],
};

/**
 * Sauvegarde exportée avant toute écriture : toutes les notes source,
 * plus les notes de destination qui seraient écrasées.
 */
export function buildBackup(job: TransferJob, rows: JobRow[], now = new Date(), lang: Lang = 'fr'): BackupFiles {
  const source: PivotExport = { schemaVersion: PIVOT_SCHEMA_VERSION, exportedAt: now.toISOString(), entries: rows.map((r) => r.entry) };
  const overwritten = rows
    .filter((r) => r.selected && r.action === 'overwrite' && r.existing && r.match?.ref)
    .map((r) => ({ title: r.entry.work.title, destination: r.match!.ref!, rating: r.existing! }));
  const json = JSON.stringify(
    { kind: 'notes-transfert-backup', job: { source: job.source, destination: job.destination }, source, destinationToBeOverwritten: overwritten },
    null,
    2,
  );
  const csv = toCsv(
    BACKUP_HEADERS[lang],
    rows.map(({ entry: e }) => {
      const ref = e.work.refs.find((r) => r.platform === e.source.platform);
      return [e.source.platform, ref?.id, ref?.url, e.work.title, e.work.originalTitle, e.work.year, e.rating?.value, e.rating?.scale.max, e.rating?.ratedAt];
    }),
  );
  return { json, csv };
}

export interface ReportSummary {
  done: number;
  skipped: number;
  failed: number;
  pending: number;
  simulated: boolean;
}

export function summarize(job: TransferJob, rows: JobRow[]): ReportSummary {
  const s: ReportSummary = { done: 0, skipped: 0, failed: 0, pending: 0, simulated: job.dryRun };
  for (const r of rows) {
    if (!r.selected || !isWriteAction(r.action)) s.skipped++;
    else if (r.status === 'done') s.done++;
    else if (r.status === 'failed') s.failed++;
    else if (r.status === 'skipped') s.skipped++;
    else s.pending++;
  }
  return s;
}

/** Raison affichée pour une ligne : résultat d'écriture, sinon action prévue. */
export function reasonOf(r: JobRow): Msg | undefined {
  if (r.outcome) return r.outcome.message;
  if (!r.selected && isWriteAction(r.action)) return msg('report.uncheckedByYou');
  return r.action ? actionMsg(r.action) : undefined;
}

const REPORT_HEADERS: Record<Lang, string[]> = {
  fr: ['titre', 'annee', 'note_source', 'note_convertie', 'conversion', 'note_existante', 'correspondance', 'confiance', 'resultat', 'raison', 'simule'],
  en: ['title', 'year', 'source_rating', 'converted_rating', 'conversion', 'existing_rating', 'match', 'confidence', 'result', 'reason', 'simulated'],
};

export function buildReport(job: TransferJob, rows: JobRow[], now = new Date(), lang: Lang = 'fr'): BackupFiles {
  const num = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
  const header = REPORT_HEADERS[lang];
  const lines = rows.map((r) => {
    const src = r.entry.rating;
    const status: RowStatus = !r.selected || !isWriteAction(r.action) ? 'skipped' : r.status;
    const c = r.conversion;
    const values = [
      r.entry.work.title,
      r.entry.work.year,
      src ? formatRating(src.value, src.scale, lang) : '',
      // Même format décimal que note_source, pour un rapport cohérent.
      c ? num(c.value) : '',
      c && !c.exact ? `${num(c.raw)} → ${num(c.value)} (${render(c.rule, lang)})` : '',
      r.existing ? num(r.existing.value) : '',
      r.match?.ref?.url ?? r.match?.ref?.id ?? '',
      r.match ? render(msg(`confidence.${r.match.confidence}`), lang) : '',
      render(statusMsg(status), lang),
      render(reasonOf(r), lang),
      r.outcome?.simulated ? (lang === 'fr' ? 'oui' : 'yes') : '',
    ];
    return Object.fromEntries(header.map((h, i) => [h, values[i]])) as Record<string, string | number | undefined>;
  });
  const json = JSON.stringify(
    { kind: 'notes-transfert-report', generatedAt: now.toISOString(), job: { source: job.source, destination: job.destination, dryRun: job.dryRun }, summary: summarize(job, rows), rows: lines },
    null,
    2,
  );
  const csv = toCsv(header, lines.map((l) => header.map((h) => l[h])));
  return { json, csv };
}
