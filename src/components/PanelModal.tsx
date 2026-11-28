import { createAnimation, IonButton, IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { createContext, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode, type Ref } from 'react';
import { useAppAlert } from './AppAlert';
import './PanelModal.css';

// Modal único del panel: encabezado (título y cerrar de 44 px), cuerpo con scroll y pie fijo.
// El contenido va como hijos: <div className="pmodal-body"> y, si hay acciones, <div className="pmodal-foot">.
// Tamaños: «form» 640 px (formularios), «detail» 760 px (detalles), «wide» 960 px (formularios de dos columnas).
// En celular (menos de 720 px) es una hoja inferior (`mobile="sheet"`) o pantalla completa (`mobile="full"`, formularios largos).
// `aside`: panel a la izquierda desde 720 px; el encabezado, el cuerpo y el pie quedan a su derecha. En celular no se muestra.
export type PanelModalSize = 'form' | 'detail' | 'wide';

type Props = {
  isOpen: boolean;
  // Se llama cuando el modal termina de cerrarse (X, Esc, tocar fuera, «Cancelar» o isOpen en false)
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: PanelModalSize;
  mobile?: 'sheet' | 'full';
  aside?: ReactNode;
  className?: string;
  modalRef?: Ref<HTMLIonModalElement>;
  // Hay cambios sin guardar: la X, Esc, tocar fuera y «Cancelar» preguntan antes de cerrar
  dirty?: boolean;
  // Título de esa pregunta (por defecto «¿Descartar cambios?»)
  discardTitle?: string;
  // Guardando: la X, Esc y tocar fuera no cierran para no perder el envío
  busy?: boolean;
  children: ReactNode;
} & Pick<ComponentProps<typeof IonModal>, 'onDidPresent' | 'canDismiss'>;

// Cierres que pidió la persona (no los que hace la pantalla al guardar poniendo isOpen en false)
const USER_ROLES = new Set(['close', 'cancel', 'backdrop', 'gesture']);

const PHONE = '(max-width: 719px)';

// Scroll de la página bloqueado mientras haya al menos un modal abierto
let openCount = 0;
const lockScroll = () => {
  if (openCount++ === 0) document.body.classList.add('pmodal-open');
};
const unlockScroll = () => {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) document.body.classList.remove('pmodal-open');
};

const FOCUSABLE_FIELD = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

// Entrada de 180 ms: en celular sube desde abajo, en escritorio crece de 0.98 a 1. Sin movimiento si así lo pide el sistema
const motion = (leaving: boolean) => (baseEl: HTMLElement) => {
  const root = baseEl.shadowRoot;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const phone = window.matchMedia?.(PHONE).matches;
  const backdrop = createAnimation()
    .addElement(root?.querySelector('ion-backdrop') ?? [])
    .fromTo('opacity', '0.01', 'var(--backdrop-opacity)')
    .beforeStyles({ 'pointer-events': 'none' })
    .afterClearStyles(['pointer-events']);
  const panel = createAnimation()
    .addElement(root?.querySelector('.modal-wrapper') ?? [])
    .fromTo('opacity', '0', '1')
    .fromTo('transform', phone ? 'translateY(40px)' : 'scale(0.98)', phone ? 'translateY(0)' : 'scale(1)');
  const all = createAnimation().addElement(baseEl).easing('cubic-bezier(0.2, 0, 0, 1)').duration(reduce ? 0 : 180).addAnimation([backdrop, panel]);
  return leaving ? all.direction('reverse') : all;
};
const enterAnimation = motion(false);
const leaveAnimation = motion(true);

const CloseContext = createContext<(() => void) | null>(null);

// «Cancelar» o «Cerrar» dentro de un PanelModal: cierra como la X (pasa por la confirmación de cambios sin guardar)
export function PanelModalCancel(props: Omit<ComponentProps<typeof IonButton>, 'onClick'>) {
  const close = useContext(CloseContext);
  return <IonButton fill="outline" {...props} onClick={() => close?.()} />;
}

