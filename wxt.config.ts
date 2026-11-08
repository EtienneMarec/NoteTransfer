import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { OPTIONAL_HOST_PERMISSIONS } from './src/core/permissions';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  zip: {
    artifactTemplate: 'notes-transfert-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'notes-transfert-{{version}}-sources.zip',
    // Archive des sources exigée par addons.mozilla.org pour le code compilé : sans fichiers locaux ni builds.
    excludeSources: ['.local-tests/**', 'dist/**', '.wxt/**', 'node_modules/**', '.claude/**'],
  },
  manifest: ({ browser }) => ({
    name: 'Notes Transfert',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'alarms', 'scripting'],
    // Demandées à l'exécution, plateforme par plateforme (permissions.request).
    optional_host_permissions: OPTIONAL_HOST_PERMISSIONS,
    action: { default_title: 'Notes Transfert' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          // Identifiant définitif : le changer ferait perdre les données des installations existantes.
          id: '{0ff0c5f4-4a4f-4db4-9b7a-9e3e4306817f}',
          strict_min_version: '140.0',
          // Aucune donnée n'est collectée ni transmise au développeur.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
