import { IonIcon, IonSpinner } from '@ionic/react';
import { cloudOfflineOutline } from 'ionicons/icons';
import type { SyncState } from '../context/AppContext';

export function SyncBadge({ state, compact }: { state: SyncState; compact?: boolean }) {
  return (
    <span className={`sync-badge is-${state} ${compact ? 'is-compact' : ''}`} title={state === 'pendiente' ? 'Guardado en este equipo, se subirá al volver la conexión' : 'Subiendo'}>
      {state === 'subiendo' ? <IonSpinner name="crescent" /> : <IonIcon icon={cloudOfflineOutline} />}
      {state === 'subiendo' ? 'Subiendo' : compact ? 'Sin subir' : 'Pendiente de subir'}
    </span>
  );
}
