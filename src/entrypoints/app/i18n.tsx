import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { render as renderMsg, type Lang, type Localized, type Msg } from '../../core/i18n';

/** Textes propres à l'interface. Les messages du moteur sont dans core/i18n.ts. */
const UI = {
  'app.newTransfer': { fr: 'Nouveau transfert', en: 'New transfer' },
  'app.transfers': { fr: 'Transferts', en: 'Transfers' },
  'app.simulationSuffix': { fr: ' (simulation)', en: ' (dry run)' },
  'app.settings': { fr: 'Réglages', en: 'Settings' },
  'app.deleteAll': { fr: 'Tout supprimer', en: 'Delete everything' },
  'app.deleteAllConfirm': {
    fr: 'Supprimer toutes les données de l’extension (transferts, correspondances mémorisées, réglages) et retirer ses autorisations ?',
    en: 'Delete all the extension’s data (transfers, remembered matches, settings) and remove its permissions?',
  },
  'app.footer': {
    fr: 'Tout fonctionne en local, avec les sessions de ce navigateur. Aucun serveur, aucune statistique d’usage, aucun mot de passe.',
    en: 'Everything runs locally, with this browser’s sessions. No server, no usage statistics, no password.',
  },
  'app.language': { fr: 'Langue', en: 'Language' },

  'settings.minDelay': { fr: 'Délai minimal entre deux requêtes (ms)', en: 'Minimum delay between two requests (ms)' },
  'settings.maxDelay': { fr: 'Délai maximal (ms)', en: 'Maximum delay (ms)' },
  'settings.save': { fr: 'Enregistrer', en: 'Save' },
  'settings.saved': { fr: 'enregistré', en: 'saved' },
  'settings.delayHelp': {
    fr: 'Le délai réel est tiré au hasard entre ces deux valeurs, sans jamais envoyer deux requêtes en parallèle vers un même site.',
    en: 'The actual delay is picked at random between these two values, and two requests are never sent to the same site at once.',
  },
  'settings.accepted': { fr: 'Avertissements acceptés :', en: 'Accepted warnings:' },
  'settings.revoke': { fr: 'Révoquer', en: 'Revoke' },

  'new.source': { fr: 'Source', en: 'Source' },
  'new.destination': { fr: 'Destination', en: 'Destination' },
  'new.noDestination': { fr: 'Aucune destination n’est encore disponible pour cette source.', en: 'No destination is available for this source yet.' },
  'new.exportFile': { fr: 'Fichier d’export {platform}', en: '{platform} export file' },
  'new.fileRead': {
    fr: '{count} film(s) lu(s) dans {name}, dont {rated} noté(s). Le fichier est lu dans ce navigateur, sans être envoyé nulle part.',
    en: '{count} film(s) read from {name}, {rated} of them rated. The file is read in this browser and never sent anywhere.',
  },
  'new.writeOn': { fr: 'Écriture sur {platform}', en: 'Writing to {platform}' },
  'new.writeMode': { fr: 'Mode d’écriture sur {platform}', en: 'Writing mode for {platform}' },
  'new.auto': { fr: 'Automatique', en: 'Automatic' },
  'new.autoHelp': { fr: 'Par l’API interne du site, avec l’avertissement ci-dessous à accepter.', en: 'Through the site’s internal API, once you accept the warning below.' },
  'new.manual': { fr: 'À la main', en: 'Manual' },
  'new.manualHelp': {
    fr: 'L’extension prépare la liste avec les liens et les notes ; vous notez vous-même sur le site. Aucune requête n’est envoyée à {platform}.',
    en: 'The extension prepares the list with links and ratings; you rate the films yourself on the site. No request is sent to {platform}.',
  },
  'new.options': { fr: 'Options', en: 'Options' },
  'new.importOnly': {
    fr: '{platform} se remplit par son importeur officiel : l’extension génère le fichier, vous l’importez vous-même sur le site.',
    en: '{platform} is filled through its official importer: the extension generates the file and you import it yourself on the site.',
  },
  'new.manualOnly': { fr: 'Vous noterez vous-même sur {platform}, à partir de la liste préparée par l’extension.', en: 'You will rate the films yourself on {platform}, using the list prepared by the extension.' },
  'new.dryRun': { fr: 'Mode simulation', en: 'Dry-run mode' },
  'new.dryRunHelp': { fr: 'Tout le parcours, sans aucune écriture sur la destination.', en: 'The whole flow, with nothing written to the destination.' },
  'new.batchSize': { fr: 'Taille du lot de test', en: 'Test batch size' },
  'new.rounding': { fr: 'Arrondi si la conversion est inexacte', en: 'Rounding when a conversion is inexact' },
  'new.roundNearest': { fr: 'Au plus proche (demi vers le haut)', en: 'To nearest (half up)' },
  'new.roundDown': { fr: 'Vers le bas', en: 'Down' },
  'new.roundUp': { fr: 'Vers le haut', en: 'Up' },
  'new.neverOverwrite': {
    fr: 'Une note déjà présente sur la destination n’est jamais écrasée par défaut : vous choisirez ligne par ligne dans l’aperçu.',
    en: 'A rating already on the destination is never overwritten by default: you choose row by row in the preview.',
  },
  'new.warning': { fr: 'Avertissement – {platform}', en: 'Warning – {platform}' },
  'new.acceptedOn': { fr: 'Accepté le {date}.', en: 'Accepted on {date}.' },
  'new.acceptRisk': { fr: 'J’ai compris et j’accepte ce risque pour mon compte.', en: 'I understand and accept this risk for my account.' },
  'new.sessions': { fr: 'Sessions', en: 'Sessions' },
  'new.sessionsHelp': {
    fr: 'L’extension utilise les sessions déjà ouvertes dans ce navigateur. Elle ne demande ni ne stocke aucun mot de passe.',
    en: 'The extension uses the sessions already open in this browser. It never asks for or stores a password.',
  },
  'new.checkSessions': { fr: 'Autoriser l’accès et vérifier les sessions', en: 'Allow access and check sessions' },
  'new.signIn': { fr: 'se connecter', en: 'sign in' },
  'new.openSite': { fr: 'ouvrir le site', en: 'open the site' },
  'session.ok': { fr: 'connecté', en: 'signed in' },
  'session.signed_out': { fr: 'non connecté', en: 'not signed in' },
  'session.blocked': { fr: 'vérification anti-robot affichée', en: 'anti-bot check displayed' },
  'session.needs_setup': { fr: 'autorisation nécessaire', en: 'permission needed' },
  'new.prepare': { fr: 'Préparer le transfert vers {platform}', en: 'Prepare the transfer to {platform}' },
  'new.read': { fr: 'Lire mes notes {platform}', en: 'Read my {platform} ratings' },
  'new.acceptToContinue': { fr: 'Acceptez l’avertissement pour continuer.', en: 'Accept the warning to continue.' },

  'phase.reading': { fr: 'Lecture des notes source', en: 'Reading source ratings' },
  'phase.matching': { fr: 'Recherche des correspondances', en: 'Looking for matches' },
  'phase.review': { fr: 'Aperçu : à vérifier avant écriture', en: 'Preview: check before writing' },
  'phase.running': { fr: 'Écriture en cours', en: 'Writing' },
  'phase.awaiting_confirmation': { fr: 'Lot de test terminé', en: 'Test batch finished' },
  'phase.manual': { fr: 'À noter vous-même', en: 'To rate yourself' },
  'phase.paused': { fr: 'En pause', en: 'Paused' },
  'phase.done': { fr: 'Terminé', en: 'Finished' },
  'phase.cancelled': { fr: 'Annulé', en: 'Cancelled' },

  'job.loading': { fr: 'Chargement…', en: 'Loading…' },
  'job.simulation': { fr: 'simulation', en: 'dry run' },
  'job.pause': { fr: 'Pause', en: 'Pause' },
  'job.cancel': { fr: 'Annuler', en: 'Cancel' },
  'job.cancelConfirm': { fr: 'Annuler ce transfert ?', en: 'Cancel this transfer?' },
  'job.close': { fr: 'Fermer', en: 'Close' },
  'job.read': { fr: '{count} film(s) lu(s)', en: '{count} film(s) read' },
  'job.readOf': { fr: '{count} film(s) lu(s) sur {total}', en: '{count} of {total} film(s) read' },
  'job.matching': { fr: '{done} / {total} film(s) recherché(s) sur {platform}', en: '{done} / {total} film(s) looked up on {platform}' },
  'job.running': { fr: '{done} / {total} note(s) traitée(s)', en: '{done} / {total} rating(s) processed' },
  'job.spaced': { fr: 'requêtes espacées de quelques secondes, une à la fois.', en: 'requests are a few seconds apart, one at a time.' },
  'job.pauseOpen': { fr: 'Ouvrez', en: 'Open' },
  'job.pauseTheSite': { fr: 'le site', en: 'the site' },
  'job.pauseSolve': {
    fr: ', résolvez la vérification vous-même, puis cliquez sur Reprendre. L’extension ne contourne jamais ces protections.',
    en: ', complete the check yourself, then click Resume. The extension never bypasses these protections.',
  },
  'job.pauseSignedOut': { fr: 'Reconnectez-vous au site dans ce navigateur, puis cliquez sur Reprendre.', en: 'Sign in to the site again in this browser, then click Resume.' },
  'job.resume': { fr: 'Reprendre', en: 'Resume' },
  'stats.read': { fr: 'films lus', en: 'films read' },
  'stats.toWrite': { fr: 'à écrire', en: 'to write' },
  'stats.simulated': { fr: 'simulés', en: 'simulated' },
  'stats.done': { fr: 'réussis', en: 'done' },
  'stats.failed': { fr: 'échecs', en: 'failed' },
  'stats.skipped': { fr: 'ignorés', en: 'skipped' },
  'job.importFile': { fr: 'Fichier d’import {platform}', en: '{platform} import file' },
  'job.importHelp': {
    fr: 'Les lignes « à vérifier » seront rapprochées par {platform} sur le titre et l’année : cochez celles que vous voulez inclure (filtre « À vérifier », puis « Valider les lignes affichées »).',
    en: 'Rows marked “to check” will be matched by {platform} on title and year: tick the ones you want to include (“To check” filter, then “Approve the rows shown”).',
  },
  'job.importerOverwrites': { fr: 'Son importeur remplace une note existante sans prévenir.', en: 'Its importer silently replaces an existing rating.' },
  'job.backupOptional': { fr: 'Télécharger la sauvegarde (facultatif)', en: 'Download the backup (optional)' },
  'job.generateImport': { fr: 'Générer le fichier d’import ({count} film(s))', en: 'Generate the import file ({count} film(s))' },
  'job.manualList': { fr: 'Liste à noter vous-même sur {platform}', en: 'List to rate yourself on {platform}' },
  'job.manualWhy': { fr: 'Sinon, la liste vous proposera aussi des films que vous avez déjà notés.', en: 'Otherwise, the list will also include films you have already rated.' },
  'job.startList': { fr: 'Commencer la liste ({count} film(s))', en: 'Start the list ({count} film(s))' },
  'job.lastStep': { fr: 'Dernière étape, sur {platform} :', en: 'Last step, on {platform}:' },
  'job.redownload': { fr: 'Télécharger à nouveau le fichier d’import', en: 'Download the import file again' },
  'job.beforeWrite': { fr: 'Avant d’écrire', en: 'Before writing' },
  'job.conflicts': { fr: 'Conflits (note différente déjà présente)', en: 'Conflicts (a different rating already exists)' },
  'job.keep': { fr: 'Conserver la note existante (recommandé)', en: 'Keep the existing rating (recommended)' },
  'job.overwrite': { fr: 'Écraser avec la note source', en: 'Overwrite with the source rating' },
  'job.backup': { fr: 'Télécharger la sauvegarde (JSON + CSV)', en: 'Download the backup (JSON + CSV)' },
  'job.backupSaved': { fr: 'enregistrée', en: 'saved' },
  'job.backupHintDry': { fr: 'facultative en simulation : notes source et notes {platform} qui seraient écrasées.', en: 'optional in a dry run: source ratings and the {platform} ratings that would be overwritten.' },
  'job.backupHintReal': { fr: 'obligatoire : notes source et notes {platform} qui seraient écrasées.', en: 'required: source ratings and the {platform} ratings that would be overwritten.' },
  'job.confirmWrite': { fr: 'Écrire réellement {count} note(s) sur {platform} ?', en: 'Really write {count} rating(s) to {platform}?' },
  'job.simulateBatch': { fr: 'Simuler le lot de test ({count} film(s))', en: 'Simulate the test batch ({count} film(s))' },
  'job.writeBatch': { fr: 'Écrire le lot de test ({count} film(s))', en: 'Write the test batch ({count} film(s))' },
  'job.batchDone': { fr: 'Le lot de test est terminé. Vérifiez les résultats ci-dessous, puis continuez.', en: 'The test batch is finished. Check the results below, then continue.' },
  'job.batchDoneReal': { fr: 'Le lot de test est terminé. Vérifiez les résultats ci-dessous et sur {platform}, puis continuez.', en: 'The test batch is finished. Check the results below and on {platform}, then continue.' },
  'job.confirmRest': { fr: 'Écrire les {count} note(s) restantes sur {platform} ?', en: 'Write the {count} remaining rating(s) to {platform}?' },
  'job.continue': { fr: 'Continuer ({count} restante(s))', en: 'Continue ({count} remaining)' },
  'job.exportReport': { fr: 'Exporter le rapport (JSON + CSV)', en: 'Export the report (JSON + CSV)' },
  'job.existingTitle': { fr: 'Notes déjà présentes sur {platform}.', en: 'Ratings already on {platform}.' },
  'job.existingBody': {
    fr: 'Ajoutez votre export {platform} actuel pour les retrouver : elles seront conservées, sauf choix contraire. Seules les correspondances sûres sont reconnues, et un film traduit différemment peut échapper à la détection.',
    en: 'Add your current {platform} export to find them: they will be kept unless you choose otherwise. Only sure matches are recognized, and a film with a different translated title may go undetected.',
  },
  'job.existingLabel': { fr: 'Export {platform} actuel', en: 'Current {platform} export' },
  'job.existingInfo': { fr: '{matched} film(s) déjà noté(s) sur {platform} retrouvé(s) parmi {total} note(s) de l’export.', en: '{matched} film(s) already rated on {platform} found among the {total} rating(s) in the export.' },
  'file.backup': { fr: 'notes-transfert-sauvegarde', en: 'notes-transfert-backup' },
  'file.report': { fr: 'notes-transfert-rapport', en: 'notes-transfert-report' },

  'filter.aria': { fr: 'Filtrer les lignes', en: 'Filter the rows' },
  'filter.all': { fr: 'Tout', en: 'All' },
  'filter.write': { fr: 'À écrire', en: 'To write' },
  'filter.review': { fr: 'À vérifier', en: 'To check' },
  'filter.conflict': { fr: 'Conflits', en: 'Conflicts' },
  'filter.not_found': { fr: 'Introuvables', en: 'Not found' },
  'filter.failed': { fr: 'Échecs', en: 'Failed' },
  'preview.approveShown': { fr: 'Valider les {count} ligne(s) affichée(s)', en: 'Approve the {count} row(s) shown' },
  'preview.approveHelp': { fr: 'Après les avoir relues : rien d’incertain n’est inclus sans votre validation.', en: 'After reading them: nothing uncertain is included without your approval.' },
  'preview.film': { fr: 'Film ({platform})', en: 'Film ({platform})' },
  'preview.sourceRating': { fr: 'Note source', en: 'Source rating' },
  'preview.converted': { fr: 'Convertie', en: 'Converted' },
  'preview.match': { fr: 'Correspondance ({platform})', en: 'Match ({platform})' },
  'preview.confidence': { fr: 'Confiance', en: 'Confidence' },
  'preview.existing': { fr: 'Note existante', en: 'Existing rating' },
  'preview.action': { fr: 'Action / résultat', en: 'Action / result' },
  'preview.noRows': { fr: 'Aucune ligne.', en: 'No rows.' },
  'preview.transfer': { fr: 'Transférer {title}', en: 'Transfer {title}' },
  'preview.pageLink': { fr: 'fiche', en: 'page' },
  'preview.searchLink': { fr: 'recherche', en: 'search' },
  'preview.none': { fr: 'aucune', en: 'none' },
  'preview.fix': { fr: 'Corriger', en: 'Fix' },
  'preview.noneMatches': { fr: 'Aucun ne correspond', en: 'None of these' },
  'preview.pasteUrl': { fr: 'Coller l’adresse de la fiche', en: 'Paste the title page address' },
  'preview.validated': { fr: 'validée', en: 'approved' },
  'preview.searching': { fr: 'recherche…', en: 'searching…' },

  'manual.toRate': { fr: 'À noter sur {platform} : {done} / {total}', en: 'To rate on {platform}: {done} / {total}' },
  'manual.film': { fr: 'Film', en: 'Film' },
  'manual.ratingToSet': { fr: 'Note à mettre', en: 'Rating to set' },
  'manual.on': { fr: 'Sur {platform}', en: 'On {platform}' },
  'manual.doneQ': { fr: 'Fait ?', en: 'Done?' },
  'manual.openPage': { fr: 'Ouvrir la fiche', en: 'Open the page' },
  'manual.searchFilm': { fr: 'Chercher le film', en: 'Search for the film' },
  'manual.pickYourself': { fr: 'choisissez le bon film vous-même', en: 'pick the right film yourself' },
  'manual.done': { fr: 'Fait', en: 'Done' },
  'manual.skip': { fr: 'Sauter', en: 'Skip' },
  'manual.doneBadge': { fr: 'fait', en: 'done' },
  'manual.skippedBadge': { fr: 'sauté', en: 'skipped' },
  'manual.undo': { fr: 'Annuler', en: 'Undo' },
} as const satisfies Record<string, Localized>;

export type UiKey = keyof typeof UI;
export const UI_KEYS = Object.keys(UI) as UiKey[];
export const uiEntry = (key: UiKey): Localized => UI[key];

export interface I18n {
  lang: Lang;
  locale: string;
  /** Texte de l'interface. */
  t(key: UiKey, params?: Record<string, string | number>): string;
  /** Message du moteur (raison, résultat, erreur). */
  m(message: Msg | string | undefined): string;
  /** Texte fourni en deux langues (consignes des adaptateurs). */
  l(text: Localized | undefined): string;
}

export function createI18n(lang: Lang): I18n {
  return {
    lang,
    locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
    t: (key, params) => UI[key][lang].replace(/\{(\w+)\}/g, (all, name: string) => (params?.[name] === undefined ? all : String(params[name]))),
    m: (message) => renderMsg(message, lang),
    l: (text) => text?.[lang] ?? '',
  };
}

export const I18nContext = createContext<I18n>(createI18n('fr'));
export const useI18n = () => useContext(I18nContext);
