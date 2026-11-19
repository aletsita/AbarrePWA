import { IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar } from '@ionic/react';
import { phonePortraitOutline, timeOutline } from 'ionicons/icons';
import { BrandLogo } from '../../components/Brand';
import { ConnectionBadge, OfflineBar } from '../../components/ConnectionBadge';
import { useApp } from '../../context/AppContext';
import { initials } from '../../data/models';
import { useNow } from '../../hooks/useNow';

export function PhoneChip() {
  const { devices, lastScan, isLive } = useApp();
  const now = useNow(1000);
  const connected = devices.filter((d) => isLive(d.id));
  const scanning = lastScan && now - lastScan.at < 6000 && isLive(lastScan.deviceId);

  if (connected.length === 0) {
    return (
      <span className="phone-chip is-off" title="Ningún celular conectado">
        <IonIcon icon={phonePortraitOutline} /> <span className="phone-text">Sin celular</span>
      </span>
    );
  }
  return (
    <span className={`phone-chip ${scanning ? 'is-live' : 'is-on'}`} role="status" aria-live="polite">
      {scanning ? <span className="live-dot" /> : <IonIcon icon={phonePortraitOutline} />}
      <span className="phone-text">
        {scanning ? 'Escaneando…' : connected.length === 1 ? 'Celular conectado' : `${connected.length} celulares`}
      </span>
    </span>
  );
}

function Clock() {
  const now = useNow(15000);
  const d = new Date(now);
  return (
    <span className="ptop-clock" title={d.toLocaleDateString('es-MX', { dateStyle: 'full' })}>
      <IonIcon icon={timeOutline} aria-hidden="true" />
      <span>{d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
      <small>{d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
    </span>
  );
}

export function PanelHeader({ title }: { title: string }) {
  const { store, user } = useApp();
  const name = user?.name ?? store.owner;
  return (
    <IonHeader className="ptop ion-no-border">
      <IonToolbar>
        <IonButtons slot="start">
          <IonMenuButton menu="panel-menu" className="ptop-menu" />
          <span className="ptop-logo"><BrandLogo size={34} /></span>
        </IonButtons>
        <IonTitle>{title}</IonTitle>
        <div slot="end" className="ptop-end">
          <Clock />
          <PhoneChip />
          <ConnectionBadge />
          <span className="ptop-store">
            <strong>{store.name}</strong>
            {store.register} · {name}
          </span>
          <span className="ptop-user" title={name}>{initials(name)}</span>
        </div>
      </IonToolbar>
      <OfflineBar message="la caja sigue funcionando. Las ventas y cambios se guardan en este equipo y se suben al volver la conexión" />
    </IonHeader>
  );
}
