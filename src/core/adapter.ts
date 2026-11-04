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
  /** Effets de bord d'une écriture, affichés dans l'aperçu. */
  writeSideEffects?: string;
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

/**
 * Pour les adaptateurs `site` : les requêtes sont exécutées depuis un onglet du site,
 * qui y ajoute lui-même l'en-tête d'authentification lu dans un cookie.
 * Le jeton ne quitte jamais l'onglet.
 */
export interface SiteConfig {
  /** Page ouverte en arrière-plan si aucun onglet du site n'est disponible. */
  homeUrl: string;
  /** Motifs d'URL des onglets utilisables (même origine que homeUrl). */
  tabPatterns: string[];
  /** En-tête construit à partir d'un cookie lisible ; absent si les cookies du site suffisent. */
  auth?: { cookie: string; header: string; prefix: string };
  /** `include` quand l'API est sur un autre domaine que la page et s'authentifie par cookies (IMDb). */
  credentials?: 'same-origin' | 'include';
  loginUrl: string;
}

/**
 * Mode « à la main » : l'extension prépare la liste, l'utilisateur note lui-même sur le site.
 * Aucune requête n'est envoyée à la destination.
 */
export interface ManualWrite {
  /** Lien vers la fiche si l'ID est connu, sinon vers une recherche sur le site. */
  linkFor(work: PivotWork): { url: string; exact: boolean };
  instructions: string;
}

export interface AdapterContext {
  /** Client limité en débit ; pour un adaptateur `site`, son transport passe par un onglet du site. */
  http: HttpClient;
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
  site?: SiteConfig;
  manualWrite?: ManualWrite;

  checkSession(ctx: AdapterContext): Promise<SessionStatus>;

  /** Lecture paginée par curseur, pour reprendre après une suspension. */
  readRatings?(ctx: AdapterContext, cursor: string | null): Promise<Page<PivotEntry>>;
  /** Lecture d'un fichier d'export officiel choisi par l'utilisateur. */
  parseExport?(file: { name: string; bytes: Uint8Array }): Promise<PivotEntry[]>;
  /** Fichiers acceptés par le sélecteur (attribut `accept`). */
  exportFileTypes?: string;
  exportInstructions?: string;

  searchFilm?(ctx: AdapterContext, query: WorkQuery): Promise<Candidate[]>;
  /** Reconnaît une URL de fiche collée par l'utilisateur pour corriger une correspondance. */
  parseUrl?(url: string): PlatformRef | null;
  getFilm?(ctx: AdapterContext, ref: PlatformRef): Promise<Candidate | null>;
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
  return a.capabilities.write !== null || !!a.manualWrite;
}
