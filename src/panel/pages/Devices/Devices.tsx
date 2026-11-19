import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar, useIonAlert } from '@ionic/react';
import { add, checkmarkCircle, closeOutline, phonePortraitOutline, refreshOutline, timeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { useApp } from '../../../context/AppContext';
import type { Device } from '../../../data/models';
import { ago, useNow } from '../../../hooks/useNow';
import { PanelHeader } from '../../components/PanelHeader';
import { QrCode } from '../../components/QrCode';
import './Devices.css';

function LinkModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { pairing, newPairingCode, devices, store } = useApp();
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
            <ol className="lk-steps">
              <li>En el celular abre Abarré y entra a <strong>Vincular con la caja</strong>.</li>
              <li>Escanea este código QR o escribe los 6 dígitos.</li>
            </ol>
            <div className="lk-grid">
              <div className={`lk-qr ${expired ? 'is-expired' : ''}`}>
                {pairing && <QrCode value={`ABARRE-LINK:${pairing.code}`} size={196} />}
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
            <p className="lk-wait">Esperando a que el celular se vincule…</p>
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
