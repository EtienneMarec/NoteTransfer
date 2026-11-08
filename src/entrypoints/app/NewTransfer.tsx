import { useEffect, useState } from 'preact/hooks';
import { destinationsFor, getAdapter, sources } from '../../adapters/registry';
import { send, type Settings } from '../../background/messages';
import type { SessionStatus } from '../../core/adapter';
import type { RoundingMode } from '../../core/convert';
import { errorMsg, LocalizedError, msg, type Msg } from '../../core/i18n';
import type { PivotEntry, PlatformId } from '../../core/pivot';
import { useI18n } from './i18n';

export function NewTransfer({ onCreated }: { onCreated: (jobId: string) => void }) {
  const { t, m, l, locale } = useI18n();
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
  const [error, setError] = useState<Msg>();
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
      if (!entries.length) throw new LocalizedError(msg('err.noFilmsInFile'));
      setFile({ name: f.name, entries });
    } catch (e) {
      setError(errorMsg(e));
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
        if (!ok) throw new LocalizedError(msg('err.permissionRefused'));
        setSessions(await send({ type: 'checkSessions', platforms: online.map((a) => a.id) }));
      })
      .catch((e: unknown) => setError(errorMsg(e)))
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
      setError(errorMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <h2>{t('app.newTransfer')}</h2>
      <div class="grid2">
        <label class="field">
          {t('new.source')}
          <select value={source} onChange={(e) => setSource((e.target as HTMLSelectElement).value as PlatformId)}>
            {sources().map((a) => (
              <option value={a.id}>{a.displayName}</option>
            ))}
          </select>
          <span class="muted small">{l(src.capabilities.notes)}</span>
        </label>
        <label class="field">
          {t('new.destination')}
          <select value={destination} onChange={(e) => setDestination((e.target as HTMLSelectElement).value as PlatformId)}>
            {dests.map((a) => (
              <option value={a.id}>{a.displayName}</option>
            ))}
          </select>
          <span class="muted small">{l(dst?.capabilities.notes)}</span>
        </label>
      </div>
      {!dests.length && <p class="notice warn">{t('new.noDestination')}</p>}

      {fromFile && (
        <>
          <h3>{t('new.exportFile', { platform: src.displayName })}</h3>
          <p class="muted small">{l(src.exportInstructions)}</p>
          <input
            type="file"
            accept={src.exportFileTypes}
            onChange={(e) => void readFile((e.target as HTMLInputElement).files?.[0])}
            aria-label={t('new.exportFile', { platform: src.displayName })}
          />
          {file && (
            <p class="notice ok">
              {t('new.fileRead', { count: file.entries.length, name: file.name, rated: file.entries.filter((e) => e.rating).length })}
            </p>
          )}
        </>
      )}

      {bothModes && dst && (
        <>
          <h3>{t('new.writeOn', { platform: dst.displayName })}</h3>
          <div class="grid2" role="radiogroup" aria-label={t('new.writeMode', { platform: dst.displayName })}>
            <label class="check">
              <input type="radio" name="writeMode" checked={writeMode === 'auto'} onChange={() => setWriteMode('auto')} />
              <span>
                <strong>{t('new.auto')}</strong>
                <br />
                <span class="muted small">{t('new.autoHelp')}</span>
              </span>
            </label>
            <label class="check">
              <input type="radio" name="writeMode" checked={writeMode === 'manual'} onChange={() => setWriteMode('manual')} />
              <span>
                <strong>{t('new.manual')}</strong>
                <br />
                <span class="muted small">{t('new.manualHelp', { platform: dst.displayName })}</span>
              </span>
            </label>
          </div>
        </>
      )}

      <h3>{t('new.options')}</h3>
      <div class="grid2">
        {noSiteWrite ? (
          <p class="muted small">
            {t(toFile ? 'new.importOnly' : 'new.manualOnly', { platform: dst?.displayName ?? '' })}
          </p>
        ) : (
          <>
            <label class="check">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun((e.target as HTMLInputElement).checked)} />
              <span>
                <strong>{t('new.dryRun')}</strong>
                <br />
                <span class="muted small">{t('new.dryRunHelp')}</span>
              </span>
            </label>
            <label class="field">
              {t('new.batchSize')}
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
          {t('new.rounding')}
          <select value={rounding} onChange={(e) => setRounding((e.target as HTMLSelectElement).value as RoundingMode)}>
            <option value="nearest">{t('new.roundNearest')}</option>
            <option value="down">{t('new.roundDown')}</option>
            <option value="up">{t('new.roundUp')}</option>
          </select>
        </label>
      </div>
      <p class="muted small">{t('new.neverOverwrite')}</p>

      {warned && warning && (
        <div class="notice warn">
          <strong>{t('new.warning', { platform: warned.displayName })}</strong>
          <p>{l(warning)}</p>
          {alreadyAccepted ? (
            <p class="small">{t('new.acceptedOn', { date: new Date(settings!.termsAccepted[warned.id]!).toLocaleString(locale) })}</p>
          ) : (
            <label class="check">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
              <span>{t('new.acceptRisk')}</span>
            </label>
          )}
        </div>
      )}

      {online.length > 0 && (
        <>
          <h3>{t('new.sessions')}</h3>
          <p class="muted small">{t('new.sessionsHelp')}</p>
          <div class="row">
            <button onClick={checkSessions} disabled={busy || !dst}>
              {t('new.checkSessions')}
            </button>
            {sessions &&
              online.map(({ id: p }) => {
                const s = sessions[p];
                if (!s) return null;
                return (
                  <span>
                    {getAdapter(p).displayName} :{' '}
                    <span class={`badge ${s.state === 'ok' ? 'done' : 'failed'}`}>
                      {t(`session.${s.state}`)}
                      {s.state === 'ok' && s.displayName ? ` (${s.displayName})` : ''}
                    </span>{' '}
                    {s.state === 'signed_out' && (
                      <a href={s.loginUrl} target="_blank" rel="noreferrer">
                        {t('new.signIn')}
                      </a>
                    )}
                    {s.state === 'blocked' && s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {t('new.openSite')}
                      </a>
                    )}
                  </span>
                );
              })}
          </div>
        </>
      )}

      {error && <p class="notice bad">{m(error)}</p>}

      <div class="row" style={{ marginTop: '16px' }}>
        <button class="primary" disabled={busy || !sessionsOk || !termsOk || !sourceReady || !dst} onClick={() => void start()}>
          {fromFile ? t('new.prepare', { platform: dst?.displayName ?? '…' }) : t('new.read', { platform: src.displayName })}
        </button>
        {!termsOk && <span class="muted small">{t('new.acceptToContinue')}</span>}
      </div>
    </section>
  );
}
