import { formatRating } from './convert';
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

export const ACTION_LABELS: Record<PlannedAction, string> = {
  create: 'créer',
  overwrite: 'écraser',
  skip_identical: 'ignorer : déjà identique',
  skip_conflict: 'ignorer : note existante conservée',
  skip_review: 'ignorer : correspondance à vérifier',
  skip_unmatched: 'ignorer : introuvable',
  skip_unrated: 'ignorer : pas de note source',
};

export const STATUS_LABELS: Record<RowStatus, string> = {
  pending: 'en attente',
  in_flight: 'en cours',
  done: 'réussi',
  skipped: 'ignoré',
  failed: 'échec',
};

export interface BackupFiles {
  json: string;
  csv: string;
}

/**
 * Sauvegarde exportée avant toute écriture : toutes les notes source,
 * plus les notes de destination qui seraient écrasées.
 */
export function buildBackup(job: TransferJob, rows: JobRow[], now = new Date()): BackupFiles {
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
    ['plateforme', 'id', 'url', 'titre', 'titre_original', 'annee', 'note', 'echelle_max', 'date_note'],
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

function reasonOf(r: JobRow): string {
  if (r.outcome) return r.outcome.message;
  if (!r.selected && isWriteAction(r.action)) return 'décochée par vous';
  return r.action ? ACTION_LABELS[r.action] : '';
}

export function buildReport(job: TransferJob, rows: JobRow[], now = new Date()): BackupFiles {
  const lines = rows.map((r) => {
    const src = r.entry.rating;
    const status: RowStatus = !r.selected || !isWriteAction(r.action) ? 'skipped' : r.status;
    return {
      titre: r.entry.work.title,
      annee: r.entry.work.year,
      note_source: src ? formatRating(src.value, src.scale) : '',
      note_convertie: r.conversion ? String(r.conversion.value) : '',
      conversion: r.conversion && !r.conversion.exact ? `${r.conversion.raw} → ${r.conversion.value} (${r.conversion.rule})` : '',
      note_existante: r.existing ? String(r.existing.value) : '',
      correspondance: r.match?.ref?.url ?? r.match?.ref?.id ?? '',
      confiance: r.match?.confidence ?? '',
      resultat: STATUS_LABELS[status],
      raison: reasonOf(r),
      simule: r.outcome?.simulated ? 'oui' : '',
    };
  });
  const json = JSON.stringify(
    { kind: 'notes-transfert-report', generatedAt: now.toISOString(), job: { source: job.source, destination: job.destination, dryRun: job.dryRun }, summary: summarize(job, rows), rows: lines },
    null,
    2,
  );
  const header = Object.keys(lines[0] ?? { titre: '' });
  const csv = toCsv(header, lines.map((l) => header.map((h) => (l as Record<string, string | number | undefined>)[h])));
  return { json, csv };
}
