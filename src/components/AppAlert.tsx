import { IonButton, IonIcon, IonModal } from '@ionic/react';
import { alertCircleOutline, checkmarkCircleOutline, closeCircleOutline, informationCircleOutline } from 'ionicons/icons';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import './AppAlert.css';

// Alerta de la app: título corto, mensaje sencillo, ícono por tipo y dos botones con jerarquía.
// Solo para lo que pide una decisión; los avisos sin decisión van como toast.
export type AlertTone = 'info' | 'warning' | 'error' | 'success';

export interface AlertOptions {
  tone: AlertTone;
  title: string;
  message: ReactNode;
  // Dato leído o capturado que conviene ver tal cual (por ejemplo el código escaneado)
  code?: string;
  // Botón principal; `danger` lo pinta en rojo (borrar, cerrar sesión…)
  primary: string | { text: string; danger?: boolean };
  // Botón secundario (cancelar); sin él solo queda el principal
  secondary?: string;
}

// true = tocó el botón principal; false = secundario, atrás de Android o tocó fuera
type Show = (o: AlertOptions) => Promise<boolean>;

const TONE_ICON: Record<AlertTone, string> = {
  info: informationCircleOutline,
  warning: alertCircleOutline,
  error: closeCircleOutline,
  success: checkmarkCircleOutline,
};

const AlertContext = createContext<Show | null>(null);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<AlertOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const answer = useRef(false);

  // Nunca dos alertas a la vez: si llega otra, la anterior se responde como «cancelar»
  const show = useCallback<Show>((o) => {
    resolver.current?.(false);
    answer.current = false;
    setCurrent(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    answer.current = ok;
    setCurrent(null);
  };

  const primary = current && (typeof current.primary === 'string' ? { text: current.primary } : current.primary);

  return (
    <AlertContext.Provider value={show}>
      {children}
      <IonModal
        className="app-alert-modal"
        isOpen={!!current}
        // Foco en la acción principal al abrir (lectores de pantalla y teclado)
        onDidPresent={() => document.querySelector<HTMLElement>('.app-alert-primary')?.focus()}
        onDidDismiss={() => {
          // El botón atrás de Android y tocar fuera cierran el modal: cuentan como «cancelar»
          setCurrent(null);
          const r = resolver.current;
          resolver.current = null;
          r?.(answer.current);
        }}
      >
        {current && primary && (
          <div className={`app-alert is-${current.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="app-alert-title" aria-describedby="app-alert-msg">
            <span className="app-alert-icon">
              <IonIcon icon={TONE_ICON[current.tone]} aria-hidden="true" />
            </span>
            <h2 id="app-alert-title">{current.title}</h2>
            {current.code && <code className="app-alert-code">{current.code}</code>}
            <div id="app-alert-msg" className="app-alert-msg">
              {current.message}
            </div>
            <div className="app-alert-actions">
              <IonButton expand="block" className="app-alert-primary" color={primary.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {primary.text}
              </IonButton>
              {current.secondary && (
                <IonButton expand="block" fill="clear" color="medium" className="app-alert-secondary" onClick={() => close(false)}>
                  {current.secondary}
                </IonButton>
              )}
            </div>
          </div>
        )}
      </IonModal>
    </AlertContext.Provider>
  );
}

export function useAppAlert(): Show {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAppAlert fuera de AlertProvider');
  return ctx;
}
