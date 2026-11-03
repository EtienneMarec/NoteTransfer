import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { OPTIONAL_HOST_PERMISSIONS } from './src/core/permissions';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: 'Notes Transfert',
    description: "Transférez vos notes de films d'une plateforme à une autre, en local.",
    permissions: ['storage', 'alarms', 'scripting'],
    // Demandées à l'exécution, plateforme par plateforme (permissions.request).
    optional_host_permissions: OPTIONAL_HOST_PERMISSIONS,
    action: { default_title: 'Notes Transfert' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'notes-transfert@local',
          strict_min_version: '140.0',
          // Aucune donnée n'est collectée ni transmise au développeur.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
