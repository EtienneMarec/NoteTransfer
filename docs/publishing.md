# Installer durablement et publier

## Générer les paquets

```bash
npm ci
```

```bash
npm run zip:firefox
```

```bash
npm run zip
```

Résultat dans `dist/` :

| Fichier | Usage |
|---|---|
| `notes-transfert-<version>-firefox.zip` | Extension Firefox, à envoyer à addons.mozilla.org |
| `notes-transfert-<version>-sources.zip` | Sources, exigées par Mozilla car le code est compilé (Vite) |
| `notes-transfert-<version>-chrome.zip` | Extension Chrome / Edge |

Pour publier une nouvelle version, augmentez `version` dans `package.json` (les boutiques refusent un numéro déjà utilisé).

## Firefox : installation permanente

Firefox (version normale) n'accepte de façon permanente que les extensions **signées par Mozilla**. Un « module temporaire » chargé depuis `about:debugging` disparaît à la fermeture.

### Recommandé : signature « hors boutique » (gratuite, privée)

1. Créez un compte développeur sur <https://addons.mozilla.org/developers/>.
2. Cliquez sur « Soumettre un nouveau module », puis choisissez **« Sur votre propre site »** (*On your own*). L'extension ne sera pas listée publiquement.
3. Envoyez `notes-transfert-<version>-firefox.zip`. Quand la page demande le code source, envoyez `notes-transfert-<version>-sources.zip` et indiquez la commande de build : `npm ci && npm run zip:firefox`.
4. La validation est automatique, en général en quelques minutes. Téléchargez ensuite le fichier **`.xpi` signé**.
5. Dans Firefox, ouvrez `about:addons`, cliquez sur la roue dentée, puis sur « Installer un module depuis un fichier… », et choisissez le `.xpi`.

L'extension reste installée et conserve ses données (transferts, correspondances mémorisées, réglages) d'un redémarrage à l'autre. Pour une mise à jour, refaites la même procédure avec un numéro de version plus élevé.

Équivalent en ligne de commande, avec les clés d'API de la page « Gérer les clés d'API » du compte développeur :

```bash
npx web-ext sign --source-dir dist/firefox-mv3 --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

### Sans signature

Seules **Firefox Developer Edition**, **Nightly** et **ESR** permettent d'installer une extension non signée : dans `about:config`, passez `xpinstall.signatures.required` à `false`, puis installez le `.zip` renommé en `.xpi`. La version normale de Firefox ignore ce réglage.

> L'identifiant Firefox de l'extension est définitif depuis la version 1.0.0 (`{0ff0c5f4-4a4f-4db4-9b7a-9e3e4306817f}`). Les données d'un module temporaire chargé avant cette version ne sont pas reprises.

## Chrome / Edge

Une extension chargée avec « Charger l'extension non empaquetée » (mode développeur, dossier `dist/chrome-mv3`) **reste installée** après un redémarrage. Chrome affiche simplement un rappel sur le mode développeur au démarrage. Ne déplacez pas le dossier : l'extension le lit à chaque lancement.

## Publier

### Code source

Le code est public sur <https://github.com/EtienneMarec/NoteTransfer>, sous licence MIT. Vous pouvez y joindre une *Release* GitHub contenant le `.xpi` signé et le `.zip` Chrome : c'est la façon la plus simple de partager l'extension sans passer par une boutique.

### addons.mozilla.org (public)

Procédure identique à la signature, mais en choisissant **« Sur ce site »** (*On this site*). Il faut prévoir :

- une description, quelques captures d'écran et une catégorie ;
- une politique de confidentialité : l'extension ne collecte ni ne transmet aucune donnée, ce que déclare déjà le manifeste (`data_collection_permissions: none`) ;
- l'archive des sources (voir plus haut) ;
- une possible relecture humaine, de quelques jours à quelques semaines.

### Chrome Web Store (public)

- Compte développeur : inscription unique de 5 $ sur <https://chrome.google.com/webstore/devconsole>.
- Envoyez `notes-transfert-<version>-chrome.zip`.
- Remplissez l'onglet « Confidentialité » : usage unique (transférer ses notes de films), aucune donnée collectée, et la justification de chaque permission :
  - `storage` : transferts et réglages en local ;
  - `alarms` : reprise après la mise en veille du service worker ;
  - `scripting` : envoyer les requêtes depuis un onglet du site, avec la session de l'utilisateur ;
  - permissions d'hôte **optionnelles** : demandées seulement pour la plateforme choisie.
- La relecture prend en général quelques jours.

### Avant de publier : points à peser

- **Conditions d'utilisation des sites.** AlloCiné (art. 7.5 et 8.1) et IMDb interdisent l'automatisation, et l'écriture automatique sur SensCritique passe par une API non documentée. L'extension avertit et propose le mode « à la main », mais une boutique peut refuser ou retirer une extension qui automatise des sites contre leurs conditions, et un site peut contacter l'éditeur.
- **Marques.** Les noms AlloCiné, SensCritique, Letterboxd et IMDb sont utilisés de façon descriptive. N'utilisez pas leurs logos dans l'icône, les captures ou la fiche de la boutique.
- **Fragilité.** Les API internes peuvent changer à tout moment. L'extension se met alors en pause avec le message « adaptateur obsolète », mais il faudra la mettre à jour.

L'option la moins exposée est la signature « hors boutique » pour un usage personnel, plus le code sur GitHub. La publication en boutique est possible, mais ces trois points sont à décider en connaissance de cause.
