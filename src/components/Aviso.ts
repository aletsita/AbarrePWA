import { useIonToast, type ToastOptions } from '@ionic/react';
import { alertCircle, checkmarkCircle, trashOutline } from 'ionicons/icons';
import { useCallback } from 'react';

// Aviso de la marca (marca/components/Aviso): el único toast de la app. Abajo, sobre la barra de
// navegación; fondo marino, texto blanco e ícono a la izquierda; 3 s y sin punto final.
// Recibe las mismas opciones que useIonToast; el color solo elige el ícono, no el fondo.
const MS = 3000;
const LONG_TEXT = 70;

const iconFor = (o: ToastOptions): string => {
  const text = `${o.header ?? ''} ${o.message ?? ''}`.toLowerCase();
  if (o.color === 'danger' || o.color === 'warning') return alertCircle;
  if (/eliminad|borr|quit/.test(text)) return trashOutline;
  return checkmarkCircle;
};

// Quita el punto final; respeta los puntos suspensivos y los signos de cierre
const trimPeriod = (m: ToastOptions['message']) => (typeof m === 'string' ? m.replace(/(?<!\.)\.\s*$/, '') : m);

export function useAviso() {
  const [present] = useIonToast();
  return useCallback(
    (o: ToastOptions) => {
      const message = trimPeriod(o.message);
      const long = (typeof message === 'string' && message.length > LONG_TEXT) || !!o.buttons?.length;
      const tone = o.color === 'danger' ? 'is-error' : o.color === 'warning' ? 'is-alerta' : 'is-ok';
      const anchor = document.querySelector<HTMLElement>('ion-tab-bar:not(.tab-bar-hidden)');
      return present({
        ...o,
        message,
        color: undefined,
        icon: o.icon ?? iconFor(o),
        position: 'bottom',
        positionAnchor: anchor ?? undefined,
        // Los textos largos o con botón se quedan lo que pedía la pantalla; los demás, 3 s
        duration: long ? Math.max(o.duration ?? MS, MS) : MS,
        cssClass: ['toast-app', tone, o.cssClass].filter(Boolean).join(' '),
      });
    },
    [present],
  );
}
