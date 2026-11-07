# Notes Transfert

Open-source browser extension (Manifest V3, Chrome and Firefox) that transfers your movie ratings from one platform to another, for example from AlloCiné to SensCritique.

- **Everything runs locally**: the extension uses the sessions already open in your browser. No server, no usage statistics, no telemetry.
- **No password** is ever requested or stored. Session cookies and tokens are never read by the extension, exported or logged.
- **Nothing uncertain is written without your approval**, and an existing rating is never overwritten by default.

> **Status: version 1.0.** The AlloCiné → SensCritique flow is complete and was tested in Firefox on real accounts: a full dry run, then a first real write, verified on the site. IMDb → AlloCiné was also tested in Firefox on test accounts. Not yet tested in Chrome, nor on a real transfer of many films. See [docs/verification.md](docs/verification.md).
>
> The extension's interface is in French, so buttons are quoted below in French with an English translation.

## Platforms

| Platform | Source | Destination | Method | Status |
|---|---|---|---|---|
| AlloCiné | ✅ | ✅ | The site's internal API, from an AlloCiné tab; writing can also be done manually | Reading verified on the real site; search and writing verified on a test account (outside the loaded extension) |
| SensCritique | ✅ | ✅ | The site's internal API, from a SensCritique tab | Search, existing rating and writing verified on the real site (Firefox); reading as a source only tested by direct request |
| Letterboxd | ✅ | ✅ | Official files: the export (ZIP or `ratings.csv`) as input, a file for the official importer as output | Real export read; generated file successfully imported on a test account |
| IMDb | ✅ | ✅ | Reading: the official CSV export. Writing: the site's internal API (with a warning) **or** manually | Real export read; automatic writing verified on a test account (outside the loaded extension); manual mode tested on fixtures |

Trakt and TMDB were studied ([docs/platforms/](docs/platforms/)) but are out of scope for now.

Details for each platform (methods, authentication, pagination, rating scale, limits, fragile points and terms of use) are in [docs/platforms/](docs/platforms/) (in French).

### Limitations

- **AlloCiné**: its terms of use forbid automated data extraction (articles 7.5 and 8.1), and the site may suspend an account without notice (article 9). The extension shows this warning and waits for your consent before first use. As a destination, AlloCiné can also be filled in **manually**: the extension prepares the list (rating and search link) and you rate the films yourself, with no request sent to AlloCiné. AlloCiné does not provide rating dates.
- **SensCritique**: rating a film marks it as watched and removes it from your watchlist.
- **Letterboxd**: the extension generates the file, and you import it yourself at letterboxd.com/import. Letterboxd matches the films itself: by IMDb ID when the source provides one (IMDb export), otherwise by title, year and director. Those rows must therefore be validated in the preview, then checked in Letterboxd's import summary. **The importer silently replaces an existing rating**, and an import cannot be undone: add your current Letterboxd export in the preview so the extension can find those ratings and keep them. The importer is normally reserved for Pro members, and limited to 1,900 titles per file.
- **IMDb**: reading uses its export file. For writing, IMDb offers neither an import nor a public API, hence two modes:
  - **automatic**, through the site's internal API, after a warning: IMDb's conditions of use forbid robots, and an IMDb account is often an Amazon account;
  - **manual**: the extension prepares the list (rating, and a link to the title page or to a search), you rate each film yourself and tick it off, with no request sent to IMDb.

  An IMDb rating of 0 would delete the rating: the extension only sends ratings from 1 to 10.
- **Files** are read in the browser and never sent anywhere.
- AlloCiné, SensCritique and IMDb writing rely on undocumented internal APIs: a change on the site can break the adapter. The extension then pauses with an "adapter outdated" message (« adaptateur obsolète ») instead of continuing.
- If a site shows a CAPTCHA or an anti-bot check, the transfer pauses and lets you know. The extension never bypasses these protections.

## Installation (developer mode)

Requirement: Node.js 20 or later.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run build:firefox
```

- **Chrome / Edge**: open `chrome://extensions`, turn on "Developer mode", click "Load unpacked" and choose `dist/chrome-mv3`.
- **Firefox (140 or later)**: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on…" and choose `dist/firefox-mv3/manifest.json`.

Development with live reload: `npm run dev` (Chrome) or `npm run dev:firefox`.

A temporary Firefox add-on is removed when the browser closes. For a **permanent installation** (free signing by Mozilla, without a public listing) or **publication** on addons.mozilla.org or the Chrome Web Store, see [docs/publishing.md](docs/publishing.md) (in French).

## Usage

1. Sign in to the platforms as usual in this browser (for example AlloCiné and SensCritique).
2. Click the extension icon: the app opens in a tab.
3. Choose the source and the destination. **Dry-run mode** (« Mode simulation ») is on by default.
4. Click « Autoriser l'accès et vérifier les sessions » (allow access and check sessions). The browser asks for access to those sites, and only those.
5. Read and accept the AlloCiné warning, then start reading. Requests are sent one at a time, 2 to 4 seconds apart (configurable).
6. In the **preview**, check each row: film, source rating, converted rating, existing rating, confidence and planned action.
   - Rows « à vérifier » (to check) are unticked: tick them to approve, or fix the match (list of candidates, or a pasted title-page URL).
   - Conflicts are kept by default: tick a row to overwrite it, or change the global rule.
7. Download the **backup** (JSON + CSV). It is required before any real write.
8. Run the **test batch** (3 films by default), check the result, then click « Continuer » (continue).
9. Export the final **report** (JSON + CSV): successes, skipped, failures and reasons.

**From a file** (IMDb or Letterboxd as source): at step 3, choose the indicated export file; there is no session to check for that platform.
**To Letterboxd**: instead of steps 7 and 8, click « Générer le fichier d'import » (generate the import file), then follow the on-screen instructions to import it on the site.
**Manual mode** (AlloCiné or IMDb as destination, option « À la main »): the extension sends nothing to the destination; after the preview, click « Commencer la liste » (start the list), open each link, rate the film yourself, then mark it « Fait » (done) or « Sauter » (skip).

You can pause and resume at any time. After the browser is closed, the transfer is paused: click « Reprendre » (resume). Every row that was in progress is checked again on the site before any new attempt, which prevents duplicates.

**« Tout supprimer »** (delete everything, at the top of the app) erases transfers, remembered matches and settings, then removes the extension's access to the sites.

## Rating conversion

The original rating and its scale are kept. The conversion is proportional (3.5/5 → 7/10), then aligned to the destination's step. Between AlloCiné (0.5 to 5) and SensCritique (1 to 10), it is always exact. The same goes for Letterboxd (0.5 to 5) and IMDb (1 to 10). If a future platform makes a conversion inexact, the preview will show the old rating, the new one and the chosen rounding rule.

## Development

```bash
npm test
```

```bash
npm run typecheck
```

Design notes are in French:

- Architecture, pivot model and adapter interface: [docs/plan.md](docs/plan.md)
- Adding a platform: [docs/adding-a-platform.md](docs/adding-a-platform.md)
- What was verified on the real sites, and what was only tested with fixtures: [docs/verification.md](docs/verification.md)

## License

MIT.
