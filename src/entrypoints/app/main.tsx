import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send, type Settings } from '../../background/messages';
import { defaultLang, LANGS, type Lang } from '../../core/i18n';
import type { TransferJob } from '../../core/job/types';
import { createI18n, I18nContext, useI18n } from './i18n';
import { JobView } from './JobView';
import { NewTransfer } from './NewTransfer';
import './style.css';

const LANG_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English' };

function App() {
  const [lang, setLang] = useState<Lang>(defaultLang(navigator.language));
  const i18n = useMemo(() => createI18n(lang), [lang]);

  useEffect(() => {
    void browser.storage.local.get('language').then(({ language }) => {
      if (LANGS.includes(language as Lang)) setLang(language as Lang);
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Clé à part des réglages : un écran qui enregistre ses réglages ne peut pas écraser la langue.
  function changeLang(next: Lang) {
    setLang(next);
    void browser.storage.local.set({ language: next });
  }

  return (
    <I18nContext.Provider value={i18n}>
      <Shell onLangChange={changeLang} onDeleted={() => setLang(defaultLang(navigator.language))} />
    </I18nContext.Provider>
  );
}

function Shell({ onLangChange, onDeleted }: { onLangChange: (lang: Lang) => void; onDeleted: () => void }) {
  const { t, lang, locale } = useI18n();
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadJobs = () => void send({ type: 'listJobs' }).then(setJobs);
  useEffect(loadJobs, [current]);

  async function deleteAll() {
    if (!confirm(t('app.deleteAllConfirm'))) return;
    await send({ type: 'deleteAll' });
    // « Tout supprimer » efface aussi la langue choisie : on revient à celle du navigateur, sans la réenregistrer.
    onDeleted();
    setCurrent(null);
    setJobs([]);
  }

  return (
    <main>
      <header class="top">
        <h1>Notes Transfert</h1>
        {jobs.length > 0 && (
          <select value={current ?? ''} onChange={(e) => setCurrent((e.target as HTMLSelectElement).value || null)} aria-label={t('app.transfers')}>
            <option value="">{t('app.newTransfer')}</option>
            {jobs.map((j) => (
              <option value={j.id}>
                {new Date(j.createdAt).toLocaleString(locale)} – {getAdapter(j.source).displayName} → {getAdapter(j.destination).displayName}
                {j.dryRun ? t('app.simulationSuffix') : ''}
              </option>
            ))}
          </select>
        )}
        <select value={lang} aria-label={t('app.language')} onChange={(e) => onLangChange((e.target as HTMLSelectElement).value as Lang)}>
          {LANGS.map((l) => (
            <option value={l}>{LANG_NAMES[l]}</option>
          ))}
        </select>
        <button onClick={() => setShowSettings((s) => !s)}>{t('app.settings')}</button>
        <button class="danger" onClick={() => void deleteAll()}>
          {t('app.deleteAll')}
        </button>
      </header>

      {showSettings && <SettingsPanel />}
      {current ? <JobView jobId={current} onClosed={() => setCurrent(null)} /> : <NewTransfer onCreated={setCurrent} />}

      <footer class="muted small">{t('app.footer')}</footer>
    </main>
  );
}

function SettingsPanel() {
  const { t } = useI18n();
  const [s, setS] = useState<Settings>();
  const [saved, setSaved] = useState(false);
  useEffect(() => void send({ type: 'getSettings' }).then(setS), []);
  if (!s) return null;
  const num = (v: string) => Math.max(500, Number(v) || 0);
  return (
    <section class="card">
      <h2>{t('app.settings')}</h2>
      <div class="row">
        <label class="field">
          {t('settings.minDelay')}
          <input type="number" min={500} step={100} value={s.minDelayMs} onChange={(e) => setS({ ...s, minDelayMs: num((e.target as HTMLInputElement).value) })} />
        </label>
        <label class="field">
          {t('settings.maxDelay')}
          <input type="number" min={500} step={100} value={s.maxDelayMs} onChange={(e) => setS({ ...s, maxDelayMs: num((e.target as HTMLInputElement).value) })} />
        </label>
        <button onClick={() => void send({ type: 'saveSettings', settings: s }).then(() => setSaved(true))}>{t('settings.save')}</button>
        {saved && <span class="badge done">{t('settings.saved')}</span>}
      </div>
      <p class="muted small">{t('settings.delayHelp')}</p>
      {Object.keys(s.termsAccepted).length > 0 && (
        <p>
          {t('settings.accepted')} {Object.keys(s.termsAccepted).join(', ')}{' '}
          <button onClick={() => void send({ type: 'saveSettings', settings: { ...s, termsAccepted: {} } }).then(() => setS({ ...s, termsAccepted: {} }))}>
            {t('settings.revoke')}
          </button>
        </p>
      )}
    </section>
  );
}

render(<App />, document.getElementById('root')!);
