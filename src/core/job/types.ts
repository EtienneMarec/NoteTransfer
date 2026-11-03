import type { Candidate } from '../adapter';
import type { ConversionResult, RoundingMode } from '../convert';
import type { PauseError } from '../errors';
import type { Confidence } from '../match/score';
import type { PivotEntry, PivotRating, PlatformId, PlatformRef } from '../pivot';

export type JobPhase =
  | 'reading' // lecture des notes source (reprise par curseur)
  | 'matching' // recherche des correspondances et des notes existantes
  | 'review' // aperçu, corrections et sélection par l'utilisateur
  | 'running' // écriture en cours
  | 'awaiting_confirmation' // lot de test terminé, en attente de « Continuer »
  | 'paused' // erreur persistante, blocage ou demande de l'utilisateur
  | 'done'
  | 'cancelled';

export type ConflictPolicy = 'keep' | 'overwrite';

export interface TransferJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: PlatformId;
  destination: PlatformId;
  dryRun: boolean;
  phase: JobPhase;
  readCursor: string | null;
  /** Nombre total annoncé par la source, pour la progression. */
  readTotal?: number;
  rounding: RoundingMode;
  conflictPolicy: ConflictPolicy;
  testBatchSize: number;
  testBatchConfirmed: boolean;
  backupSavedAt?: string;
  /** Destination par fichier : export actuel de la destination pris en compte (notes existantes). */
  destinationExportAppliedAt?: string;
  pause?: {
    kind: PauseError['kind'] | 'user';
    message: string;
    at: string;
    url?: string;
    /** Phase à reprendre. */
    resumePhase: 'reading' | 'matching' | 'running';
  };
}

export type PlannedAction =
  | 'create' // aucune note existante
  | 'overwrite' // note différente, écrasement demandé
  | 'skip_identical' // la destination a déjà cette note
  | 'skip_conflict' // note différente, conservée (par défaut)
  | 'skip_review' // correspondance à vérifier, non validée
  | 'skip_unmatched' // introuvable
  | 'skip_unrated'; // pas de note source

export type RowStatus = 'pending' | 'in_flight' | 'done' | 'skipped' | 'failed';

export interface RowMatch {
  confidence: Confidence;
  ref?: PlatformRef;
  score?: number;
  reason: string;
  candidates: Array<{ candidate: Candidate; score: number }>;
  /** Vrai si l'utilisateur a choisi ou validé la correspondance. */
  confirmedByUser: boolean;
}

export interface JobRow {
  jobId: string;
  /** Identifiant natif de la source : clé stable, garantit l'absence de doublon. */
  rowId: string;
  order: number;
  entry: PivotEntry;
  match?: RowMatch;
  existing?: PivotRating | null;
  conversion?: ConversionResult;
  action?: PlannedAction;
  selected: boolean;
  status: RowStatus;
  attempts: number;
  outcome?: { at: string; message: string; verified?: boolean; simulated?: boolean };
}
