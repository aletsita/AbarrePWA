import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar, useIonAlert } from '@ionic/react';
import { add, alertCircleOutline, checkmarkCircle, closeOutline, phonePortraitOutline, refreshOutline, serverOutline, timeOutline, wifiOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { useApp } from '../../../context/AppContext';
import type { Device } from '../../../data/models';
import { ago, useNow } from '../../../hooks/useNow';
import { buildLinkQr, normalizeServer, shortServer } from '../../../lib/link';
import { URL_SYNC } from '../../../lib/sync';
import { PanelHeader } from '../../components/PanelHeader';
import { QrCode } from '../../components/QrCode';
import './Devices.css';

interface ServerOption {
  url: string;
  name: string;
}

// Direcciones con las que el celular llega al servidor de sincronización.
// Si VITE_SYNC_URL ya es una dirección pública (no localhost) se usa esa; si no, se le pregunta al servidor.
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
  const { options, state } = useServerOptions(isOpen);
  const [server, setServer] = useState('');
  const now = useNow(1000);
  const known = useRef<Set<string>>(new Set());
  const [linked, setLinked] = useState<Device>();

  useEffect(() => {
    if (!isOpen) return;
    known.current = new Set(devices.map((d) => d.id));
    setLinked(undefined);
    if (!pairing || pairing.expiresAt < Date.now() + 60000) newPairingCode();
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
              <p className="lk-alert" role="alert">
                <IonIcon icon={alertCircleOutline} />
                <span>
                  Esta caja no está conectada al servidor de sincronización, así que el celular no podrá vincularse.
                  Enciéndelo en la computadora con <code>npm run dev:server</code>.
                </span>
              </p>
            )}
            <ol className="lk-steps">
              <li>Conecta el celular a la <strong>misma red Wi‑Fi</strong> que esta computadora.</li>
              <li>En el celular abre Abarré y entra a <strong>Vincular con la caja</strong>.</li>
              <li>Escanea el código QR, o escribe la dirección y los 6 dígitos.</li>
            </ol>
            <div className="lk-grid">
              <div className={`lk-qr ${expired ? 'is-expired' : ''}`}>
                {pairing && <QrCode value={buildLinkQr(pairing.code, server || null)} size={196} />}
              </div>
              <div className="lk-code">
                <span>Código</span>
                <strong>{pairing ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}` : '··· ···'}</strong>
                <span className={`lk-timer ${left < 60 ? 'is-low' : ''}`}>
                  <IonIcon icon={timeOutline} />
                  {expired ? 'Venció' : `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
                </span>
                <IonButton fill="clear" size="small" onClick={newPairingCode}>
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
  const [alert] = useIonAlert();
  const now = useNow(5000);
  const [linkOpen, setLinkOpen] = useState(false);

  const confirmRemove = (d: Device) =>
    alert({
      header: `¿Quitar ${d.name}?`,
      message: 'El celular dejará de enviar productos a la caja hasta que se vincule de nuevo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Quitar', role: 'destructive', handler: () => removeDevice(d.id) },
      ],
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
            <section className="pcard">
              <EmptyState art="box" title="Sin celulares vinculados" text="Vincula un celular para escanear productos y mandarlos a la caja." />
            </section>
          ) : (
            <div className="dev-grid">
              {devices.map((d) => {
                const on = isLive(d.id);
                return (
                  <article key={d.id} className={`pcard dev-card ${on ? 'is-on' : 'is-off'}`}>
                    <div className="dev-top">
                      <span className="dev-icon"><IonIcon icon={phonePortraitOutline} /></span>
                      <span className={`pill ${on ? 'is-ok' : 'is-off'}`}>
                        <span className="dev-dot" />
                        {on ? 'Conectado' : 'Desconectado'}
                      </span>
                    </div>
                    <h2>{d.name}</h2>
                    <p className="muted">{d.model}</p>
                    <dl>
                      <div><dt>Usuario</dt><dd>{d.owner || 'Sin asignar'}</dd></div>
                      <div><dt>Caja</dt><dd>{d.register}</dd></div>
                      <div><dt>Última conexión</dt><dd>{on ? 'Ahora' : ago(new Date(d.lastSeen).getTime(), now)}</dd></div>
                    </dl>
                    <IonButton fill="clear" color="danger" size="small" className="dev-remove" onClick={() => confirmRemove(d)}>
                      Quitar dispositivo
                    </IonButton>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </IonContent>
      <LinkModal isOpen={linkOpen} onClose={() => setLinkOpen(false)} />
    </IonPage>
  );
}
