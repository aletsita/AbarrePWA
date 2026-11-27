import { IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { useId, useRef, type ComponentProps, type ReactNode, type Ref } from 'react';
import './PanelModal.css';

// Modal único del panel: encabezado (título y cerrar de 44 px), cuerpo con scroll y pie fijo.
// El contenido va como hijos: <div className="pmodal-body"> y, si hay acciones, <div className="pmodal-foot">.
// Tamaños: «form» 640 px (formularios), «detail» 760 px (detalles), «wide» 960 px (formularios de dos columnas).
export type PanelModalSize = 'form' | 'detail' | 'wide';

type Props = {
  isOpen: boolean;
  // Se llama cuando el modal termina de cerrarse (X, Esc, tocar fuera o isOpen en false)
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: PanelModalSize;
  className?: string;
  modalRef?: Ref<HTMLIonModalElement>;
  children: ReactNode;
} & Pick<ComponentProps<typeof IonModal>, 'onDidPresent' | 'canDismiss'>;

export function PanelModal({ isOpen, onClose, title, subtitle, size = 'form', className = '', modalRef, children, onDidPresent, canDismiss }: Props) {
  const titleId = useId();
  const own = useRef<HTMLIonModalElement | null>(null);

  const setRef = (el: HTMLIonModalElement | null) => {
    own.current = el;
    if (typeof modalRef === 'function') modalRef(el);
    else if (modalRef) (modalRef as { current: HTMLIonModalElement | null }).current = el;
  };

  return (
    <IonModal
      ref={setRef}
      isOpen={isOpen}
      onDidDismiss={onClose}
      onDidPresent={onDidPresent}
      canDismiss={canDismiss}
      aria-labelledby={titleId}
      className={`pmodal amodal is-${size} ${className}`}
    >
      <header className="amodal-head">
        <div className="amodal-title">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {/* Cerrar pasa por canDismiss (por ejemplo, «¿Salir sin guardar?») */}
        <button type="button" className="amodal-close" onClick={() => void own.current?.dismiss()} aria-label="Cerrar">
          <IonIcon icon={closeOutline} aria-hidden="true" />
        </button>
      </header>
      {children}
    </IonModal>
  );
}
