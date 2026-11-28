import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAviso } from '../components/Aviso';

// Aviso cuando sube lo que se hizo sin internet. Lo que el servidor no aceptó se muestra y ya no se reintenta.
export function SyncToaster() {
  const { lastUpload } = useApp();
  const toast = useAviso();

  useEffect(() => {
    if (!lastUpload) return;
    const { count, rejected, warnings } = lastUpload;
    if (rejected.length) {
      void toast({
        header: count ? `${rejected.length} de ${count} cambios no se aceptaron` : rejected[0].title,
        message: rejected.map((r) => (count ? `${r.title}: ${r.message}` : r.message)).join(' · '),
        duration: 9000,
        color: 'danger',
        position: 'top',
        cssClass: 'toast-app',
        buttons: [{ text: 'Entendido', role: 'cancel' }],
      });
      return;
    }
    if (warnings.length) {
      void toast({
        header: count === 1 ? 'Se subió 1 cambio pendiente, con aviso' : `Se subieron ${count} cambios pendientes, con avisos`,
        message: warnings.map((w) => w.message || w.title).join(' · '),
        duration: 7000,
        color: 'warning',
        position: 'top',
        cssClass: 'toast-app',
      });
      return;
    }
    void toast({
      message: count === 1 ? 'Se subió 1 cambio pendiente' : `Se subieron ${count} cambios pendientes`,
      duration: 2200,
      color: 'success',
      position: 'top',
      cssClass: 'toast-app',
    });
  }, [lastUpload]);

  return null;
}
