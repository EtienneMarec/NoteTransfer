import { useEffect, useState } from 'preact/hooks';
import { destinationsFor, getAdapter, sources } from '../../adapters/registry';
import { send, type Settings } from '../../background/messages';
import type { SessionStatus } from '../../core/adapter';
import type { RoundingMode } from '../../core/convert';
import type { PivotEntry, PlatformId } from '../../core/pivot';

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
  const [file, setFile] = useState<{ name: string; entries: PivotEntry[] }>();
  const [writeMode, setWriteMode] = useState<'auto' | 'manual'>('auto');

  useEffect(() => {
    void send({ type: 'getSettings' }).then(setSettings);
  }, []);
  useEffect(() => {
    if (!dests.some((d) => d.id === destination)) setDestination(dests[0]?.id);
    setSessions(undefined);
    setFile(undefined);
  }, [source]);

  const src = getAdapter(source);
  const dst = destination ? getAdapter(destination) : undefined;
  const fromFile = src.capabilities.read === 'file';
  const toFile = dst?.capabilities.write === 'file';
  // Destination qui propose à la fois l'écriture automatique et le mode « à la main » (IMDb).
  const bothModes = !!dst?.manualWrite && (dst.capabilities.write === 'site' || dst.capabilities.write === 'api');
  const manual = !!dst?.manualWrite && (writeMode === 'manual' || !dst.capabilities.write);
  const noSiteWrite = toFile || manual;
  // Seules les plateformes réellement contactées ont une session à vérifier et un éventuel avertissement.
  const srcOnline = src.capabilities.read === 'site' || src.capabilities.read === 'api';
  const dstOnline = !!dst && !noSiteWrite && (dst.capabilities.write === 'site' || dst.capabilities.write === 'api');
  const online = [srcOnline && src, dstOnline && dst].filter((a): a is NonNullable<typeof dst> => !!a);
  const warned = online.find((a) => a.capabilities.termsWarning);
  const warning = warned?.capabilities.termsWarning;
  const alreadyAccepted = !!warned && !!settings?.termsAccepted[warned.id];
  const termsOk = !warning || alreadyAccepted || accepted;
  const sessionsOk = online.every((a) => sessions?.[a.id]?.state === 'ok');
  const sourceReady = !fromFile || !!file?.entries.length;

  async function readFile(f: File | undefined) {
    setFile(undefined);
    setError(undefined);
    if (!f || !src.parseExport) return;
    try {
      const entries = await src.parseExport({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      if (!entries.length) throw new Error('Aucun film trouvé dans ce fichier.');
      setFile({ name: f.name, entries });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // permissions.request doit être appelé directement dans le gestionnaire de clic.
  function checkSessions() {
    if (!dst) return;
    setError(undefined);
    setBusy(true);
    const origins = [...new Set(online.flatMap((a) => a.hostPermissions))];
    const granted = origins.length ? browser.permissions.request({ origins }) : Promise.resolve(true);
    void granted
      .then(async (ok) => {
        if (!ok) throw new Error('Autorisation refusée : l’extension ne peut pas accéder à ces sites.');
        setSessions(await send({ type: 'checkSessions', platforms: online.map((a) => a.id) }));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  async function start() {
    if (!dst || !settings) return;
    setBusy(true);
    setError(undefined);
    try {
      if (warned && !alreadyAccepted) {
        await send({ type: 'saveSettings', settings: { ...settings, termsAccepted: { ...settings.termsAccepted, [warned.id]: new Date().toISOString() } } });
      }
      const { jobId } = await send({
        type: 'createJob',
        job: {
          source,
          destination: dst.id,
          dryRun: !noSiteWrite && dryRun,
          writeMode: manual ? 'manual' : 'auto',
          rounding,
          conflictPolicy: 'keep',
          testBatchSize,
        },
        ...(fromFile && file && { entries: file.entries }),
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

      {fromFile && (
        <>
          <h3>Fichier d’export {src.displayName}</h3>
          <p class="muted small">{src.exportInstructions}</p>
          <input
            type="file"
            accept={src.exportFileTypes}
            onChange={(e) => void readFile((e.target as HTMLInputElement).files?.[0])}
            aria-label={`Fichier d’export ${src.displayName}`}
          />
          {file && (
            <p class="notice ok">
              {file.entries.length} film(s) lu(s) dans {file.name}, dont {file.entries.filter((e) => e.rating).length} noté(s). Le fichier
              est lu dans ce navigateur, sans être envoyé nulle part.
            </p>
          )}
        </>
      )}

      {bothModes && dst && (
        <>
          <h3>Écriture sur {dst.displayName}</h3>
          <div class="grid2" role="radiogroup" aria-label={`Mode d’écriture sur ${dst.displayName}`}>
            <label class="check">
              <input type="radio" name="writeMode" checked={writeMode === 'auto'} onChange={() => setWriteMode('auto')} />
              <span>
                <strong>Automatique</strong>
                <br />
                <span class="muted small">Par l’API interne du site, avec l’avertissement ci-dessous à accepter.</span>
              </span>
            </label>
            <label class="check">
              <input type="radio" name="writeMode" checked={writeMode === 'manual'} onChange={() => setWriteMode('manual')} />
              <span>
                <strong>À la main</strong>
                <br />
                <span class="muted small">
                  L’extension prépare la liste avec les liens et les notes ; vous notez vous-même sur le site. Aucune requête n’est envoyée à{' '}
                  {dst.displayName}.
                </span>
              </span>
            </label>
          </div>
        </>
      )}

      <h3>Options</h3>
      <div class="grid2">
        {noSiteWrite ? (
          <p class="muted small">
            {toFile
              ? `${dst?.displayName} se remplit par son importeur officiel : l’extension génère le fichier, vous l’importez vous-même sur le site.`
              : `Vous noterez vous-même sur ${dst?.displayName}, à partir de la liste préparée par l’extension.`}
          </p>
        ) : (
          <>
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
          </>
        )}
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

      {warned && warning && (
        <div class="notice warn">
          <strong>Avertissement – {warned.displayName}</strong>
          <p>{warning}</p>
          {alreadyAccepted ? (
            <p class="small">Accepté le {new Date(settings!.termsAccepted[warned.id]!).toLocaleString('fr-FR')}.</p>
          ) : (
            <label class="check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
              <span>J’ai compris et j’accepte ce risque pour mon compte.</span>
            </label>
          )}
        </div>
      )}

      {online.length > 0 && (
        <>
          <h3>Sessions</h3>
          <p class="muted small">
            L’extension utilise les sessions déjà ouvertes dans ce navigateur. Elle ne demande ni ne stocke aucun mot de passe.
          </p>
          <div class="row">
            <button onClick={checkSessions} disabled={busy || !dst}>
              Autoriser l’accès et vérifier les sessions
            </button>
            {sessions &&
              online.map(({ id: p }) => {
                const s = sessions[p];
                if (!s) return null;
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
        </>
      )}

      {error && <p class="notice bad">{error}</p>}

      <div class="row" style={{ marginTop: '16px' }}>
        <button class="primary" disabled={busy || !sessionsOk || !termsOk || !sourceReady || !dst} onClick={() => void start()}>
          {fromFile ? `Préparer le transfert vers ${dst?.displayName ?? '…'}` : `Lire mes notes ${src.displayName}`}
        </button>
        {!termsOk && <span class="muted small">Acceptez l’avertissement pour continuer.</span>}
      </div>
    </section>
  );
}
