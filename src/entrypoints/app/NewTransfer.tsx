import { useEffect, useState } from 'preact/hooks';
import { destinationsFor, getAdapter, sources } from '../../adapters/registry';
import { send, type Settings } from '../../background/messages';
import type { SessionStatus } from '../../core/adapter';
import type { RoundingMode } from '../../core/convert';
import type { PlatformId } from '../../core/pivot';

const SESSION_LABELS: Record<SessionStatus['state'], string> = {
  ok: 'connecté',
  signed_out: 'non connecté',
  blocked: 'vérification anti-robot affichée',
  needs_setup: 'autorisation nécessaire',
};

export function NewTransfer({ onCreated }: { onCreated: (jobId: string) => void }) {
  const [source, setSource] = useState<PlatformId>(sources()[0]!.id);
  const dests = destinationsFor(source);
  const [destination, setDestination] = useState<PlatformId | undefined>(dests[0]?.id);
  const [dryRun, setDryRun] = useState(true);
  const [testBatchSize, setTestBatchSize] = useState(3);
  const [rounding, setRounding] = useState<RoundingMode>('nearest');
  const [settings, setSettings] = useState<Settings>();
  const [accepted, setAccepted] = useState(false);
  const [sessions, setSessions] = useState<Partial<Record<PlatformId, SessionStatus>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void send({ type: 'getSettings' }).then(setSettings);
  }, []);
  useEffect(() => {
    if (!dests.some((d) => d.id === destination)) setDestination(dests[0]?.id);
    setSessions(undefined);
  }, [source]);

  const src = getAdapter(source);
  const dst = destination ? getAdapter(destination) : undefined;
  const warning = src.capabilities.termsWarning;
  const alreadyAccepted = !!settings?.termsAccepted[source];
  const termsOk = !warning || alreadyAccepted || accepted;
  const sessionsOk = sessions && destination && sessions[source]?.state === 'ok' && sessions[destination]?.state === 'ok';

  // permissions.request doit être appelé directement dans le gestionnaire de clic.
  function checkSessions() {
    if (!dst) return;
    setError(undefined);
    setBusy(true);
    const origins = [...new Set([...src.hostPermissions, ...dst.hostPermissions])];
    const granted = origins.length ? browser.permissions.request({ origins }) : Promise.resolve(true);
    void granted
      .then(async (ok) => {
        if (!ok) throw new Error('Autorisation refusée : l’extension ne peut pas accéder à ces sites.');
        setSessions(await send({ type: 'checkSessions', platforms: [source, dst.id] }));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  async function start() {
    if (!dst || !settings) return;
    setBusy(true);
    setError(undefined);
    try {
      if (warning && !alreadyAccepted) {
        await send({ type: 'saveSettings', settings: { ...settings, termsAccepted: { ...settings.termsAccepted, [source]: new Date().toISOString() } } });
      }
      const { jobId } = await send({
        type: 'createJob',
        job: { source, destination: dst.id, dryRun, rounding, conflictPolicy: 'keep', testBatchSize },
      });
      onCreated(jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <h2>Nouveau transfert</h2>
      <div class="grid2">
        <label class="field">
          Source
          <select value={source} onChange={(e) => setSource((e.target as HTMLSelectElement).value as PlatformId)}>
            {sources().map((a) => (
              <option value={a.id}>{a.displayName}</option>
            ))}
          </select>
          <span class="muted small">{src.capabilities.notes}</span>
        </label>
        <label class="field">
          Destination
          <select value={destination} onChange={(e) => setDestination((e.target as HTMLSelectElement).value as PlatformId)}>
            {dests.map((a) => (
              <option value={a.id}>{a.displayName}</option>
            ))}
          </select>
          <span class="muted small">{dst?.capabilities.notes}</span>
        </label>
      </div>
      {!dests.length && <p class="notice warn">Aucune destination n’est encore disponible pour cette source.</p>}

      <h3>Options</h3>
      <div class="grid2">
        <label class="check">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun((e.target as HTMLInputElement).checked)} />
          <span>
            <strong>Mode simulation</strong>
            <br />
            <span class="muted small">Tout le parcours, sans aucune écriture sur la destination.</span>
          </span>
        </label>
        <label class="field">
          Taille du lot de test
          <input
            type="number"
            min={1}
            max={50}
            value={testBatchSize}
            onChange={(e) => setTestBatchSize(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
          />
        </label>
        <label class="field">
          Arrondi si la conversion est inexacte
          <select value={rounding} onChange={(e) => setRounding((e.target as HTMLSelectElement).value as RoundingMode)}>
            <option value="nearest">Au plus proche (demi vers le haut)</option>
            <option value="down">Vers le bas</option>
            <option value="up">Vers le haut</option>
          </select>
        </label>
      </div>
      <p class="muted small">
        Une note déjà présente sur la destination n’est jamais écrasée par défaut : vous choisirez ligne par ligne dans l’aperçu.
      </p>

      {warning && (
        <div class="notice warn">
          <strong>Avertissement – {src.displayName}</strong>
          <p>{warning}</p>
          {alreadyAccepted ? (
            <p class="small">Accepté le {new Date(settings!.termsAccepted[source]!).toLocaleString('fr-FR')}.</p>
          ) : (
            <label class="check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
              <span>J’ai compris et j’accepte ce risque pour mon compte.</span>
            </label>
          )}
        </div>
      )}

      <h3>Sessions</h3>
      <p class="muted small">
        L’extension utilise les sessions déjà ouvertes dans ce navigateur. Elle ne demande ni ne stocke aucun mot de passe.
      </p>
      <div class="row">
        <button onClick={checkSessions} disabled={busy || !dst}>
          Autoriser l’accès et vérifier les sessions
        </button>
        {sessions &&
          [source, destination].map((p) => {
            const s = p && sessions[p];
            if (!p || !s) return null;
            return (
              <span>
                {getAdapter(p).displayName} :{' '}
                <span class={`badge ${s.state === 'ok' ? 'done' : 'failed'}`}>
                  {SESSION_LABELS[s.state]}
                  {s.state === 'ok' && s.displayName ? ` (${s.displayName})` : ''}
                </span>{' '}
                {s.state === 'signed_out' && (
                  <a href={s.loginUrl} target="_blank" rel="noreferrer">
                    se connecter
                  </a>
                )}
                {s.state === 'blocked' && s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    ouvrir le site
                  </a>
                )}
              </span>
            );
          })}
      </div>

      {error && <p class="notice bad">{error}</p>}

      <div class="row" style={{ marginTop: '16px' }}>
        <button class="primary" disabled={busy || !sessionsOk || !termsOk} onClick={() => void start()}>
          Lire mes notes {src.displayName}
        </button>
        {!termsOk && <span class="muted small">Acceptez l’avertissement pour continuer.</span>}
      </div>
    </section>
  );
}
