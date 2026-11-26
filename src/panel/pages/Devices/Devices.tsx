import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { useAppAlert } from '../../../components/AppAlert';
import { add, checkmarkCircle, closeOutline, cloudOfflineOutline, personOutline, phonePortraitOutline, pulseOutline, refreshOutline, serverOutline, storefrontOutline, timeOutline, trashOutline, wifiOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '../../../components/Notice';
import { useApp } from '../../../context/AppContext';
import type { Device } from '../../../data/models';
import { ago, useNow } from '../../../hooks/useNow';
import { buildLinkQr, normalizeServer, shortServer } from '../../../lib/link';
import { API_URL } from '../../../lib/api';
import { PanelHeader } from '../../components/PanelHeader';
import { QrCode } from '../../components/QrCode';
import './Devices.css';

interface ServerOption {
  url: string;
  name: string;
}

// Direcciones con las que el celular llega a la API (AbarreAPI).
// Si VITE_API_URL ya es una dirección pública (no localhost) se usa esa; si no, se le pregunta a la API
// (GET /__sync/info: su dirección pública y las de la red local).
const URL_SYNC = `${API_URL}/__sync`;
function useServerOptions(isOpen: boolean) {
  const [options, setOptions] = useState<ServerOption[]>([]);
  const [state, setState] = useState<'buscando' | 'listo' | 'error'>('buscando');

  useEffect(() => {
    if (!isOpen) return;
    const fixed = /^https?:\/\//.test(URL_SYNC) && !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(URL_SYNC) ? normalizeServer(URL_SYNC) : null;
    if (fixed) {
      setOptions([{ url: fixed, name: 'Configurada' }]);
      setState('listo');
      return;
    }
    let alive = true;
    setState('buscando');
    fetch(`${URL_SYNC.replace(/\/$/, '')}/info`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((info: { urls?: ServerOption[] }) => {
        if (!alive) return;
        setOptions(info.urls ?? []);
        setState('listo');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [isOpen]);

  return { options, state };
}

function LinkModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { pairing, newPairingCode, devices, store, syncConnected } = useApp();
  const [pairError, setPairError] = useState('');
  const renew = async () => {
    const r = await newPairingCode();
    setPairError(r.ok ? '' : r.message);
  };
  const { options, state } = useServerOptions(isOpen);
  const [server, setServer] = useState('');
  const now = useNow(1000);
  const known = useRef<Set<string>>(new Set());
  const [linked, setLinked] = useState<Device>();

  useEffect(() => {
    if (!isOpen) return;
    known.current = new Set(devices.map((d) => d.id));
    setLinked(undefined);
    if (!pairing || pairing.expiresAt < Date.now() + 60000) void renew();
    // solo al abrir
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || linked) return;
    const fresh = devices.find((d) => !known.current.has(d.id));
    if (fresh) setLinked(fresh);
  }, [devices, isOpen, linked]);

  useEffect(() => {
    if (!options.some((o) => o.url === server)) setServer(options[0]?.url ?? '');
  }, [options, server]);

  const left = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;
  const expired = !!pairing && left === 0;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Vincular nuevo celular</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body">
        {linked ? (
          <div className="lk-done">
            <IonIcon icon={checkmarkCircle} />
            <h3>{linked.name} vinculado</h3>
            <p>{linked.model} · ya puede escanear productos para {store.register}.</p>
          </div>
        ) : (
          <>
            {!syncConnected && (
              <div role="alert" className="lk-alert">
                <Notice tone="error" title="La caja no está conectada al servidor">
                  El celular no podrá vincularse. Revisa que la API (AbarreAPI) esté encendida y que haya internet.
                </Notice>
              </div>
            )}
            {pairError && (
              <div className="lk-alert">
                <Notice tone="error" title="No se pudo generar el código">{pairError}</Notice>
              </div>
            )}
            <ol className="lk-steps">
              <li><span>1</span><p>Conecta el celular a la <strong>misma red Wi‑Fi</strong> que esta computadora.</p></li>
              <li><span>2</span><p>En el celular abre Abarré y entra a <strong>Vincular con la caja</strong>.</p></li>
              <li><span>3</span><p>Escanea el código QR, o escribe la dirección y los 6 dígitos.</p></li>
            </ol>
            <div className="lk-grid">
              <div className={`lk-qr ${expired ? 'is-expired' : ''}`}>
                {pairing && <QrCode value={server ? buildLinkQr(pairing.code, server) : pairing.qr ?? buildLinkQr(pairing.code, null)} size={196} />}
              </div>
              <div className="lk-code">
                <span>Código</span>
                <strong>{pairing ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}` : '··· ···'}</strong>
                <span className={`lk-timer ${left < 60 ? 'is-low' : ''}`}>
                  <IonIcon icon={timeOutline} />
                  {expired ? 'Venció' : `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
                </span>
                <IonButton fill="clear" size="small" onClick={() => void renew()}>
                  <IonIcon slot="start" icon={refreshOutline} />
                  Generar otro
                </IonButton>
              </div>
            </div>
            <div className="lk-server">
              <span className="lk-server-icon"><IonIcon icon={serverOutline} /></span>
              <div>
                <span className="lk-label">Dirección de la caja</span>
                {state === 'buscando' && <strong className="muted">Buscando…</strong>}
                {state === 'error' && <strong className="lk-bad">No se encontró el servidor</strong>}
                {state === 'listo' && options.length === 0 && <strong className="lk-bad">Esta computadora no está conectada a una red</strong>}
                {state === 'listo' && options.length === 1 && <strong>{shortServer(server)}</strong>}
                {state === 'listo' && options.length > 1 && (
                  <select className="fselect lk-select" value={server} onChange={(e) => setServer(e.target.value)} aria-label="Red para el celular">
                    {options.map((o) => (
                      <option key={o.url} value={o.url}>{shortServer(o.url)} · {o.name}</option>
                    ))}
                  </select>
                )}
                <small>
                  {options.length > 1
                    ? 'Elige la red a la que está conectado el celular; el QR se actualiza solo.'
                    : 'El QR ya la incluye; escríbela solo si vinculas con el código.'}
                </small>
              </div>
            </div>
            <p className="lk-wait">
              <IonIcon icon={wifiOutline} /> Esperando a que el celular se vincule…
            </p>
          </>
        )}
      </div>
      <div className="pmodal-foot">
        <IonButton className="btn-lg" fill={linked ? 'solid' : 'outline'} onClick={onClose}>{linked ? 'Listo' : 'Cerrar'}</IonButton>
      </div>
    </IonModal>
  );
}

export default function Devices() {
  const { devices, isLive, removeDevice } = useApp();
  const showAlert = useAppAlert();
  const now = useNow(5000);
  const [linkOpen, setLinkOpen] = useState(false);
  const online = devices.filter((d) => isLive(d.id)).length;

  const confirmRemove = (d: Device) =>
    void showAlert({
      tone: 'warning',
      title: `¿Quitar ${d.name}?`,
      message: 'El celular dejará de enviar productos a la caja hasta que se vincule de nuevo.',
      primary: { text: 'Quitar celular', danger: true },
      secondary: 'Cancelar',
    }).then(async (yes) => {
      if (!yes) return;
      const r = await removeDevice(d.id);
      if (!r.ok) void showAlert({ tone: 'error', title: 'No se pudo quitar el celular', message: r.message, primary: 'Entendido' });
    });

  return (
    <IonPage>
      <PanelHeader title="Dispositivos" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Dispositivos</h1>
              <p>Celulares que escanean para esta caja.</p>
            </div>
            <div className="ppage-actions">
              <IonButton className="btn-lg" onClick={() => setLinkOpen(true)}>
                <IonIcon slot="start" icon={add} />
                Vincular nuevo celular
              </IonButton>
            </div>
          </div>

          {devices.length === 0 ? (
            <section className="pcard dev-empty">
              <span className="dev-empty-icon">
                <IonIcon icon={phonePortraitOutline} aria-hidden="true" />
              </span>
              <h2>Vincula tu primer celular</h2>
              <p>Con él escaneas productos y los mandas a esta caja, das de alta mercancía y entregas pedidos.</p>
              <ol className="dev-steps">
                <li><span>1</span>Instala Abarré en el celular</li>
                <li><span>2</span>Conéctalo a la misma Wi‑Fi que esta computadora</li>
                <li><span>3</span>Escanea el QR que te mostramos aquí</li>
              </ol>
              <IonButton className="btn-lg" onClick={() => setLinkOpen(true)}>
                <IonIcon slot="start" icon={add} />
                Vincular celular
              </IonButton>
            </section>
          ) : (
            <>
              <div className="dev-stats">
                <div className="dev-stat">
                  <span className="dev-stat-icon"><IonIcon icon={phonePortraitOutline} aria-hidden="true" /></span>
                  <strong>{devices.length}</strong>
                  <span>{devices.length === 1 ? 'Celular vinculado' : 'Celulares vinculados'}</span>
                </div>
                <div className="dev-stat is-on">
                  <span className="dev-stat-icon"><IonIcon icon={pulseOutline} aria-hidden="true" /></span>
                  <strong>{online}</strong>
                  <span>Conectados ahora</span>
                </div>
                <div className="dev-stat is-off">
                  <span className="dev-stat-icon"><IonIcon icon={cloudOfflineOutline} aria-hidden="true" /></span>
                  <strong>{devices.length - online}</strong>
                  <span>Desconectados</span>
                </div>
              </div>

              <div className="dev-grid">
                {devices.map((d) => {
                  const on = isLive(d.id);
                  return (
                    <article key={d.id} className={`pcard dev-card ${on ? 'is-on' : 'is-off'}`}>
                      <header className="dev-top">
                        <span className="dev-icon">
                          <IonIcon icon={phonePortraitOutline} aria-hidden="true" />
                          <span className="dev-dot" />
                        </span>
                        <span className="dev-name">
                          <h2>{d.name}</h2>
                          <small>{d.model}</small>
                        </span>
                        <span className="dev-state">{on ? 'Conectado' : 'Desconectado'}</span>
                      </header>
                      <ul className="dev-info">
                        <li>
                          <IonIcon icon={personOutline} aria-hidden="true" />
                          <span>Usuario</span>
                          <strong>{d.owner || 'Sin asignar'}</strong>
                        </li>
                        <li>
                          <IonIcon icon={storefrontOutline} aria-hidden="true" />
                          <span>Caja</span>
                          <strong>{d.register}</strong>
                        </li>
                        <li>
                          <IonIcon icon={timeOutline} aria-hidden="true" />
                          <span>Última conexión</span>
                          <strong>{on ? 'Ahora' : ago(new Date(d.lastSeen).getTime(), now)}</strong>
                        </li>
                      </ul>
                      <button type="button" className="dev-remove" onClick={() => confirmRemove(d)}>
                        <IonIcon icon={trashOutline} aria-hidden="true" />
                        Quitar celular
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </IonContent>
      <LinkModal isOpen={linkOpen} onClose={() => setLinkOpen(false)} />
    </IonPage>
  );
}
