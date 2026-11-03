import type { ExternalIds, PivotEntry, PivotRating, PivotWork, PlatformId, PlatformRef, RatingScale, WorkKind } from './pivot';
import type { HttpClient } from './http/client';
import type { Logger } from './log';

export type ReadMethod = 'api' | 'site' | 'file';
export type WriteMethod = 'api' | 'site' | 'file';

export interface Capabilities {
  read: ReadMethod | null;
  write: WriteMethod | null;
  scale: RatingScale;
  kinds: WorkKind[];
  /** IDs externes présents dans ce que renvoie readRatings / parseExport. */
  providesExternalIds: (keyof ExternalIds)[];
  /** IDs externes que searchFilm (ou le fichier d'import) sait exploiter. */
  lookupByExternalId: (keyof ExternalIds)[];
  requiresUserCredentials?: 'apiKey' | 'oauth';
  /** Avertissement à accepter avant la première utilisation (ex. CGU AlloCiné). */
  termsWarning?: string;
  notes?: string;
}

export type SessionStatus =
  | { state: 'ok'; displayName?: string }
  | { state: 'signed_out'; loginUrl: string }
  | { state: 'blocked'; reason: BlockReason; url?: string }
  | { state: 'needs_setup'; what: 'apiKey' | 'oauth' | 'file' | 'permission' };

export type BlockReason = 'captcha' | 'challenge' | 'forbidden';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface WorkQuery {
  title: string;
  originalTitle?: string;
  year?: number;
  directors?: string[];
  runtimeMinutes?: number;
  externalIds: ExternalIds;
}

export interface Candidate {
  ref: PlatformRef;
  work: PivotWork;
}

export type WriteResult = { ok: true } | { ok: false; retryable: boolean; reason: string };

/** Exécute une requête depuis un onglet du site, avec la session de l'utilisateur. */
export interface SiteBridge {
  graphql<T>(endpoint: string, body: { operationName?: string; query: string; variables?: object }): Promise<T>;
}

export interface AdapterContext {
  http: HttpClient;
  site?: SiteBridge;
  settings: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
  log: Logger;
}

export interface ImportFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  capabilities: Capabilities;
  /** Origines à demander via permissions.request() avant usage. */
  hostPermissions: readonly string[];

  checkSession(ctx: AdapterContext): Promise<SessionStatus>;

  /** Lecture paginée par curseur, pour reprendre après une suspension. */
  readRatings?(ctx: AdapterContext, cursor: string | null): Promise<Page<PivotEntry>>;
  parseExport?(fileName: string, content: string): Promise<PivotEntry[]>;

  searchFilm?(ctx: AdapterContext, query: WorkQuery): Promise<Candidate[]>;
  getExistingRating?(ctx: AdapterContext, ref: PlatformRef): Promise<PivotRating | null>;
  /** `value` est déjà dans l'échelle de la plateforme. */
  writeRating?(ctx: AdapterContext, ref: PlatformRef, value: number): Promise<WriteResult>;

  buildImportFiles?(rows: Array<{ work: PivotWork; value: number }>): ImportFile[];
  importInstructions?: string;
}

export function canBeSource(a: PlatformAdapter): boolean {
  return a.capabilities.read !== null;
}

export function canBeDestination(a: PlatformAdapter): boolean {
  return a.capabilities.write !== null;
}
