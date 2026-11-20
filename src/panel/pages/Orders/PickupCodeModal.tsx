import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { alertCircleOutline, closeOutline, qrCodeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { ORDER_STATUS_LABEL, parsePickupInput, type PickupOrder } from '../../../data/pickup';
import { useQrCamera } from '../../../lib/qrCamera';

const MAX_FAILS = 5;
const LOCK_MS = 60000;

const CAMERA_TEXT = {
  apagada: '',
  iniciando: 'Encendiendo la cámara…',
  activa: 'Acerca el QR del celular del cliente',
  'sin-permiso': 'El navegador no dio permiso para usar la cámara.',
  'sin-camara': 'No se encontró una cámara.',
};

interface Props {
  isOpen: boolean;
  // Pedido que se va a entregar; sin él, el código busca entre los pedidos listos
  order?: PickupOrder;
  orders: PickupOrder[];
  onClose: () => void;
  onVerified: (order: PickupOrder, code: string) => void;
}

// Entregar un pedido exige el código que muestra la app del cliente (QR o 6 dígitos).
// La caja nunca muestra el código: solo lo compara.
export function PickupCodeModal({ isOpen, order, orders, onClose, onVerified }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const fails = useRef(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = lockedUntil > Date.now();

  useEffect(() => {
    if (!locked) return;
    const t = window.setTimeout(() => setLockedUntil(0), lockedUntil - Date.now());
    return () => window.clearTimeout(t);
  }, [lockedUntil]);

  const reset = () => {
    setText('');
    setError('');
    setCamera(false);
  };

  const fail = (msg: string) => {
    fails.current += 1;
    if (fails.current >= MAX_FAILS) {
      fails.current = 0;
      setLockedUntil(Date.now() + LOCK_MS);
      setError('Demasiados intentos. Espera un minuto y vuelve a intentarlo.');
    } else setError(msg);
    setText('');
    inputRef.current?.focus();
  };

  const check = (raw: string) => {
    if (locked) return;
    const parsed = parsePickupInput(raw);
    if (!parsed) {
      setError('Escribe los 6 dígitos o escanea el QR del cliente.');
      return;
    }
    let found: PickupOrder | undefined;
    if (order) {
      if (parsed.orderId && parsed.orderId !== order.id) return fail(`Ese código es de otro pedido, no del ${order.folio}.`);
      if (order.pickupCode !== parsed.code) return fail('El código no coincide. Pídele al cliente que lo revise en su app.');
      found = order;
    } else {
      const match = orders.find((o) => o.pickupCode === parsed.code && (!parsed.orderId || o.id === parsed.orderId));
      if (!match) return fail('No hay ningún pedido con ese código.');
      if (match.status === 'entregado') return fail(`El pedido ${match.folio} ya se entregó.`);
      if (match.status !== 'listo') {
        setError(`El pedido ${match.folio} todavía está en "${ORDER_STATUS_LABEL[match.status]}". Márcalo como listo antes de entregarlo.`);
        return;
      }
      found = match;
    }
    fails.current = 0;
    reset();
    onVerified(found, parsed.code);
  };

  const { videoRef, status } = useQrCamera(isOpen && camera && !locked, check);

  return (
    <IonModal
      isOpen={isOpen}
      onDidPresent={() => inputRef.current?.focus()}
      onDidDismiss={() => {
        reset();
        onClose();
      }}
      className="pmodal pc-modal"
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{order ? `Entregar ${order.folio}` : 'Entregar pedido'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <form
        className="pmodal-body pc-body"
        onSubmit={(e) => {
          e.preventDefault();
          check(text);
        }}
      >
        <p className="pc-lead">
          {order ? <><strong>{order.customer.name}</strong> debe mostrarte el código de su app.</> : 'Pide al cliente el código de su app.'}
        </p>

        <label className="pc-label" htmlFor="pc-code">Código para recoger</label>
        <input
          id="pc-code"
          ref={inputRef}
          className="pc-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000 000"
          maxLength={80}
          value={text}
          disabled={locked}
          aria-invalid={!!error}
          aria-describedby="pc-help"
          // Un lector USB escribe el contenido del QR y Enter; a mano se escriben los 6 dígitos
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
        />
        <p id="pc-help" className={`pc-help ${error ? 'is-error' : ''}`} role={error ? 'alert' : undefined}>
          {error ? <><IonIcon icon={alertCircleOutline} />{error}</> : 'Escríbelo o escanéalo con el lector o la cámara.'}
        </p>

        {camera ? (
          <div className="pc-camera">
            <video ref={videoRef} muted playsInline />
            <span className="pc-camera-text">{CAMERA_TEXT[status]}</span>
          </div>
        ) : (
          <button type="button" className="pc-camera-btn" disabled={locked} onClick={() => setCamera(true)}>
            <IonIcon icon={qrCodeOutline} />
            Escanear QR con la cámara
          </button>
        )}

        <button type="submit" hidden />
      </form>

      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton color="success" className="btn-lg" disabled={locked || !text.trim()} onClick={() => check(text)}>
          Verificar y cobrar
        </IonButton>
      </div>
    </IonModal>
  );
}