export function PanelModal({ isOpen, onClose, title, subtitle, size = 'form', mobile = 'sheet', aside, className = '', modalRef, dirty, discardTitle = '¿Descartar cambios?', busy, children, onDidPresent, canDismiss }: Props) {
  const titleId = useId();
  const own = useRef<HTMLIonModalElement | null>(null);
  const showAlert = useAppAlert();
  // Ionic llama a canDismiss después de otros renders: siempre se leen los valores actuales
  const latest = useRef({ dirty, busy, canDismiss, discardTitle });
  latest.current = { dirty, busy, canDismiss, discardTitle };

  const setRef = (el: HTMLIonModalElement | null) => {
    own.current = el;
    if (typeof modalRef === 'function') modalRef(el);
    else if (modalRef) (modalRef as { current: HTMLIonModalElement | null }).current = el;
  };

  // Siempre una función: si llega undefined, Ionic lo copia tal cual sobre su valor por defecto (true)
  // y entonces ningún cierre pasa (ni la X, ni Esc, ni tocar fuera, ni isOpen en false)
  const guard = async (data: unknown, role?: string) => {
    const { dirty, busy, canDismiss, discardTitle } = latest.current;
    if (canDismiss !== undefined && !(typeof canDismiss === 'function' ? await canDismiss(data, role) : canDismiss)) return false;
    const byUser = !!role && USER_ROLES.has(role);
    if (busy && byUser) return false;
    if (dirty && byUser) {
      return showAlert({
        tone: 'warning',
        title: discardTitle,
        message: 'Lo que escribiste en esta ventana no se ha guardado.',
        primary: { text: 'Descartar', danger: true },
        secondary: 'Seguir editando',
      });
    }
    return true;
  };

  const close = (role: 'close' | 'cancel') => {
    if (latest.current.busy) return;
    void own.current?.dismiss(undefined, role);
  };

  // Si la pantalla se desmonta con el modal abierto, el scroll se libera igual
  const locked = useRef(false);
  const setLocked = (on: boolean) => {
    if (on === locked.current) return;
    locked.current = on;
    if (on) lockScroll();
    else unlockScroll();
  };
  useEffect(() => () => setLocked(false), []);

  // Celular con el teclado abierto: el modal se recorta a lo visible y el campo enfocado se centra en el cuerpo
  useEffect(() => {
    const el = own.current;
    if (!isOpen || !el) return;
    const vv = window.visualViewport;
    const fit = () => el.style.setProperty('--kb', `${vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0}px`);
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!window.matchMedia?.(PHONE).matches || !t.matches?.(FOCUSABLE_FIELD) || !t.closest('.pmodal-body')) return;
      window.setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260);
    };
    vv?.addEventListener('resize', fit);
    el.addEventListener('focusin', onFocus);
    fit();
    return () => {
      vv?.removeEventListener('resize', fit);
      el.removeEventListener('focusin', onFocus);
      el.style.removeProperty('--kb');
    };
  }, [isOpen]);

  return (
    <IonModal
      ref={setRef}
      isOpen={isOpen}
      onWillPresent={() => setLocked(true)}
      onDidDismiss={() => {
        setLocked(false);
        onClose();
      }}
      onDidPresent={(e) => {
        onDidPresent?.(e);
        // Primer foco: lo que la pantalla ya enfocó; si no, el primer campo; si no, el botón de cerrar
        const root = own.current;
        if (!root || root.querySelector('.ion-page')?.contains(document.activeElement)) return;
        (root.querySelector<HTMLElement>(`.pmodal-body :is(${FOCUSABLE_FIELD})`) ?? root.querySelector<HTMLElement>('.amodal-close'))?.focus();
      }}
      canDismiss={guard}
      backdropDismiss={!busy}
      enterAnimation={enterAnimation}
      leaveAnimation={leaveAnimation}
      aria-labelledby={titleId}
      className={`pmodal amodal is-${size} is-m-${mobile} ${aside ? 'has-aside' : ''} ${className}`}
    >
      <CloseContext.Provider value={() => close('cancel')}>
        <span className="amodal-grip" aria-hidden="true" />
        <div className="amodal-split">
          {aside && <aside className="amodal-aside">{aside}</aside>}
          <div className="amodal-main">
            <header className="amodal-head">
              <div className="amodal-title">
                <h2 id={titleId}>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button type="button" className="amodal-close" onClick={() => close('close')} disabled={busy} aria-label="Cerrar">
                <IonIcon icon={closeOutline} aria-hidden="true" />
              </button>
            </header>
            {children}
          </div>
        </div>
      </CloseContext.Provider>
    </IonModal>
  );
}
