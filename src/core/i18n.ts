/**
 * Messages affichés à l'utilisateur, en français et en anglais.
 * Le noyau ne stocke jamais de phrase toute faite : il enregistre un code et ses paramètres (`Msg`),
 * traduits au moment de l'affichage. Changer de langue retraduit donc aussi les transferts passés.
 */
export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];

/** Texte fixe fourni en deux langues (consignes des adaptateurs, etc.). */
export type Localized = Record<Lang, string>;

type Param = string | number | Msg;
export interface Msg {
  key: MsgKey;
  params?: Record<string, Param>;
}

const CATALOG = {
  // Texte brut venu d'un site (message d'erreur du serveur) : non traduit.
  raw: { fr: '{text}', en: '{text}' },

  // Conversion
  'round.nearest': { fr: 'arrondi au plus proche, demi vers le haut', en: 'rounded to nearest, half up' },
  'round.down': { fr: 'arrondi vers le bas', en: 'rounded down' },
  'round.up': { fr: 'arrondi vers le haut', en: 'rounded up' },
  'round.clamped': { fr: 'ramenée dans les bornes {min}–{max}', en: 'clamped to {min}–{max}' },
  'err.outOfScale': { fr: 'Note {value} hors de l’échelle {min}–{max} (pas {step})', en: 'Rating {value} is outside the {min}–{max} scale (step {step})' },

  // Actions prévues et résultats
  'action.create': { fr: 'créer', en: 'create' },
  'action.overwrite': { fr: 'écraser', en: 'overwrite' },
  'action.skip_identical': { fr: 'ignorer : déjà identique', en: 'skip: already identical' },
  'action.skip_conflict': { fr: 'ignorer : note existante conservée', en: 'skip: existing rating kept' },
  'action.skip_review': { fr: 'ignorer : correspondance à vérifier', en: 'skip: match to check' },
  'action.skip_unmatched': { fr: 'ignorer : introuvable', en: 'skip: not found' },
  'action.skip_unrated': { fr: 'ignorer : pas de note source', en: 'skip: no source rating' },
  'status.pending': { fr: 'en attente', en: 'pending' },
  'status.in_flight': { fr: 'en cours', en: 'in progress' },
  'status.done': { fr: 'réussi', en: 'done' },
  'status.skipped': { fr: 'ignoré', en: 'skipped' },
  'status.failed': { fr: 'échec', en: 'failed' },
  'confidence.sure': { fr: 'sûr', en: 'sure' },
  'confidence.review': { fr: 'à vérifier', en: 'to check' },
  'confidence.not_found': { fr: 'introuvable', en: 'not found' },
  'report.uncheckedByYou': { fr: 'décochée par vous', en: 'unticked by you' },

  // Correspondances
  'match.sure': { fr: 'titre, année et indices concordants', en: 'title, year and clues agree' },
  'match.multipleClose': { fr: 'plusieurs candidats proches', en: 'several close candidates' },
  'match.partial': { fr: 'correspondance partielle', en: 'partial match' },
  'match.noCandidate': { fr: 'aucun candidat', en: 'no candidate' },
  'match.noCloseCandidate': { fr: 'aucun candidat assez proche', en: 'no candidate close enough' },
  'match.externalId': { fr: 'identifiant externe identique', en: 'same external ID' },
  'match.noSourceRating': { fr: 'pas de note source', en: 'no source rating' },
  'match.remembered': { fr: 'correspondance mémorisée', en: 'remembered match' },
  'match.validatedByYou': { fr: 'correspondance validée par vous', en: 'match approved by you' },
  'match.chosenByYou': { fr: 'choisie par vous', en: 'chosen by you' },
  'match.noneByYou': { fr: 'aucune correspondance selon vous', en: 'no match, according to you' },
  'match.fileById': { fr: '{platform} rapprochera par identifiant {ids}', en: '{platform} will match by {ids} ID' },
  'match.fileByTitle': {
    fr: '{platform} rapprochera par titre et année : vérifiez son récapitulatif avant de confirmer',
    en: '{platform} will match by title and year: check its summary before confirming',
  },
  'match.manualExact': { fr: 'fiche exacte (identifiant connu)', en: 'exact title page (ID known)' },
  'match.manualSearch': { fr: 'à choisir vous-même sur le site, via le lien de recherche', en: 'pick it yourself on the site, via the search link' },

  // Résultats d'écriture
  'outcome.simulated': { fr: 'simulation : aucune écriture', en: 'dry run: nothing written' },
  'outcome.incomplete': { fr: 'ligne incomplète (correspondance ou note manquante)', en: 'incomplete row (missing match or rating)' },
  'outcome.verifiedOnResume': { fr: 'déjà enregistrée (vérifiée à la reprise)', en: 'already saved (checked on resume)' },
  'outcome.alreadyPresent': { fr: 'déjà présente', en: 'already there' },
  'outcome.changedSincePreview': {
    fr: 'la note de destination a changé depuis l’aperçu ; elle est conservée',
    en: 'the destination rating changed since the preview; it was kept',
  },
  'outcome.saved': { fr: 'enregistrée', en: 'saved' },
  'outcome.savedVerified': { fr: 'enregistrée et vérifiée', en: 'saved and verified' },
  'outcome.notConfirmed': { fr: 'non confirmée : la destination indique {value}', en: 'not confirmed: the destination shows {value}' },
  'outcome.noRating': { fr: 'aucune note', en: 'no rating' },
  'outcome.savedDespiteError': { fr: 'enregistrée malgré l’erreur « {error} »', en: 'saved despite the error “{error}”' },
  'outcome.inImportFile': { fr: 'incluse dans {files} : à importer sur le site', en: 'included in {files}: import it on the site' },
  'outcome.manualDone': { fr: 'notée à la main par vous', en: 'rated manually by you' },
  'outcome.manualSkipped': { fr: 'sautée par vous', en: 'skipped by you' },

  // Écriture refusée par un adaptateur
  'write.invalidHalfStars': { fr: 'note {value} invalide pour {platform} (0,5 à 5, par demi-étoile)', en: 'rating {value} is invalid for {platform} (0.5 to 5, in half stars)' },
  'write.invalidInteger': { fr: 'note {value} invalide pour {platform} (entier de 1 à 10)', en: 'rating {value} is invalid for {platform} (whole number from 1 to 10)' },
  'write.unexpected': { fr: 'réponse inattendue (note {value})', en: 'unexpected response (rating {value})' },
  'write.missing': { fr: 'absente', en: 'missing' },
  'write.hasReview': {
    fr: 'ce film a une critique sur AlloCiné : note non modifiée pour ne pas la perdre',
    en: 'this film has a review on AlloCiné: rating left unchanged so the review is not lost',
  },

  // Pauses et erreurs
  'pause.byUser': { fr: 'Mis en pause par vous.', en: 'Paused by you.' },
  'pause.browserRestart': {
    fr: 'Interrompu par la fermeture du navigateur. Cliquez sur Reprendre pour continuer.',
    en: 'Interrupted because the browser was closed. Click Resume to continue.',
  },
  'err.signedOut': { fr: 'La session a expiré : reconnectez-vous au site puis reprenez.', en: 'The session expired: sign in to the site again, then resume.' },
  'err.adapterOutdated': { fr: 'Le site a modifié son API ({detail}). L’adaptateur doit être mis à jour.', en: 'The site changed its API ({detail}). The adapter needs an update.' },
  'err.notJson': { fr: 'Réponse inattendue de {host} (pas du JSON).', en: 'Unexpected response from {host} (not JSON).' },
  'err.http': { fr: '{host} a répondu {status}', en: '{host} answered {status}' },
  'err.blocked': { fr: '{host} affiche une vérification ({reason}).', en: '{host} is showing a verification ({reason}).' },
  'err.networkDetail': { fr: 'erreur réseau ({detail})', en: 'network error ({detail})' },
  'err.statusDetail': { fr: 'statut {status}', en: 'status {status}' },
  'err.retriesExhausted': { fr: '{host} : {detail} après {attempts} tentatives.', en: '{host}: {detail} after {attempts} attempts.' },
  'err.maintenance': { fr: '{platform} est en maintenance : réessayez plus tard.', en: '{platform} is under maintenance: try again later.' },
  'err.noRatingList': { fr: 'Réponse {platform} sans liste de films (session absente ?)', en: '{platform} response without a film list (no session?)' },
  'err.noCollection': { fr: 'Collection {platform} introuvable', en: '{platform} collection not found' },
  'err.filmNotFound': { fr: 'Film {platform} {id} introuvable', en: '{platform} film {id} not found' },
  'err.invalidState': { fr: 'Opération impossible dans cet état', en: 'This action is not possible in the current state' },
  'err.jobRunning': { fr: 'Un transfert est déjà en cours', en: 'A transfer is already running' },
  'err.noFilmsInFile': { fr: 'Aucun film lu dans le fichier', en: 'No films found in the file' },
  'err.noManualMode': { fr: '{platform} ne propose pas de mode « à la main »', en: '{platform} has no manual mode' },
  'err.urlNotRecognized': { fr: 'Adresse non reconnue pour {platform}', en: 'Address not recognized for {platform}' },
  'err.filmNotFoundAtUrl': { fr: 'Film introuvable à cette adresse', en: 'No film found at this address' },
  'err.unknownCandidate': { fr: 'Candidat inconnu', en: 'Unknown candidate' },
  'err.jobNotFound': { fr: 'Transfert introuvable', en: 'Transfer not found' },
  'err.tabOpen': { fr: 'Impossible d’ouvrir un onglet', en: 'Could not open a tab' },
  'err.tabTimeout': { fr: 'Le site met trop de temps à charger', en: 'The site is taking too long to load' },
  'err.tabNoResponse': { fr: 'Aucune réponse de l’onglet du site', en: 'No response from the site tab' },
  'err.noBackground': { fr: 'Le service de l’extension ne répond pas', en: 'The extension service is not responding' },

  // Fichiers
  'file.notImdb': {
    fr: 'Fichier non reconnu : il faut l’export « Your Ratings » d’IMDb (colonnes Const et Your Rating).',
    en: 'File not recognized: the IMDb “Your Ratings” export is needed (Const and Your Rating columns).',
  },
  'file.notLetterboxd': {
    fr: 'Fichier non reconnu : il faut ratings.csv (ou le ZIP) de l’export Letterboxd.',
    en: 'File not recognized: ratings.csv (or the ZIP) from the Letterboxd export is needed.',
  },
  'file.zipWithoutRatings': {
    fr: 'Cette archive ne contient pas de ratings.csv : est-ce bien l’export Letterboxd ?',
    en: 'This archive has no ratings.csv: is it really the Letterboxd export?',
  },
} as const satisfies Record<string, Localized>;

