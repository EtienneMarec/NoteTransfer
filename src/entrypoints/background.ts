import { handle, onAlarm, pauseAfterBrowserRestart, resumeActive } from '../background/orchestrator';
import type { Request } from '../background/messages';

export default defineBackground(() => {
  // Clic sur l'icône : ouvre l'application plein onglet.
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
  });

  // Seules les pages de l'extension peuvent piloter le transfert.
  browser.runtime.onMessage.addListener((message: Request, sender) => {
    const fromExtensionPage = sender.id === browser.runtime.id && (!sender.tab || sender.url?.startsWith(browser.runtime.getURL('/')));
    if (!fromExtensionPage) return undefined;
    return handle(message).then(
      (value) => ({ ok: true, value }),
      (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
  });

  browser.alarms.onAlarm.addListener((alarm) => onAlarm(alarm.name));

  // storage.session est vidé à la fermeture du navigateur :
  // - marqueur présent → simple réveil du service worker : on reprend le job actif ;
  // - marqueur absent → démarrage du navigateur : on met en pause, l'utilisateur reprendra.
  void (async () => {
    const { awake } = await browser.storage.session.get('awake');
    if (awake) {
      await resumeActive();
    } else {
      await pauseAfterBrowserRestart();
      await browser.storage.session.set({ awake: true });
    }
  })();
});
