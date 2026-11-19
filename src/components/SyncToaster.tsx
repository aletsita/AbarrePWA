import { useIonToast } from '@ionic/react';
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function SyncToaster() {
  const { lastUpload } = useApp();
  const [toast] = useIonToast();

  useEffect(() => {
    if (!lastUpload) return;
    toast({
      message: lastUpload.count === 1 ? 'Se subió 1 cambio pendiente' : `Se subieron ${lastUpload.count} cambios pendientes`,
      duration: 2200,
      color: 'success',
      position: 'top',
      cssClass: 'toast-app',
    });
  }, [lastUpload]);

  return null;
}