export type MsgKey = keyof typeof CATALOG;
export const MESSAGE_KEYS = Object.keys(CATALOG) as MsgKey[];
export const catalogEntry = (key: MsgKey): Localized => CATALOG[key];

export const msg = (key: MsgKey, params?: Msg['params']): Msg => (params ? { key, params } : { key });
export const raw = (text: string): Msg => msg('raw', { text });

const isMsg = (v: unknown): v is Msg => !!v && typeof v === 'object' && 'key' in v && typeof (v as Msg).key === 'string';

/** Traduit un message. Une chaîne (données d'une ancienne version) est rendue telle quelle. */
export function render(m: Msg | string | undefined | null, lang: Lang): string {
  if (m === undefined || m === null) return '';
  if (typeof m === 'string') return m;
  const entry = (CATALOG as Record<string, Localized>)[m.key];
  if (!entry) return m.key;
  return entry[lang].replace(/\{(\w+)\}/g, (_, name: string) => {
    const p = m.params?.[name];
    if (p === undefined) return `{${name}}`;
    if (isMsg(p)) return render(p, lang);
    return typeof p === 'number' ? p.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') : p;
  });
}

/** Erreur dont le message est traduisible ; `message` reste en français pour le débogage. */
export class LocalizedError extends Error {
  constructor(readonly msg: Msg) {
    super(render(msg, 'fr'));
    this.name = 'LocalizedError';
  }
}

/** Message d'une erreur quelconque : traduisible si possible, sinon texte brut. */
export function errorMsg(e: unknown): Msg {
  if (e && typeof e === 'object' && 'msg' in e && isMsg((e as { msg: unknown }).msg)) return (e as { msg: Msg }).msg;
  return raw(e instanceof Error ? e.message : String(e));
}

/** Langue par défaut : celle du navigateur si c'est le français, sinon l'anglais. */
export const defaultLang = (navigatorLanguage: string | undefined): Lang => (navigatorLanguage?.toLowerCase().startsWith('fr') ? 'fr' : 'en');
