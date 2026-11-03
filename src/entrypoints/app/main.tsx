import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getAdapter } from '../../adapters/registry';
import { send, type Settings } from '../../background/messages';
import type { TransferJob } from '../../core/job/types';
import { JobView } from './JobView';
import { NewTransfer } from './NewTransfer';
import './style.css';

function App() {
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadJobs = () => void send({ type: 'listJobs' }).then(setJobs);
  useEffect(loadJobs, [current]);

  async function deleteAll() {
    if (!confirm('Supprimer toutes les données de l’extension (transferts, correspondances mémorisées, réglages) et retirer ses autorisations ?')) return;
    await send({ type: 'deleteAll' });
    setCurrent(null);
    setJobs([]);
  }

  return (
    <main>
      <header class="top">
        <h1>Notes Transfert</h1>
        {jobs.length > 0 && (
          <select value={current ?? ''} onChange={(e) => setCurrent((e.target as HTMLSelectElement).value || null)} aria-label="Transferts">
            <option value="">Nouveau transfert</option>
            {jobs.map((j) => (
              <option value={j.id}>
                {new Date(j.createdAt).toLocaleString('fr-FR')} – {getAdapter(j.source).displayName} → {getAdapter(j.destination).displayName}
                {j.dryRun ? ' (simulation)' : ''}
              </option>
            ))}
          </select>
        )}
        <button onClick={() => setShowSettings((s) => !s)}>Réglages</button>
        <button class="danger" onClick={() => void deleteAll()}>
          Tout supprimer
        </button>
      </header>

      {showSettings && <SettingsPanel />}
      {current ? <JobView jobId={current} onClosed={() => setCurrent(null)} /> : <NewTransfer onCreated={setCurrent} />}

      <footer class="muted small">
        Tout fonctionne en local, avec les sessions de ce navigateur. Aucun serveur, aucune statistique d’usage, aucun mot de passe.
      </footer>
    </main>
  );
}

function SettingsPanel() {
  const [s, setS] = useState<Settings>();
  const [saved, setSaved] = useState(false);
  const [logs, setLogs] = useState<string>();
  useEffect(() => void send({ type: 'getSettings' }).then(setS), []);
  if (!s) return null;
  const num = (v: string) => Math.max(500, Number(v) || 0);
  return (
    <section class="card">
      <h2>Réglages</h2>
      <div class="row">
        <label class="field">
          Délai minimal entre deux requêtes (ms)
          <input type="number" min={500} step={100} value={s.minDelayMs} onChange={(e) => setS({ ...s, minDelayMs: num((e.target as HTMLInputElement).value) })} />
        </label>
        <label class="field">
          Délai maximal (ms)
          <input type="number" min={500} step={100} value={s.maxDelayMs} onChange={(e) => setS({ ...s, maxDelayMs: num((e.target as HTMLInputElement).value) })} />
        </label>
        <button onClick={() => void send({ type: 'saveSettings', settings: s }).then(() => setSaved(true))}>Enregistrer</button>
        {saved && <span class="badge done">enregistré</span>}
      </div>
      <p class="muted small">Le délai réel est tiré au hasard entre ces deux valeurs, sans jamais envoyer deux requêtes en parallèle vers un même site.</p>
      {Object.keys(s.termsAccepted).length > 0 && (
        <p>
          Avertissements acceptés : {Object.keys(s.termsAccepted).join(', ')}{' '}
          <button onClick={() => void send({ type: 'saveSettings', settings: { ...s, termsAccepted: {} } }).then(() => setS({ ...s, termsAccepted: {} }))}>
            Révoquer
          </button>
        </p>
      )}
      <details onToggle={() => void send({ type: 'getLogs' }).then((l) => setLogs(l.map((r) => `${r.at} ${r.level} ${r.msg}`).join('\n')))}>
        <summary>Journal (sans cookies ni jetons)</summary>
        <pre class="logs">{logs || 'Vide.'}</pre>
      </details>
    </section>
  );
}

render(<App />, document.getElementById('root')!);
